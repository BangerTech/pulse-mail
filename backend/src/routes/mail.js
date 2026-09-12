import { Router } from 'express';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { decryptPassword } from '../db.js';
import { withFolder, withClient } from '../imap-pool.js';
import { assignThreadIds, threadsForPage, extractMessageIds } from '../threading.js';
import * as cache from '../mail-cache.js';
import {
  mimeType, mimeEncoding, mimeCharset, decodeBody, looksEncoded,
  repairEncodedText, decodeMimeWords, downloadPart
} from '../mime.js';
import { markPendingDelete, clearPendingDelete, isPending } from '../pending.js';
import { reconcileFolder } from '../sync.js';
import { userAccountIds, requireOwnedAccount } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads/signatures');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const SNIPPET_LENGTH = 200;
const SNIPPET_BATCH = 40;
const THREAD_LOOKBACK = 250;

function withoutPending(accountId, folder, messages) {
  return (messages || []).filter(m => !isPending(accountId, folder, m.uid));
}

function dropPendingFromCache(db, accountId, folder, messages) {
  const uids = (messages || []).filter(m => isPending(accountId, folder, m.uid)).map(m => m.uid);
  if (uids.length) cache.removeMessages(db, accountId, folder, uids);
}

export default function mailRouter(db, broadcast = () => {}) {
  const router = Router();

  router.get('/search', async (req, res) => {
    const { q, accountId, folder, from, hasAttachments, since, before } = req.query;

    try {
      const mine = userAccountIds(db, req.user.id);
      const wanted = accountId ? Number(accountId) : undefined;
      if (wanted && !mine.includes(wanted)) {
        return res.json([]);
      }
      const results = cache.searchCache(db, {
        accountId: wanted,
        accountIds: wanted ? undefined : mine,
        query: q || undefined,
        folder: folder || undefined,
        from: from || undefined,
        hasAttachments: hasAttachments === 'true' || hasAttachments === '1',
        since: since || undefined,
        before: before || undefined,
        limit: 200
      });

      const accounts = db.prepare('SELECT id, name, email, color FROM accounts WHERE user_id = ?').all(req.user.id);
      const byId = new Map(accounts.map(a => [a.id, a]));

      res.json(results.map(r => ({ ...r, account: byId.get(r.accountId) || null })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Merged inbox across all accounts (Apple-Mail style "Alle Eingänge").
  router.get('/unified/inbox', async (req, res) => {
    const take = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Number(req.query.offset) || 0;

    try {
      const mine = userAccountIds(db, req.user.id);
      const window = cache.readUnifiedInbox(db, { limit: skip + take + THREAD_LOOKBACK, offset: 0, accountIds: mine })
        .filter(m => !isPending(m.accountId, m.folder || 'INBOX', m.uid));
      const messages = window.slice(skip, skip + take);

      // Thread within each account only so identical Message-IDs across
      // mailboxes never merge into one conversation.
      const byAccount = new Map();
      for (const m of window) {
        if (!byAccount.has(m.accountId)) byAccount.set(m.accountId, []);
        byAccount.get(m.accountId).push(m);
      }
      for (const [accId, list] of byAccount) {
        assignThreadIds(list);
        for (const m of list) m.threadId = `${accId}:${m.threadId}`;
      }

      res.json({
        messages,
        threads: threadsForPage(window, messages),
        total: cache.countUnifiedInbox(db, mine),
        offset: skip,
        limit: take,
        source: 'cache'
      });

      for (const id of mine) {
        refreshFolder(id, 'INBOX', 50, 0).catch(() => {});
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/unified/unread', (req, res) => {
    try {
      const accounts = db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(req.user.id);
      let inbox = 0;
      for (const account of accounts) {
        const counts = cache.unreadCounts(db, account.id);
        inbox += counts.INBOX || 0;
      }
      res.json({ inbox });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.use('/:accountId', requireOwnedAccount(db));

  router.get('/:accountId/unread-counts', (req, res) => {
    try {
      res.json(cache.unreadCounts(db, req.params.accountId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:accountId/messages', async (req, res) => {
    const { folder = 'INBOX', limit = 50, offset = 0 } = req.query;
    const accountId = Number(req.params.accountId);
    const take = Math.min(Number(limit) || 50, 200);
    const skip = Number(offset) || 0;

    // Answer from cache immediately, then refresh from IMAP in the background so
    // the list paints without waiting on the network.
    const cachedWindow = withoutPending(
      accountId,
      folder,
      cache.readMessages(db, accountId, folder, { limit: skip + take + THREAD_LOOKBACK, offset: 0 })
    );
    const cached = cachedWindow.slice(skip, skip + take);

    if (cached.length) {
      assignThreadIds(cachedWindow);
      res.json({
        messages: cached,
        threads: threadsForPage(cachedWindow, cached),
        total: cache.countMessages(db, accountId, folder),
        offset: skip,
        limit: take,
        source: 'cache'
      });

      refreshFolder(accountId, folder, take, skip).catch(() => {});
      return;
    }

    try {
      const messages = await refreshFolder(accountId, folder, take, skip);
      const window = withoutPending(
        accountId,
        folder,
        cache.readMessages(db, accountId, folder, { limit: skip + take + THREAD_LOOKBACK, offset: 0 })
      );
      const source = window.length ? window : messages;
      assignThreadIds(source);
      res.json({
        messages,
        threads: threadsForPage(source, messages),
        total: cache.countMessages(db, accountId, folder),
        offset: skip,
        limit: take,
        source: 'imap'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  async function refreshFolder(accountId, folder, limit, offset) {
    const messages = await withFolder(accountId, folder, async (client) => {
      const total = client.mailbox.exists;
      if (!total) return [];

      const end = Math.max(1, total - offset);
      const start = Math.max(1, end - limit + 1);
      const collected = [];

      for await (const msg of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        headers: [
          'references',
          'list-unsubscribe',
          'list-unsubscribe-post',
          'list-id',
          'precedence',
          'auto-submitted',
          'feedback-id',
          'authentication-results',
          'dkim-signature',
          'return-path'
        ]
      })) {
        collected.push({
          uid: msg.uid,
          messageId: msg.envelope?.messageId || null,
          subject: decodeMimeWords(msg.envelope?.subject || ''),
          from: msg.envelope?.from?.[0]
            ? { ...msg.envelope.from[0], name: decodeMimeWords(msg.envelope.from[0].name || '') }
            : {},
          to: msg.envelope?.to || [],
          cc: msg.envelope?.cc || [],
          replyTo: msg.envelope?.replyTo || [],
          date: msg.envelope?.date || null,
          flags: [...(msg.flags || [])],
          hasAttachments: hasAttachments(msg.bodyStructure),
          inReplyTo: Array.isArray(msg.envelope?.inReplyTo)
            ? msg.envelope.inReplyTo.join(' ')
            : (msg.envelope?.inReplyTo || null),
          references: parseReferences(msg.headers),
          rawHeaders: parseHeaders(msg.headers),
          textPart: findTextPart(msg.bodyStructure),
          snippet: ''
        });
      }

      return collected.reverse();
    });

    const before = snapshotOf(cache.readMessages(db, accountId, folder, { limit, offset }));
    const filtered = withoutPending(accountId, folder, messages);
    cache.upsertMessages(db, accountId, folder, filtered);
    dropPendingFromCache(db, accountId, folder, messages);
    fillSnippets(accountId, folder, filtered).catch(() => {});

    const after = withoutPending(
      accountId,
      folder,
      cache.readMessages(db, accountId, folder, { limit, offset })
    );
    if (before !== snapshotOf(after)) {
      broadcast({ type: 'messages_updated', accountId, folder });
    }

    // At the top of the list, also reconcile deletions and flag drift with
    // the server. Fire-and-forget: the response has already gone out.
    if (offset === 0) {
      reconcileFolder(db, broadcast, accountId, folder).catch(() => {});
    }

    return after;
  }

  function snapshotOf(messages) {
    return messages.map(m => `${m.uid}:${(m.flags || []).join(',')}`).join('|');
  }

  // Bodies are not fetched for the list view, so previews are filled in a second
  // pass and pushed to the client once they land.
  async function fillSnippets(accountId, folder, messages) {
    const cached = new Map(
      cache.readMessages(db, accountId, folder, { limit: 500, offset: 0 })
        .map(m => [m.uid, m.snippet])
    );

    const pending = messages
      .filter(m => m.textPart && (!cached.get(m.uid) || looksEncoded(cached.get(m.uid))))
      .slice(0, SNIPPET_BATCH);

    if (!pending.length) return;

    const byPart = new Map();
    for (const msg of pending) {
      const key = `${msg.textPart.part}|${msg.textPart.isHtml}`;
      if (!byPart.has(key)) byPart.set(key, { ...msg.textPart, uids: [] });
      byPart.get(key).uids.push(msg.uid);
    }

    let updated = 0;

    await withFolder(accountId, folder, async (client) => {
      for (const group of byPart.values()) {
        try {
          for await (const msg of client.fetch(
            group.uids,
            { uid: true, bodyParts: [group.part] },
            { uid: true }
          )) {
            const buffer = msg.bodyParts?.get(group.part);
            if (!buffer) continue;

            const snippet = toSnippet(
              decodeBody(buffer, group.charset, group.encoding),
              group.isHtml
            );
            if (!snippet) continue;

            const original = messages.find(m => m.uid === msg.uid);
            if (!original || isPending(accountId, folder, msg.uid)) continue;

            cache.upsertMessages(db, accountId, folder, [{ ...original, snippet }]);
            updated++;
          }
        } catch {}
      }
    });

    if (updated) {
      broadcast({ type: 'messages_updated', accountId, folder });
    }
  }

  router.get('/:accountId/message/:uid', async (req, res) => {
    const { folder = 'INBOX' } = req.query;
    const accountId = Number(req.params.accountId);
    const uid = Number(req.params.uid);

    try {
      const cachedRow = db.prepare(
        'SELECT * FROM mail_cache WHERE account_id = ? AND folder = ? AND uid = ?'
      ).get(accountId, folder, uid);

      const cachedHtml = repairEncodedText(cachedRow?.body_html || '');
      const cachedText = repairEncodedText(cachedRow?.body_text || '');
      const cachedBodyOk = cachedRow
        && (cachedHtml || cachedText)
        && !looksEncoded(cachedHtml)
        && !looksEncoded(cachedText);

      if (cachedRow && (cachedHtml !== (cachedRow.body_html || '') || cachedText !== (cachedRow.body_text || ''))) {
        cache.writeBody(db, accountId, folder, uid, cachedHtml, cachedText, safeParse(cachedRow.attachments_meta, []));
      }

      if (cachedBodyOk) {
        return res.json(buildDetail({ ...cachedRow, body_html: cachedHtml, body_text: cachedText }));
      }

      const parsed = await withFolder(accountId, folder, async (client) => {
        return loadMessageBody(client, uid);
      });

      cache.writeBody(db, accountId, folder, uid, parsed.html, parsed.text, parsed.attachments);

      res.json({
        uid,
        accountId,
        folder,
        messageId: parsed.messageId || cachedRow?.message_id || null,
        subject: parsed.subject || cachedRow?.subject || '',
        from: parsed.from || (cachedRow ? { name: cachedRow.from_name, address: cachedRow.from_address } : {}),
        to: parsed.to || safeParse(cachedRow?.to_address, []),
        cc: parsed.cc || safeParse(cachedRow?.cc_address, []),
        replyTo: parsed.replyTo || safeParse(cachedRow?.reply_to_address, []),
        date: parsed.date || cachedRow?.date,
        html: parsed.html,
        text: parsed.text,
        inReplyTo: parsed.inReplyTo || cachedRow?.in_reply_to || null,
        references: parsed.references || (cachedRow?.references_header ? cachedRow.references_header.split(/\s+/).filter(Boolean) : []),
        flags: parsed.flags || (cachedRow ? safeParse(cachedRow.flags, []) : []),
        attachments: parsed.attachments
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:accountId/attachment/:uid/:filename', async (req, res) => {
    const { folder = 'INBOX', cid, inline } = req.query;
    const wantCid = cid ? normalizeCid(cid) : '';
    const accountId = Number(req.params.accountId);
    const uid = Number(req.params.uid);

    try {
      const cachedRow = db.prepare(
        'SELECT attachments_meta FROM mail_cache WHERE account_id = ? AND folder = ? AND uid = ?'
      ).get(accountId, folder, uid);
      const meta = safeParse(cachedRow?.attachments_meta, []);
      const listed = meta.find(a =>
        (wantCid && normalizeCid(a.cid) === wantCid) || a.filename === req.params.filename
      );

      const att = await withFolder(accountId, folder, async (client) => {
        if (listed?.part) {
          const downloaded = await client.download(uid, listed.part, { uid: true });
          const chunks = [];
          for await (const chunk of downloaded.content) chunks.push(chunk);
          return {
            content: Buffer.concat(chunks),
            contentType: listed.contentType || downloaded.meta?.contentType,
            filename: listed.filename || req.params.filename
          };
        }

        const raw = await client.download(uid, undefined, { uid: true });
        const chunks = [];
        for await (const chunk of raw.content) chunks.push(chunk);
        const parsed = await simpleParser(Buffer.concat(chunks));
        const list = parsed.attachments || [];
        const found = wantCid
          ? list.find(a => normalizeCid(a.cid) === wantCid)
          : list.find(a => a.filename === req.params.filename);
        return found || null;
      });

      if (!att) return res.status(404).json({ error: 'Attachment not found' });

      const buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content || []);
      const filename = att.filename || req.params.filename;
      const type = sniffContentType(filename, att.contentType, buf);
      const asInline = inline === '1';
      res.set('Content-Type', type);
      res.set('Content-Disposition', `${asInline ? 'inline' : 'attachment'}; filename="${String(filename).replace(/"/g, '')}"`);
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:accountId/send', upload.array('attachments', 10), async (req, res) => {
    try {
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
      if (!account) return res.status(404).json({ error: 'Account not found' });

      const mailOptions = buildMailOptions(account, req);

      const transporter = nodemailer.createTransport({
        host: account.smtp_host,
        port: account.smtp_port,
        secure: account.smtp_port === 465,
        auth: { user: account.username, pass: decryptPassword(account.password_encrypted) }
      });

      await transporter.sendMail(mailOptions);

      // Most servers do not file an outgoing copy for us.
      appendToSpecialFolder(req.params.accountId, '\\Sent', mailOptions, []).catch(() => {});

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:accountId/draft', upload.array('attachments', 10), async (req, res) => {
    try {
      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId);
      if (!account) return res.status(404).json({ error: 'Account not found' });

      const mailOptions = buildMailOptions(account, req);
      const uid = await appendToSpecialFolder(req.params.accountId, '\\Drafts', mailOptions, ['\\Draft']);

      res.json({ ok: true, uid });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  async function appendToSpecialFolder(accountId, specialUse, mailOptions, flags) {
    const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'crlf' });
    const built = await builder.sendMail(mailOptions);

    return withClient(accountId, async (client) => {
      const target = await findSpecialFolder(client, specialUse);
      if (!target) return null;
      const result = await client.append(target, built.message, flags);
      return result?.uid || null;
    });
  }

  router.post('/:accountId/move', async (req, res) => {
    const { uids, from, to } = req.body;
    cache.removeMessages(db, req.params.accountId, from, uids);
    markPendingDelete(req.params.accountId, from, uids);
    res.json({ ok: true });

    withFolder(req.params.accountId, from, async (client) => {
      await client.messageMove(uids, to, { uid: true });
    }).then(
      () => clearPendingDelete(req.params.accountId, from, uids),
      (err) => {
        console.error('IMAP move failed:', err.message);
        clearPendingDelete(req.params.accountId, from, uids);
      }
    );
  });

  router.post('/:accountId/delete', async (req, res) => {
    const { uids, folder = 'INBOX' } = req.body;
    cache.removeMessages(db, req.params.accountId, folder, uids);
    markPendingDelete(req.params.accountId, folder, uids);
    res.json({ ok: true });

    withClient(req.params.accountId, async (client) => {
      const target = await findSpecialFolder(client, '\\Trash');
      const lock = await client.getMailboxLock(folder);
      try {
        if (target) {
          await client.messageMove(uids, target, { uid: true });
        } else {
          await client.messageDelete(uids, { uid: true });
        }
      } finally {
        lock.release();
      }
    }).then(
      () => clearPendingDelete(req.params.accountId, folder, uids),
      (err) => {
        console.error('IMAP delete failed:', err.message);
        clearPendingDelete(req.params.accountId, folder, uids);
      }
    );
  });

  router.post('/:accountId/archive', async (req, res) => {
    const { uids, folder = 'INBOX' } = req.body;
    cache.removeMessages(db, req.params.accountId, folder, uids);
    markPendingDelete(req.params.accountId, folder, uids);
    res.json({ ok: true });

    withClient(req.params.accountId, async (client) => {
      const target = await findSpecialFolder(client, '\\Archive');
      if (!target) throw new Error('No archive folder');
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageMove(uids, target, { uid: true });
      } finally {
        lock.release();
      }
    }).then(
      () => clearPendingDelete(req.params.accountId, folder, uids),
      (err) => {
        console.error('IMAP archive failed:', err.message);
        clearPendingDelete(req.params.accountId, folder, uids);
      }
    );
  });

  router.post('/:accountId/flags', async (req, res) => {
    const { uids, folder, flags, action } = req.body;
    cache.updateFlags(db, req.params.accountId, folder, uids, flags, action);
    res.json({ ok: true });

    withFolder(req.params.accountId, folder, async (client) => {
      if (action === 'add') {
        await client.messageFlagsAdd(uids, flags, { uid: true });
      } else {
        await client.messageFlagsRemove(uids, flags, { uid: true });
      }
    }).then(
      () => broadcast({ type: 'messages_updated', accountId: Number(req.params.accountId), folder }),
      (err) => console.error('IMAP flags failed:', err.message)
    );
  });

  return router;
}

function buildMailOptions(account, req) {
  const { to, cc, bcc, subject, html, inReplyTo, references } = req.body;
  const { html: processedHtml, inlineAttachments } = embedSignatureImages(html || '');

  return {
    from: `"${account.name}" <${account.email}>`,
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    html: processedHtml,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    attachments: [
      ...(req.files || []).map(f => ({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype
      })),
      ...inlineAttachments
    ]
  };
}

// Signature images are stored on disk and referenced by URL in the editor, which
// no mail client can resolve. They become inline CID parts on the way out.
function embedSignatureImages(html) {
  const inlineAttachments = [];
  let processedHtml = html;

  const imgRegex = /src="(\/api\/signatures\/images\/([^"]+))"/g;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const [, imgUrl, filename] = match;
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) continue;

    const cid = crypto.randomUUID() + '@sig';
    const ext = path.extname(filename).slice(1).toLowerCase() || 'png';

    inlineAttachments.push({
      filename,
      path: filePath,
      cid,
      contentDisposition: 'inline',
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`
    });

    processedHtml = processedHtml.replace(imgUrl, `cid:${cid}`);
  }

  return { html: processedHtml, inlineAttachments };
}

const SPECIAL_FALLBACKS = {
  '\\Sent': ['Sent', 'Sent Items', 'Gesendet', 'INBOX.Sent'],
  '\\Drafts': ['Drafts', 'Entwürfe', 'INBOX.Drafts'],
  '\\Trash': ['Trash', 'Papierkorb', 'Deleted', 'Deleted Items', 'Gelöschte Objekte', 'INBOX.Trash', 'INBOX.Papierkorb'],
  '\\Archive': ['Archive', 'Archiv', 'INBOX.Archive']
};

function normalizeCid(cid) {
  if (!cid) return '';
  return String(cid).replace(/^<|>$/g, '').trim().toLowerCase();
}

function sniffContentType(filename, contentType, buf) {
  const name = String(filename || '').toLowerCase();
  const type = String(contentType || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'application/pdf';
  if (buf && buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return contentType || 'application/octet-stream';
}

async function findSpecialFolder(client, specialUse) {
  const list = await client.list();

  const flagged = list.find(f => f.specialUse === specialUse);
  if (flagged) return flagged.path;

  for (const name of SPECIAL_FALLBACKS[specialUse] || []) {
    const byName = list.find(f => f.path === name || f.name === name);
    if (byName) return byName.path;
  }

  return null;
}

function buildDetail(row) {
  return {
    uid: row.uid,
    accountId: row.account_id,
    folder: row.folder,
    messageId: row.message_id,
    subject: decodeMimeWords(row.subject || ''),
    from: { name: decodeMimeWords(row.from_name || '') || undefined, address: row.from_address || undefined },
    to: safeParse(row.to_address, []),
    cc: safeParse(row.cc_address, []),
    replyTo: safeParse(row.reply_to_address, []),
    date: row.date,
    html: repairEncodedText(row.body_html || ''),
    text: repairEncodedText(row.body_text || ''),
    inReplyTo: row.in_reply_to,
    references: row.references_header ? row.references_header.split(/\s+/).filter(Boolean) : [],
    flags: safeParse(row.flags, []),
    attachments: safeParse(row.attachments_meta, [])
  };
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseReferences(headers) {
  if (!headers) return [];
  const text = Buffer.isBuffer(headers) ? headers.toString('utf8') : String(headers);
  const unfolded = text.replace(/\r?\n[ \t]+/g, ' ');
  return extractMessageIds(unfolded);
}

// Parses a raw RFC822 header block (as imapflow returns for the `headers`
// fetch option) into a lower-cased name -> value map. Header folding is
// unfolded so long headers become single-line values. Only the last value
// of a repeated header is kept; that's fine for the fields we consume.
function parseHeaders(headers) {
  if (!headers) return null;
  const text = Buffer.isBuffer(headers) ? headers.toString('utf8') : String(headers);
  if (!text) return null;
  const unfolded = text.replace(/\r?\n[ \t]+/g, ' ');
  const out = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return Object.keys(out).length ? out : null;
}

function normalizeReferences(references) {
  if (!references) return [];
  return Array.isArray(references) ? references : [references];
}

function toSnippet(raw, isHtml) {
  let text = repairEncodedText(decodeMimeWords(raw || ''));

  if (isHtml || /<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }

  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SNIPPET_LENGTH);
}

function findTextPart(structure) {
  return findMimePart(structure, 'text/plain') || findMimePart(structure, 'text/html');
}

function findMimePart(structure, preferred) {
  if (!structure) return null;

  const walk = (node) => {
    if (!node) return null;
    const type = mimeType(node);
    const disp = String(node.disposition || '').toLowerCase();
    if (type === preferred && disp !== 'attachment') {
      return {
        part: node.part || '1',
        isHtml: preferred === 'text/html',
        charset: mimeCharset(node),
        encoding: mimeEncoding(node)
      };
    }
    for (const child of node.childNodes || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };

  return walk(structure);
}

function listAttachments(structure, list = []) {
  if (!structure) return list;

  const type = mimeType(structure);
  const disp = (structure.disposition || '').toLowerCase();
  const filename = structure.dispositionParameters?.filename || structure.parameters?.name;
  const cid = String(structure.id || '').replace(/^<|>$/g, '');
  const isBodyText = type.startsWith('text/') && disp !== 'attachment' && !cid;

  if (!isBodyText && (disp === 'attachment' || disp === 'inline' || filename || cid || type.startsWith('image/'))) {
    list.push({
      filename: filename || (cid ? 'inline' : 'attachment'),
      contentType: type,
      size: structure.size || 0,
      cid: cid || undefined,
      part: structure.part
    });
  }

  for (const child of structure.childNodes || []) listAttachments(child, list);
  return list;
}

async function loadPart(client, uid, partInfo) {
  if (!partInfo?.part) return '';
  try {
    // client.download() already applies the Content-Transfer-Encoding, so the
    // buffer is plain bytes here. Decoding base64/quoted-printable a second
    // time would shred the body (base64 stops at the first '=' in the text),
    // therefore only the charset is applied.
    const downloaded = await downloadPart(client, uid, partInfo.part);
    const decoded = decodeBody(downloaded, partInfo.charset, null);
    if (decoded && !looksEncoded(decoded)) return decoded;
  } catch {}

  // fetchOne with bodyParts returns the part verbatim, still transfer-encoded,
  // so here the encoding does have to be applied.
  const fetched = await client.fetchOne(uid, { uid: true, bodyParts: [partInfo.part] }, { uid: true });
  const buffer = fetched?.bodyParts?.get(partInfo.part);
  return decodeBody(buffer, partInfo.charset, partInfo.encoding);
}

async function loadMessageBody(client, uid) {
  const info = await client.fetchOne(uid, {
    uid: true,
    envelope: true,
    flags: true,
    bodyStructure: true
  }, { uid: true });

  if (!info) throw new Error('Message not found');

  const htmlPart = findMimePart(info.bodyStructure, 'text/html');
  const textPart = findMimePart(info.bodyStructure, 'text/plain');

  let html = htmlPart ? await loadPart(client, uid, htmlPart) : '';
  let text = textPart ? await loadPart(client, uid, textPart) : '';

  if (looksEncoded(html) || looksEncoded(text) || (!html && !text)) {
    try {
      const raw = await downloadPart(client, uid);
      const parsed = await simpleParser(raw);
      html = repairEncodedText(parsed.html || html);
      text = repairEncodedText(parsed.text || text);
    } catch {}
  }

  html = repairEncodedText(html);
  text = repairEncodedText(text);

  return {
    html,
    text,
    attachments: listAttachments(info.bodyStructure),
    messageId: info.envelope?.messageId || null,
    subject: decodeMimeWords(info.envelope?.subject || ''),
    from: info.envelope?.from?.[0] || {},
    to: info.envelope?.to || [],
    cc: info.envelope?.cc || [],
    replyTo: info.envelope?.replyTo || [],
    date: info.envelope?.date || null,
    inReplyTo: info.envelope?.inReplyTo || null,
    references: Array.isArray(info.envelope?.references)
      ? info.envelope.references
      : (info.envelope?.references ? [info.envelope.references] : []),
    flags: [...(info.flags || [])]
  };
}

function hasAttachments(structure) {
  if (!structure) return false;
  if (structure.disposition === 'attachment') return true;
  if (structure.childNodes) return structure.childNodes.some(hasAttachments);
  return false;
}

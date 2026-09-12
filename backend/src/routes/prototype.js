import { Router } from 'express';
import { simpleParser } from 'mailparser';
import { withFolder } from '../imap-pool.js';
import * as cache from '../mail-cache.js';
import { decodeMimeWords, repairEncodedText } from '../mime.js';
import { extractPdfText, isInvoicePdf } from '../pdf-text.js';

// Prototyp-Endpoint: liefert die Unified-Inbox mit Rohheadern
// (List-Id, List-Unsubscribe, Precedence, Authentication-Results, ...) und
// dem gecachten body_text/body_html, damit der Klassifikator und Extraktor
// im Frontend ohne weitere IMAP-Roundtrips arbeiten koennen.
//
// Trennung vom bestehenden mail.js absichtlich: keine Aenderung an der
// klassischen App, dieser Router ist rein additiv.
export default function prototypeRouter(db, broadcast = () => {}) {
  const router = Router();

  router.get('/messages', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 300, 1000);

    try {
      if (req.query.sync === '1') {
        await pullRecent(db, broadcast, { force: true });
      }

      const rows = db.prepare(`
        SELECT c.*, a.email AS account_email, a.color AS account_color, a.name AS account_name
        FROM mail_cache c
        JOIN accounts a ON a.id = c.account_id
        WHERE c.folder = 'INBOX'
        ORDER BY c.date DESC
        LIMIT ?
      `).all(limit);

      const messages = rows.map(mapRow);

      res.json({
        source: 'cache',
        count: messages.length,
        messages
      });

      backfillMissing(db)
        .then(() => enrichEntities(db, broadcast))
        .catch(() => {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      const pulled = await pullRecent(db, broadcast, { force: true });
      const summary = await backfillMissing(db, { force: true });
      const enrich = await enrichEntities(db, broadcast);
      res.json({ ...summary, pulled, enrich });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/accounts', (req, res) => {
    try {
      const rows = db.prepare('SELECT id, name, email, color FROM accounts').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// -------- Sync & Backfill --------

let pullInFlight = false;
let pullQueued = false;
let lastPullAt = 0;

export async function ingestRecent(db, broadcast = () => {}) {
  return pullRecent(db, broadcast, { force: true });
}

const FETCH_HEADERS = [
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
];

function structureHasAtt(node) {
  if (!node) return false;
  if (String(node.disposition || '').toLowerCase() === 'attachment') return true;
  return (node.childNodes || []).some(structureHasAtt);
}

async function pullRecent(db, broadcast = () => {}, { force = false } = {}) {
  if (pullInFlight) {
    pullQueued = true;
    return { skipped: true, queued: true };
  }
  if (!force && Date.now() - lastPullAt < 8000) return { skipped: true, cool: true };
  pullInFlight = true;
  lastPullAt = Date.now();
  const summary = { added: 0, perAccount: [] };
  try {
    const accounts = db.prepare('SELECT id, email FROM accounts').all();
    let added = 0;
    for (const account of accounts) {
      const before = db.prepare(
        'SELECT COUNT(*) AS c FROM mail_cache WHERE account_id = ? AND folder = ?'
      ).get(account.id, 'INBOX')?.c || 0;
      const perAccountBefore = added;

      await withFolder(account.id, 'INBOX', async (client) => {
        const total = client.mailbox?.exists || 0;
        if (!total) return;
        const start = Math.max(1, total - 39);
        const collected = [];
        for await (const msg of client.fetch(`${start}:${total}`, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          headers: FETCH_HEADERS
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
            hasAttachments: structureHasAtt(msg.bodyStructure),
            inReplyTo: Array.isArray(msg.envelope?.inReplyTo)
              ? msg.envelope.inReplyTo.join(' ')
              : (msg.envelope?.inReplyTo || null),
            references: [],
            rawHeaders: parseHeaderBlock(msg.headers),
            snippet: ''
          });
        }
        if (collected.length) cache.upsertMessages(db, account.id, 'INBOX', collected);
      });

      const after = db.prepare(
        'SELECT COUNT(*) AS c FROM mail_cache WHERE account_id = ? AND folder = ?'
      ).get(account.id, 'INBOX')?.c || 0;
      const delta = Math.max(0, after - before);
      added += delta;
      if (delta > 0) {
        // Emit per-account so the single-account view in App.tsx picks it up.
        const newest = db.prepare(`
          SELECT subject, from_name, from_address
          FROM mail_cache
          WHERE account_id = ? AND folder = 'INBOX'
          ORDER BY datetime(date) DESC, uid DESC
          LIMIT 1
        `).get(account.id);
        broadcast({ type: 'messages_updated', accountId: account.id, folder: 'INBOX' });
        summary.perAccount.push({ accountId: account.id, added: delta, newest });
      }
    }
    summary.added = added;
  } catch (err) {
    summary.error = err.message;
  } finally {
    pullInFlight = false;
    if (pullQueued) {
      pullQueued = false;
      pullRecent(db, broadcast, { force: true }).catch(() => {});
    }
  }
  return summary;
}

let backfillInFlight = false;
const RECENT_UIDS = 100;

async function backfillMissing(db, { force = false } = {}) {
  if (backfillInFlight && !force) return { skipped: true };
  backfillInFlight = true;
  const summary = { accounts: [] };
  try {
    const accounts = db.prepare('SELECT id, email FROM accounts').all();
    for (const account of accounts) {
      const missing = db.prepare(`
        SELECT uid FROM mail_cache
        WHERE account_id = ? AND folder = 'INBOX' AND raw_headers IS NULL
        ORDER BY date DESC LIMIT ?
      `).all(account.id, RECENT_UIDS).map(r => r.uid);

      if (!missing.length) {
        summary.accounts.push({ email: account.email, backfilled: 0 });
        continue;
      }

      let backfilled = 0;
      try {
        await withFolder(account.id, 'INBOX', async (client) => {
          for await (const msg of client.fetch(missing, {
            uid: true,
            envelope: true,
            flags: true,
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
          }, { uid: true })) {
            const rawHeaders = parseHeaderBlock(msg.headers);
            if (!rawHeaders) continue;
            cache.upsertMessages(db, account.id, 'INBOX', [{
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
              hasAttachments: 0,
              inReplyTo: Array.isArray(msg.envelope?.inReplyTo)
                ? msg.envelope.inReplyTo.join(' ')
                : (msg.envelope?.inReplyTo || null),
              references: [],
              rawHeaders,
              snippet: ''
            }]);
            backfilled++;
          }
        });
      } catch (err) {
        summary.accounts.push({ email: account.email, error: err.message });
        continue;
      }
      summary.accounts.push({ email: account.email, backfilled });
    }
  } finally {
    backfillInFlight = false;
  }
  return summary;
}

const SEARCH_TERMS = [
  'snus', 'netflix', 'adobe', 'paypal', 'dhl', 'dpd', 'hermes', 'gls',
  'paket', 'sendung', 'zugestellt', 'creative cloud', 'abo', 'versand'
];
const ENTITY_SUBJECT = /rechnung|proforma|mahnung|invoice|beleg|bestell|paket|sendung|zugestellt|versand|adobe|netflix|paypal|snus|abo|subscription/i;
let enrichInFlight = false;

async function enrichEntities(db, broadcast = () => {}) {
  if (enrichInFlight) return { skipped: true };
  enrichInFlight = true;
  const summary = { pulled: 0, pdfs: 0, bodies: 0 };
  try {
    const accounts = db.prepare('SELECT id, email FROM accounts').all();
    for (const account of accounts) {
      const existing = new Set(
        db.prepare('SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?').all(account.id, 'INBOX').map(r => r.uid)
      );

      await withFolder(account.id, 'INBOX', async (client) => {
        const found = new Set();
        for (const term of SEARCH_TERMS) {
          try {
            const uids = await client.search({ or: [{ subject: term }, { from: term }] }, { uid: true });
            for (const uid of uids || []) found.add(Number(uid));
          } catch {}
        }
        const missing = [...found].filter(uid => !existing.has(uid)).slice(0, 80);
        if (missing.length) {
          const collected = [];
          for await (const msg of client.fetch(missing, {
            uid: true,
            envelope: true,
            flags: true,
            bodyStructure: true,
            headers: [
              'list-unsubscribe', 'list-id', 'precedence', 'auto-submitted',
              'authentication-results', 'dkim-signature', 'return-path'
            ]
          }, { uid: true })) {
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
              hasAttachments: 1,
              inReplyTo: null,
              references: [],
              rawHeaders: parseHeaderBlock(msg.headers),
              snippet: ''
            });
          }
          if (collected.length) {
            cache.upsertMessages(db, account.id, 'INBOX', collected);
            summary.pulled += collected.length;
          }
        }

        const rows = db.prepare(`
          SELECT uid, subject, from_address, body_text, body_html, snippet,
                 attachments_meta, extracted_pdf_text
          FROM mail_cache
          WHERE account_id = ? AND folder = 'INBOX'
          ORDER BY date DESC LIMIT 400
        `).all(account.id);

        let bodyBudget = 25;
        for (const row of rows) {
          if (!ENTITY_SUBJECT.test(row.subject || '') && !ENTITY_SUBJECT.test(row.from_address || '')) continue;
          const atts = safeParse(row.attachments_meta, []);
          const pdfCandidates = atts.filter(a => isInvoicePdf(a.filename, a.contentType));
          if (!row.extracted_pdf_text && pdfCandidates.length) {
            const chunks = [];
            for (const att of pdfCandidates.filter(a => a.part).slice(0, 2)) {
              try {
                const downloaded = await client.download(row.uid, att.part, { uid: true });
                const bufs = [];
                for await (const chunk of downloaded.content) bufs.push(chunk);
                const text = await extractPdfText(Buffer.concat(bufs));
                if (text) chunks.push(text);
              } catch {}
            }
            if (!chunks.length) {
              try {
                const raw = await client.download(row.uid, undefined, { uid: true });
                const bufs = [];
                for await (const chunk of raw.content) bufs.push(chunk);
                const parsed = await simpleParser(Buffer.concat(bufs));
                for (const a of parsed.attachments || []) {
                  if (!isInvoicePdf(a.filename, a.contentType) || !a.content) continue;
                  const text = await extractPdfText(a.content);
                  if (text) chunks.push(text);
                }
              } catch {}
            }
            if (chunks.length) {
              cache.writePdfText(db, account.id, 'INBOX', row.uid, chunks.join('\n'));
              summary.pdfs += 1;
            } else if (pdfCandidates.length) {
              cache.writePdfText(db, account.id, 'INBOX', row.uid, ' ');
            }
          }

          const hasBody = !!(row.body_html || (row.body_text && row.body_text.length > 80));
          if (!hasBody && bodyBudget > 0) {
            bodyBudget -= 1;
            try {
              const raw = await client.download(row.uid, undefined, { uid: true });
              const bufs = [];
              for await (const chunk of raw.content) bufs.push(chunk);
              const parsed = await simpleParser(Buffer.concat(bufs));
              const html = parsed.html || '';
              const text = parsed.text || '';
              const attachments = (parsed.attachments || []).map(a => ({
                filename: a.filename,
                contentType: a.contentType,
                size: a.size,
                cid: a.cid,
                part: undefined
              }));
              cache.writeBody(db, account.id, 'INBOX', row.uid, html, text, attachments);
              summary.bodies += 1;
            } catch {}
          }
        }
      });
    }
    if (summary.pulled || summary.pdfs || summary.bodies) {
      broadcast({ type: 'messages_updated' });
    }
  } finally {
    enrichInFlight = false;
  }
  return summary;
}

function parseHeaderBlock(headers) {
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

function safeParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapRow(row) {
  const flags = safeParse(row.flags, []);
  const toList = safeParse(row.to_address, []);
  const rawHeaders = safeParse(row.raw_headers, {});
  const attachmentsMeta = safeParse(row.attachments_meta, []);

  // Alle Textfelder durch die MIME-Repair-Funktion schicken; dadurch werden
  // im Cache liegende Base64-/QP-Snippets on-the-fly korrekt dekodiert.
  const subject = repairEncodedText(decodeMimeWords(row.subject || ''));
  const fromName = repairEncodedText(decodeMimeWords(row.from_name || ''));
  const bodyText = repairEncodedText(
    [row.body_text || row.snippet || '', row.extracted_pdf_text || ''].filter(Boolean).join('\n')
  );
  // The production path repairs body_html on the detail endpoint; the
  // prototype list-shaped payload used to skip it, so cached Base64/QP HTML
  // arrived as garbage. Do the same repair here for consistency.
  const bodyHtml = repairEncodedText(row.body_html || '');

  return {
    id: `${row.account_id}:${row.uid}`,
    threadId: row.thread_id || row.message_id || `uid-${row.account_id}-${row.folder}-${row.uid}`,
    accountId: row.account_id,
    account: {
      id: row.account_id,
      name: row.account_name,
      email: row.account_email,
      color: row.account_color
    },
    folder: row.folder,
    uid: row.uid,
    headers: {
      'Message-ID': row.message_id,
      From: fromName ? `${fromName} <${row.from_address}>` : row.from_address,
      To: toList.map(t => t.address || t).join(', '),
      'List-Unsubscribe': rawHeaders['list-unsubscribe'],
      'List-Unsubscribe-Post': rawHeaders['list-unsubscribe-post'],
      'List-Id': rawHeaders['list-id'],
      Precedence: rawHeaders['precedence'],
      'Auto-Submitted': rawHeaders['auto-submitted'],
      'Feedback-ID': rawHeaders['feedback-id'],
      'Authentication-Results': rawHeaders['authentication-results'],
      'DKIM-Signature': rawHeaders['dkim-signature'],
      'Return-Path': rawHeaders['return-path']
    },
    from: {
      name: fromName,
      address: row.from_address || ''
    },
    to: toList,
    subject,
    date: row.date,
    bodyText,
    bodyHtml,
    flags,
    attachments: attachmentsMeta.map(a => ({
      filename: repairEncodedText(decodeMimeWords(a.filename || '')),
      mime: a.contentType,
      size: a.size || 0,
      inline: !!a.cid,
      cid: a.cid || undefined,
      part: a.part || undefined
    })),
    hasRawHeaders: !!row.raw_headers,
    hasBody: !!(row.body_text || row.body_html)
  };
}

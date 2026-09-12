import { decodeMimeWords, repairEncodedText } from './mime.js';

const UPSERT = `
  INSERT INTO mail_cache (
    account_id, folder, uid, message_id, subject,
    from_address, from_name, to_address, cc_address, reply_to_address,
    date, snippet, flags, has_attachments,
    in_reply_to, references_header, thread_id, raw_headers, cached_at
  ) VALUES (
    @account_id, @folder, @uid, @message_id, @subject,
    @from_address, @from_name, @to_address, @cc_address, @reply_to_address,
    @date, @snippet, @flags, @has_attachments,
    @in_reply_to, @references_header, @thread_id, @raw_headers, CURRENT_TIMESTAMP
  )
  ON CONFLICT(account_id, folder, uid) DO UPDATE SET
    message_id = excluded.message_id,
    subject = excluded.subject,
    from_address = excluded.from_address,
    from_name = excluded.from_name,
    to_address = excluded.to_address,
    cc_address = excluded.cc_address,
    reply_to_address = excluded.reply_to_address,
    date = excluded.date,
    snippet = COALESCE(NULLIF(excluded.snippet, ''), mail_cache.snippet),
    flags = excluded.flags,
    has_attachments = excluded.has_attachments,
    in_reply_to = excluded.in_reply_to,
    references_header = excluded.references_header,
    thread_id = excluded.thread_id,
    raw_headers = COALESCE(NULLIF(excluded.raw_headers, ''), mail_cache.raw_headers),
    cached_at = CURRENT_TIMESTAMP
`;

export function upsertMessages(db, accountId, folder, messages) {
  if (!messages.length) return;
  const stmt = db.prepare(UPSERT);
  const run = db.transaction((rows) => {
    for (const row of rows) stmt.run(row);
  });

  run(messages.map(msg => ({
    account_id: Number(accountId),
    folder,
    uid: msg.uid,
    message_id: msg.messageId || null,
    subject: decodeMimeWords(msg.subject || ''),
    from_address: msg.from?.address || null,
    from_name: decodeMimeWords(msg.from?.name || '') || null,
    snippet: repairEncodedText(msg.snippet || ''),
    to_address: JSON.stringify(msg.to || []),
    cc_address: JSON.stringify(msg.cc || []),
    reply_to_address: JSON.stringify(msg.replyTo || []),
    date: msg.date ? new Date(msg.date).toISOString() : null,
    flags: JSON.stringify(msg.flags || []),
    has_attachments: msg.hasAttachments ? 1 : 0,
    in_reply_to: msg.inReplyTo || null,
    references_header: msg.references ? msg.references.join(' ') : null,
    thread_id: msg.threadId || null,
    raw_headers: msg.rawHeaders ? JSON.stringify(msg.rawHeaders) : null
  })));
}

function rowToMessage(row) {
  const parse = (val, fallback) => {
    if (!val) return fallback;
    try { return JSON.parse(val); } catch { return fallback; }
  };

  return {
    uid: row.uid,
    accountId: row.account_id,
    accountEmail: row.account_email || undefined,
    accountColor: row.account_color || undefined,
    folder: row.folder,
    messageId: row.message_id,
    subject: decodeMimeWords(row.subject || ''),
    from: { name: decodeMimeWords(row.from_name || undefined), address: row.from_address || undefined },
    to: parse(row.to_address, []),
    cc: parse(row.cc_address, []),
    replyTo: parse(row.reply_to_address, []),
    date: row.date,
    snippet: repairEncodedText(row.snippet || ''),
    flags: parse(row.flags, []),
    hasAttachments: !!row.has_attachments,
    inReplyTo: row.in_reply_to,
    references: row.references_header ? row.references_header.split(/\s+/).filter(Boolean) : [],
    threadId: row.thread_id,
    rawHeaders: parse(row.raw_headers, null)
  };
}

export function readMessages(db, accountId, folder, { limit = 50, offset = 0 } = {}) {
  const rows = db.prepare(`
    SELECT * FROM mail_cache
    WHERE account_id = ? AND folder = ?
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `).all(Number(accountId), folder, limit, offset);

  return rows.map(rowToMessage);
}

export function countMessages(db, accountId, folder) {
  const row = db.prepare(
    'SELECT COUNT(*) AS total FROM mail_cache WHERE account_id = ? AND folder = ?'
  ).get(Number(accountId), folder);
  return row?.total || 0;
}

// Merged inbox across every account. The account colour/email are joined in so
// the list can show which mailbox a message belongs to.
function accountFilter(accountIds, column = 'c.account_id') {
  if (!accountIds) return { sql: '', params: [] };
  if (!accountIds.length) return { sql: ` AND ${column} = -1`, params: [] };
  return {
    sql: ` AND ${column} IN (${accountIds.map(() => '?').join(',')})`,
    params: accountIds.map(Number)
  };
}

export function readUnifiedInbox(db, { limit = 50, offset = 0, accountIds } = {}) {
  const filter = accountFilter(accountIds);
  const rows = db.prepare(`
    SELECT c.*, a.email AS account_email, a.color AS account_color
    FROM mail_cache c
    JOIN accounts a ON a.id = c.account_id
    WHERE c.folder = 'INBOX'${filter.sql}
    ORDER BY c.date DESC
    LIMIT ? OFFSET ?
  `).all(...filter.params, limit, offset);

  return rows.map(rowToMessage);
}

export function countUnifiedInbox(db, accountIds) {
  const filter = accountFilter(accountIds, 'account_id');
  const row = db.prepare(
    `SELECT COUNT(*) AS total FROM mail_cache WHERE folder = 'INBOX'${filter.sql}`
  ).get(...filter.params);
  return row?.total || 0;
}

export function writePdfText(db, accountId, folder, uid, text) {
  db.prepare(`
    UPDATE mail_cache SET extracted_pdf_text = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(text || '', Number(accountId), folder, Number(uid));
}

export function writeBody(db, accountId, folder, uid, html, text, attachments) {
  const info = JSON.stringify(attachments || []);
  const updated = db.prepare(`
    UPDATE mail_cache SET body_html = ?, body_text = ?, attachments_meta = ?
    WHERE account_id = ? AND folder = ? AND uid = ?
  `).run(html || '', text || '', info, Number(accountId), folder, Number(uid));

  if (updated.changes) return;

  db.prepare(`
    INSERT INTO mail_cache (
      account_id, folder, uid, body_html, body_text, attachments_meta, snippet, flags, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', CURRENT_TIMESTAMP)
  `).run(
    Number(accountId),
    folder,
    Number(uid),
    html || '',
    text || '',
    info,
    (text || '').slice(0, 200)
  );
}

export function updateFlags(db, accountId, folder, uids, flags, action) {
  const rows = db.prepare(
    `SELECT uid, flags FROM mail_cache WHERE account_id = ? AND folder = ? AND uid IN (${uids.map(() => '?').join(',')})`
  ).all(Number(accountId), folder, ...uids.map(Number));

  const stmt = db.prepare('UPDATE mail_cache SET flags = ? WHERE account_id = ? AND folder = ? AND uid = ?');
  const run = db.transaction(() => {
    for (const row of rows) {
      let current = [];
      try { current = JSON.parse(row.flags) || []; } catch {}
      const set = new Set(current);
      for (const flag of flags) {
        if (action === 'add') set.add(flag);
        else set.delete(flag);
      }
      stmt.run(JSON.stringify([...set]), Number(accountId), folder, row.uid);
    }
  });
  run();
}

export function removeMessages(db, accountId, folder, uids) {
  if (!uids.length) return;
  db.prepare(
    `DELETE FROM mail_cache WHERE account_id = ? AND folder = ? AND uid IN (${uids.map(() => '?').join(',')})`
  ).run(Number(accountId), folder, ...uids.map(Number));
}

export function pruneFolder(db, accountId, folder, liveUids) {
  const existing = db.prepare(
    'SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?'
  ).all(Number(accountId), folder).map(r => r.uid);

  const live = new Set(liveUids.map(Number));
  const stale = existing.filter(uid => !live.has(uid));
  removeMessages(db, accountId, folder, stale);
}

export function searchCache(db, { accountId, accountIds, query, folder, from, hasAttachments, since, before, limit = 100 }) {
  const where = [];
  const params = [];

  if (accountId) { where.push('account_id = ?'); params.push(Number(accountId)); }
  else if (accountIds) {
    if (!accountIds.length) return [];
    where.push(`account_id IN (${accountIds.map(() => '?').join(',')})`);
    params.push(...accountIds.map(Number));
  }
  if (folder) { where.push('folder = ?'); params.push(folder); }

  if (query) {
    where.push('(subject LIKE ? OR from_name LIKE ? OR from_address LIKE ? OR to_address LIKE ? OR cc_address LIKE ? OR snippet LIKE ? OR body_text LIKE ?)');
    const like = `%${query}%`;
    params.push(like, like, like, like, like, like, like);
  }

  if (from) {
    where.push('(from_address LIKE ? OR from_name LIKE ?)');
    params.push(`%${from}%`, `%${from}%`);
  }

  if (hasAttachments) where.push('has_attachments = 1');
  if (since) { where.push('date >= ?'); params.push(new Date(since).toISOString()); }
  if (before) { where.push('date <= ?'); params.push(new Date(before).toISOString()); }

  const sql = `
    SELECT * FROM mail_cache
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY date DESC
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...params).map(row => ({
    ...rowToMessage(row),
    accountId: row.account_id,
    folder: row.folder
  }));
}

// Flags live in the row as a JSON array, so the backslash of "\Seen" is itself
// escaped in the stored text. Deriving the pattern avoids guessing that depth.
const SEEN_PATTERN = `%${JSON.stringify('\\Seen').slice(1, -1)}%`;

export function unreadCounts(db, accountId) {
  const rows = db.prepare(`
    SELECT folder, COUNT(*) AS unread FROM mail_cache
    WHERE account_id = ? AND (flags IS NULL OR flags NOT LIKE ?)
    GROUP BY folder
  `).all(Number(accountId), SEEN_PATTERN);

  const result = {};
  for (const row of rows) result[row.folder] = row.unread;
  return result;
}

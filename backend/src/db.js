import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = process.env.DB_PATH || './data/mail.db';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';

export function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER DEFAULT 993,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER DEFAULT 587,
      username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      color TEXT DEFAULT '#007AFF',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      account_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS mail_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      folder TEXT NOT NULL,
      uid INTEGER NOT NULL,
      message_id TEXT,
      subject TEXT,
      from_address TEXT,
      from_name TEXT,
      to_address TEXT,
      date DATETIME,
      snippet TEXT,
      flags TEXT,
      has_attachments INTEGER DEFAULT 0,
      body_html TEXT,
      body_text TEXT,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      UNIQUE(account_id, folder, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_mail_account_folder ON mail_cache(account_id, folder, date DESC);
    CREATE INDEX IF NOT EXISTS idx_mail_search ON mail_cache(subject, from_name, body_text);

    CREATE TABLE IF NOT EXISTS folder_sync (
      account_id INTEGER NOT NULL,
      folder TEXT NOT NULL,
      uid_validity INTEGER,
      last_sync_at DATETIME,
      PRIMARY KEY (account_id, folder)
    );
  `);

  migrate(db);

  return db;
}

function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(mail_cache)').all().map(c => c.name);

  const additions = [
    ['in_reply_to', 'TEXT'],
    ['references_header', 'TEXT'],
    ['thread_id', 'TEXT'],
    ['cc_address', 'TEXT'],
    ['reply_to_address', 'TEXT'],
    ['attachments_meta', 'TEXT'],
    ['raw_headers', 'TEXT'],
    ['extracted_pdf_text', 'TEXT']
  ];

  for (const [name, type] of additions) {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE mail_cache ADD COLUMN ${name} ${type}`);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mail_thread ON mail_cache(account_id, folder, thread_id);
    CREATE INDEX IF NOT EXISTS idx_mail_message_id ON mail_cache(message_id);
  `);

  dropCorruptBodies(db);
}

// Bodies that were double transfer-decoded got stored as binary noise. Clear
// them so the next open refetches a clean copy; the row itself (envelope,
// flags, threading) stays intact.
const JUNK_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g;

function junkRatio(text) {
  if (!text) return 0;
  const junk = text.match(JUNK_CHARS);
  return junk ? junk.length / text.length : 0;
}

function dropCorruptBodies(db) {
  const rows = db.prepare(`
    SELECT id, body_html, body_text FROM mail_cache
    WHERE (body_html IS NOT NULL AND body_html <> '')
       OR (body_text IS NOT NULL AND body_text <> '')
  `).all();

  const bad = rows
    .filter(r => junkRatio(r.body_html) > 0.02 || junkRatio(r.body_text) > 0.02)
    .map(r => r.id);

  if (!bad.length) return;

  const stmt = db.prepare(
    "UPDATE mail_cache SET body_html = '', body_text = '', attachments_meta = NULL WHERE id = ?"
  );
  db.transaction((ids) => { for (const id of ids) stmt.run(id); })(bad);
  console.log(`Cache-Reparatur: ${bad.length} beschaedigte Mail-Bodies geleert`);
}

export function encryptPassword(password) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptPassword(encrypted) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const [ivHex, encData] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

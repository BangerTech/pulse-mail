import { Router } from 'express';
import { encryptPassword, decryptPassword } from '../db.js';
import { ImapFlow } from 'imapflow';
import { withClient, getConnection, closeConnection } from '../imap-pool.js';
import { unreadCounts } from '../mail-cache.js';

async function testImap({ imap_host, imap_port, username, password }) {
  const client = new ImapFlow({
    host: imap_host,
    port: imap_port || 993,
    secure: true,
    auth: { user: username, pass: password },
    logger: false
  });
  client.on('error', () => {});
  await client.connect();
  await client.logout();
}

export default function accountsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const accounts = db.prepare(
      'SELECT id, name, email, imap_host, imap_port, smtp_host, smtp_port, username, color FROM accounts'
    ).all();
    res.json(accounts);
  });

  router.post('/', async (req, res) => {
    const { name, email, imap_host, imap_port, smtp_host, smtp_port, username, password, color } = req.body;

    try {
      await testImap({ imap_host, imap_port, username, password });
    } catch (err) {
      return res.status(400).json({ error: 'IMAP connection failed: ' + err.message });
    }

    const encrypted = encryptPassword(password);
    const result = db.prepare(
      'INSERT INTO accounts (name, email, imap_host, imap_port, smtp_host, smtp_port, username, password_encrypted, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, email, imap_host, imap_port || 993, smtp_host, smtp_port || 587, username, encrypted, color || '#007AFF');

    getConnection(result.lastInsertRowid).catch(() => {});

    res.json({ id: result.lastInsertRowid });
  });

  router.put('/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const name = req.body.name ?? existing.name;
    const email = req.body.email ?? existing.email;
    const imap_host = req.body.imap_host ?? existing.imap_host;
    const imap_port = Number(req.body.imap_port) || existing.imap_port;
    const smtp_host = req.body.smtp_host ?? existing.smtp_host;
    const smtp_port = Number(req.body.smtp_port) || existing.smtp_port;
    const username = req.body.username ?? existing.username;
    const color = req.body.color ?? existing.color;
    const passwordChanged = typeof req.body.password === 'string' && req.body.password.length > 0;
    const plainPassword = passwordChanged ? req.body.password : decryptPassword(existing.password_encrypted);

    const reconnect =
      passwordChanged ||
      imap_host !== existing.imap_host ||
      Number(imap_port) !== Number(existing.imap_port) ||
      username !== existing.username;

    if (reconnect) {
      try {
        await testImap({ imap_host, imap_port, username, password: plainPassword });
      } catch (err) {
        return res.status(400).json({ error: 'IMAP connection failed: ' + err.message });
      }
    }

    db.prepare(`
      UPDATE accounts SET
        name = ?, email = ?, imap_host = ?, imap_port = ?,
        smtp_host = ?, smtp_port = ?, username = ?,
        password_encrypted = ?, color = ?
      WHERE id = ?
    `).run(
      name, email, imap_host, imap_port, smtp_host, smtp_port, username,
      passwordChanged ? encryptPassword(req.body.password) : existing.password_encrypted,
      color, req.params.id
    );

    if (reconnect) {
      closeConnection(req.params.id);
      getConnection(req.params.id).catch(() => {});
    }

    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    closeConnection(req.params.id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM mail_cache WHERE account_id = ?').run(req.params.id);
    db.prepare('DELETE FROM signatures WHERE account_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.get('/:id/folders', async (req, res) => {
    try {
      const folders = await withClient(req.params.id, client => client.list());
      const counts = unreadCounts(db, req.params.id);

      res.json(folders.map(f => ({
        path: f.path,
        name: f.name,
        specialUse: f.specialUse,
        delimiter: f.delimiter,
        listed: f.listed,
        unread: counts[f.path] || 0
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

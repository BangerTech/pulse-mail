import { Router } from 'express';
import { encryptPassword } from '../db.js';
import { ImapFlow } from 'imapflow';
import { withClient, getConnection, closeConnection } from '../imap-pool.js';
import { unreadCounts } from '../mail-cache.js';

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

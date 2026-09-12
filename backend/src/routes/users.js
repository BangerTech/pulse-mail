import { Router } from 'express';
import { hashPassword, publicUser, requireAdmin } from '../auth.js';

export default function usersRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    const users = db.prepare(
      'SELECT id, name, username, role, color, avatar, created_at FROM app_users ORDER BY name'
    ).all();
    res.json(users.map(publicUser));
  });

  router.post('/', (req, res) => {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    const color = req.body.color || '#34C759';
    if (!name || !username || password.length < 4) {
      return res.status(400).json({ error: 'Name, Benutzername und Passwort (mind. 4 Zeichen) nötig' });
    }
    try {
      const result = db.prepare(
        'INSERT INTO app_users (name, username, password_hash, role, color) VALUES (?, ?, ?, ?, ?)'
      ).run(name, username, hashPassword(password), role, color);
      const user = db.prepare('SELECT * FROM app_users WHERE id = ?').get(result.lastInsertRowid);
      res.json(publicUser(user));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(400).json({ error: 'Benutzername ist schon vergeben' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM app_users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    const name = String(req.body.name || existing.name).trim();
    const color = req.body.color || existing.color;
    let role = existing.role;
    if (req.body.role === 'admin' || req.body.role === 'user') {
      if (existing.role === 'admin' && req.body.role === 'user') {
        const admins = db.prepare("SELECT COUNT(*) AS c FROM app_users WHERE role = 'admin'").get().c;
        if (admins <= 1) return res.status(400).json({ error: 'Der letzte Administrator bleibt Admin' });
      }
      role = req.body.role;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 4) {
        return res.status(400).json({ error: 'Passwort mindestens 4 Zeichen' });
      }
      db.prepare('UPDATE app_users SET name = ?, color = ?, role = ?, password_hash = ? WHERE id = ?')
        .run(name, color, role, hashPassword(req.body.password), existing.id);
    } else {
      db.prepare('UPDATE app_users SET name = ?, color = ?, role = ? WHERE id = ?')
        .run(name, color, role, existing.id);
    }
    res.json(publicUser(db.prepare('SELECT * FROM app_users WHERE id = ?').get(existing.id)));
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen' });
    const existing = db.prepare('SELECT * FROM app_users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    if (existing.role === 'admin') {
      const admins = db.prepare("SELECT COUNT(*) AS c FROM app_users WHERE role = 'admin'").get().c;
      if (admins <= 1) return res.status(400).json({ error: 'Der letzte Administrator bleibt' });
    }
    db.prepare('DELETE FROM app_sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM app_users WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return router;
}

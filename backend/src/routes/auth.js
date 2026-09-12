import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  hashPassword, verifyPassword, publicUser, userCount, createSession,
  destroySession, getUserByToken, readToken
} from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (_req, file, cb) => {
      const raw = path.extname(file.originalname || '').toLowerCase();
      const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(raw) ? raw : '.jpg';
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Nur JPG, PNG, GIF oder WebP'));
  }
});

function removeAvatarFile(filename) {
  if (!filename) return;
  const filePath = path.join(AVATAR_DIR, path.basename(filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export default function authRouter(db) {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ needsSetup: userCount(db) === 0 });
  });

  router.post('/setup', (req, res) => {
    if (userCount(db) > 0) {
      return res.status(400).json({ error: 'Einrichtung ist schon abgeschlossen' });
    }
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !username || password.length < 4) {
      return res.status(400).json({ error: 'Name, Benutzername und Passwort (mind. 4 Zeichen) nötig' });
    }
    const result = db.prepare(
      'INSERT INTO app_users (name, username, password_hash, role, color) VALUES (?, ?, ?, ?, ?)'
    ).run(name, username, hashPassword(password), 'admin', req.body.color || '#007AFF');
    db.prepare('UPDATE accounts SET user_id = ? WHERE user_id IS NULL').run(result.lastInsertRowid);
    db.prepare('UPDATE signatures SET user_id = ? WHERE user_id IS NULL').run(result.lastInsertRowid);
    const user = db.prepare('SELECT * FROM app_users WHERE id = ?').get(result.lastInsertRowid);
    const session = createSession(db, user.id);
    res.json({ user: publicUser(user), ...session });
  });

  router.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
    }
    const session = createSession(db, user.id);
    res.json({ user: publicUser(user), ...session });
  });

  router.get('/me', (req, res) => {
    const user = getUserByToken(db, readToken(req));
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    res.json(publicUser(user));
  });

  router.put('/me', (req, res) => {
    const user = getUserByToken(db, readToken(req));
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    const name = String(req.body.name || user.name).trim();
    const color = req.body.color || user.color;
    if (req.body.password) {
      if (String(req.body.password).length < 4) {
        return res.status(400).json({ error: 'Passwort mindestens 4 Zeichen' });
      }
      db.prepare('UPDATE app_users SET name = ?, color = ?, password_hash = ? WHERE id = ?')
        .run(name, color, hashPassword(req.body.password), user.id);
    } else {
      db.prepare('UPDATE app_users SET name = ?, color = ? WHERE id = ?').run(name, color, user.id);
    }
    const next = db.prepare('SELECT * FROM app_users WHERE id = ?').get(user.id);
    res.json(publicUser(next));
  });

  router.post('/logout', (req, res) => {
    destroySession(db, readToken(req));
    res.json({ ok: true });
  });

  router.get('/avatars/:filename', (req, res) => {
    const filePath = path.join(AVATAR_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(filePath);
  });

  router.post('/me/avatar', (req, res, next) => {
    const user = getUserByToken(db, readToken(req));
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.user = user;
    next();
  }, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload fehlgeschlagen' });
      next();
    });
  }, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Kein Bild' });
    removeAvatarFile(req.user.avatar);
    db.prepare('UPDATE app_users SET avatar = ? WHERE id = ?').run(req.file.filename, req.user.id);
    const next = db.prepare('SELECT * FROM app_users WHERE id = ?').get(req.user.id);
    res.json(publicUser(next));
  });

  router.delete('/me/avatar', (req, res) => {
    const user = getUserByToken(db, readToken(req));
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    removeAvatarFile(user.avatar);
    db.prepare('UPDATE app_users SET avatar = NULL WHERE id = ?').run(user.id);
    const next = db.prepare('SELECT * FROM app_users WHERE id = ?').get(user.id);
    res.json(publicUser(next));
  });

  return router;
}

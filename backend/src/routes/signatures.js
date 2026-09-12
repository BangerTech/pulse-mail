import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '../../uploads/signatures');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

export default function signaturesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    if (!req.user) return res.json([]);
    const signatures = db.prepare(
      'SELECT * FROM signatures WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);
    res.json(signatures);
  });

  router.post('/', (req, res) => {
    const { name, content, is_default, account_id } = req.body;
    if (is_default) {
      db.prepare('UPDATE signatures SET is_default = 0 WHERE user_id = ? AND account_id IS ?')
        .run(req.user.id, account_id || null);
    }
    const result = db.prepare(
      'INSERT INTO signatures (name, content, is_default, account_id, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(name, content, is_default ? 1 : 0, account_id || null, req.user.id);
    res.json({ id: result.lastInsertRowid });
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM signatures WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, content, is_default, account_id } = req.body;
    if (is_default) {
      db.prepare('UPDATE signatures SET is_default = 0 WHERE user_id = ? AND account_id IS ?')
        .run(req.user.id, account_id || null);
    }
    db.prepare(
      'UPDATE signatures SET name = ?, content = ?, is_default = ?, account_id = ? WHERE id = ? AND user_id = ?'
    ).run(name, content, is_default ? 1 : 0, account_id || null, req.params.id, req.user.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM signatures WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  router.post('/upload-image', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    res.json({ url: `/api/signatures/images/${req.file.filename}` });
  });

  router.get('/images/:filename', (req, res) => {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(filePath);
  });

  return router;
}

import crypto from 'crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    color: row.color || '#007AFF',
    avatar: row.avatar || null,
    avatarUrl: row.avatar ? `/api/auth/avatars/${row.avatar}` : null
  };
}

export function userCount(db) {
  return db.prepare('SELECT COUNT(*) AS c FROM app_users').get()?.c || 0;
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    "INSERT INTO app_sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
  ).run(token, userId);
  const row = db.prepare('SELECT expires_at FROM app_sessions WHERE token = ?').get(token);
  return { token, expiresAt: row?.expires_at };
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM app_sessions WHERE token = ?').run(token);
}

export function getUserByToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM app_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

export function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query?.token) return String(req.query.token);
  return '';
}

export function requireAuth(db) {
  return (req, res, next) => {
    const user = getUserByToken(db, readToken(req));
    if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.user = publicUser(user);
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Nur Administratoren' });
  }
  next();
}

export function userAccountIds(db, userId) {
  return db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(userId).map(r => r.id);
}

export function ownsAccount(db, userId, accountId) {
  const row = db.prepare('SELECT user_id FROM accounts WHERE id = ?').get(Number(accountId));
  return !!row && Number(row.user_id) === Number(userId);
}

export function requireOwnedAccount(db) {
  return (req, res, next) => {
    const id = req.params.accountId || req.params.id;
    if (!id) return next();
    if (!ownsAccount(db, req.user.id, id)) {
      return res.status(404).json({ error: 'Account not found' });
    }
    next();
  };
}

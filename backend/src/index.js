import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { initDb } from './db.js';
import { getUserByToken, requireAuth } from './auth.js';
import accountsRouter from './routes/accounts.js';
import mailRouter from './routes/mail.js';
import signaturesRouter from './routes/signatures.js';
import prototypeRouter, { ingestRecent } from './routes/prototype.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { initPool, startPool } from './imap-pool.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const db = initDb();

const broadcast = (data) => {
  const msg = JSON.stringify(data);
  const ownerId = data.accountId
    ? db.prepare('SELECT user_id FROM accounts WHERE id = ?').get(data.accountId)?.user_id
    : null;
  wss.clients.forEach((ws) => {
    if (ws.readyState !== 1 || !ws.userId) return;
    if (ownerId && ws.userId !== ownerId) return;
    ws.send(msg);
  });
};

initPool(db, broadcast, () => ingestRecent(db, broadcast));

app.use('/api/auth', authRouter(db));
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && req.path.startsWith('/signatures/images/')) return next();
  return requireAuth(db)(req, res, next);
});
app.use('/api/users', usersRouter(db));
app.use('/api/accounts', accountsRouter(db));
app.use('/api/mail', mailRouter(db, broadcast));
app.use('/api/signatures', signaturesRouter(db));
app.use('/api/prototype', prototypeRouter(db, broadcast));

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const user = getUserByToken(db, url.searchParams.get('token') || '');
  ws.userId = user?.id || null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (!ws.userId) {
    ws.close(4001, 'Nicht angemeldet');
  }
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mail backend running on port ${PORT}`);
  startPool();
});

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { initDb } from './db.js';
import accountsRouter from './routes/accounts.js';
import mailRouter from './routes/mail.js';
import signaturesRouter from './routes/signatures.js';
import prototypeRouter, { ingestRecent } from './routes/prototype.js';
import { initPool, startPool } from './imap-pool.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const db = initDb();

const broadcast = (data) => {
  const msg = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
};

initPool(db, broadcast, () => ingestRecent(db, broadcast));

app.use('/api/accounts', accountsRouter(db));
app.use('/api/mail', mailRouter(db, broadcast));
app.use('/api/signatures', signaturesRouter(db));
app.use('/api/prototype', prototypeRouter(db, broadcast));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
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

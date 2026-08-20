import { ImapFlow } from 'imapflow';
import { decryptPassword } from './db.js';

const RECONNECT_DELAY = 5000;
const idleConnections = new Map();
const workConnections = new Map();
const lastExists = new Map();

let db = null;
let broadcast = () => {};
let onNewMail = async () => {};

export function initPool(database, broadcastFn, onNewMailFn) {
  db = database;
  if (broadcastFn) broadcast = broadcastFn;
  if (onNewMailFn) onNewMail = onNewMailFn;
}

function accountById(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Account not found');
  return account;
}

function makeClient(account) {
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.username, pass: decryptPassword(account.password_encrypted) },
    logger: false,
    emitLogs: false
  });
  client.on('error', () => {});
  return client;
}

function remember(map, accountId, connectFn) {
  const id = Number(accountId);
  let entry = map.get(id);

  if (!entry) {
    entry = {};
    entry.promise = connectFn(id).then(
      (result) => {
        entry.client = result.client;
        entry.account = result.account;
        return result;
      },
      (err) => {
        map.delete(id);
        throw err;
      }
    );
    map.set(id, entry);
  }

  return entry.promise;
}

async function connectIdle(accountId) {
  const account = accountById(accountId);
  const client = makeClient(account);

  client.on('close', () => {
    if (idleConnections.get(accountId)?.client === client) {
      idleConnections.delete(accountId);
      setTimeout(() => getIdleConnection(accountId).catch(() => {}), RECONNECT_DELAY);
    }
  });

  await client.connect();
  await client.mailboxOpen('INBOX');

  client.on('exists', (data) => {
    lastExists.set(accountId, data?.count ?? client.mailbox?.exists);
    broadcast({ type: 'new_mail', accountId, data });
    onNewMail(accountId).catch(() => {});
  });

  console.log(`IMAP IDLE connected: ${account.email}`);
  return { client, account };
}

async function connectWork(accountId) {
  const account = accountById(accountId);
  const client = makeClient(account);

  client.on('close', () => {
    if (workConnections.get(accountId)?.client === client) {
      workConnections.delete(accountId);
      setTimeout(() => getWorkConnection(accountId).catch(() => {}), RECONNECT_DELAY);
    }
  });

  await client.connect();
  console.log(`IMAP work connected: ${account.email}`);
  return { client, account };
}

function getIdleConnection(accountId) {
  return remember(idleConnections, accountId, connectIdle);
}

function getWorkConnection(accountId) {
  return remember(workConnections, accountId, connectWork);
}

export function getConnection(accountId) {
  return getWorkConnection(accountId);
}

export async function withFolder(accountId, folder, fn) {
  const { client, account } = await getWorkConnection(accountId);
  const lock = await client.getMailboxLock(folder);
  try {
    return await fn(client, account);
  } finally {
    lock.release();
  }
}

export async function withClient(accountId, fn) {
  const { client, account } = await getWorkConnection(accountId);
  return fn(client, account);
}

export function closeConnection(accountId) {
  const id = Number(accountId);

  for (const map of [idleConnections, workConnections]) {
    const entry = map.get(id);
    map.delete(id);
    if (entry?.client) entry.client.logout().catch(() => {});
  }
}

export function startPool() {
  const accounts = db.prepare('SELECT id, email FROM accounts').all();
  for (const account of accounts) {
    getIdleConnection(account.id).catch((err) => {
      console.error(`IMAP IDLE failed for ${account.email}: ${err.message}`);
    });
    getWorkConnection(account.id).catch((err) => {
      console.error(`IMAP work failed for ${account.email}: ${err.message}`);
    });
  }

  setInterval(pollInboxes, 60000);
}

async function pollInboxes() {
  if (!db) return;
  const accounts = db.prepare('SELECT id FROM accounts').all();

  for (const account of accounts) {
    try {
      await withFolder(account.id, 'INBOX', async (client) => {
        const exists = client.mailbox?.exists ?? 0;
        const previous = lastExists.get(account.id);
        lastExists.set(account.id, exists);
        if (previous !== undefined && exists !== previous) {
          broadcast({ type: 'new_mail', accountId: account.id });
          onNewMail(account.id).catch(() => {});
        }
      });
    } catch {}
  }
}

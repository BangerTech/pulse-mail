import { ImapFlow } from 'imapflow';
import { decryptPassword } from './db.js';
import { reconcileFolder, scheduleReconcile } from './sync.js';

const RECONNECT_DELAY = 5000;
const RECONCILE_INTERVAL = 5 * 60 * 1000; // safety net if IDLE misses events
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

function emitNewMail(accountId) {
  Promise.resolve(onNewMail(accountId))
    .then((summary) => {
      const row = summary?.perAccount?.find((entry) => entry.accountId === accountId)
        || summary?.perAccount?.find((entry) => entry.added > 0);
      const newest = row?.newest;
      broadcast({
        type: 'new_mail',
        accountId,
        preview: newest
          ? {
              subject: newest.subject || '',
              fromName: newest.from_name || '',
              fromAddress: newest.from_address || '',
              count: row?.added || 1
            }
          : { count: 1 }
      });
    })
    .catch(() => {
      broadcast({ type: 'new_mail', accountId, preview: { count: 1 } });
    });
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
  lastExists.set(accountId, client.mailbox?.exists ?? 0);

  client.on('exists', (data) => {
    const next = data?.count ?? client.mailbox?.exists;
    const prev = lastExists.get(accountId);
    lastExists.set(accountId, next);
    // `exists` also fires on some expunges. Only treat a rising count as
    // new mail so the UI does not ding on deletes or flag changes.
    if (typeof prev === 'number' && typeof next === 'number' && next > prev) {
      emitNewMail(accountId);
    } else if (typeof prev === 'number' && typeof next === 'number' && next < prev) {
      scheduleReconcile(db, broadcast, accountId, 'INBOX');
    }
  });

  // Expunge fires when a message is removed from the mailbox on the server
  // (e.g. Apple Mail deletes or moves a mail). ImapFlow only gives us the
  // sequence number here, not the UID, so we reconcile the whole folder.
  client.on('expunge', () => {
    scheduleReconcile(db, broadcast, accountId, 'INBOX');
  });

  // Flag changes on already-seen messages arrive as `flags` events.
  client.on('flags', () => {
    scheduleReconcile(db, broadcast, accountId, 'INBOX');
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
  setInterval(safetyReconcile, RECONCILE_INTERVAL);
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
        if (previous !== undefined && exists > previous) {
          emitNewMail(account.id);
        } else if (previous !== undefined && exists < previous) {
          // A drop in count means something was expunged elsewhere; the
          // additive `onNewMail` sync can't detect that on its own.
          scheduleReconcile(db, broadcast, account.id, 'INBOX', 200);
        }
      });
    } catch {}
  }
}

// Safety net: even if IDLE keeps working, run a full reconcile every few
// minutes so external flag changes on older mail eventually catch up.
async function safetyReconcile() {
  if (!db) return;
  const accounts = db.prepare('SELECT id FROM accounts').all();
  for (const account of accounts) {
    reconcileFolder(db, broadcast, account.id, 'INBOX').catch(() => {});
  }
}

// Two-way reconcile between the IMAP server and mail_cache. A single
// `1:*` fetch delivers every UID plus flags in one shot, so we can detect
// external deletions and external flag changes together.

import { withFolder } from './imap-pool.js';
import * as cache from './mail-cache.js';
import { isPending } from './pending.js';

const inFlight = new Map(); // `${accountId}:${folder}` -> Promise
const queued = new Set();
const debounceTimers = new Map();

function key(accountId, folder) {
  return `${Number(accountId)}:${folder}`;
}

function readSyncRow(db, accountId, folder) {
  return db.prepare(
    'SELECT uid_validity, last_sync_at FROM folder_sync WHERE account_id = ? AND folder = ?'
  ).get(Number(accountId), folder);
}

function writeSyncRow(db, accountId, folder, uidValidity) {
  db.prepare(`
    INSERT INTO folder_sync (account_id, folder, uid_validity, last_sync_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_id, folder) DO UPDATE SET
      uid_validity = excluded.uid_validity,
      last_sync_at = CURRENT_TIMESTAMP
  `).run(Number(accountId), folder, uidValidity ?? null);
}

function clearFolderCache(db, accountId, folder) {
  db.prepare(
    'DELETE FROM mail_cache WHERE account_id = ? AND folder = ?'
  ).run(Number(accountId), folder);
}

function normalizeFlags(list) {
  return JSON.stringify([...(list || [])].sort());
}

async function runReconcile(db, broadcast, accountId, folder) {
  let changed = false;

  await withFolder(accountId, folder, async (client) => {
    const box = client.mailbox;
    const uidValidity = box?.uidValidity ? Number(box.uidValidity) : null;
    const total = box?.exists ?? 0;

    // uidValidity changed → the server renumbered UIDs; the local cache for
    // this folder is stale in a way we can't repair, so wipe and refill.
    const prev = readSyncRow(db, accountId, folder);
    if (uidValidity != null && prev?.uid_validity != null && prev.uid_validity !== uidValidity) {
      clearFolderCache(db, accountId, folder);
      changed = true;
    }
    writeSyncRow(db, accountId, folder, uidValidity);

    if (!total) {
      // Empty folder: nothing on the server, so anything cached is stale.
      const cached = db.prepare(
        'SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?'
      ).all(Number(accountId), folder).map(r => r.uid);
      const stale = cached.filter(uid => !isPending(accountId, folder, uid));
      if (stale.length) {
        cache.removeMessages(db, accountId, folder, stale);
        changed = true;
      }
      return;
    }

    const liveUids = [];
    const liveFlags = new Map();
    for await (const msg of client.fetch('1:*', { uid: true, flags: true })) {
      const uid = Number(msg.uid);
      liveUids.push(uid);
      liveFlags.set(uid, [...(msg.flags || [])]);
    }

    // Deletions: rows the server no longer has (minus pending local deletes).
    const cachedUids = db.prepare(
      'SELECT uid FROM mail_cache WHERE account_id = ? AND folder = ?'
    ).all(Number(accountId), folder).map(r => Number(r.uid));
    const live = new Set(liveUids);
    const stale = cachedUids.filter(uid => !live.has(uid) && !isPending(accountId, folder, uid));
    if (stale.length) {
      cache.removeMessages(db, accountId, folder, stale);
      changed = true;
    }

    // Flag drift: rows still on the server but with different flags locally.
    const cachedRows = db.prepare(
      'SELECT uid, flags FROM mail_cache WHERE account_id = ? AND folder = ?'
    ).all(Number(accountId), folder);
    const update = db.prepare(
      'UPDATE mail_cache SET flags = ? WHERE account_id = ? AND folder = ? AND uid = ?'
    );
    const tx = db.transaction((rows) => {
      for (const row of rows) update.run(row.flags, Number(accountId), folder, row.uid);
    });
    const drift = [];
    for (const row of cachedRows) {
      const uid = Number(row.uid);
      const live = liveFlags.get(uid);
      if (!live) continue;
      const before = row.flags || '[]';
      let currentSorted;
      try { currentSorted = JSON.stringify([...(JSON.parse(before) || [])].sort()); }
      catch { currentSorted = '[]'; }
      const nextSorted = normalizeFlags(live);
      if (currentSorted !== nextSorted) {
        drift.push({ uid, flags: JSON.stringify(live) });
      }
    }
    if (drift.length) {
      tx(drift);
      changed = true;
    }
  });

  if (changed) {
    broadcast({ type: 'messages_updated', accountId: Number(accountId), folder });
  }
  return { changed };
}

// Coalesces overlapping requests: while a reconcile runs, at most one more
// gets queued to run right after.
export function reconcileFolder(db, broadcast, accountId, folder = 'INBOX') {
  const id = key(accountId, folder);
  if (inFlight.has(id)) {
    queued.add(id);
    return inFlight.get(id);
  }
  const p = runReconcile(db, broadcast, accountId, folder)
    .catch((err) => { console.error(`reconcile ${id} failed: ${err.message}`); return { error: err.message }; })
    .finally(() => {
      inFlight.delete(id);
      if (queued.delete(id)) {
        setTimeout(() => reconcileFolder(db, broadcast, accountId, folder).catch(() => {}), 250);
      }
    });
  inFlight.set(id, p);
  return p;
}

// Debounced entry point. Used by IDLE `expunge` where a mass delete can fire
// many events in a row, so we wait for the burst to settle.
export function scheduleReconcile(db, broadcast, accountId, folder = 'INBOX', delay = 1500) {
  const id = key(accountId, folder);
  const existing = debounceTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    debounceTimers.delete(id);
    reconcileFolder(db, broadcast, accountId, folder).catch(() => {});
  }, delay);
  debounceTimers.set(id, t);
}

// Shared pending-delete registry. Both the mail routes (local delete/move/
// archive) and the reconcile job need to know which UIDs are mid-flight to the
// server, so external state can't accidentally step on them.

const pendingDeletes = new Set();

function key(accountId, folder, uid) {
  return `${Number(accountId)}:${folder}:${Number(uid)}`;
}

export function markPendingDelete(accountId, folder, uids) {
  for (const uid of uids || []) pendingDeletes.add(key(accountId, folder, uid));
}

export function clearPendingDelete(accountId, folder, uids) {
  for (const uid of uids || []) pendingDeletes.delete(key(accountId, folder, uid));
}

export function isPending(accountId, folder, uid) {
  return pendingDeletes.has(key(accountId, folder, uid));
}

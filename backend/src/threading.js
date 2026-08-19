// Groups messages into conversations using Message-ID / In-Reply-To /
// References, then a conservative subject fallback for replies that omit those
// headers. Works on any IMAP server regardless of the THREAD extension.

class UnionFind {
  constructor() {
    this.parent = new Map();
  }

  find(key) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      return key;
    }

    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root);

    let cursor = key;
    while (this.parent.get(cursor) !== root) {
      const next = this.parent.get(cursor);
      this.parent.set(cursor, root);
      cursor = next;
    }

    return root;
  }

  union(a, b) {
    if (!a || !b) return;
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

export function normalizeMessageId(value) {
  if (!value) return '';
  return String(value).trim().replace(/^<|>$/g, '').toLowerCase();
}

export function extractMessageIds(value) {
  if (!value) return [];
  const text = Array.isArray(value) ? value.join(' ') : String(value);
  const ids = [];
  const bracket = text.match(/<[^>]+>/g);
  if (bracket) {
    for (const part of bracket) {
      const id = normalizeMessageId(part);
      if (id) ids.push(id);
    }
    return [...new Set(ids)];
  }
  for (const part of text.split(/\s+/)) {
    const id = normalizeMessageId(part);
    if (id.includes('@')) ids.push(id);
  }
  return [...new Set(ids)];
}

const REPLY_PREFIX = /^(re|aw|wg|fwd?|sv|enc|odp|rv|antw|antwort|tr|rif)\.?\s*(\[\d+\])?\s*:\s*/i;

export function normalizeSubject(subject) {
  let text = String(subject || '').replace(/\s+/g, ' ').trim();
  while (REPLY_PREFIX.test(text)) text = text.replace(REPLY_PREFIX, '');
  return text.toLowerCase();
}

function hasReplyCue(msg) {
  const subject = String(msg.subject || '');
  if (REPLY_PREFIX.test(subject.trim())) return true;
  if (extractMessageIds(msg.inReplyTo).length) return true;
  if (extractMessageIds(msg.references).length) return true;
  return false;
}

function selfKey(msg) {
  const id = extractMessageIds(msg.messageId)[0];
  if (id) return id;
  return `uid-${msg.accountId ?? 0}-${msg.folder || ''}-${msg.uid}`;
}

export function assignThreadIds(messages) {
  const uf = new UnionFind();

  for (const msg of messages) {
    const self = selfKey(msg);
    uf.find(self);

    for (const link of [
      ...extractMessageIds(msg.inReplyTo),
      ...extractMessageIds(msg.references)
    ]) {
      uf.union(self, link);
    }
  }

  const bySubject = new Map();
  for (const msg of messages) {
    const subject = normalizeSubject(msg.subject);
    if (subject.length < 5) continue;
    const bucket = `${msg.accountId ?? 0}::${msg.folder || ''}::${subject}`;
    if (!bySubject.has(bucket)) bySubject.set(bucket, []);
    bySubject.get(bucket).push(msg);
  }

  for (const group of bySubject.values()) {
    if (group.length < 2) continue;
    if (!group.some(hasReplyCue)) continue;
    const root = selfKey(group[0]);
    for (let i = 1; i < group.length; i++) uf.union(root, selfKey(group[i]));
  }

  for (const msg of messages) {
    msg.threadId = uf.find(selfKey(msg));
  }

  return messages;
}

function isSeen(msg) {
  return (msg.flags || []).includes('\\Seen');
}

function isFlagged(msg) {
  return (msg.flags || []).includes('\\Flagged');
}

export function groupIntoThreads(messages) {
  const groups = new Map();

  for (const msg of messages) {
    const id = msg.threadId || selfKey(msg);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(msg);
  }

  const threads = [];

  for (const [threadId, msgs] of groups) {
    msgs.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const latest = msgs[msgs.length - 1];
    const root = msgs[0];

    threads.push({
      threadId,
      uid: latest.uid,
      accountId: latest.accountId,
      accountEmail: latest.accountEmail,
      accountColor: latest.accountColor,
      folder: latest.folder || root.folder,
      uids: msgs.map(m => m.uid),
      count: msgs.length,
      subject: latest.subject || root.subject || '',
      from: latest.from,
      participants: [...new Set(
        msgs.map(m => m.from?.name || m.from?.address).filter(Boolean)
      )],
      date: latest.date,
      snippet: latest.snippet || '',
      flags: latest.flags || [],
      unread: msgs.some(m => !isSeen(m)),
      flagged: msgs.some(isFlagged),
      hasAttachments: msgs.some(m => m.hasAttachments),
      messages: msgs
    });
  }

  threads.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return threads;
}

export function threadsForPage(windowMessages, pageMessages) {
  const pageKeys = new Set(pageMessages.map(m => `${m.accountId ?? 0}:${m.uid}`));
  return groupIntoThreads(windowMessages).filter(thread => {
    const latest = thread.messages[thread.messages.length - 1];
    return pageKeys.has(`${latest.accountId ?? 0}:${latest.uid}`);
  });
}

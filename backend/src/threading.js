// Groups messages into conversations using only the Message-ID / In-Reply-To /
// References headers, so it works on any IMAP server regardless of whether the
// THREAD extension is advertised.

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
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

function selfKey(msg) {
  return msg.messageId || `uid-${msg.uid}`;
}

export function assignThreadIds(messages) {
  const uf = new UnionFind();

  for (const msg of messages) {
    const self = selfKey(msg);
    uf.find(self);

    const links = [];
    if (msg.inReplyTo) links.push(msg.inReplyTo);
    if (Array.isArray(msg.references)) links.push(...msg.references);

    for (const link of links) {
      if (link) uf.union(self, link);
    }
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
      uids: msgs.map(m => m.uid),
      count: msgs.length,
      subject: root.subject || latest.subject || '',
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

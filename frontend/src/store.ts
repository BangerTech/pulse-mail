import { create } from 'zustand';

export interface Account {
  id: number;
  name: string;
  email: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  color: string;
}

export interface Folder {
  path: string;
  name: string;
  specialUse?: string;
  unread?: number;
}

export interface Address {
  name?: string;
  address?: string;
}

export interface MailMessage {
  uid: number;
  accountId?: number;
  accountEmail?: string;
  accountColor?: string;
  folder?: string;
  messageId?: string;
  subject: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  replyTo?: Address[];
  date: string;
  snippet?: string;
  flags: string[];
  hasAttachments: boolean;
  inReplyTo?: string | null;
  references?: string[];
  threadId?: string;
}

export interface MailThread {
  threadId: string;
  uid: number;
  accountId?: number;
  accountEmail?: string;
  accountColor?: string;
  uids: number[];
  count: number;
  subject: string;
  from: Address;
  participants: string[];
  date: string;
  snippet: string;
  flags: string[];
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  messages: MailMessage[];
}

export interface MailDetail {
  uid: number;
  accountId?: number;
  folder?: string;
  messageId?: string;
  subject: string;
  from: Address;
  to: Address[];
  cc: Address[];
  replyTo?: Address[];
  date: string;
  html: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
  flags: string[];
  attachments: { filename: string; contentType: string; size: number; cid?: string; part?: string }[];
  bodyLoading?: boolean;
}

export interface Signature {
  id: number;
  name: string;
  content: string;
  is_default: number;
  account_id: number | null;
}

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposeFont {
  family: string;
  size: number;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type PreviewPosition = 'right' | 'bottom';
export type Density = 'comfortable' | 'compact';

interface MailStore {
  accounts: Account[];
  selectedAccount: Account | null;
  folders: Folder[];
  foldersByAccount: Record<number, Folder[]>;
  selectedFolder: string;
  messages: MailMessage[];
  threads: MailThread[];
  total: number;
  selectedMessage: MailDetail | null;
  // Body is stored separately so subscribers that only care about identity
  // (the list, toolbar flags, ...) don't re-render when a 300 KB HTML body
  // lands.
  messageBody: { html: string; text: string } | null;
  selectedKeys: string[];
  signatures: Signature[];
  loading: boolean;
  loadingMore: boolean;
  composing: boolean;
  composeMode: ComposeMode;
  replyTo: MailDetail | null;
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  showSettings: boolean;
  showPalette: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
  maillistWidth: number;
  listPaneHeight: number;
  composeFont: ComposeFont;
  theme: ThemeMode;
  previewPosition: PreviewPosition;
  density: Density;
  threadingEnabled: boolean;
  notifySound: boolean;
  notifyDesktop: boolean;
  loadRemoteImages: boolean;
  // Optimistic hide for delete/archive. Lives in Zustand (not React
  // useOptimistic) because MailList, App and the WebSocket reload all need
  // the same set, and a component-local optimistic state would desync.
  hiddenKeys: string[];
  unifiedView: boolean;
  unifiedUnread: number;
  collapsedAccounts: number[];

  setAccounts: (accounts: Account[]) => void;
  setSelectedAccount: (account: Account | null) => void;
  setUnifiedView: (v: boolean) => void;
  setUnifiedUnread: (n: number) => void;
  setFolders: (folders: Folder[]) => void;
  setFoldersForAccount: (accountId: number, folders: Folder[]) => void;
  setSelectedFolder: (folder: string) => void;
  selectMailbox: (account: Account, folder: string) => void;
  toggleAccountCollapsed: (accountId: number) => void;
  setMessages: (messages: MailMessage[]) => void;
  setThreads: (threads: MailThread[]) => void;
  appendMessages: (messages: MailMessage[], threads: MailThread[]) => void;
  removeKeys: (keys: string[]) => void;
  unhideKeys: (keys: string[]) => void;
  setTotal: (total: number) => void;
  setSelectedMessage: (message: MailDetail | null) => void;
  setMessageBody: (body: { html: string; text: string } | null) => void;
  setSelectedKeys: (keys: string[]) => void;
  toggleSelectedKey: (key: string, additive: boolean) => void;
  clearSelection: () => void;
  setSignatures: (signatures: Signature[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  openCompose: (mode: ComposeMode, replyTo?: MailDetail | null) => void;
  closeCompose: () => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: any[]) => void;
  setSearching: (searching: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowPalette: (show: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setMaillistWidth: (w: number) => void;
  setListPaneHeight: (h: number) => void;
  setComposeFont: (f: ComposeFont) => void;
  setTheme: (t: ThemeMode) => void;
  setPreviewPosition: (p: PreviewPosition) => void;
  setDensity: (d: Density) => void;
  setThreadingEnabled: (enabled: boolean) => void;
  setNotifySound: (enabled: boolean) => void;
  setNotifyDesktop: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
}

export function isInboxFolder(f: { path: string; specialUse?: string }) {
  return f.specialUse === '\\Inbox' || f.path.toUpperCase() === 'INBOX';
}

export function totalInboxUnread(
  foldersByAccount: Record<number, Folder[]>,
  unifiedUnread: number,
  accountCount: number
): number {
  if (accountCount > 1) return unifiedUnread;
  const folders = Object.values(foldersByAccount)[0] || [];
  return folders.find(isInboxFolder)?.unread || 0;
}

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function persist<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Messages and threads are identified by account + uid, because IMAP UIDs are
// only unique within a single mailbox (two accounts can reuse the same number).
export function msgKey(accountId: number | undefined | null, uid: number): string {
  return `${accountId ?? 0}:${uid}`;
}

export function parseKey(key: string): { accountId: number; uid: number } {
  const [accountId, uid] = key.split(':');
  return { accountId: Number(accountId), uid: Number(uid) };
}

function stripHiddenThreads(threads: MailThread[], hiddenKeys: string[]): MailThread[] {
  const gone = new Set(hiddenKeys);
  return threads.flatMap(thread => {
    const remaining = (thread.messages || []).filter(m => !gone.has(msgKey(m.accountId ?? thread.accountId, m.uid)));
    const remainingUids = remaining.map(m => m.uid);
    if (!remainingUids.length) return [];
    const latest = remaining[remaining.length - 1] || thread;
    return [{
      ...thread,
      uid: latest.uid,
      accountId: latest.accountId ?? thread.accountId,
      uids: remainingUids,
      count: remainingUids.length,
      messages: remaining,
      from: latest.from || thread.from,
      date: latest.date || thread.date,
      snippet: latest.snippet || thread.snippet,
      flags: latest.flags || thread.flags,
      unread: remaining.some(m => !(m.flags || []).includes('\\Seen')),
      flagged: remaining.some(m => (m.flags || []).includes('\\Flagged')),
      hasAttachments: remaining.some(m => m.hasAttachments)
    }];
  });
}

const DEFAULT_FONT: ComposeFont = {
  family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  size: 14
};

export const useStore = create<MailStore>((set, get) => ({
  accounts: [],
  selectedAccount: null,
  folders: [],
  foldersByAccount: {},
  selectedFolder: 'INBOX',
  messages: [],
  threads: [],
  total: 0,
  selectedMessage: null,
  messageBody: null,
  selectedKeys: [],
  signatures: [],
  loading: false,
  loadingMore: false,
  composing: false,
  composeMode: 'new',
  replyTo: null,
  searchQuery: '',
  searchResults: [],
  searching: false,
  showSettings: false,
  showPalette: false,
  sidebarVisible: loadSetting('sidebarVisible', true),
  sidebarWidth: loadSetting('sidebarWidth', 240),
  maillistWidth: loadSetting('maillistWidth', 380),
  listPaneHeight: loadSetting('listPaneHeight', 42),
  composeFont: loadSetting('composeFont', DEFAULT_FONT),
  theme: loadSetting<ThemeMode>('theme', 'system'),
  previewPosition: loadSetting<PreviewPosition>('previewPosition', 'right'),
  density: loadSetting<Density>('density', 'comfortable'),
  threadingEnabled: loadSetting('threadingEnabled', true),
  notifySound: loadSetting('notifySound', true),
  notifyDesktop: loadSetting('notifyDesktop', true),
  loadRemoteImages: loadSetting('loadRemoteImages', true),
  hiddenKeys: [],
  unifiedView: loadSetting('unifiedView', true),
  unifiedUnread: 0,
  collapsedAccounts: loadSetting<number[]>('collapsedAccounts', []),

  setAccounts: (accounts) => set({ accounts }),
  setSelectedAccount: (selectedAccount) => set({ selectedAccount }),
  setUnifiedView: (unifiedView) => {
    persist('unifiedView', unifiedView);
    set({
      unifiedView,
      selectedFolder: unifiedView ? 'INBOX' : get().selectedFolder,
      selectedMessage: null,
      messageBody: null,
      selectedKeys: [],
      messages: [],
      threads: [],
      hiddenKeys: []
    });
  },
  setUnifiedUnread: (unifiedUnread) => set({ unifiedUnread }),
  setFolders: (folders) => set((state) => ({
    folders,
    foldersByAccount: state.selectedAccount
      ? { ...state.foldersByAccount, [state.selectedAccount.id]: folders }
      : state.foldersByAccount
  })),
  setFoldersForAccount: (accountId, folders) => set((state) => ({
    foldersByAccount: { ...state.foldersByAccount, [accountId]: folders },
    folders: state.selectedAccount?.id === accountId ? folders : state.folders
  })),
  setSelectedFolder: (selectedFolder) => {
    persist('unifiedView', false);
    set({
      selectedFolder,
      unifiedView: false,
      selectedMessage: null,
      messageBody: null,
      selectedKeys: [],
      messages: [],
      threads: [],
      hiddenKeys: []
    });
  },
  selectMailbox: (account, folder) => {
    persist('unifiedView', false);
    const folders = get().foldersByAccount[account.id] || get().folders;
    set({
      selectedAccount: account,
      selectedFolder: folder,
      folders,
      unifiedView: false,
      selectedMessage: null,
      messageBody: null,
      selectedKeys: [],
      messages: [],
      threads: [],
      hiddenKeys: []
    });
  },
  toggleAccountCollapsed: (accountId) => {
    const current = get().collapsedAccounts;
    const next = current.includes(accountId)
      ? current.filter(id => id !== accountId)
      : [...current, accountId];
    persist('collapsedAccounts', next);
    set({ collapsedAccounts: next });
  },
  setMessages: (messages) => set((state) => ({
    messages: messages.filter(m => !state.hiddenKeys.includes(msgKey(m.accountId, m.uid)))
  })),
  setThreads: (threads) => set((state) => ({
    threads: stripHiddenThreads(threads, state.hiddenKeys)
  })),
  appendMessages: (messages, threads) => set((state) => {
    const gone = new Set(state.hiddenKeys);
    const seen = new Set(state.messages.map(m => msgKey(m.accountId, m.uid)));
    const merged = [...state.messages, ...messages.filter(m => {
      const key = msgKey(m.accountId, m.uid);
      return !seen.has(key) && !gone.has(key);
    })];
    const byThread = new Map(state.threads.map(t => [t.threadId, t]));
    for (const thread of stripHiddenThreads(threads, state.hiddenKeys)) {
      const existing = byThread.get(thread.threadId);
      if (!existing) {
        byThread.set(thread.threadId, thread);
        continue;
      }
      const known = new Set((existing.messages || []).map(m => msgKey(m.accountId ?? existing.accountId, m.uid)));
      const extra = (thread.messages || []).filter(m => !known.has(msgKey(m.accountId ?? thread.accountId, m.uid)));
      if (!extra.length) continue;
      const msgs = [...(existing.messages || []), ...extra]
        .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
      const latest = msgs[msgs.length - 1];
      byThread.set(thread.threadId, {
        ...existing,
        ...thread,
        uid: latest.uid,
        accountId: latest.accountId ?? thread.accountId,
        uids: msgs.map(m => m.uid),
        count: msgs.length,
        messages: msgs,
        from: latest.from || thread.from,
        date: latest.date || thread.date,
        snippet: latest.snippet || thread.snippet,
        unread: msgs.some(m => !(m.flags || []).includes('\\Seen')),
        flagged: msgs.some(m => (m.flags || []).includes('\\Flagged')),
        hasAttachments: msgs.some(m => m.hasAttachments)
      });
    }
    return {
      messages: merged,
      threads: [...byThread.values()].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    };
  }),
  removeKeys: (keys) => set((state) => {
    const hiddenKeys = [...new Set([...state.hiddenKeys, ...keys])];
    const gone = new Set(hiddenKeys);
    const messages = state.messages.filter(m => !gone.has(msgKey(m.accountId, m.uid)));
    const threads = stripHiddenThreads(state.threads, hiddenKeys);
    const selectedGone = state.selectedMessage && gone.has(msgKey(state.selectedMessage.accountId, state.selectedMessage.uid));
    return {
      messages,
      threads,
      hiddenKeys,
      total: Math.max(0, state.total - keys.length),
      selectedMessage: selectedGone ? null : state.selectedMessage,
      messageBody: selectedGone ? null : state.messageBody,
      selectedKeys: state.selectedKeys.filter(k => !gone.has(k))
    };
  }),
  unhideKeys: (keys) => set((state) => ({
    hiddenKeys: state.hiddenKeys.filter(k => !keys.includes(k))
  })),
  setTotal: (total) => set({ total }),
  setSelectedMessage: (next) => set((state) => {
    if (!next) return { selectedMessage: null, messageBody: null };
    const html = next.html || '';
    const text = next.text || '';
    const meta: MailDetail = { ...next, html: '', text: '' };
    const prev = state.selectedMessage;
    const sameMeta = prev
      && prev.uid === meta.uid
      && prev.accountId === meta.accountId
      && prev.bodyLoading === meta.bodyLoading
      && (prev.flags || []).join() === (meta.flags || []).join()
      && prev.subject === meta.subject;
    return {
      selectedMessage: sameMeta ? prev : meta,
      messageBody: { html, text }
    };
  }),
  setMessageBody: (messageBody) => set({ messageBody }),
  setSelectedKeys: (selectedKeys) => set({ selectedKeys }),
  toggleSelectedKey: (key, additive) => set((state) => {
    if (!additive) return { selectedKeys: [key] };
    return state.selectedKeys.includes(key)
      ? { selectedKeys: state.selectedKeys.filter(k => k !== key) }
      : { selectedKeys: [...state.selectedKeys, key] };
  }),
  clearSelection: () => set({ selectedKeys: [] }),
  setSignatures: (signatures) => set({ signatures }),
  setLoading: (loading) => set({ loading }),
  setLoadingMore: (loadingMore) => set({ loadingMore }),
  openCompose: (composeMode, replyTo = null) => {
    const body = get().messageBody;
    const withBody = replyTo && body
      ? { ...replyTo, html: replyTo.html || body.html, text: replyTo.text || body.text }
      : replyTo;
    set({ composing: true, composeMode, replyTo: withBody });
  },
  closeCompose: () => set({ composing: false, replyTo: null, composeMode: 'new' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearching: (searching) => set({ searching }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowPalette: (showPalette) => set({ showPalette }),
  toggleSidebar: () => {
    const next = !get().sidebarVisible;
    persist('sidebarVisible', next);
    set({ sidebarVisible: next });
  },
  setSidebarWidth: (w) => { persist('sidebarWidth', w); set({ sidebarWidth: w }); },
  setMaillistWidth: (w) => { persist('maillistWidth', w); set({ maillistWidth: w }); },
  setListPaneHeight: (h) => { persist('listPaneHeight', h); set({ listPaneHeight: h }); },
  setComposeFont: (f) => { persist('composeFont', f); set({ composeFont: f }); },
  setTheme: (t) => { persist('theme', t); set({ theme: t }); },
  setPreviewPosition: (p) => { persist('previewPosition', p); set({ previewPosition: p }); },
  setDensity: (d) => { persist('density', d); set({ density: d }); },
  setThreadingEnabled: (enabled) => {
    persist('threadingEnabled', enabled);
    set({ threadingEnabled: enabled });
  },
  setNotifySound: (enabled) => {
    persist('notifySound', enabled);
    set({ notifySound: enabled });
  },
  setNotifyDesktop: (enabled) => {
    persist('notifyDesktop', enabled);
    set({ notifyDesktop: enabled });
  },
  setLoadRemoteImages: (enabled) => {
    persist('loadRemoteImages', enabled);
    set({ loadRemoteImages: enabled });
  },
}));

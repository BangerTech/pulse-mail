import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore, msgKey, parseKey } from './store';
import { api } from './api';
import Sidebar from './components/Sidebar';
import MailList from './components/MailList';
import MailContent from './components/MailContent';
import Toolbar from './components/Toolbar';
import ComposeModal from './components/ComposeModal';
import SettingsModal from './components/SettingsModal';
import CommandPalette, { Command } from './components/CommandPalette';
import SearchResults, { SearchOptions } from './components/SearchResults';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Icon } from './components/Icon';
import './styles/app.css';

const PAGE_SIZE = 50;

function ResizeHandle({ widthRef, setWidth, min, max }: {
  widthRef: React.MutableRefObject<number>;
  setWidth: (w: number) => void;
  min: number;
  max: number;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.max(min, Math.min(max, startWidth + (ev.clientX - startX)));
      widthRef.current = next;
      setWidth(next);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return <div className="resize-handle" onMouseDown={onMouseDown} />;
}

function VerticalResizeHandle({ percentRef, setPercent, min, max }: {
  percentRef: React.MutableRefObject<number>;
  setPercent: (p: number) => void;
  min: number;
  max: number;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const parent = (e.currentTarget.parentElement as HTMLElement);
    const startY = e.clientY;
    const start = percentRef.current;
    const height = parent.getBoundingClientRect().height || window.innerHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.max(min, Math.min(max, start + ((ev.clientY - startY) / height) * 100));
      percentRef.current = next;
      setPercent(next);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return <div className="resize-handle horizontal" onMouseDown={onMouseDown} />;
}

export default function App() {
  const store = useStore();
  const {
    selectedAccount, selectedFolder, composing, showSettings, showPalette,
    sidebarVisible, sidebarWidth, maillistWidth, listPaneHeight, theme, previewPosition,
    messages, threads, threadingEnabled, selectedMessage, selectedKeys,
    searchQuery, folders, unifiedView, accounts,
    setAccounts, setSelectedAccount, setFoldersForAccount, setSelectedFolder,
    setMessages, setThreads, appendMessages, removeKeys, unhideKeys, setTotal, setSelectedMessage,
    setSignatures, setLoading, setLoadingMore, setSidebarWidth, setMaillistWidth, setListPaneHeight,
    setShowSettings, setShowPalette, setSearchQuery, setSearchResults, setSearching,
    setSelectedKeys, clearSelection, openCompose, toggleSidebar, setTheme,
    setPreviewPosition, setThreadingEnabled, setUnifiedView, setUnifiedUnread, selectMailbox
  } = store;

  const [refreshing, setRefreshing] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 860);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [readingFull, setReadingFull] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    scopeAllAccounts: false,
    from: '',
    hasAttachments: false,
    since: '',
    before: '',
    folder: ''
  });

  const sidebarRef = useRef(sidebarWidth);
  const maillistRef = useRef(maillistWidth);
  const listHeightRef = useRef(listPaneHeight);
  sidebarRef.current = sidebarWidth;
  maillistRef.current = maillistWidth;
  listHeightRef.current = listPaneHeight;

  const searchActive = searchQuery.trim().length > 0;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 859px)');
    const apply = () => setMobile(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!selectedMessage) setReadingFull(false);
  }, [selectedMessage]);

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    };

    apply();

    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    loadAccounts();
    loadSignatures();
    const cleanup = connectWebSocket();
    return cleanup;
  }, []);

  useEffect(() => {
    if (unifiedView) {
      loadMessages();
      loadFolders();
      return;
    }
    if (!selectedAccount) return;
    loadFolders();
    loadMessages();
  }, [selectedAccount, selectedFolder, unifiedView, accounts.length]);

  useEffect(() => {
    if (!searchActive) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => runSearch(), 250);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOptions, selectedAccount]);

  async function loadAccounts() {
    try {
      const accounts = await api.getAccounts();
      setAccounts(accounts);
      if (accounts.length > 0 && !useStore.getState().selectedAccount) {
        setSelectedAccount(accounts[0]);
      }
      if (accounts.length < 2) setUnifiedView(false);
    } catch {}
  }

  async function loadFolders() {
    const state = useStore.getState();
    const list = state.accounts.length ? state.accounts : (state.selectedAccount ? [state.selectedAccount] : []);
    await Promise.all(list.map(async (account) => {
      try {
        setFoldersForAccount(account.id, await api.getFolders(account.id));
      } catch {}
    }));
    if (state.accounts.length > 1) {
      try {
        const data = await api.getUnifiedUnread();
        setUnifiedUnread(data.inbox || 0);
      } catch {}
    }
  }

  function tagMessages(list: any[], accountId?: number, folder?: string) {
    const account = useStore.getState().accounts.find(a => a.id === accountId);
    return (list || []).map((m: any) => ({
      ...m,
      accountId: m.accountId ?? accountId,
      accountEmail: m.accountEmail ?? account?.email,
      accountColor: m.accountColor ?? account?.color,
      folder: m.folder ?? folder
    }));
  }

  async function loadMessages(silent = false) {
    const state = useStore.getState();
    const alreadyLoaded = state.messages.length > 0;
    if (!silent && !alreadyLoaded) setLoading(true);
    try {
      const data = state.unifiedView
        ? await api.getUnifiedInbox(PAGE_SIZE, 0)
        : state.selectedAccount
          ? await api.getMessages(state.selectedAccount.id, state.selectedFolder, PAGE_SIZE, 0)
          : null;
      if (!data) return;
      const folder = state.unifiedView ? 'INBOX' : state.selectedFolder;
      const accountId = state.unifiedView ? undefined : state.selectedAccount?.id;
      setMessages(tagMessages(data.messages, accountId, folder));
      setThreads(tagMessages(data.threads, accountId, folder));
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }

  const loadMore = useCallback(async () => {
    const state = useStore.getState();
    if (state.loadingMore || state.messages.length >= state.total) return;
    if (!state.unifiedView && !state.selectedAccount) return;

    setLoadingMore(true);
    try {
      const data = state.unifiedView
        ? await api.getUnifiedInbox(PAGE_SIZE, state.messages.length)
        : await api.getMessages(
            state.selectedAccount!.id,
            state.selectedFolder,
            PAGE_SIZE,
            state.messages.length
          );
      const folder = state.unifiedView ? 'INBOX' : state.selectedFolder;
      const accountId = state.unifiedView ? undefined : state.selectedAccount?.id;
      appendMessages(
        tagMessages(data.messages, accountId, folder),
        tagMessages(data.threads, accountId, folder)
      );
    } catch {}
    setLoadingMore(false);
  }, [appendMessages, setLoadingMore]);

  async function loadSignatures() {
    try {
      setSignatures(await api.getSignatures());
    } catch {}
  }

  async function runSearch() {
    const query = useStore.getState().searchQuery.trim();
    if (!query) return;

    setSearching(true);
    try {
      const results = await api.search(query, {
        accountId: searchOptions.scopeAllAccounts ? undefined : selectedAccount?.id,
        folder: searchOptions.folder || undefined,
        from: searchOptions.from || undefined,
        hasAttachments: searchOptions.hasAttachments,
        since: searchOptions.since || undefined,
        before: searchOptions.before || undefined
      });
      setSearchResults(results);
    } catch {}
    setSearching(false);
  }

  function connectWebSocket() {
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let reloadTimer: number | undefined;
    let closed = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_mail' || data.type === 'messages_updated') {
            const state = useStore.getState();
            if (state.unifiedView || state.selectedAccount?.id === data.accountId) {
              window.clearTimeout(reloadTimer);
              reloadTimer = window.setTimeout(() => {
                loadMessages(true);
                loadFolders();
              }, 400);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!closed) timer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(reloadTimer);
      ws?.close();
    };
  }

  const openMessage = useCallback(async (key: string) => {
    const { accountId, uid } = parseKey(key);
    const state = useStore.getState();
    const msg = state.messages.find(m => msgKey(m.accountId, m.uid) === key)
      || state.threads.flatMap(t => t.messages || []).find(m => msgKey(m.accountId, m.uid) === key)
      || state.threads.find(t => msgKey(t.accountId, t.uid) === key);
    const folder = msg?.folder || (state.unifiedView ? 'INBOX' : state.selectedFolder);
    const accId = msg?.accountId || accountId || state.selectedAccount?.id;
    if (!accId) return;

    setSelectedKeys([key]);
    setSelectedMessage({
      uid,
      accountId: accId,
      folder,
      subject: msg?.subject || '',
      from: msg?.from || {},
      to: (msg as any)?.to || [],
      cc: (msg as any)?.cc || [],
      date: msg?.date || '',
      html: '',
      text: msg?.snippet || '',
      flags: msg?.flags || [],
      attachments: [],
      bodyLoading: true
    });

    try {
      const detail = await api.getMessage(accId, uid, folder);
      const current = useStore.getState().selectedMessage;
      if (current && current.uid === uid && (current.accountId ?? accId) === accId) {
        setSelectedMessage({ ...detail, accountId: detail.accountId ?? accId, folder: detail.folder ?? folder, bodyLoading: false });
      }

      if (!detail.flags?.includes('\\Seen')) {
        api.setFlags(accId, [uid], folder, ['\\Seen'], 'add').then(() => loadFolders()).catch(() => {});
      }
    } catch {
      const current = useStore.getState().selectedMessage;
      if (current?.uid === uid) setSelectedMessage({ ...current, bodyLoading: false });
    }
  }, [setSelectedMessage, setSelectedKeys]);

  const openMessageFull = useCallback((key: string) => {
    setReadingFull(true);
    openMessage(key);
  }, [openMessage]);

  const openSearchResult = useCallback(async (accountId: number, folder: string, uid: number) => {
    try {
      const detail = await api.getMessage(accountId, uid, folder);
      setSelectedMessage({ ...detail, accountId, folder });
      setSelectedKeys([msgKey(accountId, uid)]);
    } catch {}
  }, [setSelectedMessage, setSelectedKeys]);

  const targetKeys = useCallback((explicit?: string[]) => {
    if (explicit?.length) return explicit;
    const state = useStore.getState();
    if (state.selectedKeys.length) return state.selectedKeys;
    if (state.selectedMessage) {
      return [msgKey(state.selectedMessage.accountId ?? state.selectedAccount?.id, state.selectedMessage.uid)];
    }
    return [];
  }, []);

  function refsFromKeys(keys: string[]) {
    const state = useStore.getState();
    const fallbackFolder = state.unifiedView ? 'INBOX' : state.selectedFolder;
    const fallbackAccount = state.selectedAccount?.id;
    const groups = new Map<string, { accountId: number; folder: string; uids: number[]; keys: string[] }>();

    for (const key of keys) {
      const parsed = parseKey(key);
      const msg = state.messages.find(m => msgKey(m.accountId, m.uid) === key);
      const thread = state.threads.find(t => msgKey(t.accountId, t.uid) === key);
        const accountId = msg?.accountId ?? thread?.accountId ?? parsed.accountId ?? fallbackAccount;
      if (!accountId) continue;
      const folder = msg?.folder || fallbackFolder;
      const uids = thread?.uids?.length ? thread.uids : [parsed.uid];
      const groupKey = `${accountId}:${folder}`;
      const group = groups.get(groupKey) || { accountId, folder, uids: [], keys: [] };
      for (const uid of uids) {
        if (!group.uids.includes(uid)) group.uids.push(uid);
      }
      group.keys.push(key);
      groups.set(groupKey, group);
    }

    return [...groups.values()];
  }

  const handleArchive = useCallback(async (keys?: string[]) => {
    const list = targetKeys(keys);
    if (!list.length) return;
    const groups = refsFromKeys(list);
    if (!groups.length) return;

    removeKeys(list);
    try {
      await Promise.all(groups.map(g => api.archiveMail(g.accountId, g.uids, g.folder)));
      loadFolders();
    } catch (err: any) {
      unhideKeys(list);
      loadMessages(true);
      alert('Archivieren fehlgeschlagen: ' + err.message);
    }
  }, [targetKeys, removeKeys, unhideKeys]);

  const handleDelete = useCallback(async (keys?: string[]) => {
    const list = targetKeys(keys);
    if (!list.length) return;
    const groups = refsFromKeys(list);
    if (!groups.length) return;

    removeKeys(list);
    try {
      await Promise.all(groups.map(g => api.deleteMail(g.accountId, g.uids, g.folder)));
      loadFolders();
    } catch (err: any) {
      unhideKeys(list);
      loadMessages(true);
      alert('Löschen fehlgeschlagen: ' + err.message);
    }
  }, [targetKeys, removeKeys, unhideKeys]);

  const handleToggleFlag = useCallback(async (keys?: string[], flagged?: boolean) => {
    const list = targetKeys(keys);
    if (!list.length) return;
    const groups = refsFromKeys(list);
    if (!groups.length) return;

    const state = useStore.getState();
    const next = flagged ?? !state.selectedMessage?.flags?.includes('\\Flagged');

    try {
      await Promise.all(groups.map(g => api.setFlags(g.accountId, g.uids, g.folder, ['\\Flagged'], next ? 'add' : 'remove')));
      loadMessages(true);
      if (state.selectedMessage) {
        const selectedKey = msgKey(state.selectedMessage.accountId ?? state.selectedAccount?.id, state.selectedMessage.uid);
        if (list.includes(selectedKey)) {
          const flags = new Set(state.selectedMessage.flags || []);
          if (next) flags.add('\\Flagged'); else flags.delete('\\Flagged');
          setSelectedMessage({ ...state.selectedMessage, flags: [...flags] });
        }
      }
    } catch {}
  }, [targetKeys, setSelectedMessage]);

  const handleToggleUnread = useCallback(async () => {
    const list = targetKeys();
    if (!list.length) return;
    const groups = refsFromKeys(list);
    if (!groups.length) return;

    const state = useStore.getState();
    const isUnread = state.selectedMessage
      ? !state.selectedMessage.flags?.includes('\\Seen')
      : false;

    try {
      await Promise.all(groups.map(g =>
        api.setFlags(g.accountId, g.uids, g.folder, ['\\Seen'], isUnread ? 'add' : 'remove')
      ));
      loadMessages(true);
      loadFolders();
      if (state.selectedMessage) {
        const flags = new Set(state.selectedMessage.flags || []);
        if (isUnread) flags.add('\\Seen'); else flags.delete('\\Seen');
        setSelectedMessage({ ...state.selectedMessage, flags: [...flags] });
      }
    } catch {}
  }, [targetKeys, setSelectedMessage]);

  const handleMove = useCallback(async (target: string, keys?: string[]) => {
    const list = targetKeys(keys);
    if (!list.length) return;
    const groups = refsFromKeys(list);
    if (!groups.length) return;

    removeKeys(list);
    try {
      await Promise.all(groups.map(g => api.moveMail(g.accountId, g.uids, g.folder, target)));
      loadFolders();
    } catch (err: any) {
      unhideKeys(list);
      loadMessages(true);
      alert('Verschieben fehlgeschlagen: ' + err.message);
    }
  }, [targetKeys, removeKeys, unhideKeys]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMessages(), loadFolders()]);
    setRefreshing(false);
  }, [selectedAccount, selectedFolder]);

  const navigate = useCallback((direction: 1 | -1) => {
    const state = useStore.getState();
    const list = state.threadingEnabled
      ? state.threads.map(t => msgKey(t.accountId, t.uid))
      : state.messages.map(m => msgKey(m.accountId, m.uid));
    if (!list.length) return;

    const current = state.selectedMessage
      ? msgKey(state.selectedMessage.accountId ?? state.selectedAccount?.id, state.selectedMessage.uid)
      : undefined;
    const index = current !== undefined ? list.indexOf(current) : -1;
    const nextIndex = index === -1
      ? (direction === 1 ? 0 : list.length - 1)
      : Math.max(0, Math.min(list.length - 1, index + direction));

    openMessage(list[nextIndex]);
  }, [openMessage]);

  const focusSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>('.search-bar input');
    input?.focus();
    input?.select();
  }, []);

  const handleEscape = useCallback(() => {
    const state = useStore.getState();
    if (state.showPalette) return setShowPalette(false);
    if (state.composing) return store.closeCompose();
    if (state.showSettings) return setShowSettings(false);
    if (readingFull) return setReadingFull(false);
    if (state.searchQuery) return setSearchQuery('');
    if (state.selectedMessage) {
      setSelectedMessage(null);
      clearSelection();
    }
  }, [readingFull, setShowPalette, setShowSettings, setSearchQuery, setSelectedMessage, clearSelection, store]);

  const shortcutsEnabled = !composing && !showSettings && !showPalette;

  useKeyboardShortcuts({
    onCompose: () => openCompose('new'),
    onReply: () => selectedMessage && openCompose('reply', selectedMessage),
    onReplyAll: () => selectedMessage && openCompose('replyAll', selectedMessage),
    onForward: () => selectedMessage && openCompose('forward', selectedMessage),
    onArchive: () => handleArchive(),
    onDelete: () => handleDelete(),
    onToggleFlag: () => handleToggleFlag(),
    onToggleUnread: handleToggleUnread,
    onNext: () => navigate(1),
    onPrevious: () => navigate(-1),
    onEscape: handleEscape,
    onSearch: focusSearch,
    onPalette: () => setShowPalette(true),
    onRefresh: handleRefresh
  }, shortcutsEnabled);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'compose', label: 'Neue E-Mail', icon: 'compose', shortcut: 'N', run: () => openCompose('new') },
      {
        id: 'reply', label: 'Antworten', icon: 'reply', shortcut: 'R',
        disabled: !selectedMessage, run: () => selectedMessage && openCompose('reply', selectedMessage)
      },
      {
        id: 'replyAll', label: 'Allen antworten', icon: 'replyAll', shortcut: 'A',
        disabled: !selectedMessage, run: () => selectedMessage && openCompose('replyAll', selectedMessage)
      },
      {
        id: 'forward', label: 'Weiterleiten', icon: 'forward', shortcut: 'F',
        disabled: !selectedMessage, run: () => selectedMessage && openCompose('forward', selectedMessage)
      },
      {
        id: 'archive', label: 'Archivieren', icon: 'archive', shortcut: 'E',
        disabled: !selectedMessage && !selectedKeys.length, run: () => handleArchive()
      },
      {
        id: 'delete', label: 'Löschen', icon: 'trash', shortcut: '#',
        disabled: !selectedMessage && !selectedKeys.length, run: () => handleDelete()
      },
      {
        id: 'flag', label: 'Markierung umschalten', icon: 'flag', shortcut: 'L',
        disabled: !selectedMessage && !selectedKeys.length, run: () => handleToggleFlag()
      },
      {
        id: 'unread', label: 'Gelesen-Status umschalten', icon: 'envelope', shortcut: 'U',
        disabled: !selectedMessage, run: handleToggleUnread
      },
      {
        id: 'move', label: 'In Ordner verschieben...', icon: 'folder',
        disabled: !selectedMessage && !selectedKeys.length,
        run: () => {
          const target = window.prompt('Ordnerpfad (z.B. Archive):');
          if (target) handleMove(target);
        }
      },
      { id: 'search', label: 'Suchen', icon: 'search', shortcut: '/', run: focusSearch },
      { id: 'settings', label: 'Einstellungen öffnen', icon: 'settings', run: () => setShowSettings(true) },
      { id: 'sidebar', label: 'Seitenleiste umschalten', icon: 'sidebar', run: toggleSidebar },
      {
        id: 'threading',
        label: threadingEnabled ? 'Konversationen ausschalten' : 'Konversationen einschalten',
        icon: 'inbox',
        run: () => setThreadingEnabled(!threadingEnabled)
      },
      {
        id: 'preview',
        label: previewPosition === 'right' ? 'Vorschau nach unten' : 'Vorschau nach rechts',
        icon: 'sidebar',
        run: () => setPreviewPosition(previewPosition === 'right' ? 'bottom' : 'right')
      },
      {
        id: 'theme',
        label: 'Erscheinungsbild wechseln',
        icon: 'moon',
        hint: theme === 'system' ? 'System' : theme === 'dark' ? 'Dunkel' : 'Hell',
        run: () => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')
      }
    ];

    const unifiedCommand: Command[] = store.accounts.length > 1 ? [{
      id: 'unified',
      label: 'Alle Eingänge',
      hint: 'Alle Postfächer',
      icon: 'inbox',
      run: () => setUnifiedView(true)
    }] : [];

    const folderCommands: Command[] = folders.map(folder => ({
      id: `folder-${folder.path}`,
      label: folder.name,
      hint: 'Ordner öffnen',
      icon: 'folder',
      run: () => setSelectedFolder(folder.path)
    }));

    const accountCommands: Command[] = store.accounts.map(account => ({
      id: `account-${account.id}`,
      label: account.email,
      hint: 'Account wechseln',
      icon: 'envelope',
      run: () => { setUnifiedView(false); selectMailbox(account, 'INBOX'); }
    }));

    return [...base, ...unifiedCommand, ...folderCommands, ...accountCommands];
  }, [
    selectedMessage, selectedKeys, folders, store.accounts, theme, threadingEnabled,
    previewPosition, openCompose, handleArchive, handleDelete, handleMove, handleToggleFlag,
    handleToggleUnread, handleRefresh, focusSearch, setShowSettings, toggleSidebar,
    setThreadingEnabled, setPreviewPosition, setTheme, setSelectedFolder, setSelectedAccount,
    setUnifiedView, selectMailbox
  ]);

  const reading = mobile && !!selectedMessage;

  const folderTitle = unifiedView
    ? 'Alle Eingänge'
    : (() => {
    const folder = folders.find(f => f.path === selectedFolder);
    if (!folder) return selectedFolder;
    const names: Record<string, string> = {
      '\\Inbox': 'Eingang', '\\Sent': 'Gesendet', '\\Drafts': 'Entwürfe',
      '\\Trash': 'Papierkorb', '\\Junk': 'Spam', '\\Archive': 'Archiv'
    };
    if (folder.specialUse && names[folder.specialUse]) return names[folder.specialUse];
    if (folder.path.toUpperCase() === 'INBOX') return 'Eingang';
    return folder.name;
  })();

  const showSidebar = mobile ? drawerOpen : sidebarVisible;

  return (
    <div className={`app ${mobile ? 'mobile' : ''} ${reading ? 'reading' : ''}`}>
      <Toolbar
        sidebarWidth={sidebarWidth}
        onArchive={() => handleArchive()}
        onDelete={() => handleDelete()}
        onMove={handleMove}
        onToggleFlag={() => handleToggleFlag()}
        onToggleUnread={handleToggleUnread}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        mobile={mobile}
        reading={reading}
        onBack={() => { setReadingFull(false); setSelectedMessage(null); clearSelection(); }}
        onMenu={() => setDrawerOpen(true)}
        folderTitle={folderTitle}
      />

      <div className="app-body">
        {mobile && drawerOpen && (
          <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
        )}

        {showSidebar && (
          <>
            <div
              className={`app-pane sidebar-pane ${mobile ? 'drawer' : ''}`}
              style={mobile ? undefined : { width: sidebarWidth, minWidth: sidebarWidth }}
            >
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
            {!mobile && (
              <ResizeHandle widthRef={sidebarRef} setWidth={setSidebarWidth} min={180} max={420} />
            )}
          </>
        )}

        <div className={`app-split ${mobile ? 'right' : previewPosition}`}>
          <div
            className="app-pane list-pane"
            style={mobile
              ? undefined
              : previewPosition === 'right'
                ? { width: maillistWidth, minWidth: maillistWidth }
                : { height: `${listPaneHeight}%`, minHeight: 160 }}
          >
            {searchActive ? (
              <SearchResults
                options={searchOptions}
                onOptionsChange={setSearchOptions}
                onOpen={(accountId, folder, uid) => {
                  openSearchResult(accountId, folder, uid);
                  setDrawerOpen(false);
                }}
              />
            ) : (
              <MailList
                onOpen={openMessage}
                onOpenFull={openMessageFull}
                onLoadMore={loadMore}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onToggleFlag={handleToggleFlag}
                swipeEnabled={mobile}
              />
            )}
          </div>

          {!mobile && (previewPosition === 'right' ? (
            <ResizeHandle widthRef={maillistRef} setWidth={setMaillistWidth} min={280} max={640} />
          ) : (
            <VerticalResizeHandle percentRef={listHeightRef} setPercent={setListPaneHeight} min={22} max={72} />
          ))}

          <MailContent
            variant={mobile ? 'full' : 'preview'}
            onExpand={() => setReadingFull(true)}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onToggleFlag={handleToggleFlag}
          />
        </div>
      </div>

      {!mobile && readingFull && selectedMessage && (
        <div className="reader-overlay" onMouseDown={() => setReadingFull(false)}>
          <div className="reader-window" onMouseDown={e => e.stopPropagation()}>
            <MailContent
              variant="full"
              onClose={() => setReadingFull(false)}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onToggleFlag={handleToggleFlag}
            />
          </div>
        </div>
      )}

      {mobile && !reading && !composing && (
        <button className="mobile-fab" onClick={() => openCompose('new')} title="Neue E-Mail">
          <Icon name="compose" />
        </button>
      )}

      {composing && <ComposeModal />}
      {showSettings && <SettingsModal />}
      {showPalette && <CommandPalette commands={commands} />}
    </div>
  );
}

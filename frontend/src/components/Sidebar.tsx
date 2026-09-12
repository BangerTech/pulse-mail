import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, Account, Folder } from '../store';
import { Icon } from './Icon';
import '../styles/sidebar.css';

const SPECIAL_ICONS: Record<string, string> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'draft',
  '\\Trash': 'trash',
  '\\Junk': 'junk',
  '\\Archive': 'archive',
};

const SPECIAL_NAMES: Record<string, string> = {
  '\\Inbox': 'Eingang',
  '\\Sent': 'Gesendet',
  '\\Drafts': 'Entwürfe',
  '\\Trash': 'Papierkorb',
  '\\Junk': 'Spam',
  '\\Archive': 'Archiv',
};

const SPECIAL_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\Junk', '\\Trash'];

function isInbox(f: { path: string; specialUse?: string }) {
  return f.specialUse === '\\Inbox' || f.path.toUpperCase() === 'INBOX';
}

function displayName(f: { name: string; path: string; specialUse?: string }) {
  const key = isInbox(f) ? '\\Inbox' : f.specialUse;
  return (key && SPECIAL_NAMES[key]) || f.name;
}

function iconFor(f: { path: string; specialUse?: string }) {
  const key = isInbox(f) ? '\\Inbox' : f.specialUse;
  return (key && SPECIAL_ICONS[key]) || 'folder';
}

function splitFolders(folders: Folder[]) {
  const special = folders
    .filter(f => f.specialUse || isInbox(f))
    .sort((a, b) => {
      const key = (f: Folder) => (isInbox(f) ? '\\Inbox' : f.specialUse || '');
      return SPECIAL_ORDER.indexOf(key(a)) - SPECIAL_ORDER.indexOf(key(b));
    });
  const others = folders.filter(f => !f.specialUse && !isInbox(f));
  return { special, others };
}

function inboxUnread(folders: Folder[]) {
  return folders.find(isInbox)?.unread || 0;
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const {
    accounts, selectedAccount, folders, foldersByAccount, selectedFolder,
    unifiedView, unifiedUnread, collapsedAccounts,
  } = useStore(useShallow(s => ({
    accounts: s.accounts,
    selectedAccount: s.selectedAccount,
    folders: s.folders,
    foldersByAccount: s.foldersByAccount,
    selectedFolder: s.selectedFolder,
    unifiedView: s.unifiedView,
    unifiedUnread: s.unifiedUnread,
    collapsedAccounts: s.collapsedAccounts,
  })));
  const setUnifiedView = useStore(s => s.setUnifiedView);
  const selectMailbox = useStore(s => s.selectMailbox);
  const toggleAccountCollapsed = useStore(s => s.toggleAccountCollapsed);

  const renderFolder = (account: Account, folder: Folder) => {
    const active = !unifiedView
      && selectedAccount?.id === account.id
      && selectedFolder === folder.path;

    return (
      <button
        key={`${account.id}:${folder.path}`}
        className={`sidebar-item nested ${active ? 'active' : ''}`}
        onClick={() => {
          selectMailbox(account, folder.path);
          onNavigate?.();
        }}
      >
        <Icon name={iconFor(folder)} size={15} className={`sidebar-item-icon tile ${iconFor(folder)}`} />
        <span className="sidebar-item-label">{displayName(folder)}</span>
        {!!folder.unread && <span className="sidebar-badge">{folder.unread}</span>}
      </button>
    );
  };

  const renderAccount = (account: Account) => {
    const list = foldersByAccount[account.id] || (selectedAccount?.id === account.id ? folders : []);
    const { special, others } = splitFolders(list);
    const collapsed = collapsedAccounts.includes(account.id);
    const unread = inboxUnread(list);
    const isCurrent = !unifiedView && selectedAccount?.id === account.id;

    return (
      <div key={account.id} className="sidebar-account-group">
        <button
          className={`sidebar-account-header ${isCurrent ? 'current' : ''}`}
          onClick={() => toggleAccountCollapsed(account.id)}
          title={account.email}
        >
          <Icon
            name="chevronRight"
            size={12}
            className={`sidebar-chevron ${collapsed ? '' : 'open'}`}
          />
          <span className="sidebar-account-dot" style={{ background: account.color }} />
          <span className="sidebar-item-label">{account.name || account.email}</span>
          {!!unread && <span className="sidebar-badge">{unread}</span>}
        </button>

        {!collapsed && (
          <div className="sidebar-account-folders">
            {special.map(folder => renderFolder(account, folder))}
            {others.map(folder => renderFolder(account, folder))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        {accounts.length > 1 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Favoriten</div>
            <button
              className={`sidebar-item ${unifiedView ? 'active' : ''}`}
              onClick={() => {
                setUnifiedView(true);
                onNavigate?.();
              }}
            >
              <Icon name="inbox" size={16} className="sidebar-item-icon tile inbox" />
              <span className="sidebar-item-label">Alle Eingänge</span>
              {!!unifiedUnread && <span className="sidebar-badge">{unifiedUnread}</span>}
            </button>
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            {accounts.length > 1 ? 'Postfächer' : 'Favoriten'}
          </div>
          {accounts.map(renderAccount)}
        </div>
      </div>
    </div>
  );
}

const Sidebar = memo(SidebarInner);
export default Sidebar;

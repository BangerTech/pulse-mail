import { useState, useRef, useEffect, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { Icon } from './Icon';
import UserMenu from './UserMenu';
import '../styles/toolbar.css';

interface ToolbarProps {
  sidebarWidth: number;
  onArchive: () => void;
  onDelete: () => void;
  onMove: (folder: string) => void;
  onToggleFlag: () => void;
  onToggleUnread: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  mobile?: boolean;
  reading?: boolean;
  onBack?: () => void;
  onMenu?: () => void;
  folderTitle?: string;
}

function ToolbarInner({
  sidebarWidth,
  onArchive,
  onDelete,
  onMove,
  onToggleFlag,
  onToggleUnread,
  onRefresh,
  refreshing,
  mobile = false,
  reading = false,
  onBack,
  onMenu,
  folderTitle
}: ToolbarProps) {
  const {
    selectedMessage, selectedKeys, selectedAccount, selectedFolder,
    sidebarVisible, searchQuery, folders,
  } = useStore(useShallow(s => ({
    selectedMessage: s.selectedMessage,
    selectedKeys: s.selectedKeys,
    selectedAccount: s.selectedAccount,
    selectedFolder: s.selectedFolder,
    sidebarVisible: s.sidebarVisible,
    searchQuery: s.searchQuery,
    folders: s.folders,
  })));
  const openCompose = useStore(s => s.openCompose);
  const toggleSidebar = useStore(s => s.toggleSidebar);
  const setSearchQuery = useStore(s => s.setSearchQuery);
  const setShowPalette = useStore(s => s.setShowPalette);

  const [showMove, setShowMove] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setShowMove(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const hasSelection = !!selectedMessage || selectedKeys.length > 0;
  const multiple = selectedKeys.length > 1;
  const isFlagged = selectedMessage?.flags?.includes('\\Flagged');
  const isUnread = selectedMessage ? !selectedMessage.flags?.includes('\\Seen') : false;

  if (mobile) {
    return (
      <div className="toolbar mobile-toolbar">
        <div className="toolbar-left">
          {reading ? (
            <button className="toolbar-btn" onClick={onBack} title="Zurück" aria-label="Zurück">
              <Icon name="chevronLeft" />
            </button>
          ) : (
            <button className="toolbar-btn" onClick={onMenu} title="Ordner" aria-label="Ordner">
              <Icon name="sidebar" />
            </button>
          )}
        </div>

        <div className="toolbar-title">
          {reading ? (selectedMessage?.subject || 'Nachricht') : (folderTitle || 'Posteingang')}
        </div>

        <div className="toolbar-right">
          {reading ? (
            <>
              <button className="toolbar-btn" onClick={() => selectedMessage && openCompose('reply', selectedMessage)} title="Antworten" aria-label="Antworten">
                <Icon name="reply" />
              </button>
              <button className="toolbar-btn" onClick={onArchive} title="Archivieren" aria-label="Archivieren">
                <Icon name="archive" />
              </button>
              <button className="toolbar-btn destructive" onClick={onDelete} title="Löschen" aria-label="Löschen">
                <Icon name="trash" />
              </button>
            </>
          ) : (
            <>
              <div className="search-bar">
                <Icon name="search" className="search-icon" size={14} />
                <input
                  type="search"
                  placeholder="Suchen"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                className={`toolbar-btn ${refreshing ? 'spinning' : ''}`}
                onClick={onRefresh}
                title="Aktualisieren"
                aria-label="Aktualisieren"
              >
                <Icon name="refresh" />
              </button>
              <UserMenu />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left" style={{ width: sidebarVisible ? sidebarWidth : 60 }}>
        <button
          className="toolbar-btn"
          onClick={toggleSidebar}
          title={sidebarVisible ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
          aria-label={sidebarVisible ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
        >
          <Icon name="sidebar" />
        </button>
        <button className="compose-button" onClick={() => openCompose('new')} title="Neue E-Mail (N)" aria-label="Neue E-Mail">
          <Icon name="compose" />
          {sidebarVisible && <span>Neue E-Mail</span>}
        </button>
      </div>

      <div className="toolbar-actions">
        <button className="toolbar-btn" onClick={onArchive} disabled={!hasSelection} title="Archivieren (E)" aria-label="Archivieren">
          <Icon name="archive" />
        </button>
        <button className="toolbar-btn destructive" onClick={onDelete} disabled={!hasSelection} title="Löschen (⌫)" aria-label="Löschen">
          <Icon name="trash" />
        </button>
        <div className="toolbar-move" ref={moveRef}>
          <button
            className="toolbar-btn"
            onClick={() => setShowMove(v => !v)}
            disabled={!hasSelection}
            title="Verschieben"
            aria-label="Verschieben"
          >
            <Icon name="folder" />
          </button>
          {showMove && (
            <div className="toolbar-menu">
              {folders.filter(f => f.path !== selectedFolder).map(folder => (
                <button
                  key={folder.path}
                  className="toolbar-menu-item"
                  onClick={() => {
                    onMove(folder.path);
                    setShowMove(false);
                  }}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="toolbar-divider" />

        <button
          className="toolbar-btn"
          onClick={() => selectedMessage && openCompose('reply', selectedMessage)}
          disabled={!selectedMessage || multiple}
          title="Antworten (R)"
          aria-label="Antworten"
        >
          <Icon name="reply" />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => selectedMessage && openCompose('replyAll', selectedMessage)}
          disabled={!selectedMessage || multiple}
          title="Allen antworten (A)"
          aria-label="Allen antworten"
        >
          <Icon name="replyAll" />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => selectedMessage && openCompose('forward', selectedMessage)}
          disabled={!selectedMessage || multiple}
          title="Weiterleiten (F)"
          aria-label="Weiterleiten"
        >
          <Icon name="forward" />
        </button>

        <span className="toolbar-divider" />

        <button
          className={`toolbar-btn ${isFlagged ? 'flagged' : ''}`}
          onClick={onToggleFlag}
          disabled={!hasSelection}
          title="Markieren (L)"
          aria-label="Markieren"
          aria-pressed={!!isFlagged}
        >
          <Icon name="flag" />
        </button>
        <button
          className="toolbar-btn"
          onClick={onToggleUnread}
          disabled={!hasSelection}
          title={isUnread ? 'Als gelesen markieren (U)' : 'Als ungelesen markieren (U)'}
          aria-label={isUnread ? 'Als gelesen markieren' : 'Als ungelesen markieren'}
        >
          <Icon name={isUnread ? 'envelopeOpen' : 'envelope'} />
        </button>
      </div>

      <div className="toolbar-right">
        <div className="search-bar">
          <Icon name="search" className="search-icon" size={14} />
          <input
            type="text"
            placeholder="Suchen"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} title="Suche zurücksetzen" aria-label="Suche zurücksetzen">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <button className="toolbar-btn" onClick={() => setShowPalette(true)} title="Befehle (⌘K)" aria-label="Befehlspalette">
          <Icon name="command" />
        </button>
        <button
          className={`toolbar-btn ${refreshing ? 'spinning' : ''}`}
          onClick={onRefresh}
          title="Aktualisieren"
          aria-label="Aktualisieren"
        >
          <Icon name="refresh" />
        </button>
        <UserMenu />
      </div>
    </div>
  );
}

const Toolbar = memo(ToolbarInner);
export default Toolbar;

import { useRef, useCallback, useState, useEffect, memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore, msgKey, MailThread, MailMessage } from '../store';
import { Icon } from './Icon';
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { de } from 'date-fns/locale';
import '../styles/maillist.css';

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Gestern';
  if (isThisYear(date)) return format(date, 'd. MMM', { locale: de });
  return format(date, 'd. MMM yy', { locale: de });
}

function getInitials(name?: string, address?: string) {
  const source = (name || address || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.charAt(0).toUpperCase();
}

const AVATAR_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];

function getAvatarColor(address?: string) {
  if (!address) return '#8E8E93';
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface MailListProps {
  onOpen: (key: string) => void;
  onLoadMore: () => void;
  onArchive: (keys: string[]) => void;
  onDelete: (keys: string[]) => void;
  onToggleFlag: (keys: string[], flagged?: boolean) => void;
  onOpenFull?: (key: string) => void;
  swipeEnabled?: boolean;
}

interface Row {
  key: string;
  uid: number;
  keys: string[];
  subject: string;
  from: { name?: string; address?: string };
  date: string;
  snippet: string;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  count: number;
  accountColor?: string;
  accountEmail?: string;
  showAccount?: boolean;
}

const SWIPE_COMMIT = 112;
const SWIPE_MAX = 168;

interface MailRowProps {
  row: Row;
  index: number;
  isActive: boolean;
  swipeEnabled: boolean;
  onClick: (row: Row, index: number, e: React.MouseEvent) => void;
  onActivate: (row: Row, index: number) => void;
  onArchive: (keys: string[]) => void;
  onDelete: (keys: string[]) => void;
  onToggleFlag: (keys: string[], flagged?: boolean) => void;
  onOpenFull?: (key: string) => void;
}

const MailRow = memo(function MailRow({
  row,
  index,
  isActive,
  swipeEnabled,
  onClick,
  onActivate,
  onArchive,
  onDelete,
  onToggleFlag,
  onOpenFull
}: MailRowProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; lock?: 'h' | 'v' } | null>(null);
  const dxRef = useRef(0);
  const swipedRef = useRef(false);
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !swipeEnabled) return;
    const blockScroll = (e: TouchEvent) => {
      if (startRef.current?.lock === 'h') e.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, [swipeEnabled]);

  const setOffset = (value: number, snap = false) => {
    dxRef.current = value;
    setSnapping(snap);
    setDx(value);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!swipeEnabled || e.pointerType === 'mouse') return;
    startRef.current = { x: e.clientX, y: e.clientY };
    swipedRef.current = false;
    setSnapping(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    const mx = e.clientX - start.x;
    const my = e.clientY - start.y;
    if (!start.lock) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      start.lock = Math.abs(mx) > Math.abs(my) * 1.15 ? 'h' : 'v';
      if (start.lock === 'v') return;
      wrapRef.current?.setPointerCapture(e.pointerId);
    }
    if (start.lock !== 'h') return;
    const next = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, mx));
    setOffset(next);
    if (Math.abs(next) > 12) swipedRef.current = true;
  };

  const settle = () => {
    const start = startRef.current;
    startRef.current = null;
    if (!start || start.lock !== 'h') return;
    const dist = dxRef.current;
    if (dist <= -SWIPE_COMMIT) {
      setOffset(-Math.max(window.innerWidth, 400), true);
      window.setTimeout(() => onDelete(row.keys), 180);
      return;
    }
    if (dist >= SWIPE_COMMIT) {
      setOffset(Math.max(window.innerWidth, 400), true);
      window.setTimeout(() => onArchive(row.keys), 180);
      return;
    }
    setOffset(0, true);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swipedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      swipedRef.current = false;
      return;
    }
    onClick(row, index, e);
  };

  return (
    <div
      ref={wrapRef}
      className={`maillist-swipe ${dx < 0 ? 'reveal-delete' : ''} ${dx > 0 ? 'reveal-archive' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={settle}
      onPointerCancel={settle}
    >
      {swipeEnabled && (
        <div className="maillist-swipe-bg" aria-hidden>
          <div className="maillist-swipe-action archive">
            <Icon name="archive" size={18} />
            <span>Archiv</span>
          </div>
          <div className="maillist-swipe-action delete">
            <span>Löschen</span>
            <Icon name="trash" size={18} />
          </div>
        </div>
      )}

      <div
        className={`maillist-item ${isActive ? 'active' : ''} ${row.unread ? 'unread' : ''} ${snapping ? 'swipe-snap' : ''}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onClick={handleClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenFull?.(row.keys[row.keys.length - 1]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate(row, index);
          }
        }}
        role="button"
        tabIndex={0}
        aria-selected={isActive}
        aria-label={`${row.unread ? 'Ungelesen: ' : ''}${row.from.name || row.from.address || 'Unbekannt'} — ${row.subject || 'Kein Betreff'}`}
      >
        <div className="maillist-indicator">
          {row.unread && <span className="maillist-unread-dot" />}
        </div>

        <div
          className="maillist-avatar"
          style={{ background: getAvatarColor(row.from.address) }}
          title={row.showAccount ? row.accountEmail : undefined}
        >
          {getInitials(row.from.name, row.from.address)}
          {row.showAccount && (
            <span
              className="maillist-account-dot"
              style={{ background: row.accountColor || 'var(--accent-color)' }}
            />
          )}
        </div>

        <div className="maillist-content">
          <div className="maillist-row">
            <span className="maillist-from">
              {row.from.name || row.from.address || 'Unbekannt'}
            </span>
            {row.count > 1 && <span className="maillist-count">{row.count}</span>}
            <span className="maillist-date">{formatDate(row.date)}</span>
          </div>

          <div className="maillist-row">
            <span className="maillist-subject">{row.subject || '(Kein Betreff)'}</span>
            {row.flagged && <Icon name="flag" size={12} className="maillist-flag" filled />}
            {row.hasAttachments && <Icon name="attachment" size={12} className="maillist-attachment" />}
          </div>

          {row.snippet && <div className="maillist-snippet">{row.snippet}</div>}
        </div>

        <div className="maillist-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="maillist-action"
            onClick={() => onArchive(row.keys)}
            title="Archivieren"
            aria-label="Archivieren"
          >
            <Icon name="archive" size={15} />
          </button>
          <button
            className="maillist-action"
            onClick={() => onToggleFlag(row.keys, !row.flagged)}
            title={row.flagged ? 'Markierung entfernen' : 'Markieren'}
            aria-label={row.flagged ? 'Markierung entfernen' : 'Markieren'}
            aria-pressed={row.flagged}
          >
            <Icon name="flag" size={15} filled={row.flagged} />
          </button>
          <button
            className="maillist-action destructive"
            onClick={() => onDelete(row.keys)}
            title="Löschen"
            aria-label="Löschen"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
});

// Rough starting height per row; the virtualizer replaces this per item
// via measureElement once each row lays out. Larger than the actual row
// height means overscan renders comfortably and the initial scroll bar
// doesn't undershoot on very long lists.
const ROW_ESTIMATE_COMFORTABLE = 88;
const ROW_ESTIMATE_COMPACT = 56;

export default function MailList({ onOpen, onLoadMore, onArchive, onDelete, onToggleFlag, onOpenFull, swipeEnabled = false }: MailListProps) {
  // Granular selectors so unrelated store changes (compose modal, search,
  // sidebar width, ...) don't re-render the whole list.
  const messages = useStore(s => s.messages);
  const threads = useStore(s => s.threads);
  const threadingEnabled = useStore(s => s.threadingEnabled);
  const density = useStore(s => s.density);
  const total = useStore(s => s.total);
  // Only the identity of the selected message matters for row highlighting;
  // subscribing to the full detail object (including the HTML body) would
  // rerender the list every time a mail is opened.
  const selectedKey = useStore(s => s.selectedMessage
    ? msgKey(s.selectedMessage.accountId, s.selectedMessage.uid)
    : '');
  const selectedKeys = useStore(s => s.selectedKeys);
  const loading = useStore(s => s.loading);
  const loadingMore = useStore(s => s.loadingMore);
  const showAccount = useStore(useShallow(s => s.unifiedView && s.accounts.length > 1));
  const toggleSelectedKey = useStore(s => s.toggleSelectedKey);
  const setSelectedKeys = useStore(s => s.setSelectedKeys);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef<number | null>(null);

  const rows: Row[] = useMemo(() => (
    threadingEnabled
      ? threads.map((t: MailThread) => {
          const accountId = t.accountId;
          const keys = (t.messages?.length
            ? t.messages.map(m => msgKey(m.accountId ?? accountId, m.uid))
            : t.uids.map(u => msgKey(accountId, u)));
          return {
            key: t.threadId,
            uid: t.uid,
            keys,
            subject: t.subject,
            from: t.from || {},
            date: t.date,
            snippet: t.snippet,
            unread: t.unread,
            flagged: t.flagged,
            hasAttachments: t.hasAttachments,
            count: t.count,
            accountColor: t.accountColor,
            accountEmail: t.accountEmail,
            showAccount
          };
        })
      : messages.map((m: MailMessage) => ({
          key: msgKey(m.accountId, m.uid),
          uid: m.uid,
          keys: [msgKey(m.accountId, m.uid)],
          subject: m.subject,
          from: m.from || {},
          date: m.date,
          snippet: m.snippet || '',
          unread: !m.flags.includes('\\Seen'),
          flagged: m.flags.includes('\\Flagged'),
          hasAttachments: m.hasAttachments,
          count: 1,
          accountColor: m.accountColor,
          accountEmail: m.accountEmail,
          showAccount
        }))
  ), [threadingEnabled, threads, messages, showAccount]);

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => density === 'compact' ? ROW_ESTIMATE_COMPACT : ROW_ESTIMATE_COMFORTABLE,
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index
  });

  // Nachladen an den virtualisierten Range koppeln, nicht an scrollHeight:
  // sobald das letzte Item die Sichtbarkeit erreicht, holen wir mehr.
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (loadingMore || !virtualItems.length) return;
    if (messages.length >= total) return;
    const lastVisibleIndex = virtualItems[virtualItems.length - 1].index;
    if (lastVisibleIndex >= rows.length - 5) onLoadMore();
  }, [virtualItems, loadingMore, messages.length, total, rows.length, onLoadMore]);

  const handleClick = useCallback((row: Row, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastIndexRef.current !== null) {
      const start = Math.min(lastIndexRef.current, index);
      const end = Math.max(lastIndexRef.current, index);
      setSelectedKeys(rows.slice(start, end + 1).flatMap(r => r.keys));
      return;
    }
    lastIndexRef.current = index;
    if (e.metaKey || e.ctrlKey) {
      toggleSelectedKey(row.keys[0], true);
      return;
    }
    onOpen(row.keys[row.keys.length - 1]);
  }, [rows, setSelectedKeys, toggleSelectedKey, onOpen]);

  // Keyboard activation (Enter/Space) has no mouse event to inspect; treat
  // it like a plain click.
  const handleActivate = useCallback((row: Row) => {
    onOpen(row.keys[row.keys.length - 1]);
  }, [onOpen]);

  if (loading && !rows.length) {
    return (
      <div className="maillist">
        <div className="maillist-state">Laden...</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="maillist">
        <div className="maillist-state">Keine E-Mails</div>
      </div>
    );
  }

  return (
    <div
      className={`maillist ${density}`}
      ref={scrollRef}
      role="listbox"
      aria-label="Nachrichten"
    >
      <div
        className="maillist-virtual-inner"
        style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
      >
        {virtualItems.map(item => {
          const row = rows[item.index];
          if (!row) return null;
          const isActive = row.keys.includes(selectedKey) || row.keys.some(k => selectedKeySet.has(k));
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${item.start}px)`,
                contain: 'layout style paint'
              }}
            >
              <MailRow
                row={row}
                index={item.index}
                isActive={isActive}
                swipeEnabled={swipeEnabled}
                onClick={handleClick}
                onActivate={handleActivate}
                onArchive={onArchive}
                onDelete={onDelete}
                onToggleFlag={onToggleFlag}
                onOpenFull={onOpenFull}
              />
            </div>
          );
        })}
      </div>

      {loadingMore && <div className="maillist-state small">Weitere werden geladen...</div>}
    </div>
  );
}

import { useRef, useCallback, useState, useEffect } from 'react';
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

function MailRow({
  row,
  index,
  isActive,
  swipeEnabled,
  onClick,
  onArchive,
  onDelete,
  onToggleFlag
}: {
  row: Row;
  index: number;
  isActive: boolean;
  swipeEnabled: boolean;
  onClick: (row: Row, index: number, e: React.MouseEvent) => void;
  onArchive: (keys: string[]) => void;
  onDelete: (keys: string[]) => void;
  onToggleFlag: (keys: string[], flagged?: boolean) => void;
}) {
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
        role="button"
        tabIndex={0}
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
          >
            <Icon name="archive" size={15} />
          </button>
          <button
            className="maillist-action"
            onClick={() => onToggleFlag(row.keys, !row.flagged)}
            title={row.flagged ? 'Markierung entfernen' : 'Markieren'}
          >
            <Icon name="flag" size={15} filled={row.flagged} />
          </button>
          <button
            className="maillist-action destructive"
            onClick={() => onDelete(row.keys)}
            title="Löschen"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MailList({ onOpen, onLoadMore, onArchive, onDelete, onToggleFlag, swipeEnabled = false }: MailListProps) {
  const {
    messages, threads, threadingEnabled, density, total,
    selectedMessage, selectedKeys, loading, loadingMore, unifiedView, accounts,
    toggleSelectedKey, setSelectedKeys
  } = useStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef<number | null>(null);

  const showAccount = unifiedView && accounts.length > 1;

  const rows: Row[] = threadingEnabled
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
      }));

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore) return;
    if (messages.length >= total) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      onLoadMore();
    }
  }, [loadingMore, messages.length, total, onLoadMore]);

  const handleClick = (row: Row, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastIndexRef.current !== null) {
      const start = Math.min(lastIndexRef.current, index);
      const end = Math.max(lastIndexRef.current, index);
      setSelectedKeys(rows.slice(start, end + 1).flatMap(r => r.keys));
      return;
    }

    lastIndexRef.current = index;
    const additive = e.metaKey || e.ctrlKey;
    if (additive) {
      toggleSelectedKey(row.keys[0], true);
      return;
    }
    onOpen(row.keys[row.keys.length - 1]);
  };

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
    <div className={`maillist ${density}`} ref={scrollRef} onScroll={handleScroll}>
      {rows.map((row, index) => {
        const selectedKey = selectedMessage
          ? msgKey(selectedMessage.accountId, selectedMessage.uid)
          : '';
        const isActive = row.keys.includes(selectedKey) || row.keys.some(k => selectedKeys.includes(k));

        return (
          <MailRow
            key={row.key}
            row={row}
            index={index}
            isActive={isActive}
            swipeEnabled={swipeEnabled}
            onClick={handleClick}
            onArchive={onArchive}
            onDelete={onDelete}
            onToggleFlag={onToggleFlag}
          />
        );
      })}

      {loadingMore && <div className="maillist-state small">Weitere werden geladen...</div>}
    </div>
  );
}

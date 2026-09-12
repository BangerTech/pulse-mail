import { useRef, useCallback, useState, useEffect, memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore, msgKey, isSentFolder, MailThread, MailMessage, Address } from '../store';
import SenderAvatar from '../shared/SenderAvatar';
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

function normalizeAddress(a?: Address & { mailbox?: string; host?: string }): Address {
  if (!a) return {};
  const address = a.address
    || (a.mailbox && a.host ? `${a.mailbox}@${a.host}` : a.mailbox);
  return { name: a.name, address };
}

function formatRecipients(to?: Address[]): Address {
  const list = (to || []).map(normalizeAddress).filter(a => a.name || a.address);
  if (!list.length) return { name: 'Kein Empfänger' };
  const first = list[0];
  if (list.length === 1) return first;
  return {
    name: `${first.name || first.address} +${list.length - 1}`,
    address: first.address
  };
}

function listPeer(from: Address | undefined, to: Address[] | undefined, sent: boolean): Address {
  if (sent) return formatRecipients(to);
  return from || {};
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
  peerPrefix?: string;
  date: string;
  snippet: string;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  count: number;
  accountColor?: string;
  accountEmail?: string;
  showAccount?: boolean;
  threadId?: string;
  nested?: boolean;
  expanded?: boolean;
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
  onToggleExpand?: (threadId: string) => void;
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
  onOpenFull,
  onToggleExpand
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
        className={`maillist-item ${isActive ? 'active' : ''} ${row.unread ? 'unread' : ''} ${row.nested ? 'nested' : ''} ${snapping ? 'swipe-snap' : ''}`}
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
        aria-label={`${row.unread ? 'Ungelesen: ' : ''}${row.peerPrefix || ''}${row.from.name || row.from.address || 'Unbekannt'} — ${row.subject || 'Kein Betreff'}`}
      >
        <div className="maillist-indicator">
          {row.unread && <span className="maillist-unread-dot" />}
        </div>

        <SenderAvatar
          className="maillist-avatar"
          name={row.from.name}
          address={row.from.address}
          title={row.showAccount ? row.accountEmail : undefined}
          allowRemote={useStore(s => s.loadRemoteImages)}
        >
          {row.showAccount && (
            <span
              className="maillist-account-dot"
              style={{ background: row.accountColor || 'var(--accent-color)' }}
            />
          )}
        </SenderAvatar>

        <div className="maillist-content">
          <div className="maillist-row">
            <span className="maillist-from">
              {row.peerPrefix}{row.from.name || row.from.address || 'Unbekannt'}
            </span>
            {row.count > 1 && !row.nested && (
              <button
                type="button"
                className={`maillist-count ${row.expanded ? 'open' : ''}`}
                title={row.expanded ? 'Konversation einklappen' : `${row.count} Nachrichten anzeigen`}
                aria-label={row.expanded ? 'Konversation einklappen' : `${row.count} Nachrichten anzeigen`}
                aria-expanded={!!row.expanded}
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.threadId) onToggleExpand?.(row.threadId);
                }}
              >
                <Icon name={row.expanded ? 'chevronDown' : 'chevronRight'} size={11} />
                {row.count}
              </button>
            )}
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
  const sentFolder = useStore(s => !s.unifiedView && isSentFolder(
    s.folders.find(f => f.path === s.selectedFolder) || { path: s.selectedFolder }
  ));
  const toggleSelectedKey = useStore(s => s.toggleSelectedKey);
  const setSelectedKeys = useStore(s => s.setSelectedKeys);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIndexRef = useRef<number | null>(null);

  const toggleExpand = useCallback((threadId: string) => {
    setExpandedIds(ids => ids.includes(threadId) ? ids.filter(id => id !== threadId) : [...ids, threadId]);
  }, []);

  const rows: Row[] = useMemo(() => {
    if (!threadingEnabled) {
      return messages.map((m: MailMessage) => ({
        key: msgKey(m.accountId, m.uid),
        uid: m.uid,
        keys: [msgKey(m.accountId, m.uid)],
        subject: m.subject,
        from: listPeer(m.from, m.to, sentFolder),
        peerPrefix: sentFolder ? 'An ' : '',
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
    }

    const rows: Row[] = [];
    for (const t of threads) {
      const accountId = t.accountId;
      const keys = (t.messages?.length
        ? t.messages.map(m => msgKey(m.accountId ?? accountId, m.uid))
        : t.uids.map(u => msgKey(accountId, u)));
      const latest = t.messages?.[t.messages.length - 1];
      const expanded = t.count > 1 && expandedIds.includes(t.threadId);
      rows.push({
        key: t.threadId,
        uid: t.uid,
        keys,
        subject: t.subject,
        from: listPeer(t.from, latest?.to, sentFolder),
        peerPrefix: sentFolder ? 'An ' : '',
        date: t.date,
        snippet: t.snippet,
        unread: t.unread,
        flagged: t.flagged,
        hasAttachments: t.hasAttachments,
        count: t.count,
        accountColor: t.accountColor,
        accountEmail: t.accountEmail,
        showAccount,
        threadId: t.threadId,
        expanded
      });
      if (expanded && t.messages?.length) {
        for (const m of t.messages) {
          const key = msgKey(m.accountId ?? accountId, m.uid);
          rows.push({
            key,
            uid: m.uid,
            keys: [key],
            subject: m.subject,
            from: listPeer(m.from, m.to, sentFolder),
            peerPrefix: sentFolder ? 'An ' : '',
            date: m.date,
            snippet: m.snippet || '',
            unread: !m.flags.includes('\\Seen'),
            flagged: m.flags.includes('\\Flagged'),
            hasAttachments: m.hasAttachments,
            count: 1,
            accountColor: m.accountColor || t.accountColor,
            accountEmail: m.accountEmail || t.accountEmail,
            showAccount,
            threadId: t.threadId,
            nested: true
          });
        }
      }
    }
    return rows;
  }, [threadingEnabled, threads, messages, showAccount, sentFolder, expandedIds]);

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
    if (row.count > 1 && row.threadId && !row.nested) {
      setExpandedIds(ids => ids.includes(row.threadId!) ? ids : [...ids, row.threadId!]);
    }
    onOpen(row.keys[row.keys.length - 1]);
  }, [rows, setSelectedKeys, toggleSelectedKey, onOpen]);

  // Keyboard activation (Enter/Space) has no mouse event to inspect; treat
  // it like a plain click.
  const handleActivate = useCallback((row: Row) => {
    if (row.count > 1 && row.threadId && !row.nested) {
      setExpandedIds(ids => ids.includes(row.threadId!) ? ids : [...ids, row.threadId!]);
    }
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
          const isActive = row.nested || !row.expanded
            ? row.keys.includes(selectedKey) || row.keys.some(k => selectedKeySet.has(k))
            : false;
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
                onToggleExpand={toggleExpand}
              />
            </div>
          );
        })}
      </div>

      {loadingMore && <div className="maillist-state small">Weitere werden geladen...</div>}
    </div>
  );
}

import { useRef, useCallback } from 'react';
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

export default function MailList({ onOpen, onLoadMore, onArchive, onDelete, onToggleFlag }: MailListProps) {
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
    onOpen(row.keys[0]);
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
          <div
            key={row.key}
            className={`maillist-item ${isActive ? 'active' : ''} ${row.unread ? 'unread' : ''}`}
            onClick={(e) => handleClick(row, index, e)}
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
        );
      })}

      {loadingMore && <div className="maillist-state small">Weitere werden geladen...</div>}
    </div>
  );
}

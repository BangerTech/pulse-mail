import { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RawMessage } from '../data/types';
import type { Classification } from '../logic/classify';
import { domainHue, domainOf, rootDomain } from '../logic/classify';
import { trackersIn } from '../logic/extract';
import { formatRelative, initials, frequencyByListOrSender, weekKey } from '../logic/util';
import { onActivateKey } from '../../shared/keyboard';

interface Item { msg: RawMessage; cls: Classification }

interface Props {
  items: Item[];
  allBulk: Item[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  collapsed: boolean;
}

interface Group {
  key: string;
  senderName: string;
  senderAddress: string;
  listId?: string;
  items: Item[];
  latest: Item;
  freq: string;
  trackers: Set<string>;
  unsubUrl?: string;
  hue: number;
}

export function FeedLens({ items, allBulk, selectedId, onOpen, collapsed }: Props) {
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = (it.cls.listId || it.msg.from.address).toLowerCase();
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    const freq = frequencyByListOrSender(allBulk.map(a => a.msg));
    const out: Group[] = [];
    for (const [key, arr] of map) {
      arr.sort((a, b) => b.msg.date.localeCompare(a.msg.date));
      const latest = arr[0];
      const trackers = new Set<string>();
      for (const it of arr) for (const t of trackersIn(it.msg)) trackers.add(t);
      out.push({
        key,
        senderName: latest.msg.from.name || latest.msg.from.address,
        senderAddress: latest.msg.from.address,
        listId: latest.cls.listId,
        items: arr,
        latest,
        freq: freq.get(key)?.per ?? `${arr.length}\u00d7`,
        trackers,
        unsubUrl: latest.cls.unsubscribeUrl,
        hue: domainHue(latest.msg.from.address)
      });
    }
    return out.sort((a, b) => b.items.length - a.items.length);
  }, [items, allBulk]);

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current?.closest('.proto-main') as HTMLElement | null,
    estimateSize: () => 140,
    overscan: 6,
    getItemKey: (i) => groups[i]?.key ?? i
  });

  return (
    <section className={`lens feed ${collapsed ? 'collapsed' : ''}`}>
      <header className="lens-head">
        <h1>Feed</h1>
        <p className="lens-sub">Newsletter und Broadcasts, gruppiert nach Absender. Getrennt von deinen direkten Konversationen.</p>
      </header>

      <div className="feed-groups" ref={scrollRef}>
        {groups.length === 0 && (
          <div className="empty">Keine Newsletter im Zeitraum.</div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map(item => {
            const g = groups[item.index];
            if (!g) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                data-week={weekKey(g.latest.msg.date)}
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
                <FeedGroup
                  group={g}
                  muted={muted.has(g.key)}
                  onMute={() => setMuted(s => {
                    const next = new Set(s);
                    if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                    return next;
                  })}
                  onOpen={onOpen}
                  selectedId={selectedId}
                  collapsed={collapsed}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeedGroup({ group, muted, onMute, onOpen, selectedId, collapsed }: {
  group: Group;
  muted: boolean;
  onMute: () => void;
  onOpen: (id: string) => void;
  selectedId: string | null;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(true);
  const domain = rootDomain(domainOf(group.senderAddress));

  return (
    <section className={`feed-group ${muted ? 'muted' : ''}`} style={{ ['--row-hue' as any]: group.hue }}>
      <header
        className="feed-group-head"
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => onActivateKey(e, () => setOpen(o => !o))}
        role="button"
        tabIndex={0}
        aria-expanded={open && !muted}
        aria-label={`${group.senderName}, ${group.items.length} Nachrichten`}
      >
        <div className="feed-avatar" style={{ background: `oklch(58% 0.14 ${group.hue})` }} aria-hidden>
          {initials(group.senderName, group.senderAddress)}
        </div>
        <div className="feed-title">
          <div className="feed-sender">{group.senderName}</div>
          <div className="feed-meta">
            <span className="feed-domain">{domain}</span>
            <span className="dot" />
            <span className="feed-freq">{group.freq}</span>
            {group.trackers.size > 0 && (
              <>
                <span className="dot" />
                <span className="feed-trackers" title={[...group.trackers].join(', ')}>
                  {group.trackers.size} Tracker blockiert
                </span>
              </>
            )}
          </div>
        </div>
        <div className="feed-actions" onClick={e => e.stopPropagation()}>
          {group.unsubUrl && (
            <a
              className="chip chip-danger-soft"
              href={group.unsubUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={group.unsubUrl}
            >
              Abmelden
            </a>
          )}
          <button className={`chip ${muted ? 'chip-active' : ''}`} onClick={onMute}>
            {muted ? 'Wieder anzeigen' : 'Stummschalten'}
          </button>
          <button className="chip chip-ghost" onClick={() => setOpen(o => !o)}>
            {open ? 'Einklappen' : `${group.items.length} zeigen`}
          </button>
        </div>
      </header>

      {open && !muted && !collapsed && (
        <div className="feed-items">
          {group.items.map(it => (
            <button
              key={it.msg.id}
              className={`feed-item ${it.msg.id === selectedId ? 'active' : ''} ${!it.msg.flags.includes('\\Seen') ? 'unread' : ''}`}
              onClick={() => onOpen(it.msg.id)}
            >
              <div className="feed-item-subject">{it.msg.subject}</div>
              <div className="feed-item-date">{formatRelative(it.msg.date)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

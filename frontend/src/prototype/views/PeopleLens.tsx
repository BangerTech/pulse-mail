import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RawMessage } from '../data/types';
import type { Classification } from '../logic/classify';
import { MessageRow } from './MessageRow';
import { formatRelative, weekKey } from '../logic/util';

interface Item { msg: RawMessage; cls: Classification }

interface Props {
  items: Item[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  collapsed: boolean;
}

interface Thread {
  id: string;
  latest: Item;
  count: number;
  span: { firstDate: string; lastDate: string };
  all: Item[];
}

export function PeopleLens({ items, selectedId, onOpen, collapsed }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.msg.threadId) ?? [];
      list.push(it);
      map.set(it.msg.threadId, list);
    }
    const out: Thread[] = [];
    for (const [id, arr] of map) {
      arr.sort((a, b) => b.msg.date.localeCompare(a.msg.date));
      out.push({
        id,
        latest: arr[0],
        count: arr.length,
        span: { firstDate: arr[arr.length - 1].msg.date, lastDate: arr[0].msg.date },
        all: arr
      });
    }
    return out.sort((a, b) => b.span.lastDate.localeCompare(a.span.lastDate));
  }, [items]);

  // The lens list itself does not scroll; `.proto-main` is the scroll
  // container. Walk up the DOM once to find it.
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => scrollRef.current?.closest('.proto-main') as HTMLElement | null,
    estimateSize: () => collapsed ? 52 : 84,
    overscan: 8,
    getItemKey: (i) => threads[i]?.id ?? i
  });

  return (
    <section className={`lens people ${collapsed ? 'collapsed' : ''}`}>
      <header className="lens-head">
        <h1>Direkt</h1>
        <p className="lens-sub">Persönlich an dich adressiert. Keine Newsletter, keine Broadcasts.</p>
      </header>

      <div className="lens-list" ref={scrollRef} role="listbox" aria-label="Threads">
        {threads.length === 0 && (
          <div className="empty">Keine menschlichen Konversationen im Zeitraum.</div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map(item => {
            const t = threads[item.index];
            if (!t) return null;
            const active = t.all.some(a => a.msg.id === selectedId);
            const isThread = t.count > 1;
            return (
              <div
                key={item.key}
                data-index={item.index}
                data-week={weekKey(t.latest.msg.date)}
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
                <MessageRow
                  msg={t.latest.msg}
                  cls={t.latest.cls}
                  active={active}
                  onClick={() => onOpen(t.latest.msg.id)}
                  hideSnippet={collapsed}
                  right={
                    isThread ? (
                      <div className="thread-badge" title={`${t.count} Nachrichten`}>
                        <span className="thread-count">{t.count}</span>
                        <ThreadTimeline items={t.all} />
                      </div>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ThreadTimeline({ items }: { items: Item[] }) {
  // Proportionale Punkte auf Zeitachse
  const sorted = [...items].sort((a, b) => a.msg.date.localeCompare(b.msg.date));
  const t0 = new Date(sorted[0].msg.date).getTime();
  const t1 = new Date(sorted[sorted.length - 1].msg.date).getTime();
  const span = Math.max(t1 - t0, 1);
  return (
    <div className="thread-timeline" aria-label={`Verlauf ${formatRelative(sorted[0].msg.date)} bis ${formatRelative(sorted[sorted.length - 1].msg.date)}`}>
      {sorted.map(it => {
        const pos = ((new Date(it.msg.date).getTime() - t0) / span) * 100;
        return <span key={it.msg.id} className="thread-dot" style={{ left: `${pos}%` }} />;
      })}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RawMessage } from '../data/types';
import type { Classification } from '../logic/classify';
import type { Entity } from '../logic/extract';
import { domainHue } from '../logic/classify';
import { formatRelative, initials } from '../logic/util';

type Item = { msg: RawMessage; cls: Classification; ents: Entity[] };
type Decision = 'archive' | 'keep' | 'later';

interface Props {
  items: Item[];
  onExit: () => void;
}

export function TriageMode({ items, onExit }: Props) {
  // Nur Ungelesenes triagieren
  const queue = useMemo(
    () => items.filter(i => !i.msg.flags.includes('\\Seen')),
    [items]
  );
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<{ id: string; decision: Decision }[]>([]);
  const [swipe, setSwipe] = useState<Decision | null>(null);
  const current = queue[index];
  const done = index >= queue.length;

  const commit = useCallback((decision: Decision) => {
    if (!current) return;
    setSwipe(decision);
    window.setTimeout(() => {
      setDecisions(d => [...d, { id: current.msg.id, decision }]);
      setIndex(i => i + 1);
      setSwipe(null);
    }, 220);
  }, [current]);

  const undo = useCallback(() => {
    setDecisions(d => {
      if (!d.length) return d;
      setIndex(i => Math.max(0, i - 1));
      return d.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit('archive'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); commit('keep'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); commit('later'); }
      else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
      else if (e.key === 'Escape') { onExit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit, undo, onExit]);

  const stats = useMemo(() => ({
    archived: decisions.filter(d => d.decision === 'archive').length,
    kept: decisions.filter(d => d.decision === 'keep').length,
    later: decisions.filter(d => d.decision === 'later').length
  }), [decisions]);

  return (
    <div className="triage">
      <header className="triage-head">
        <button className="chip chip-ghost" onClick={onExit}>Verlassen (Esc)</button>
        <div className="triage-progress">
          <span>{Math.min(index + 1, queue.length)} / {queue.length}</span>
          <div className="triage-bar"><span style={{ width: `${(index / Math.max(1, queue.length)) * 100}%` }} /></div>
        </div>
        <div className="triage-stats">
          <span className="stat stat-archive">← Archiv {stats.archived}</span>
          <span className="stat stat-keep">→ Behalten {stats.kept}</span>
          <span className="stat stat-later">↑ Spaeter {stats.later}</span>
          <button className="chip chip-ghost" onClick={undo} disabled={!decisions.length}>⌘Z Undo</button>
        </div>
      </header>

      <main className="triage-main">
        {done ? (
          <div className="triage-done">
            <div className="triage-done-emoji" aria-hidden>✓</div>
            <h2>Inbox getriaged</h2>
            <p>{stats.archived} archiviert · {stats.kept} behalten · {stats.later} fuer spaeter</p>
            <button className="chip chip-primary" onClick={onExit}>Fertig</button>
          </div>
        ) : (
          <TriageCard item={current} swipe={swipe} />
        )}
      </main>

      {!done && (
        <footer className="triage-actions">
          <button className="triage-btn triage-archive" onClick={() => commit('archive')}>
            <span className="key">←</span>
            <span>Archiv</span>
          </button>
          <button className="triage-btn triage-later" onClick={() => commit('later')}>
            <span className="key">↑</span>
            <span>Spaeter</span>
          </button>
          <button className="triage-btn triage-keep" onClick={() => commit('keep')}>
            <span className="key">→</span>
            <span>Behalten</span>
          </button>
        </footer>
      )}
    </div>
  );
}

function TriageCard({ item, swipe }: { item: Item; swipe: Decision | null }) {
  const hue = domainHue(item.msg.from.address);
  return (
    <article className={`triage-card ${swipe ? `swipe-${swipe}` : ''}`} style={{ ['--row-hue' as any]: hue }}>
      <div className="triage-sender">
        <div className="triage-avatar" style={{ background: `oklch(58% 0.14 ${hue})` }}>
          {initials(item.msg.from.name, item.msg.from.address)}
        </div>
        <div>
          <div className="triage-from">{item.msg.from.name}</div>
          <div className="triage-address">{item.msg.from.address}</div>
        </div>
        <div className="triage-cat" data-cat={item.cls.category}>{item.cls.category}</div>
      </div>
      <h1 className="triage-subject">{item.msg.subject}</h1>
      <div className="triage-date">{formatRelative(item.msg.date)}</div>
      <div className="triage-body">
        {item.msg.bodyText?.split('\n').slice(0, 12).map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </article>
  );
}

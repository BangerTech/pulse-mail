import { useMemo, useState } from 'react';
import type { RawMessage } from '../data/types';
import { densityByWeek } from '../logic/util';

export function Scrubber({ items }: { items: RawMessage[] }) {
  const weeks = useMemo(() => densityByWeek(items), [items]);
  const max = Math.max(1, ...weeks.map(w => w.count));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <aside className="scrubber" aria-label="Zeitleiste">
      <div className="scrubber-bars">
        {weeks.map((w, i) => (
          <span
            key={w.week}
            className={`scrubber-bar ${hover === i ? 'hover' : ''}`}
            style={{ height: `${(w.count / max) * 100}%` }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            title={`${w.week}: ${w.count}`}
          />
        ))}
      </div>
      {hover !== null && (
        <div className="scrubber-tip">
          <strong>{weeks[hover].count}</strong> in {weeks[hover].week}
        </div>
      )}
    </aside>
  );
}

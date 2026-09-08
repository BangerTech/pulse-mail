import { useMemo, useState } from 'react';
import type { RawMessage } from '../data/types';
import { densityByWeek } from '../logic/util';
import { onActivateKey } from '../../shared/keyboard';

interface Props {
  items: RawMessage[];
  onJump?: (week: string) => void;
}

export function Scrubber({ items, onJump }: Props) {
  const weeks = useMemo(() => densityByWeek(items), [items]);
  const max = Math.max(1, ...weeks.map(w => w.count));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <aside className="scrubber" aria-label="Zeitleiste">
      <div className="scrubber-bars">
        {weeks.map((w, i) => (
          <button
            key={w.week}
            type="button"
            className={`scrubber-bar ${hover === i ? 'hover' : ''}`}
            style={{ height: `${(w.count / max) * 100}%` }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onJump?.(w.week)}
            onKeyDown={(e) => onActivateKey(e, () => onJump?.(w.week))}
            title={`${w.week}: ${w.count}`}
            aria-label={`${w.count} Nachrichten in ${w.week}`}
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

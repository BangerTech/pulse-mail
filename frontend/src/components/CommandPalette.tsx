import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Icon } from './Icon';
import { useFocusTrap } from '../shared/useFocusTrap';
import '../styles/palette.css';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
}

export default function CommandPalette({ commands }: CommandPaletteProps) {
  const setShowPalette = useStore(s => s.setShowPalette);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const available = commands.filter(c => !c.disabled);
    if (!query.trim()) return available;

    const needle = query.toLowerCase();
    return available
      .map(cmd => {
        const haystack = `${cmd.label} ${cmd.hint || ''}`.toLowerCase();
        const index = haystack.indexOf(needle);
        return { cmd, score: index === -1 ? Infinity : index };
      })
      .filter(entry => entry.score !== Infinity)
      .sort((a, b) => a.score - b.score)
      .map(entry => entry.cmd);
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => setShowPalette(false);

  const execute = (index: number) => {
    const cmd = filtered[index];
    if (!cmd) return;
    close();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      execute(active);
    }
  };

  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusSelector: 'input.palette-input',
    onEscape: close,
  });

  return (
    <div className="palette-overlay" onMouseDown={close} role="presentation">
      <div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Befehlspalette"
        ref={trapRef}
      >
        <div className="palette-input-wrap">
          <Icon name="command" size={16} className="palette-input-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Befehl oder Ordner suchen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="palette-esc">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="palette-empty">Keine Treffer</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => execute(i)}
            >
              <Icon name={cmd.icon} size={16} className="palette-item-icon" />
              <span className="palette-item-label">{cmd.label}</span>
              {cmd.hint && <span className="palette-item-hint">{cmd.hint}</span>}
              {cmd.shortcut && <kbd className="palette-item-shortcut">{cmd.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

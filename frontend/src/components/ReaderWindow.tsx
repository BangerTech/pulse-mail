import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'pulse:readerWindow';
const MARGIN = 16;
const MIN_W = 520;
const MIN_H = 400;

type Box = { x: number; y: number; w: number; h: number };
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function defaultBox(): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(980, Math.max(MIN_W, vw - 56));
  const h = Math.min(860, Math.max(MIN_H, vh - 56));
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

function clampBox(box: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(box.w, MIN_W), Math.max(MIN_W, vw - MARGIN * 2));
  const h = Math.min(Math.max(box.h, MIN_H), Math.max(MIN_H, vh - MARGIN * 2));
  return {
    w,
    h,
    x: Math.min(Math.max(box.x, MARGIN), Math.max(MARGIN, vw - w - MARGIN)),
    y: Math.min(Math.max(box.y, MARGIN), Math.max(MARGIN, vh - h - MARGIN))
  };
}

function loadBox(): Box {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clampBox(defaultBox());
    const parsed = JSON.parse(raw) as Partial<Box>;
    if ([parsed.x, parsed.y, parsed.w, parsed.h].some(n => typeof n !== 'number')) {
      return clampBox(defaultBox());
    }
    return clampBox(parsed as Box);
  } catch {
    return clampBox(defaultBox());
  }
}

function applyResize(start: Box, edge: Edge, dx: number, dy: number): Box {
  let { x, y, w, h } = start;
  if (edge.includes('e')) w += dx;
  if (edge.includes('s')) h += dy;
  if (edge.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (edge.includes('n')) {
    y += dy;
    h -= dy;
  }
  if (w < MIN_W) {
    if (edge.includes('w')) x -= MIN_W - w;
    w = MIN_W;
  }
  if (h < MIN_H) {
    if (edge.includes('n')) y -= MIN_H - h;
    h = MIN_H;
  }
  return clampBox({ x, y, w, h });
}

export default function ReaderWindow({
  title,
  onClose,
  children,
  trapRef
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  trapRef?: React.Ref<HTMLDivElement>;
}) {
  const [box, setBox] = useState<Box>(() => loadBox());
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    const onResize = () => setBox(current => clampBox(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(box));
  }, [box]);

  const startMove = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = boxRef.current;
    setBusy(true);

    const onMove = (ev: PointerEvent) => {
      setBox(clampBox({
        ...origin,
        x: origin.x + ev.clientX - startX,
        y: origin.y + ev.clientY - startY
      }));
    };
    const onUp = () => {
      setBusy(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (edge: Edge) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = boxRef.current;
    setBusy(true);

    const onMove = (ev: PointerEvent) => {
      setBox(applyResize(origin, edge, ev.clientX - startX, ev.clientY - startY));
    };
    const onUp = () => {
      setBusy(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="reader-overlay" onMouseDown={onClose}>
      <div
        className={`reader-window ${busy ? 'is-busy' : ''}`}
        style={{ top: box.y, left: box.x, width: box.w, height: box.h }}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={trapRef}
      >
        <div className="reader-window-bar" onPointerDown={startMove}>
          <span>{title || 'Nachricht'}</span>
        </div>
        <div className="reader-window-body">{children}</div>
        {EDGES.map(edge => (
          <div
            key={edge}
            className={`reader-window-resize ${edge}`}
            onPointerDown={startResize(edge)}
          />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { messages as fixtures } from './data/fixtures';
import { fetchLive, type LiveMeta } from './data/live';
import { classify } from './logic/classify';
import { extract, type Entity } from './logic/extract';
import type { RawMessage } from './data/types';
import { PeopleLens } from './views/PeopleLens';
import { FeedLens } from './views/FeedLens';
import { ThingsLens } from './views/ThingsLens';
import { Reader } from './views/Reader';
import { TriageMode } from './views/TriageMode';
import { Scrubber } from './views/Scrubber';
import { archiveMessage, setSeen } from './data/actions';
import { loadComposeTarget } from './data/compose';
import { api } from '../api';
import { useStore, type ComposeMode } from '../store';
import { announceNewMail } from '../shared/notifyMail';
import ComposeModal from '../components/ComposeModal';
import { Icon } from '../components/Icon';

export type LensKey = 'people' | 'feed' | 'things';
export type Source = 'live' | 'fixtures';

const LENSES: LensKey[] = ['people', 'feed', 'things'];

export function Prototype() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('proto-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [lens, setLens] = useState<LensKey>('people');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triage, setTriage] = useState(false);

  const [source, setSource] = useState<Source>(() => {
    return (localStorage.getItem('proto-source') as Source) || 'live';
  });
  const [liveMessages, setLiveMessages] = useState<RawMessage[] | null>(null);
  const [liveMeta, setLiveMeta] = useState<LiveMeta | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const loadGen = useRef(0);

  const composing = useStore(s => s.composing);
  const accounts = useStore(s => s.accounts);
  const setAccounts = useStore(s => s.setAccounts);
  const setSelectedAccount = useStore(s => s.setSelectedAccount);
  const setSignatures = useStore(s => s.setSignatures);
  const openCompose = useStore(s => s.openCompose);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('proto-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('proto-source', source);
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, sigs] = await Promise.all([api.getAccounts(), api.getSignatures()]);
        if (cancelled) return;
        setAccounts(accs);
        setSignatures(sigs);
        if (accs[0]) setSelectedAccount(accs[0]);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [setAccounts, setSignatures, setSelectedAccount]);

  const loadLive = useCallback(async (sync = false) => {
    const gen = ++loadGen.current;
    setLoadingLive(true);
    setLiveError(null);
    const result = await fetchLive({ sync });
    if (gen !== loadGen.current) return;
    setLoadingLive(false);
    if (!result) {
      setLiveError('Keine Live-Daten (Backend nicht erreichbar oder Cache leer)');
      setLiveMessages(null);
      setLiveMeta(null);
      return;
    }
    setLiveMessages(result.messages);
    setLiveMeta(result.meta);
  }, []);

  useEffect(() => {
    if (source === 'live') loadLive(true);
  }, [source, loadLive]);

  // WebSocket: neue Mails und Cache-Updates. Bei Abbruch neu verbinden.
  useEffect(() => {
    if (source !== 'live') return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'new_mail') {
            const state = useStore.getState();
            if (state.notifySound || state.notifyDesktop) {
              announceNewMail({
                preview: msg.preview,
                playSound: state.notifySound,
                desktop: state.notifyDesktop
              });
            }
          }
          if (msg.type === 'messages_updated' || msg.type === 'new_mail') loadLive(true);
        } catch {}
      };
      ws.onclose = () => {
        if (!closed) retry = window.setTimeout(connect, 2500);
      };
    };
    connect();
    const poll = window.setInterval(() => loadLive(true), 20000);
    return () => {
      closed = true;
      window.clearTimeout(retry);
      window.clearInterval(poll);
      ws?.close();
    };
  }, [source, loadLive]);

  // Datensatz je nach Quelle: Live wenn geladen und nicht leer, sonst Fixtures
  const dataset: RawMessage[] = useMemo(() => {
    const raw = (source === 'live' && liveMessages && liveMessages.length > 0)
      ? liveMessages
      : fixtures;
    return raw
      .filter(m => !hiddenIds.has(m.id))
      .map(m => seenIds.has(m.id) && !m.flags.includes('\\Seen')
        ? { ...m, flags: [...m.flags, '\\Seen'] }
        : m);
  }, [source, liveMessages, hiddenIds, seenIds]);

  // Klassifiziere alle Nachrichten einmal (deterministisch)
  const classified = useMemo(() => {
    return dataset.map(m => ({ msg: m, cls: classify(m), ents: extract(m) }));
  }, [dataset]);

  const messagesByLane = useMemo(() => {
    const buckets = { people: [] as typeof classified, feed: [] as typeof classified, things: [] as typeof classified };
    for (const item of classified) {
      if (item.cls.lane === 'human') buckets.people.push(item);
      else if (item.cls.lane === 'feed') buckets.feed.push(item);
      if (item.ents.length) buckets.things.push(item);
      // OTP / Kalender fliessen in "Sachen" ueber Entities
    }
    return buckets;
  }, [classified]);

  const allEntities: Entity[] = useMemo(
    () => classified.flatMap(c => c.ents),
    [classified]
  );

  const selectedMsg = useMemo(
    () => classified.find(c => c.msg.id === selectedId),
    [classified, selectedId]
  );

  const withMorph = useCallback((fn: () => void) => {
    // View Transitions API — silently degrades where unsupported
    const doc = document as Document & { startViewTransition?: (cb: () => void) => any };
    if (doc.startViewTransition) doc.startViewTransition(fn);
    else fn();
  }, []);

  const closeReader = useCallback(() => {
    withMorph(() => setSelectedId(null));
  }, [withMorph]);

  const markSeenLocal = useCallback((id: string) => {
    setSeenIds(s => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const hideLocal = useCallback((id: string) => {
    setHiddenIds(s => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  const openMessage = useCallback((id: string) => {
    withMorph(() => setSelectedId(id));
    markSeenLocal(id);
  }, [withMorph, markSeenLocal]);

  const jumpToWeek = useCallback((week: string) => {
    const el = document.querySelector(`[data-week="${CSS.escape(week)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const startCompose = useCallback(async (mode: ComposeMode, msg?: RawMessage) => {
    if (!accounts.length) return;
    if (mode === 'new') {
      setSelectedAccount(accounts[0]);
      openCompose('new');
      return;
    }
    if (!msg || msg.accountId == null || msg.uid == null) return;
    const account = accounts.find(a => a.id === msg.accountId) || accounts[0];
    setSelectedAccount(account);
    const detail = await loadComposeTarget(msg);
    openCompose(mode, detail);
  }, [accounts, openCompose, setSelectedAccount]);

  const onDecision = useCallback((item: { msg: RawMessage }, decision: 'archive' | 'keep' | 'later') => {
    if (decision === 'archive') {
      archiveMessage(item.msg).catch(() => {});
      hideLocal(item.msg.id);
    } else if (decision === 'keep') {
      setSeen(item.msg, true).catch(() => {});
      markSeenLocal(item.msg.id);
    }
  }, [hideLocal, markSeenLocal]);

  const onLensKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = LENSES.indexOf(lens);
    const next = LENSES[(i + (e.key === 'ArrowRight' ? 1 : LENSES.length - 1)) % LENSES.length];
    withMorph(() => { setLens(next); setSelectedId(null); });
    requestAnimationFrame(() => {
      (document.querySelector(`[role="tab"][data-lens="${next}"]`) as HTMLElement | null)?.focus();
    });
  };

  // Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (triage || composing) return;
      if (e.key === '1') { withMorph(() => { setLens('people'); setSelectedId(null); }); }
      else if (e.key === '2') { withMorph(() => { setLens('feed'); setSelectedId(null); }); }
      else if (e.key === '3') { withMorph(() => { setLens('things'); setSelectedId(null); }); }
      else if (e.key === 't') { setTriage(true); }
      else if (e.key === 'Escape') { if (selectedId) closeReader(); }
      else if (e.key === 'd') { setTheme(t => t === 'dark' ? 'light' : 'dark'); }
      else if (e.key === 'n' || e.key === 'c') { e.preventDefault(); startCompose('new'); }
      else if (e.key === 'r' && selectedMsg) { e.preventDefault(); startCompose('reply', selectedMsg.msg); }
      else if (e.key === 'a' && selectedMsg) { e.preventDefault(); startCompose('replyAll', selectedMsg.msg); }
      else if (e.key === 'f' && selectedMsg) { e.preventDefault(); startCompose('forward', selectedMsg.msg); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triage, composing, selectedId, selectedMsg, closeReader, withMorph, startCompose]);

  if (triage) {
    return <TriageMode
      items={classified}
      onExit={() => setTriage(false)}
      onDecision={onDecision}
    />;
  }

  return (
    <div
      className={`proto ${selectedMsg ? 'reader-open' : ''}`}
      data-lens={lens}
    >
      <header className="proto-header">
        <div className="proto-brand">
          <span className="proto-pulse" aria-hidden />
          <span>Pulse Mail</span>
          <span className="proto-brand-tag">2026</span>
        </div>

        <nav className="proto-lenses" role="tablist" aria-label="Linsen" onKeyDown={onLensKeyDown}>
          <button
            role="tab"
            data-lens="people"
            aria-selected={lens === 'people'}
            tabIndex={lens === 'people' ? 0 : -1}
            className={`proto-lens ${lens === 'people' ? 'active' : ''}`}
            onClick={() => withMorph(() => { setLens('people'); setSelectedId(null); })}
          >
            <span className="proto-lens-key">1</span>
            <span className="proto-lens-label">Direkt</span>
            <span className="proto-lens-count">{messagesByLane.people.length}</span>
          </button>
          <button
            role="tab"
            data-lens="feed"
            aria-selected={lens === 'feed'}
            tabIndex={lens === 'feed' ? 0 : -1}
            className={`proto-lens ${lens === 'feed' ? 'active' : ''}`}
            onClick={() => withMorph(() => { setLens('feed'); setSelectedId(null); })}
          >
            <span className="proto-lens-key">2</span>
            <span className="proto-lens-label">Feed</span>
            <span className="proto-lens-count">{messagesByLane.feed.length}</span>
          </button>
          <button
            role="tab"
            data-lens="things"
            aria-selected={lens === 'things'}
            tabIndex={lens === 'things' ? 0 : -1}
            className={`proto-lens ${lens === 'things' ? 'active' : ''}`}
            onClick={() => withMorph(() => { setLens('things'); setSelectedId(null); })}
          >
            <span className="proto-lens-key">3</span>
            <span className="proto-lens-label">Sachen</span>
            <span className="proto-lens-count">{allEntities.length}</span>
          </button>
        </nav>

        <div className="proto-tools">
          <button
            className="proto-chip proto-chip-compose"
            data-chip="compose"
            onClick={() => startCompose('new')}
            disabled={!accounts.length}
            title={accounts.length ? 'Neue Nachricht (N)' : 'Kein Postfach verbunden'}
            aria-label="Neue Nachricht"
          >
            <Icon name="compose" size={14} />
            Schreiben
          </button>
          <SourceChip
            source={source}
            liveMeta={liveMeta}
            loading={loadingLive}
            error={liveError}
            usingFallback={source === 'live' && (!liveMessages || liveMessages.length === 0)}
            onToggle={() => setSource(s => s === 'live' ? 'fixtures' : 'live')}
            onReload={() => loadLive(true)}
          />
          <button className="proto-chip" data-chip="triage" onClick={() => setTriage(true)} title="Triage-Modus (T)">
            Triage
          </button>
          <button className="proto-chip" data-chip="theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Theme (D)">
            {theme === 'dark' ? 'Hell' : 'Dunkel'}
          </button>
          <a className="proto-chip proto-chip-ghost" data-chip="app" href="/" title="Zur klassischen App">↩ App</a>
        </div>
      </header>

      <div className="proto-body">
        <main className="proto-main">
          {lens === 'people' && (
            <PeopleLens
              items={messagesByLane.people}
              selectedId={selectedId}
              onOpen={openMessage}
              collapsed={false}
            />
          )}
          {lens === 'feed' && (
            <FeedLens
              items={messagesByLane.feed}
              allBulk={classified.filter(c => c.cls.isBulk)}
              selectedId={selectedId}
              onOpen={openMessage}
              collapsed={false}
            />
          )}
          {lens === 'things' && (
            <ThingsLens entities={allEntities} items={classified} onOpen={openMessage} />
          )}
        </main>

        {(lens === 'people' || lens === 'feed') && (
          <Scrubber items={classified.map(c => c.msg)} onJump={jumpToWeek} />
        )}
      </div>

      {selectedMsg && (
        <>
          <div
            className="proto-reader-backdrop"
            onClick={closeReader}
            aria-hidden
          />
          <aside className="proto-reader" role="dialog" aria-modal="true" aria-labelledby="reader-subject">
            <Reader
              msg={selectedMsg.msg}
              cls={selectedMsg.cls}
              ents={selectedMsg.ents}
              onClose={closeReader}
              onCompose={(mode) => startCompose(mode, selectedMsg.msg)}
              composeEnabled={selectedMsg.msg.accountId != null && selectedMsg.msg.uid != null && accounts.length > 0}
            />
          </aside>
        </>
      )}

      <footer className="proto-footer">
        <span><kbd>N</kbd> Schreiben</span>
        <span><kbd>R</kbd> <kbd>A</kbd> <kbd>F</kbd> Antwort / Allen / Weiter</span>
        <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Linsen</span>
        <span><kbd>T</kbd> Triage</span>
        <span><kbd>D</kbd> Theme</span>
        <span><kbd>Esc</kbd> Schliessen</span>
        <span className="proto-footer-note">
          {source === 'live' && liveMeta
            ? `Live · ${liveMeta.count} Nachrichten · ${liveMeta.withHeaders}/${liveMeta.count} mit Rohheadern · ${liveMeta.withBody}/${liveMeta.count} mit Body`
            : 'Fixtures (deterministisch, kein Backend)'}
        </span>
      </footer>

      {composing && <ComposeModal />}
    </div>
  );
}

function SourceChip({
  source, liveMeta, loading, error, usingFallback, onToggle, onReload
}: {
  source: Source;
  liveMeta: LiveMeta | null;
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
  onToggle: () => void;
  onReload: () => void;
}) {
  const label = source === 'live'
    ? (loading ? 'Laden…' : error ? 'Live · Fehler' : usingFallback ? 'Live leer · Fixtures' : `Live · ${liveMeta?.count ?? 0}`)
    : 'Fixtures';

  const tip = source === 'live'
    ? (error
        ? `${error}. Klicken zum Wechseln auf Fixtures.`
        : liveMeta
          ? `${liveMeta.accounts.map(a => `${a.email}: ${a.count}`).join(' · ')}`
          : 'Live-Modus aktiv')
    : 'Prototyp-Daten (fix). Klicken fuer Live.';

  return (
    <span className="source-chip-wrap">
      <button
        className={`proto-chip ${source === 'live' ? 'proto-chip-live' : ''} ${error ? 'proto-chip-warn' : ''}`}
        onClick={onToggle}
        title={tip}
      >
        <span className={`source-dot ${source === 'live' ? (error ? 'bad' : 'good') : 'muted'}`} />
        {label}
      </button>
      {source === 'live' && (
        <button className="proto-chip proto-chip-ghost" onClick={onReload} title="Neu laden">↻</button>
      )}
    </span>
  );
}

import { useState, useMemo, useEffect } from 'react';
import type { RawMessage, MailAttachment } from '../data/types';
import type { Classification } from '../logic/classify';
import { domainHue, domainOf, rootDomain } from '../logic/classify';
import { trackersIn, decodeHtmlEntities, extract, type Entity, type ParcelEntity, type OtpEntity, type EventEntity, type InvoiceEntity, type OrderEntity, type SubscriptionEntity } from '../logic/extract';
import { formatMoney, formatRelative, initials } from '../logic/util';
import { fetchMessageBody, attachmentUrl } from '../data/live';
import { buildMailDocument } from '../../shared/mail-html';
import { useMailFrame } from '../../shared/useMailFrame';
import { RemoteImagesBar } from '../../shared/RemoteImagesBar';
import { isSenderAllowed, allowSender } from '../../shared/imageAllowlist';
import { useFocusTrap } from '../../shared/useFocusTrap';
import { setSeen } from '../data/actions';

interface Props {
  msg: RawMessage;
  cls: Classification;
  ents: Entity[];
  onClose: () => void;
}

export function Reader({ msg, cls, ents, onClose }: Props) {
  const [showTrackers, setShowTrackers] = useState(false);
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [loadedText, setLoadedText] = useState<string | null>(null);
  const [loadedAttachments, setLoadedAttachments] = useState<MailAttachment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const trackers = trackersIn(msg);
  const hue = domainHue(msg.from.address);
  const fromDomain = rootDomain(domainOf(msg.from.address));

  // Live-Modus: fehlender Body → aus Klassik-Endpoint lazy nachladen.
  const canLoadLive = msg.accountId != null && msg.uid != null && msg.folder;
  const needsLoad = canLoadLive && (!msg.hasBody || !msg.bodyHtml);

  useEffect(() => {
    setLoadedHtml(null);
    setLoadedText(null);
    setLoadedAttachments(null);
    if (!needsLoad) return;
    let cancelled = false;
    setLoading(true);
    fetchMessageBody(msg.accountId!, msg.uid!, msg.folder).then(body => {
      if (cancelled || !body) { setLoading(false); return; }
      setLoadedHtml(body.html);
      setLoadedText(body.text);
      setLoadedAttachments(body.attachments);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [msg.accountId, msg.uid, msg.folder, needsLoad]);

  const effectiveMsg: RawMessage = useMemo(() => ({
    ...msg,
    bodyHtml: loadedHtml || msg.bodyHtml,
    bodyText: loadedText || msg.bodyText,
    attachments: loadedAttachments || msg.attachments
  }), [msg, loadedHtml, loadedText, loadedAttachments]);

  const liveEnts = useMemo(
    () => (loadedHtml || loadedText) ? extract(effectiveMsg) : ents,
    [effectiveMsg, loadedHtml, loadedText, ents]
  );

  const isDark = useMemo(() => (
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  ), [effectiveMsg]);

  const [loadRemoteOnce, setLoadRemoteOnce] = useState(false);
  useEffect(() => { setLoadRemoteOnce(false); }, [msg.id]);
  const [allowlistTick, setAllowlistTick] = useState(0);
  useEffect(() => {
    const bump = () => setAllowlistTick((t) => t + 1);
    window.addEventListener('pulse:allowlist-changed', bump);
    return () => window.removeEventListener('pulse:allowlist-changed', bump);
  }, []);
  const senderAllowed = useMemo(
    () => isSenderAllowed(msg.from.address),
    [msg.from.address, allowlistTick]
  );
  const blockRemote = !loadRemoteOnce && !senderAllowed;

  const readableHtml = useMemo(() => renderReadable(effectiveMsg), [effectiveMsg]);
  const doc = useMemo(
    () => renderOriginal(effectiveMsg, showTrackers, isDark, blockRemote),
    [effectiveMsg, showTrackers, isDark, blockRemote]
  );
  const originalHtml = doc.srcDoc;
  const attachments = effectiveMsg.attachments || [];
  const { iframeRef, onLoad } = useMailFrame(originalHtml, { minHeight: 400 });
  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusSelector: 'button.reader-back',
    onEscape: onClose,
  });

  // Mark the mail as read on the server the first time the reader opens it.
  useEffect(() => {
    if (msg.accountId == null || msg.uid == null) return;
    if (msg.flags.includes('\\Seen')) return;
    setSeen(msg, true).catch(() => {});
  }, [msg.id, msg.accountId, msg.uid]);

  return (
    <div className="reader" style={{ ['--row-hue' as any]: hue }} ref={trapRef}>
      <header className="reader-head">
        <button className="reader-back" onClick={onClose} aria-label="Schliessen">✕</button>
        <div className="reader-sender">
          <div className="reader-avatar" style={{ background: `oklch(58% 0.14 ${hue})` }}>
            {initials(msg.from.name, msg.from.address)}
          </div>
          <div>
            <div className="reader-from">{msg.from.name}</div>
            <div className="reader-address">
              <span className="reader-mono">{msg.from.address}</span>
              <TrustChip cls={cls} fromDomain={fromDomain} />
            </div>
          </div>
        </div>
        <div className="reader-date">{formatRelative(msg.date)}</div>
      </header>

      <h1 className="reader-subject" id="reader-subject">{msg.subject}</h1>

      {cls.spoofing.reasons.length > 0 && (
        <div className="alert alert-danger">
          <strong>Vorsicht: moeglicher Betrugsversuch.</strong>
          <ul>{cls.spoofing.reasons.map(r => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      {liveEnts.length > 0 && (
        <div className="reader-entities">
          {liveEnts.map((e, i) => <EntityCard key={`${e.kind}-${i}`} ent={e} />)}
        </div>
      )}

      {(trackers.length > 0) && (
        <div className="reader-toolbar">
          <button
            className={`chip ${showTrackers ? 'chip-warn' : 'chip-ghost'}`}
            onClick={() => setShowTrackers(s => !s)}
            title={trackers.join(', ')}
          >
            {showTrackers
              ? `${trackers.length} Tracker sichtbar`
              : `${trackers.length} Tracker blockiert · ${trackers.join(', ')}`}
          </button>
        </div>
      )}

      <div className="reader-content">
        {doc.blockedCount > 0 && (
          <RemoteImagesBar
            blockedCount={doc.blockedCount}
            hosts={doc.blockedHosts}
            senderAddress={msg.from.address}
            onLoadOnce={() => setLoadRemoteOnce(true)}
            onAllowSender={() => {
              if (msg.from.address) allowSender(msg.from.address);
              setLoadRemoteOnce(true);
            }}
          />
        )}
        {loading && !loadedHtml && !effectiveMsg.bodyHtml ? (
          <div className="reader-loading">Nachricht wird geladen…</div>
        ) : effectiveMsg.bodyHtml ? (
          <iframe
            ref={iframeRef}
            onLoad={onLoad}
            className="reader-iframe"
            srcDoc={originalHtml}
            // Same-origin lets the parent measure and downscale the mail; we
            // still block scripts by not adding allow-scripts.
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            title="Nachricht"
          />
        ) : (
          <div className="readable" dangerouslySetInnerHTML={{ __html: readableHtml }} />
        )}
      </div>

      {attachments.length > 0 && (
        <div className="reader-attachments">
          <div className="section-title">Anhänge ({attachments.length})</div>
          <ul>
            {attachments.filter(a => !a.inline).map((a, i) => {
              const canDownload = canLoadLive;
              const href = canDownload
                ? attachmentUrl(msg.accountId!, msg.uid!, a.filename || `anhang-${i}`, msg.folder, a.cid)
                : undefined;
              return (
                <li key={`${a.filename}-${i}`}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener" className="att-link" download={a.filename}>
                      <span className="att-icon" aria-hidden>{fileIcon(a.mime, a.filename)}</span>
                      <span className="att-name">{a.filename || 'Anhang'}</span>
                      <span className="att-meta">{a.mime} · {formatBytes(a.size)}</span>
                    </a>
                  ) : (
                    <div className="att-link att-disabled" title="Nur mit Live-Daten öffnbar">
                      <span className="att-icon" aria-hidden>{fileIcon(a.mime, a.filename)}</span>
                      <span className="att-name">{a.filename || 'Anhang'}</span>
                      <span className="att-meta">{a.mime} · {formatBytes(a.size)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function fileIcon(mime: string, filename: string): string {
  const m = (mime || '').toLowerCase();
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  if (m.startsWith('image/')) return '🖼';
  if (m === 'application/pdf' || ext === 'pdf') return '📄';
  if (m.includes('zip') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜';
  if (m.includes('word') || ['doc', 'docx', 'odt'].includes(ext)) return '📝';
  if (m.includes('sheet') || m.includes('excel') || ['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊';
  if (m.includes('calendar') || ext === 'ics') return '📅';
  return '📎';
}

function TrustChip({ cls, fromDomain }: { cls: Classification; fromDomain: string }) {
  const t = cls.trust;
  const label =
    t.overall === 'good' ? 'verifiziert' :
    t.overall === 'warn' ? 'unklar' :
    'nicht verifiziert';
  const detail = [
    `SPF ${t.spf}`,
    `DKIM ${t.dkim}${t.dkimDomain ? ` (${rootDomain(t.dkimDomain)})` : ''}`,
    `DMARC ${t.dmarc}`,
    t.aligned ? `ausgerichtet auf ${fromDomain}` : t.dkimDomain ? 'nicht ausgerichtet' : ''
  ].filter(Boolean).join(' · ');
  return (
    <span className={`trust-chip trust-${t.overall}`} title={detail}>
      <span className="trust-dot" />
      {label}
    </span>
  );
}

function EntityCard({ ent }: { ent: Entity }) {
  switch (ent.kind) {
    case 'parcel': {
      const p = ent as ParcelEntity;
      return (
        <div className="ent-card ent-parcel">
          <div className="ent-label">Paket</div>
          <div className="ent-primary">{p.itemName || p.carrier || 'Sendung'}</div>
          <div className="ent-secondary">
            <code>{p.trackingNumber}</code> · {p.carrier}
          </div>
        </div>
      );
    }
    case 'order': {
      const o = ent as OrderEntity;
      return (
        <div className="ent-card ent-order">
          <div className="ent-label">Bestellung</div>
          <div className="ent-primary">{o.merchant}</div>
          <div className="ent-secondary">
            Nr. {o.orderNumber}{o.total ? ` · ${formatMoney(o.total.value, o.total.currency)}` : ''}
          </div>
        </div>
      );
    }
    case 'subscription': {
      const s = ent as SubscriptionEntity;
      return (
        <div className="ent-card ent-sub">
          <div className="ent-label">Abo</div>
          <div className="ent-primary">{formatMoney(s.amount.value, s.amount.currency)} / {s.cycle === 'year' ? 'Jahr' : 'Monat'}</div>
          <div className="ent-secondary">{s.service}</div>
        </div>
      );
    }
    case 'event': {
      const e = ent as EventEntity;
      return (
        <div className="ent-card ent-event">
          <div className="ent-label">Termin</div>
          <div className="ent-primary">{e.title}</div>
          <div className="ent-secondary">
            {new Date(e.start).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
            {e.location ? ` · ${e.location}` : ''}
          </div>
        </div>
      );
    }
    case 'otp': {
      const o = ent as OtpEntity;
      return (
        <div className="ent-card ent-otp">
          <div className="ent-label">Code</div>
          <button
            className="ent-otp-code"
            onClick={() => navigator.clipboard?.writeText(o.code)}
            title="Kopieren"
          >{o.code}</button>
          <div className="ent-secondary">{o.service}</div>
        </div>
      );
    }
    case 'invoice': {
      const inv = ent as InvoiceEntity;
      const isReminder = inv.status === 'reminder';
      return (
        <div className={`ent-card ent-invoice ${isReminder ? 'ent-reminder' : ''}`}>
          <div className="ent-label">{isReminder ? 'Mahnung' : 'Rechnung'}</div>
          <div className="ent-primary">
            {inv.amount ? formatMoney(inv.amount.value, inv.amount.currency) : 'Betrag nicht im Text'}
          </div>
          <div className="ent-secondary">
            {inv.merchant}{inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ''}{inv.dueDate ? ` · bis ${inv.dueDate}` : ''}
          </div>
          {inv.iban && <div className="ent-iban"><code>{inv.iban}</code></div>}
        </div>
      );
    }
  }
}

// ---------- HTML render helpers ----------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderReadable(msg: RawMessage): string {
  const text = decodeHtmlEntities(msg.bodyText || '');
  const lines = text.split(/\r?\n/);
  const paragraphs: { quote: number; text: string }[] = [];
  let buf = { quote: 0, lines: [] as string[] };
  const flush = () => {
    if (buf.lines.length) {
      paragraphs.push({ quote: buf.quote, text: buf.lines.join(' ') });
      buf = { quote: 0, lines: [] };
    }
  };
  for (const raw of lines) {
    const m = raw.match(/^(>+)\s?(.*)$/);
    const q = m ? m[1].length : 0;
    const l = m ? m[2] : raw;
    if (l.trim() === '') { flush(); continue; }
    if (buf.quote !== q && buf.lines.length) flush();
    buf.quote = q;
    buf.lines.push(l);
  }
  flush();

  const html = paragraphs.map(p => {
    if (p.quote > 0) {
      return `<blockquote class="readable-quote" data-level="${p.quote}">${escapeHtml(p.text)}</blockquote>`;
    }
    return `<p>${linkify(escapeHtml(p.text))}</p>`;
  }).join('\n');

  return html || '<p><em>Kein Textinhalt.</em></p>';
}

function linkify(escaped: string): string {
  return escaped
    .replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    .replace(/(\d{20}|H\d{13,14})/g, m => `<code>${m}</code>`);
}

function renderOriginal(msg: RawMessage, allowTrackers: boolean, isDark: boolean, blockRemote: boolean) {
  let html = msg.bodyHtml || `<pre>${escapeHtml(msg.bodyText || '')}</pre>`;
  if (!allowTrackers) {
    html = html.replace(/<img\b([^>]*)>/gi, (_full, attrs) => {
      // block 1x1 pixel trackers on top of the general remote-image block
      const isTracker = /width\s*=\s*['"]?1['"]?/i.test(attrs) && /height\s*=\s*['"]?1['"]?/i.test(attrs);
      if (isTracker) return '';
      return `<img${attrs} loading="lazy">`;
    });
  }

  // Route through the shared renderer so cid: inline images resolve, the
  // document is a valid HTML5 shell, dark-mode CSS only paints over mails
  // that don't ship their own colors, and remote images can be neutralized
  // before the browser fetches them.
  const canLoad = msg.accountId != null && msg.uid != null && msg.folder;
  return buildMailDocument({
    html,
    isDark,
    padding: 24,
    blockRemote,
    attachments: msg.attachments,
    attachmentUrl: canLoad
      ? (att) => attachmentUrl(msg.accountId!, msg.uid!, att.filename || 'inline', msg.folder!, att.cid)
      : undefined,
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

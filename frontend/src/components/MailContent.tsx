import { useMemo, memo, useState, useEffect } from 'react';
import { useStore, msgKey } from '../store';
import { Icon } from './Icon';
import { format, isToday, isYesterday } from 'date-fns';
import { de } from 'date-fns/locale';
import { buildMailDocument } from '../shared/mail-html';
import { useMailFrame } from '../shared/useMailFrame';
import { renderPlainText } from '../shared/plain-text';
import { RemoteImagesBar } from '../shared/RemoteImagesBar';
import { isSenderAllowed, allowSender } from '../shared/imageAllowlist';
import { PdfPreview } from '../shared/PdfPreview';
import { isPdfAttachment } from '../shared/pdf';
import SenderAvatar from '../shared/SenderAvatar';
import '../shared/shared.css';
import '../styles/mailcontent.css';

interface MailContentProps {
  onArchive: (keys?: string[]) => void;
  onDelete: (keys?: string[]) => void;
  onToggleFlag: (keys?: string[], flagged?: boolean) => void;
  variant?: 'preview' | 'full';
  onExpand?: () => void;
  onClose?: () => void;
  onOpenMessage?: (key: string) => void;
}

function looksLikeHtml(value: string) {
  return /<(html|head|body|div|p|table|span|br|img|meta)\b/i.test(value);
}

function decodeMaybeBase64(value: string) {
  if (!value) return '';
  const compact = value.replace(/\s+/g, '');
  if (compact.length >= 60 && /^[A-Za-z0-9+/]+=*$/.test(compact) && !value.includes('<')) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(compact), c => c.charCodeAt(0)));
      if (decoded.includes('<') || /[äöüÄÖÜß]/.test(decoded)) return decoded;
    } catch {}
  }
  return value;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addressList(list: { name?: string; address?: string }[] = []) {
  return list.map(a => a.name || a.address).filter(Boolean).join(', ');
}

function formatHeaderDate(dateStr?: string, detailed = false) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  if (detailed) {
    return format(date, "EEEE, d. MMMM yyyy · HH:mm", { locale: de });
  }
  if (isToday(date)) return format(date, "'Heute,' HH:mm", { locale: de });
  if (isYesterday(date)) return format(date, "'Gestern,' HH:mm", { locale: de });
  return format(date, 'd. MMM yyyy · HH:mm', { locale: de });
}

function MailContentInner({
  onArchive, onDelete, onToggleFlag, variant = 'preview', onExpand, onClose, onOpenMessage
}: MailContentProps) {
  const selectedMessage = useStore(s => s.selectedMessage);
  const messageBody = useStore(s => s.messageBody);
  const selectedAccount = useStore(s => s.selectedAccount);
  const selectedFolder = useStore(s => s.selectedFolder);
  const composeFont = useStore(s => s.composeFont);
  const theme = useStore(s => s.theme);
  const loadRemoteImages = useStore(s => s.loadRemoteImages);
  const openCompose = useStore(s => s.openCompose);
  const accounts = useStore(s => s.accounts);
  const threadingEnabled = useStore(s => s.threadingEnabled);
  const threads = useStore(s => s.threads);

  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const htmlSource = useMemo(() => {
    if (!selectedMessage) return '';
    const htmlCandidate = decodeMaybeBase64(messageBody?.html || selectedMessage.html || '');
    const textCandidate = decodeMaybeBase64(messageBody?.text || selectedMessage.text || '');
    if (looksLikeHtml(htmlCandidate)) return htmlCandidate;
    if (looksLikeHtml(textCandidate)) return textCandidate;
    return htmlCandidate;
  }, [selectedMessage, messageBody]);

  const plainText = useMemo(() => {
    if (!selectedMessage) return '';
    const text = decodeMaybeBase64(messageBody?.text || selectedMessage.text || '');
    return looksLikeHtml(text) ? '' : text;
  }, [selectedMessage, messageBody]);

  // Per-mail override: user clicked "Laden" once. Reset when the selected
  // message changes. Blocking only applies when the setting is off and the
  // sender is not on the allowlist.
  const [loadRemoteOnce, setLoadRemoteOnce] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const messageKey = selectedMessage
    ? `${selectedMessage.accountId ?? ''}:${selectedMessage.uid}`
    : '';
  useEffect(() => { setLoadRemoteOnce(false); setPreviewPdf(null); }, [messageKey]);

  // Re-render when the allowlist changes (e.g. after adding the sender).
  const [allowlistTick, setAllowlistTick] = useState(0);
  useEffect(() => {
    const bump = () => setAllowlistTick((t) => t + 1);
    window.addEventListener('pulse:allowlist-changed', bump);
    return () => window.removeEventListener('pulse:allowlist-changed', bump);
  }, []);

  const senderAllowed = useMemo(
    () => isSenderAllowed(selectedMessage?.from?.address),
    [selectedMessage?.from?.address, allowlistTick]
  );
  const blockRemote = !loadRemoteImages && !loadRemoteOnce && !senderAllowed;

  // Inline images arrive as cid: references which the iframe cannot resolve
  // on its own – the shared renderer swaps them for the attachment endpoint
  // and only applies our theme background/text colors when the mail itself
  // didn't bring any (otherwise we'd repaint newsletters in dark mode).
  const doc = useMemo(() => {
    const accountId = selectedMessage?.accountId ?? selectedAccount?.id;
    const folder = selectedMessage?.folder || selectedFolder;
    if (!htmlSource || !accountId || !selectedMessage) {
      return { srcDoc: '', hasOwnBackground: false, canvas: 'light' as const, blockedCount: 0, blockedHosts: [] as string[] };
    }

    const pad = variant === 'preview' ? 18 : 28;
    return buildMailDocument({
      html: htmlSource,
      isDark,
      fontFamily: composeFont.family,
      fontSize: composeFont.size,
      padding: pad,
      blockRemote,
      attachments: selectedMessage.attachments || [],
      attachmentUrl: (att) => {
        const name = encodeURIComponent(att.filename || 'inline');
        const cid = (att.cid || '').replace(/^<|>$/g, '').trim().toLowerCase();
        return `/api/mail/${accountId}/attachment/${selectedMessage.uid}/${name}?folder=${encodeURIComponent(folder)}&cid=${encodeURIComponent(cid)}&inline=1`;
      },
    });
  }, [htmlSource, selectedMessage, selectedAccount, selectedFolder, composeFont, isDark, variant, blockRemote]);

  const srcDoc = doc.srcDoc;
  const { iframeRef, onLoad } = useMailFrame(srcDoc, { minHeight: variant === 'preview' ? 240 : 400 });

  const plainTextHtml = useMemo(
    () => renderPlainText(plainText || ''),
    [plainText]
  );

  if (!selectedMessage) {
    return (
      <div className="mailcontent empty">
        <div className="mailcontent-placeholder">
          <Icon name="envelope" size={44} strokeWidth={1} />
          <p>Keine E-Mail ausgewählt</p>
          <span className="mailcontent-placeholder-hint">
            Einfach klicken zum Vorschau, Doppelklick öffnet die Mail
          </span>
        </div>
      </div>
    );
  }

  const mailAccountId = selectedMessage.accountId ?? selectedAccount?.id;
  const mailFolder = selectedMessage.folder || selectedFolder;
  const keys = mailAccountId ? [msgKey(mailAccountId, selectedMessage.uid)] : [];
  const isFlagged = selectedMessage.flags?.includes('\\Flagged');

  function attachmentUrl(filename: string, inline = false) {
    return `/api/mail/${mailAccountId}/attachment/${selectedMessage!.uid}/${encodeURIComponent(filename)}?folder=${encodeURIComponent(mailFolder)}${inline ? '&inline=1' : ''}`;
  }

  function downloadAttachment(filename: string) {
    if (!mailAccountId) return;
    window.open(attachmentUrl(filename), '_blank');
  }

  function openAttachment(att: { filename: string; contentType?: string }) {
    if (isPdfAttachment(att)) setPreviewPdf(att.filename);
    else downloadAttachment(att.filename);
  }

  const isImage = (type?: string) => !!type && type.toLowerCase().startsWith('image/');
  const realAttachments = (selectedMessage.attachments || []).filter(a => !a.cid && a.filename);
  const imageAttachments = realAttachments.filter(a => isImage(a.contentType));
  const fileAttachments = realAttachments.filter(a => !isImage(a.contentType));

  return (
    <div className={`mailcontent ${variant}`}>
      <div className="mailcontent-header">
        <div className="mailcontent-toolbar">
          {variant === 'full' && onClose && (
            <button className="action-btn" onClick={onClose} title="Schließen" aria-label="Schließen">
              <Icon name="close" />
            </button>
          )}
          <div className="mailcontent-toolbar-group">
            <button className="action-btn" onClick={() => openCompose('reply', selectedMessage)} title="Antworten (R)" aria-label="Antworten">
              <Icon name="reply" />
            </button>
            <button className="action-btn" onClick={() => openCompose('replyAll', selectedMessage)} title="Allen antworten (A)" aria-label="Allen antworten">
              <Icon name="replyAll" />
            </button>
            <button className="action-btn" onClick={() => openCompose('forward', selectedMessage)} title="Weiterleiten (F)" aria-label="Weiterleiten">
              <Icon name="forward" />
            </button>
          </div>
          <span className="mailcontent-toolbar-spacer" />
          <div className="mailcontent-toolbar-group">
            <button className="action-btn" onClick={() => onArchive(keys)} title="Archivieren (E)" aria-label="Archivieren">
              <Icon name="archive" />
            </button>
            <button
              className={`action-btn ${isFlagged ? 'flagged' : ''}`}
              onClick={() => onToggleFlag(keys, !isFlagged)}
              title="Markieren (L)"
              aria-label={isFlagged ? 'Markierung entfernen' : 'Markieren'}
              aria-pressed={isFlagged}
            >
              <Icon name="flag" filled={isFlagged} />
            </button>
            <button className="action-btn delete-btn" onClick={() => onDelete(keys)} title="Löschen" aria-label="Löschen">
              <Icon name="trash" />
            </button>
          </div>
          {variant === 'preview' && onExpand && (
            <button className="action-btn expand-btn" onClick={onExpand} title="Vollständig öffnen" aria-label="Vollständig öffnen">
              <Icon name="envelopeOpen" />
            </button>
          )}
        </div>

        <h1 className="mailcontent-subject">
          {selectedMessage.subject || '(Kein Betreff)'}
          {isFlagged && <Icon name="flag" size={16} filled className="subject-flag" />}
        </h1>

        <div className="mailcontent-person">
          <SenderAvatar
            className="mailcontent-avatar"
            name={selectedMessage.from.name}
            address={selectedMessage.from.address}
            allowRemote={loadRemoteImages}
          />
          <div className="mailcontent-person-body">
            <div className="mailcontent-person-top">
              <span className="mailcontent-person-name">
                {selectedMessage.from.name || selectedMessage.from.address || 'Unbekannt'}
              </span>
              <span className="mailcontent-person-date">
                {formatHeaderDate(selectedMessage.date, variant === 'full')}
              </span>
            </div>
            {selectedMessage.from.name && selectedMessage.from.address && (
              <div className="mailcontent-person-email">{selectedMessage.from.address}</div>
            )}
            <div className="mailcontent-person-route">
              {selectedMessage.to?.length > 0 && (
                <span>An {addressList(selectedMessage.to)}</span>
              )}
              {selectedMessage.cc?.length > 0 && (
                <span>CC {addressList(selectedMessage.cc)}</span>
              )}
              {accounts.length > 1 && mailAccountId && (
                <span className="mailcontent-mailbox">
                  <span
                    className="mailcontent-mailbox-dot"
                    style={{ background: accounts.find(a => a.id === mailAccountId)?.color || 'var(--accent-color)' }}
                  />
                  {accounts.find(a => a.id === mailAccountId)?.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {threadingEnabled && onOpenMessage && (() => {
        const currentKey = msgKey(selectedMessage.accountId, selectedMessage.uid);
        const thread = threads.find(t => t.count > 1 && (
          t.messages?.some(m => msgKey(m.accountId ?? t.accountId, m.uid) === currentKey)
          || msgKey(t.accountId, t.uid) === currentKey
        ));
        if (!thread?.messages || thread.messages.length < 2) return null;
        return (
          <div className="mailcontent-thread" role="list">
            <div className="mailcontent-thread-label">{thread.messages.length} Nachrichten in dieser Konversation</div>
            {thread.messages.map(m => {
              const key = msgKey(m.accountId ?? thread.accountId, m.uid);
              return (
                <button
                  key={key}
                  type="button"
                  role="listitem"
                  className={`mailcontent-thread-item ${key === currentKey ? 'active' : ''}`}
                  onClick={() => onOpenMessage(key)}
                >
                  <span className="mailcontent-thread-from">{m.from?.name || m.from?.address || 'Unbekannt'}</span>
                  <span className="mailcontent-thread-subject">{m.subject || '(Kein Betreff)'}</span>
                  <span className="mailcontent-thread-date">{formatHeaderDate(m.date)}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {fileAttachments.length > 0 && (
        <div className="mailcontent-attachments">
          {fileAttachments.map(att => {
            const pdf = isPdfAttachment(att);
            return (
              <button
                key={att.filename}
                className={`attachment-chip ${pdf ? 'pdf' : ''}`}
                onClick={() => openAttachment(att)}
                title={pdf ? 'PDF-Vorschau' : 'Herunterladen'}
              >
                <Icon name={pdf ? 'pdf' : 'download'} size={14} />
                <span className="attachment-name">{att.filename}</span>
                <span className="attachment-size">{formatSize(att.size)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mailcontent-body">
        {doc.blockedCount > 0 && (
          <RemoteImagesBar
            blockedCount={doc.blockedCount}
            hosts={doc.blockedHosts}
            senderAddress={selectedMessage.from?.address}
            onLoadOnce={() => setLoadRemoteOnce(true)}
            onAllowSender={() => {
              if (selectedMessage.from?.address) allowSender(selectedMessage.from.address);
              setLoadRemoteOnce(true);
            }}
          />
        )}
        {selectedMessage.bodyLoading && !htmlSource ? (
          <div className="mail-loading">
            {plainText ? (
              <div
                className="mail-text"
                style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}
                dangerouslySetInnerHTML={{ __html: plainTextHtml }}
              />
            ) : null}
            <div className="mail-loading-bar" />
          </div>
        ) : htmlSource ? (
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            onLoad={onLoad}
            className="mail-iframe"
            style={{ background: doc.canvas === 'dark' ? '#1a1b1f' : '#ffffff' }}
            // Same-origin is needed so we can measure the rendered document
            // for auto-height and downscale wide newsletters. We deliberately
            // do NOT allow-scripts, so mail JS is still blocked.
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            title="E-Mail Inhalt"
          />
        ) : (
          <div
            className="mail-text"
            style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}
            dangerouslySetInnerHTML={{ __html: plainTextHtml }}
          />
        )}
      </div>

      {imageAttachments.length > 0 && (
        <div className="mailcontent-images">
          {imageAttachments.map(att => (
            <figure key={att.filename} className="mail-image-preview">
              <img
                src={attachmentUrl(att.filename, true)}
                alt={att.filename}
                loading="lazy"
                onClick={() => downloadAttachment(att.filename)}
              />
              <figcaption>
                <span className="attachment-name">{att.filename}</span>
                <span className="attachment-size">{formatSize(att.size)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {previewPdf && mailAccountId && (
        <PdfPreview
          src={attachmentUrl(previewPdf, true)}
          filename={previewPdf}
          downloadHref={attachmentUrl(previewPdf, false)}
          onClose={() => setPreviewPdf(null)}
        />
      )}
    </div>
  );
}

const MailContent = memo(MailContentInner);
export default MailContent;

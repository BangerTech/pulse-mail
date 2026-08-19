import { useMemo } from 'react';
import { useStore, msgKey } from '../store';
import { Icon } from './Icon';
import { format, isToday, isYesterday } from 'date-fns';
import { de } from 'date-fns/locale';
import '../styles/mailcontent.css';

interface MailContentProps {
  onArchive: (keys?: string[]) => void;
  onDelete: (keys?: string[]) => void;
  onToggleFlag: (keys?: string[], flagged?: boolean) => void;
  variant?: 'preview' | 'full';
  onExpand?: () => void;
  onClose?: () => void;
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

function getInitials(name?: string, address?: string) {
  const source = (name || address || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.charAt(0).toUpperCase();
}

const AVATAR_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];

function getAvatarColor(address?: string) {
  if (!address) return '#8E8E93';
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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

export default function MailContent({
  onArchive, onDelete, onToggleFlag, variant = 'preview', onExpand, onClose
}: MailContentProps) {
  const {
    selectedMessage, selectedAccount, selectedFolder, composeFont, theme, openCompose, accounts
  } = useStore();

  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const htmlSource = useMemo(() => {
    if (!selectedMessage) return '';
    const htmlCandidate = decodeMaybeBase64(selectedMessage.html || '');
    const textCandidate = decodeMaybeBase64(selectedMessage.text || '');
    if (looksLikeHtml(htmlCandidate)) return htmlCandidate;
    if (looksLikeHtml(textCandidate)) return textCandidate;
    return htmlCandidate;
  }, [selectedMessage]);

  const plainText = useMemo(() => {
    if (!selectedMessage) return '';
    const text = decodeMaybeBase64(selectedMessage.text || '');
    return looksLikeHtml(text) ? '' : text;
  }, [selectedMessage]);

  // Inline images arrive as cid: references which the iframe cannot resolve, so
  // they are swapped for the attachment endpoint before rendering.
  const html = useMemo(() => {
    const accountId = selectedMessage?.accountId ?? selectedAccount?.id;
    const folder = selectedMessage?.folder || selectedFolder;
    if (!htmlSource || !accountId || !selectedMessage) return htmlSource;

    const normalize = (cid?: string) => (cid || '').replace(/^<|>$/g, '').trim().toLowerCase();
    let output = htmlSource;
    for (const att of selectedMessage.attachments || []) {
      if (!att.cid) continue;
      const cid = normalize(att.cid);
      const name = encodeURIComponent(att.filename || 'inline');
      const url = `/api/mail/${accountId}/attachment/${selectedMessage.uid}/${name}?folder=${encodeURIComponent(folder)}&cid=${encodeURIComponent(cid)}&inline=1`;
      output = output.replace(
        new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?`, 'gi'),
        url
      );
    }

    const pad = variant === 'preview' ? 18 : 28;
    const style = `<style>
      :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
      body {
        margin: 0;
        padding: ${pad}px;
        font-family: ${composeFont.family};
        font-size: ${composeFont.size}px;
        line-height: 1.65;
        color: ${isDark ? '#f5f5f7' : '#1d1d1f'};
        background: ${isDark ? '#1a1b1f' : '#ffffff'};
        word-wrap: break-word;
      }
      img { max-width: 100%; height: auto; }
      a { color: #0A84FF; }
      blockquote {
        margin: 8px 0;
        padding-left: 14px;
        border-left: 3px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'};
        color: ${isDark ? '#98989d' : '#6e6e73'};
      }
      pre { white-space: pre-wrap; word-wrap: break-word; }
      table { max-width: 100%; }
    </style>`;

    return style + output;
  }, [htmlSource, selectedMessage, selectedAccount, selectedFolder, composeFont, isDark, variant]);

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

  const isImage = (type?: string) => !!type && type.toLowerCase().startsWith('image/');
  const realAttachments = (selectedMessage.attachments || []).filter(a => !a.cid && a.filename);
  const imageAttachments = realAttachments.filter(a => isImage(a.contentType));
  const fileAttachments = realAttachments.filter(a => !isImage(a.contentType));

  return (
    <div className={`mailcontent ${variant}`}>
      <div className="mailcontent-header">
        <div className="mailcontent-toolbar">
          {variant === 'full' && onClose && (
            <button className="action-btn" onClick={onClose} title="Schließen">
              <Icon name="close" />
            </button>
          )}
          <div className="mailcontent-toolbar-group">
            <button className="action-btn" onClick={() => openCompose('reply', selectedMessage)} title="Antworten (R)">
              <Icon name="reply" />
            </button>
            <button className="action-btn" onClick={() => openCompose('replyAll', selectedMessage)} title="Allen antworten (A)">
              <Icon name="replyAll" />
            </button>
            <button className="action-btn" onClick={() => openCompose('forward', selectedMessage)} title="Weiterleiten (F)">
              <Icon name="forward" />
            </button>
          </div>
          <span className="mailcontent-toolbar-spacer" />
          <div className="mailcontent-toolbar-group">
            <button className="action-btn" onClick={() => onArchive(keys)} title="Archivieren (E)">
              <Icon name="archive" />
            </button>
            <button
              className={`action-btn ${isFlagged ? 'flagged' : ''}`}
              onClick={() => onToggleFlag(keys, !isFlagged)}
              title="Markieren (L)"
            >
              <Icon name="flag" filled={isFlagged} />
            </button>
            <button className="action-btn delete-btn" onClick={() => onDelete(keys)} title="Löschen">
              <Icon name="trash" />
            </button>
          </div>
          {variant === 'preview' && onExpand && (
            <button className="action-btn expand-btn" onClick={onExpand} title="Vollständig öffnen">
              <Icon name="envelopeOpen" />
            </button>
          )}
        </div>

        <h1 className="mailcontent-subject">
          {selectedMessage.subject || '(Kein Betreff)'}
          {isFlagged && <Icon name="flag" size={16} filled className="subject-flag" />}
        </h1>

        <div className="mailcontent-person">
          <div
            className="mailcontent-avatar"
            style={{ background: getAvatarColor(selectedMessage.from.address) }}
          >
            {getInitials(selectedMessage.from.name, selectedMessage.from.address)}
          </div>
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

        <div className="mailcontent-pills">
          <button className="mail-pill primary" onClick={() => openCompose('reply', selectedMessage)}>
            <Icon name="reply" size={14} />
            Antworten
          </button>
          <button className="mail-pill" onClick={() => openCompose('replyAll', selectedMessage)}>
            <Icon name="replyAll" size={14} />
            Allen
          </button>
          <button className="mail-pill" onClick={() => openCompose('forward', selectedMessage)}>
            <Icon name="forward" size={14} />
            Weiterleiten
          </button>
        </div>
      </div>

      {fileAttachments.length > 0 && (
        <div className="mailcontent-attachments">
          {fileAttachments.map(att => (
            <button
              key={att.filename}
              className="attachment-chip"
              onClick={() => downloadAttachment(att.filename)}
            >
              <Icon name="download" size={14} />
              <span className="attachment-name">{att.filename}</span>
              <span className="attachment-size">{formatSize(att.size)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mailcontent-body">
        {selectedMessage.bodyLoading && !htmlSource ? (
          <div className="mail-loading">
            {plainText ? (
              <pre
                className="mail-text"
                style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}
              >
                {plainText}
              </pre>
            ) : null}
            <div className="mail-loading-bar" />
          </div>
        ) : htmlSource ? (
          <iframe
            srcDoc={html}
            className="mail-iframe"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            title="E-Mail Inhalt"
          />
        ) : (
          <pre
            className="mail-text"
            style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}
          >
            {plainText}
          </pre>
        )}
      </div>

      {variant === 'preview' && onExpand && (
        <button className="mailcontent-open-hint" onClick={onExpand}>
          Doppelklick oder hier klicken, um die Mail vollständig zu öffnen
        </button>
      )}

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
    </div>
  );
}

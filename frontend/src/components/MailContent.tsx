import { useMemo } from 'react';
import { useStore, msgKey } from '../store';
import { Icon } from './Icon';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import '../styles/mailcontent.css';

interface MailContentProps {
  onArchive: (keys?: string[]) => void;
  onDelete: (keys?: string[]) => void;
  onToggleFlag: (keys?: string[], flagged?: boolean) => void;
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

export default function MailContent({ onArchive, onDelete, onToggleFlag }: MailContentProps) {
  const {
    selectedMessage, selectedAccount, selectedFolder, composeFont, theme, openCompose, accounts
  } = useStore();

  const isDark = theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Inline images arrive as cid: references which the iframe cannot resolve, so
  // they are swapped for the attachment endpoint before rendering.
  const html = useMemo(() => {
    const accountId = selectedMessage?.accountId ?? selectedAccount?.id;
    const folder = selectedMessage?.folder || selectedFolder;
    if (!selectedMessage?.html || !accountId) return selectedMessage?.html || '';

    const normalize = (cid?: string) => (cid || '').replace(/^<|>$/g, '').trim().toLowerCase();
    let output = selectedMessage.html;
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

    const style = `<style>
      :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
      body {
        margin: 0;
        padding: 24px;
        font-family: ${composeFont.family};
        font-size: ${composeFont.size}px;
        line-height: 1.6;
        color: ${isDark ? '#f5f5f7' : '#1d1d1f'};
        background: ${isDark ? '#141416' : '#ffffff'};
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
  }, [selectedMessage, selectedAccount, selectedFolder, composeFont, isDark]);

  if (!selectedMessage) {
    return (
      <div className="mailcontent empty">
        <div className="mailcontent-placeholder">
          <Icon name="envelope" size={44} strokeWidth={1} />
          <p>Keine E-Mail ausgewählt</p>
          <span className="mailcontent-placeholder-hint">
            Drücke <kbd>⌘K</kbd> für alle Befehle
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
    <div className="mailcontent">
      <div className="mailcontent-header">
        <div className="mailcontent-actions">
          <button className="action-btn" onClick={() => openCompose('reply', selectedMessage)} title="Antworten (R)">
            <Icon name="reply" />
          </button>
          <button className="action-btn" onClick={() => openCompose('replyAll', selectedMessage)} title="Allen antworten (A)">
            <Icon name="replyAll" />
          </button>
          <button className="action-btn" onClick={() => openCompose('forward', selectedMessage)} title="Weiterleiten (F)">
            <Icon name="forward" />
          </button>
          <span className="action-divider" />
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

        <h1 className="mailcontent-subject">
          {selectedMessage.subject || '(Kein Betreff)'}
          {isFlagged && <Icon name="flag" size={16} filled className="subject-flag" />}
        </h1>

        <div className="mailcontent-meta">
          <div className="mailcontent-from">
            <strong>{selectedMessage.from.name || selectedMessage.from.address}</strong>
            {selectedMessage.from.name && (
              <span className="mailcontent-email"> &lt;{selectedMessage.from.address}&gt;</span>
            )}
          </div>
          {selectedMessage.to?.length > 0 && (
            <div>An: {addressList(selectedMessage.to)}</div>
          )}
          {selectedMessage.cc?.length > 0 && (
            <div>CC: {addressList(selectedMessage.cc)}</div>
          )}
          <div className="mailcontent-date">
            {selectedMessage.date
              ? format(new Date(selectedMessage.date), "EEEE, d. MMMM yyyy 'um' HH:mm", { locale: de })
              : ''}
          </div>
          {accounts.length > 1 && mailAccountId && (
            <div className="mailcontent-mailbox">
              <span
                className="mailcontent-mailbox-dot"
                style={{ background: accounts.find(a => a.id === mailAccountId)?.color || 'var(--accent-color)' }}
              />
              {accounts.find(a => a.id === mailAccountId)?.email}
            </div>
          )}
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
        {selectedMessage.html ? (
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
            {selectedMessage.text}
          </pre>
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
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { useFocusTrap } from './useFocusTrap';
import { authHeaders } from '../api';

interface Props {
  src: string;
  filename: string;
  onClose: () => void;
  downloadHref?: string;
}

export function PdfPreview({ src, filename, onClose, downloadHref }: Props) {
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusSelector: 'button.pdf-preview-close',
    onEscape: onClose,
  });

  useEffect(() => {
    let cancelled = false;
    let created = '';

    (async () => {
      try {
        const res = await fetch(src, { headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || 'PDF konnte nicht geladen werden');
        }
        const blob = await res.blob();
        created = URL.createObjectURL(blob);
        if (!cancelled) setObjectUrl(created);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PDF konnte nicht geladen werden');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  async function download() {
    const href = downloadHref || src;
    try {
      const res = await fetch(href, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(href, '_blank', 'noopener');
    }
  }

  return (
    <div className="pdf-preview-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="pdf-preview"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={filename}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="pdf-preview-bar">
          <span className="pdf-preview-title" title={filename}>{filename}</span>
          <div className="pdf-preview-actions">
            {(downloadHref || src) && (
              <button
                type="button"
                className="pdf-preview-btn"
                onClick={download}
                aria-label="Herunterladen"
                title="Herunterladen"
              >
                <Icon name="download" size={16} />
              </button>
            )}
            <button
              type="button"
              className="pdf-preview-btn pdf-preview-close"
              onClick={onClose}
              aria-label="Vorschau schließen"
              title="Schließen"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
        {error && <div className="pdf-preview-error">{error}</div>}
        {!error && !loaded && <div className="pdf-preview-loading">PDF wird geladen…</div>}
        {!error && objectUrl && (
          <iframe
            className="pdf-preview-frame"
            src={objectUrl}
            title={filename}
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>
    </div>
  );
}

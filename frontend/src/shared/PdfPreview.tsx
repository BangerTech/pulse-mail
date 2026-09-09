import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useFocusTrap } from './useFocusTrap';

interface Props {
  src: string;
  filename: string;
  onClose: () => void;
  downloadHref?: string;
}

export function PdfPreview({ src, filename, onClose, downloadHref }: Props) {
  const [loaded, setLoaded] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusSelector: 'button.pdf-preview-close',
    onEscape: onClose,
  });

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
            {downloadHref && (
              <a
                className="pdf-preview-btn"
                href={downloadHref}
                download={filename}
                target="_blank"
                rel="noopener"
                aria-label="Herunterladen"
                title="Herunterladen"
              >
                <Icon name="download" size={16} />
              </a>
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
        {!loaded && <div className="pdf-preview-loading">PDF wird geladen…</div>}
        <iframe
          className="pdf-preview-frame"
          src={src}
          title={filename}
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

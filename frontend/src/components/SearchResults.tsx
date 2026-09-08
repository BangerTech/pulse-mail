import { useState } from 'react';
import { useStore } from '../store';
import { Icon } from './Icon';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { onActivateKey } from '../shared/keyboard';
import '../styles/search.css';

export interface SearchOptions {
  scopeAllAccounts: boolean;
  from: string;
  hasAttachments: boolean;
  since: string;
  before: string;
  folder: string;
}

interface SearchResultsProps {
  options: SearchOptions;
  onOptionsChange: (options: SearchOptions) => void;
  onOpen: (accountId: number, folder: string, uid: number) => void;
}

export default function SearchResults({ options, onOptionsChange, onOpen }: SearchResultsProps) {
  const searchResults = useStore(s => s.searchResults);
  const searching = useStore(s => s.searching);
  const selectedUid = useStore(s => s.selectedMessage?.uid);
  const folders = useStore(s => s.folders);
  const [showFilters, setShowFilters] = useState(false);

  const folderLabel = (path: string) => {
    const match = folders.find(f => f.path === path);
    return match?.name || path;
  };

  const activeFilters =
    (options.scopeAllAccounts ? 1 : 0) +
    (options.from ? 1 : 0) +
    (options.hasAttachments ? 1 : 0) +
    (options.since ? 1 : 0) +
    (options.before ? 1 : 0) +
    (options.folder ? 1 : 0);

  return (
    <div className="search-results">
      <div className="search-header">
        <div className="search-summary">
          {searching ? 'Suche läuft...' : `${searchResults.length} Treffer`}
        </div>
        <button
          className={`search-filter-toggle ${activeFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(v => !v)}
        >
          Filter{activeFilters ? ` (${activeFilters})` : ''}
          <Icon name={showFilters ? 'chevronDown' : 'chevronRight'} size={13} />
        </button>
      </div>

      {showFilters && (
        <div className="search-filters">
          <label className="search-filter-row">
            <input
              type="checkbox"
              checked={options.scopeAllAccounts}
              onChange={e => onOptionsChange({ ...options, scopeAllAccounts: e.target.checked })}
            />
            Alle Accounts durchsuchen
          </label>

          <label className="search-filter-row">
            <input
              type="checkbox"
              checked={options.hasAttachments}
              onChange={e => onOptionsChange({ ...options, hasAttachments: e.target.checked })}
            />
            Nur mit Anhang
          </label>

          <div className="search-filter-row column">
            <span>Absender</span>
            <input
              type="text"
              className="search-filter-input"
              placeholder="name@beispiel.de"
              value={options.from}
              onChange={e => onOptionsChange({ ...options, from: e.target.value })}
            />
          </div>

          <div className="search-filter-row column">
            <span>Ordner</span>
            <select
              className="search-filter-input"
              value={options.folder}
              onChange={e => onOptionsChange({ ...options, folder: e.target.value })}
            >
              <option value="">Alle Ordner</option>
              {folders.map(f => (
                <option key={f.path} value={f.path}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="search-filter-row column">
            <span>Ab Datum</span>
            <input
              type="date"
              className="search-filter-input"
              value={options.since}
              onChange={e => onOptionsChange({ ...options, since: e.target.value })}
            />
          </div>

          <div className="search-filter-row column">
            <span>Bis Datum</span>
            <input
              type="date"
              className="search-filter-input"
              value={options.before}
              onChange={e => onOptionsChange({ ...options, before: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="search-list">
        {!searching && searchResults.length === 0 && (
          <div className="search-empty">Keine Treffer</div>
        )}

        {searchResults.map(result => (
          <div
            key={`${result.accountId}-${result.folder}-${result.uid}`}
            className={`search-item ${selectedUid === result.uid ? 'active' : ''}`}
            onClick={() => onOpen(result.accountId, result.folder, result.uid)}
            onKeyDown={(e) => onActivateKey(e, () => onOpen(result.accountId, result.folder, result.uid))}
            role="button"
            tabIndex={0}
          >
            <div className="search-item-top">
              <span className="search-item-from">
                {result.from?.name || result.from?.address || 'Unbekannt'}
              </span>
              <span className="search-item-date">
                {result.date ? format(new Date(result.date), 'd. MMM yy', { locale: de }) : ''}
              </span>
            </div>
            <div className="search-item-subject">{result.subject || '(Kein Betreff)'}</div>
            {result.snippet && <div className="search-item-snippet">{result.snippet}</div>}
            <div className="search-item-tags">
              <span className="search-tag">{folderLabel(result.folder)}</span>
              {result.account && (
                <span className="search-tag account">{result.account.email}</span>
              )}
              {result.hasAttachments && <Icon name="attachment" size={12} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

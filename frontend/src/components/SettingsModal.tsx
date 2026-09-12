import { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { useFocusTrap } from '../shared/useFocusTrap';
import { getNotifyPermission, requestNotifyPermission } from '../shared/notifyMail';
import { playNewMailSound, setNotifyVolume, getNotifySoundStatus } from '../shared/notifySound';
import { APP_VERSION, formatBuildTime } from '../shared/version';
import UserAvatar from './UserAvatar';
import { api } from '../api';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import { ResizableImage } from './ResizableImage';
import { FontSize } from '../extensions/FontSize';
import '../styles/settings.css';

type Tab = 'accounts' | 'users' | 'signatures' | 'appearance' | 'alerts' | 'info';

const FONT_OPTIONS = [
  { label: 'SF Pro', value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", Times, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Futura', value: 'Futura, "Trebuchet MS", Arial, sans-serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { label: 'Lucida Grande', value: '"Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Geneva, sans-serif' },
];

const SIG_FONT_OPTIONS = [
  { label: 'Standard', value: '' },
  { label: 'SF Pro', value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
];

const SIG_SIZE_OPTIONS = [
  { label: 'Standard', value: '' },
  { label: '9px', value: '9px' },
  { label: '10px', value: '10px' },
  { label: '11px', value: '11px' },
  { label: '12px', value: '12px' },
  { label: '13px', value: '13px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
];

const SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

export default function SettingsModal() {
  const setShowSettings = useStore(s => s.setShowSettings);
  const appUser = useStore(s => s.appUser);
  const [tab, setTab] = useState<Tab>('accounts');
  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    onEscape: () => setShowSettings(false),
  });

  return (
    <div className="settings-overlay" role="presentation">
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        ref={trapRef}
      >
        <div className="settings-titlebar">
          <span>Einstellungen <span className="settings-version">v{APP_VERSION}</span></span>
          <button
            className="settings-close"
            onClick={() => setShowSettings(false)}
            aria-label="Einstellungen schließen"
          >
            ✕
          </button>
        </div>
        <div className="settings-tabs">
          <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Postfächer</button>
          {appUser?.role === 'admin' && (
            <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Benutzer</button>
          )}
          <button className={tab === 'signatures' ? 'active' : ''} onClick={() => setTab('signatures')}>Signaturen</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>Darstellung</button>
          <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>Hinweise</button>
          <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>Info</button>
        </div>
        <div className="settings-content">
          {tab === 'accounts' && <AccountsTab />}
          {tab === 'users' && appUser?.role === 'admin' && <UsersTab />}
          {tab === 'signatures' && <SignaturesTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'alerts' && <AlertsTab />}
          {tab === 'info' && <InfoTab />}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const {
    composeFont, theme, previewPosition, density, threadingEnabled,
    loadRemoteImages, confirmDelete, showTabUnread
  } = useStore(useShallow(s => ({
    composeFont: s.composeFont,
    theme: s.theme,
    previewPosition: s.previewPosition,
    density: s.density,
    threadingEnabled: s.threadingEnabled,
    loadRemoteImages: s.loadRemoteImages,
    confirmDelete: s.confirmDelete,
    showTabUnread: s.showTabUnread,
  })));
  const setComposeFont = useStore(s => s.setComposeFont);
  const setTheme = useStore(s => s.setTheme);
  const setPreviewPosition = useStore(s => s.setPreviewPosition);
  const setDensity = useStore(s => s.setDensity);
  const setThreadingEnabled = useStore(s => s.setThreadingEnabled);
  const setLoadRemoteImages = useStore(s => s.setLoadRemoteImages);
  const setConfirmDelete = useStore(s => s.setConfirmDelete);
  const setShowTabUnread = useStore(s => s.setShowTabUnread);

  return (
    <div className="settings-section">
      <div className="appearance-group">
        <h3 className="appearance-title">Erscheinungsbild</h3>
        <div className="appearance-row">
          <label>Theme</label>
          <select value={theme} onChange={e => setTheme(e.target.value as any)} className="appearance-select">
            <option value="system">System</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </div>
        <div className="appearance-row">
          <label>Vorschaufenster</label>
          <select value={previewPosition} onChange={e => setPreviewPosition(e.target.value as any)} className="appearance-select">
            <option value="right">Rechts</option>
            <option value="bottom">Unten</option>
          </select>
        </div>
        <div className="appearance-row">
          <label>Listendichte</label>
          <select value={density} onChange={e => setDensity(e.target.value as any)} className="appearance-select">
            <option value="comfortable">Komfortabel</option>
            <option value="compact">Kompakt</option>
          </select>
        </div>
        <div className="appearance-row">
          <label>Konversationen</label>
          <select
            value={threadingEnabled ? 'on' : 'off'}
            onChange={e => setThreadingEnabled(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">Gruppieren</option>
            <option value="off">Einzelne Mails</option>
          </select>
        </div>
        <p className="appearance-hint">
          Antworten zum selben Thema werden in einer Zeile gebündelt. Mails desselben Absenders mit anderem Betreff bleiben getrennt.
        </p>
        <div className="appearance-row">
          <label>Externe Bilder</label>
          <select
            value={loadRemoteImages ? 'on' : 'off'}
            onChange={e => setLoadRemoteImages(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">Laden</option>
            <option value="off">Blockieren</option>
          </select>
        </div>
        <p className="appearance-hint">
          Bilder in HTML-Mails. Beim Blockieren kannst du sie pro Mail oder Absender nachladen.
        </p>
      </div>

      <div className="appearance-group">
        <h3 className="appearance-title">Verhalten</h3>
        <div className="appearance-row">
          <label>Löschen bestätigen</label>
          <select
            value={confirmDelete ? 'on' : 'off'}
            onChange={e => setConfirmDelete(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">Nachfragen</option>
            <option value="off">Sofort</option>
          </select>
        </div>
        <div className="appearance-row">
          <label>Ungelesen im Titel</label>
          <select
            value={showTabUnread ? 'on' : 'off'}
            onChange={e => setShowTabUnread(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">An</option>
            <option value="off">Aus</option>
          </select>
        </div>
        <p className="appearance-hint">
          `(3) Pulse Mail` im Fenster- bzw. Tab-Titel.
        </p>
      </div>

      <div className="appearance-group">
        <h3 className="appearance-title">E-Mail verfassen</h3>
        <div className="appearance-row">
          <label>Schriftart</label>
          <select
            value={composeFont.family}
            onChange={e => setComposeFont({ ...composeFont, family: e.target.value })}
            className="appearance-select"
          >
            {FONT_OPTIONS.map(f => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="appearance-row">
          <label>Schriftgröße</label>
          <select
            value={composeFont.size}
            onChange={e => setComposeFont({ ...composeFont, size: Number(e.target.value) })}
            className="appearance-select"
          >
            {SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s} px</option>
            ))}
          </select>
        </div>
        <div className="appearance-preview" style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}>
          Dies ist eine Vorschau deiner gewählten Schriftart und -größe.
        </div>
      </div>
    </div>
  );
}

function AlertsTab() {
  const {
    notifySound, notifyDesktop, notifyWhenFocused, notifyVolume
  } = useStore(useShallow(s => ({
    notifySound: s.notifySound,
    notifyDesktop: s.notifyDesktop,
    notifyWhenFocused: s.notifyWhenFocused,
    notifyVolume: s.notifyVolume,
  })));
  const setNotifySound = useStore(s => s.setNotifySound);
  const setNotifyDesktop = useStore(s => s.setNotifyDesktop);
  const setNotifyWhenFocused = useStore(s => s.setNotifyWhenFocused);
  const setVolume = useStore(s => s.setNotifyVolume);
  const [notifyPermission, setNotifyPermission] = useState(getNotifyPermission);

  return (
    <div className="settings-section">
      <div className="appearance-group">
        <h3 className="appearance-title">Desktop</h3>
        <div className="appearance-row">
          <label>System-Hinweis</label>
          <select
            value={notifyDesktop ? 'on' : 'off'}
            onChange={e => setNotifyDesktop(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">An</option>
            <option value="off">Aus</option>
          </select>
        </div>
        {notifyDesktop && notifyPermission !== 'granted' && (
          <div className="appearance-row">
            <label>Berechtigung</label>
            <button
              type="button"
              className="remote-images-bar-btn"
              onClick={async () => setNotifyPermission(await requestNotifyPermission())}
            >
              Zulassen
            </button>
          </div>
        )}
        <p className="appearance-hint">
          {notifyPermission === 'granted'
            ? 'Benachrichtigungen sind erlaubt.'
            : notifyPermission === 'denied'
              ? 'Blockiert. In den Browser- oder Windows-Einstellungen für diese Seite erlauben.'
              : notifyPermission === 'unavailable'
                ? 'Diese Hülle bietet keine System-Hinweise. Ton und Tab-Zahl funktionieren trotzdem.'
                : 'Zulassen klicken — erst dann fragt Windows bzw. der Browser nach.'}
        </p>
        <div className="appearance-row">
          <label>Auch im Vordergrund</label>
          <select
            value={notifyWhenFocused ? 'on' : 'off'}
            onChange={e => setNotifyWhenFocused(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">An</option>
            <option value="off">Nur im Hintergrund</option>
          </select>
        </div>
        <p className="appearance-hint">
          Banner auch dann, wenn du gerade in Pulse Mail bist. Die Pake-App muss laufen (minimieren, nicht schließen).
        </p>
      </div>

      <div className="appearance-group">
        <h3 className="appearance-title">Ton</h3>
        <div className="appearance-row">
          <label>Ton bei neuer Mail</label>
          <select
            value={notifySound ? 'on' : 'off'}
            onChange={e => setNotifySound(e.target.value === 'on')}
            className="appearance-select"
          >
            <option value="on">An</option>
            <option value="off">Aus</option>
          </select>
        </div>
        <div className="appearance-row">
          <label>Lautstärke</label>
          <input
            type="range"
            min={0}
            max={100}
            value={notifyVolume}
            className="appearance-slider"
            onChange={e => {
              const next = Number(e.target.value);
              setVolume(next);
              setNotifyVolume(next / 100);
            }}
            disabled={!notifySound}
          />
          <span className="appearance-slider-value">{notifyVolume}%</span>
        </div>
        <div className="appearance-row">
          <label>Probe</label>
          <button
            type="button"
            className="remote-images-bar-btn"
            onClick={() => {
              setNotifyVolume(notifyVolume / 100);
              playNewMailSound();
            }}
          >
            Ton testen
          </button>
        </div>
        <p className="appearance-hint">
          Einmal in die App klicken, dann „Ton testen“. Wenn der Test geht, muss der gleiche Ton bei neuer Mail sofort kommen — nicht erst beim Öffnen der Nachricht.
        </p>
      </div>
    </div>
  );
}

function InfoTab() {
  const appUser = useStore(s => s.appUser);
  const setAppUser = useStore(s => s.setAppUser);
  const sound = getNotifySoundStatus();
  const permission = getNotifyPermission();
  const permissionLabel = {
    granted: 'erlaubt',
    denied: 'blockiert',
    default: 'noch nicht gefragt',
    unavailable: 'nicht verfügbar'
  }[permission];
  const [name, setName] = useState(appUser?.name || '');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const saveProfile = async () => {
    try {
      const next = await api.updateMe({ name, color: appUser?.color, password: password || undefined });
      setAppUser(next);
      setPassword('');
      setSaved('Gespeichert');
    } catch (err: any) {
      setSaved(err.message || 'Fehler');
    }
  };

  return (
    <div className="settings-section">
      <div className="appearance-group">
        <h3 className="appearance-title">Angemeldet als</h3>
        {appUser && (
          <div className="profile-photo">
            <UserAvatar user={appUser} className="account-avatar profile-photo-img" size={72} />
            <div className="profile-photo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-file-input"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    setAppUser(await api.uploadAvatar(file));
                    setSaved('Profilbild gespeichert');
                  } catch (err: any) {
                    setSaved(err.message || 'Bild fehlgeschlagen');
                  }
                }}
              />
              <button type="button" className="remote-images-bar-btn" onClick={() => fileRef.current?.click()}>
                Bild wählen
              </button>
              {appUser.avatarUrl && (
                <button
                  type="button"
                  className="remote-images-bar-btn subtle"
                  onClick={async () => {
                    try {
                      setAppUser(await api.removeAvatar());
                      setSaved('Profilbild entfernt');
                    } catch (err: any) {
                      setSaved(err.message);
                    }
                  }}
                >
                  Entfernen
                </button>
              )}
            </div>
          </div>
        )}
        <p className="appearance-hint">JPG, PNG, GIF oder WebP, höchstens 4 MB.</p>
        <div className="info-row"><span>Benutzer</span><strong>@{appUser?.username}</strong></div>
        <div className="info-row"><span>Rolle</span><strong>{appUser?.role === 'admin' ? 'Administrator' : 'Benutzer'}</strong></div>
        <div className="appearance-row">
          <label>Anzeigename</label>
          <input className="appearance-select" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="appearance-row">
          <label>Neues Passwort</label>
          <input className="appearance-select" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="unverändert" />
        </div>
        <div className="appearance-row">
          <label />
          <button type="button" className="remote-images-bar-btn" onClick={saveProfile}>Profil speichern</button>
        </div>
        {saved && <p className="appearance-hint">{saved}</p>}
      </div>
      <div className="appearance-group">
        <h3 className="appearance-title">Pulse Mail</h3>
        <div className="info-row"><span>Version</span><strong>{APP_VERSION}</strong></div>
        <div className="info-row"><span>Build</span><strong>{formatBuildTime()}</strong></div>
        <div className="info-row"><span>Hinweise</span><strong>{permissionLabel}</strong></div>
        <div className="info-row"><span>Tonkanal</span><strong>{sound.ready ? 'bereit' : 'wartet auf ersten Klick'}</strong></div>
        <p className="appearance-hint">
          Diese Version ist {APP_VERSION} vom {formatBuildTime()}.
        </p>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'user' });
  const [error, setError] = useState('');

  const load = async () => {
    try { setUsers(await api.getUsers()); } catch {}
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    setError('');
    try {
      await api.addUser(form);
      setForm({ name: '', username: '', password: '', role: 'user' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Anlegen fehlgeschlagen');
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Benutzer löschen? Die Postfächer bleiben in der Datenbank, sind aber keinem Login mehr zugeordnet.')) return;
    try { await api.deleteUser(id); await load(); } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="settings-section">
      <p className="appearance-hint">
        Jeder Benutzer sieht nach dem Login nur die eigenen Postfächer. Lege z. B. „Anna“ mit Mail A+B und „Ben“ mit Mail C+D an.
      </p>
      <div className="accounts-list">
        {users.map(u => (
          <div key={u.id} className="account-item">
            <UserAvatar user={u} size={28} />
            <div className="account-info">
              <span className="account-name">{u.name}</span>
              <span className="account-email">@{u.username} · {u.role === 'admin' ? 'Admin' : 'Benutzer'}</span>
            </div>
            <div className="account-actions">
              <button className="account-delete" type="button" onClick={() => remove(u.id)}>Entfernen</button>
            </div>
          </div>
        ))}
      </div>
      <div className="appearance-group">
        <h3 className="appearance-title">Neuen Benutzer</h3>
        <div className="appearance-row">
          <label>Name</label>
          <input className="appearance-select" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="appearance-row">
          <label>Benutzername</label>
          <input className="appearance-select" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="appearance-row">
          <label>Passwort</label>
          <input className="appearance-select" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="appearance-row">
          <label>Rolle</label>
          <select className="appearance-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="user">Benutzer</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        {error && <p className="appearance-hint">{error}</p>}
        <button type="button" className="remote-images-bar-btn" onClick={add}>Benutzer anlegen</button>
      </div>
    </div>
  );
}

const ACCOUNT_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#5856D6', '#FF2D55', '#00C7BE',
  '#5AC8FA', '#FFCC00'
];

function nextFreeColor(used: string[]) {
  const taken = new Set(used.map(c => (c || '').toLowerCase()));
  return ACCOUNT_COLORS.find(c => !taken.has(c.toLowerCase())) || ACCOUNT_COLORS[0];
}

function ColorSwatches({
  value,
  onChange
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-swatches">
      {ACCOUNT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          className={`color-swatch ${value?.toLowerCase() === color.toLowerCase() ? 'selected' : ''}`}
          style={{ background: color }}
          title={color}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="color-swatch custom" title="Eigene Farbe">
        <input
          type="color"
          value={value || '#007AFF'}
          onChange={e => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function emptyAccountForm(color: string) {
  return {
    name: '', email: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 587,
    username: '', password: '', color
  };
}

function AccountsTab() {
  const accounts = useStore(s => s.accounts);
  const selectedAccount = useStore(s => s.selectedAccount);
  const setAccounts = useStore(s => s.setAccounts);
  const setSelectedAccount = useStore(s => s.setSelectedAccount);
  const [mode, setMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyAccountForm('#007AFF'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function refreshAccounts() {
    const accs = await api.getAccounts();
    setAccounts(accs);
    if (selectedAccount) {
      const next = accs.find(a => a.id === selectedAccount.id);
      if (next) setSelectedAccount(next);
    }
    return accs;
  }

  function startAdd() {
    setError('');
    setEditingId(null);
    setForm(emptyAccountForm(nextFreeColor(accounts.map(a => a.color))));
    setMode('add');
  }

  function startEdit(acc: typeof accounts[number]) {
    setError('');
    setEditingId(acc.id);
    setForm({
      name: acc.name || '',
      email: acc.email || '',
      imap_host: acc.imap_host || '',
      imap_port: acc.imap_port || 993,
      smtp_host: acc.smtp_host || '',
      smtp_port: acc.smtp_port || 587,
      username: acc.username || '',
      password: '',
      color: acc.color || '#007AFF'
    });
    setMode('edit');
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      if (mode === 'edit' && editingId) {
        const payload: any = { ...form };
        if (!payload.password) delete payload.password;
        await api.updateAccount(editingId, payload);
      } else {
        await api.addAccount(form);
      }
      const accs = await refreshAccounts();
      if (mode === 'add' && accs.length === 1) setSelectedAccount(accs[0]);
      setMode('idle');
      setEditingId(null);
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('Account wirklich löschen?')) return;
    await api.deleteAccount(id);
    const accs = await api.getAccounts();
    setAccounts(accs);
    setSelectedAccount(accs[0] || null);
    if (editingId === id) {
      setMode('idle');
      setEditingId(null);
    }
  }

  async function handleColor(id: number, color: string) {
    await api.updateAccount(id, { color });
    await refreshAccounts();
  }

  return (
    <div className="settings-section">
      <div className="accounts-list">
        {accounts.map(acc => (
          <div key={acc.id} className={`account-item ${editingId === acc.id ? 'editing' : ''}`}>
            <div className="account-info">
              <span className="account-name">{acc.name}</span>
              <span className="account-email">{acc.email}</span>
              <ColorSwatches value={acc.color} onChange={color => handleColor(acc.id, color)} />
            </div>
            <div className="account-actions">
              <button className="account-edit" onClick={() => startEdit(acc)}>Bearbeiten</button>
              <button className="account-delete" onClick={() => handleDelete(acc.id)}>Entfernen</button>
            </div>
          </div>
        ))}
      </div>

      {mode === 'idle' ? (
        <button className="add-btn" onClick={startAdd}>+ Account hinzufügen</button>
      ) : (
        <div className="add-form">
          <h3 className="form-title">{mode === 'edit' ? 'Account bearbeiten' : 'Account hinzufügen'}</h3>
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="E-Mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input placeholder="IMAP Host" value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} />
          <input placeholder="IMAP Port" type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: Number(e.target.value) })} />
          <input placeholder="SMTP Host" value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} />
          <input placeholder="SMTP Port" type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: Number(e.target.value) })} />
          <input placeholder="Benutzername" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
          <input
            placeholder={mode === 'edit' ? 'Passwort (leer lassen = unverändert)' : 'Passwort'}
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
          />
          <div className="form-color">
            <span>Farbe</span>
            <ColorSwatches value={form.color} onChange={color => setForm({ ...form, color })} />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button className="cancel-btn" onClick={() => { setMode('idle'); setEditingId(null); }}>Abbrechen</button>
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Speichern...' : mode === 'edit' ? 'Speichern' : 'Verbinden'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SignaturesTab() {
  const signatures = useStore(s => s.signatures);
  const accounts = useStore(s => s.accounts);
  const setSignatures = useStore(s => s.setSignatures);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      FontFamily,
      Color,
      FontSize,
      ResizableImage,
    ],
    content: '',
  });

  function startEdit(sig?: any) {
    if (sig) {
      setEditing(sig.id);
      setName(sig.name);
      setAccountId(sig.account_id);
      setIsDefault(!!sig.is_default);
      editor?.commands.setContent(sig.content);
    } else {
      setEditing(-1);
      setName('');
      setAccountId(null);
      setIsDefault(false);
      editor?.commands.setContent('');
    }
  }

  async function handleSave() {
    const content = editor?.getHTML() || '';
    const data = { name, content, is_default: isDefault, account_id: accountId };
    if (editing === -1) {
      await api.addSignature(data);
    } else {
      await api.updateSignature(editing!, data);
    }
    const sigs = await api.getSignatures();
    setSignatures(sigs);
    setEditing(null);
  }

  async function handleDelete(id: number) {
    await api.deleteSignature(id);
    const sigs = await api.getSignatures();
    setSignatures(sigs);
  }

  async function handleImageUpload() {
    imageInputRef.current?.click();
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/signatures/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        (editor.commands as any).setImage({ src: data.url });
      }
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          (editor.commands as any).setImage({ src: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  }

  function handleSetFontSize(size: string) {
    if (!editor) return;
    if (!size) {
      (editor.commands as any).unsetFontSize();
    } else {
      (editor.commands as any).setFontSize(size);
    }
  }

  return (
    <div className="settings-section">
      {editing === null ? (
        <>
          <div className="signatures-list">
            {signatures.map(sig => (
              <div key={sig.id} className="signature-item">
                <div className="signature-info">
                  <span className="signature-name">{sig.name}</span>
                  {sig.is_default ? <span className="signature-badge">Standard</span> : null}
                </div>
                <div className="signature-actions">
                  <button onClick={() => startEdit(sig)}>Bearbeiten</button>
                  <button className="delete" onClick={() => handleDelete(sig.id)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
          <button className="add-btn" onClick={() => startEdit()}>+ Signatur hinzufügen</button>
        </>
      ) : (
        <div className="signature-editor">
          <input placeholder="Signatur-Name" value={name} onChange={e => setName(e.target.value)} className="sig-name-input" />
          <div className="sig-options">
            <label>
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              Als Standard verwenden
            </label>
            <select value={accountId || ''} onChange={e => setAccountId(Number(e.target.value) || null)}>
              <option value="">Alle Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </div>
          <div className="sig-editor-toolbar">
            <select
              className="sig-toolbar-select"
              onChange={e => {
                if (!editor) return;
                const val = e.target.value;
                if (!val) {
                  editor.chain().focus().unsetFontFamily().run();
                } else {
                  editor.chain().focus().setFontFamily(val).run();
                }
              }}
              title="Schriftart"
            >
              {SIG_FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value || 'inherit' }}>{f.label}</option>
              ))}
            </select>
            <select
              className="sig-toolbar-select sig-toolbar-select-small"
              onChange={e => handleSetFontSize(e.target.value)}
              title="Schriftgröße"
            >
              {SIG_SIZE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div className="sig-toolbar-divider" />
            <button
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={editor?.isActive('bold') ? 'active' : ''}
              title="Fett"
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={editor?.isActive('italic') ? 'active' : ''}
              title="Kursiv"
            >
              <em>I</em>
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              className={editor?.isActive('underline') ? 'active' : ''}
              title="Unterstrichen"
            >
              <u>U</u>
            </button>
            <div className="sig-toolbar-divider" />
            <button
              onClick={() => colorInputRef.current?.click()}
              title="Textfarbe"
              style={{ position: 'relative' }}
            >
              <span style={{ borderBottom: `3px solid ${editor?.getAttributes('textStyle').color || '#000'}` }}>A</span>
            </button>
            <input
              ref={colorInputRef}
              type="color"
              style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }}
              onChange={e => editor?.chain().focus().setColor(e.target.value).run()}
            />
            <div className="sig-toolbar-divider" />
            <button
              onClick={() => {
                const url = window.prompt('Link URL:');
                if (url) editor?.chain().focus().setLink({ href: url }).run();
              }}
              className={editor?.isActive('link') ? 'active' : ''}
              title="Link einfügen"
            >
              🔗
            </button>
            <button onClick={handleImageUpload} title="Bild einfügen">
              🖼️
            </button>
          </div>
          <div className="sig-editor-wrap">
            <EditorContent editor={editor} />
          </div>
          <div className="form-actions">
            <button className="cancel-btn" onClick={() => setEditing(null)}>Abbrechen</button>
            <button className="save-btn" onClick={handleSave}>Speichern</button>
          </div>
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
        </div>
      )}
    </div>
  );
}

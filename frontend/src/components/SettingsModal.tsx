import { useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { useFocusTrap } from '../shared/useFocusTrap';
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

type Tab = 'accounts' | 'signatures' | 'appearance';

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
          <span>Einstellungen</span>
          <button
            className="settings-close"
            onClick={() => setShowSettings(false)}
            aria-label="Einstellungen schließen"
          >
            ✕
          </button>
        </div>
        <div className="settings-tabs">
          <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Accounts</button>
          <button className={tab === 'signatures' ? 'active' : ''} onClick={() => setTab('signatures')}>Signaturen</button>
          <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}>Darstellung</button>
        </div>
        <div className="settings-content">
          {tab === 'accounts' && <AccountsTab />}
          {tab === 'signatures' && <SignaturesTab />}
          {tab === 'appearance' && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const {
    composeFont, theme, previewPosition, density, threadingEnabled
  } = useStore(useShallow(s => ({
    composeFont: s.composeFont,
    theme: s.theme,
    previewPosition: s.previewPosition,
    density: s.density,
    threadingEnabled: s.threadingEnabled,
  })));
  const setComposeFont = useStore(s => s.setComposeFont);
  const setTheme = useStore(s => s.setTheme);
  const setPreviewPosition = useStore(s => s.setPreviewPosition);
  const setDensity = useStore(s => s.setDensity);
  const setThreadingEnabled = useStore(s => s.setThreadingEnabled);

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

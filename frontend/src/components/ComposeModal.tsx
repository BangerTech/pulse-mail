import { useState, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, MailDetail, ComposeMode, Address } from '../store';
import { useFocusTrap } from '../shared/useFocusTrap';
import { api } from '../api';
import { Icon } from './Icon';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import { ResizableImage } from './ResizableImage';
import { FontSize } from '../extensions/FontSize';
import '../styles/compose.css';

const TITLES: Record<ComposeMode, string> = {
  new: 'Neue Nachricht',
  reply: 'Antworten',
  replyAll: 'Allen antworten',
  forward: 'Weiterleiten'
};

function formatAddress(addr: Address) {
  if (addr.name && addr.address) return `${addr.name} <${addr.address}>`;
  return addr.address || '';
}

function joinAddresses(list: Address[] = []) {
  return list.map(formatAddress).filter(Boolean).join(', ');
}

function quoteHeader(mail: MailDetail) {
  const date = mail.date ? new Date(mail.date).toLocaleString('de-DE') : '';
  const sender = formatAddress(mail.from) || 'Unbekannt';
  return `Am ${date} schrieb ${sender}:`;
}

function buildQuotedBody(mail: MailDetail) {
  const body = mail.html || (mail.text ? `<p>${mail.text.replace(/\n/g, '<br>')}</p>` : '');
  return `<blockquote>${body}</blockquote>`;
}

function buildForwardBody(mail: MailDetail) {
  const body = mail.html || (mail.text ? `<p>${mail.text.replace(/\n/g, '<br>')}</p>` : '');
  return `
    <p>---------- Weitergeleitete Nachricht ----------</p>
    <p>
      Von: ${formatAddress(mail.from)}<br>
      Datum: ${mail.date ? new Date(mail.date).toLocaleString('de-DE') : ''}<br>
      Betreff: ${mail.subject || ''}<br>
      An: ${joinAddresses(mail.to)}
    </p>
    ${body}
  `;
}

export default function ComposeModal() {
  const {
    selectedAccount, signatures, replyTo, composeMode, composeFont, accounts
  } = useStore(useShallow(s => ({
    selectedAccount: s.selectedAccount,
    signatures: s.signatures,
    replyTo: s.replyTo,
    composeMode: s.composeMode,
    composeFont: s.composeFont,
    accounts: s.accounts,
  })));
  const closeCompose = useStore(s => s.closeCompose);

  const fromAccount = accounts.find(a => a.id === replyTo?.accountId) || selectedAccount;

  const initial = useMemo(() => {
    const sig = signatures.find(
      s => s.is_default && (s.account_id === fromAccount?.id || !s.account_id)
    );
    const signatureHtml = sig ? `<div class="signature">${sig.content}</div>` : '';

    if (!replyTo || composeMode === 'new') {
      return {
        to: '',
        cc: '',
        subject: '',
        body: `<p></p>${signatureHtml}`,
        signatureId: sig?.id ?? null
      };
    }

    const replyTarget = replyTo.replyTo?.length ? replyTo.replyTo : [replyTo.from];

    if (composeMode === 'forward') {
      return {
        to: '',
        cc: '',
        subject: replyTo.subject?.startsWith('Fwd:') ? replyTo.subject : `Fwd: ${replyTo.subject || ''}`,
        body: `<p></p>${signatureHtml}${buildForwardBody(replyTo)}`,
        signatureId: sig?.id ?? null
      };
    }

    const ccList = composeMode === 'replyAll'
      ? [...(replyTo.to || []), ...(replyTo.cc || [])].filter(
          a => a.address && a.address.toLowerCase() !== fromAccount?.email.toLowerCase()
        )
      : [];

    return {
      to: joinAddresses(replyTarget),
      cc: joinAddresses(ccList),
      subject: replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`,
      body: `<p></p>${signatureHtml}<p>${quoteHeader(replyTo)}</p>${buildQuotedBody(replyTo)}`,
      signatureId: sig?.id ?? null
    };
  }, [replyTo, composeMode, signatures, fromAccount]);

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initial.subject);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(!!initial.cc);
  const [selectedSignature, setSelectedSignature] = useState<number | null>(initial.signatureId);
  const [attachments, setAttachments] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      FontFamily,
      Color,
      FontSize,
      ResizableImage
    ],
    content: initial.body,
    editorProps: {
      attributes: { class: 'compose-editor-content' }
    }
  });

  function buildFormData() {
    const formData = new FormData();
    formData.append('to', to);
    if (cc) formData.append('cc', cc);
    if (bcc) formData.append('bcc', bcc);
    formData.append('subject', subject);
    formData.append('html', editor?.getHTML() || '');

    if (replyTo && composeMode !== 'forward' && composeMode !== 'new') {
      if (replyTo.messageId) formData.append('inReplyTo', replyTo.messageId);
      const references = [...(replyTo.references || [])];
      if (replyTo.messageId) references.push(replyTo.messageId);
      if (references.length) formData.append('references', references.join(' '));
    }

    attachments.forEach(file => formData.append('attachments', file));
    return formData;
  }

  async function handleSend() {
    if (!fromAccount || !to.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.sendMail(fromAccount.id, buildFormData());
      closeCompose();
    } catch (err: any) {
      setError(err.message || 'Senden fehlgeschlagen');
    }
    setSending(false);
  }

  async function handleClose() {
    const html = editor?.getHTML() || '';
    const withoutSig = html.replace(/<div class="signature">[\s\S]*?<\/div>/g, '');
    const text = withoutSig.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const hasContent = !!(to.trim() || cc.trim() || subject.trim() || text.length > 8);

    if (fromAccount && hasContent && !sending && !savingDraft) {
      try {
        await api.saveDraft(fromAccount.id, buildFormData());
      } catch {}
    }

    closeCompose();
  }

  async function handleSaveDraft() {
    if (!fromAccount) return;
    setSavingDraft(true);
    setError('');
    try {
      await api.saveDraft(fromAccount.id, buildFormData());
      closeCompose();
    } catch (err: any) {
      setError(err.message || 'Entwurf konnte nicht gespeichert werden');
    }
    setSavingDraft(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/signatures/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) (editor.commands as any).setImage({ src: data.url });
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

  function applySignature(id: number | null) {
    setSelectedSignature(id);
    if (!editor) return;

    const html = editor.getHTML();
    const withoutOld = html.replace(/<div class="signature">[\s\S]*?<\/div>/, '');
    const sig = signatures.find(s => s.id === id);

    editor.commands.setContent(
      sig ? `${withoutOld}<div class="signature">${sig.content}</div>` : withoutOld
    );
  }

  const trapRef = useFocusTrap<HTMLDivElement>({
    active: true,
    initialFocusSelector: 'input[type="text"], input:not([type]), textarea',
    onEscape: handleClose,
  });

  return (
    <div className="compose-overlay" onMouseDown={handleClose} role="presentation">
      <div
        className="compose-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[composeMode]}
        ref={trapRef}
      >
        <div className="compose-titlebar">
          <span>{TITLES[composeMode]}</span>
          <button className="compose-close" onClick={handleClose} title="Schließen" aria-label="Schließen">
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="compose-fields">
          <div className="compose-field">
            <label>Von:</label>
            <span className="compose-from">{fromAccount?.email}</span>
          </div>
          <div className="compose-field">
            <label>An:</label>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="empfaenger@beispiel.de"
              autoFocus
            />
            {!showCcBcc && (
              <button className="cc-toggle" onClick={() => setShowCcBcc(true)}>CC/BCC</button>
            )}
          </div>
          {showCcBcc && (
            <>
              <div className="compose-field">
                <label>CC:</label>
                <input value={cc} onChange={e => setCc(e.target.value)} />
              </div>
              <div className="compose-field">
                <label>BCC:</label>
                <input value={bcc} onChange={e => setBcc(e.target.value)} />
              </div>
            </>
          )}
          <div className="compose-field">
            <label>Betreff:</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
        </div>

        <div className="compose-toolbar">
          <select
            className="compose-select"
            onChange={e => {
              const value = e.target.value;
              if (!editor) return;
              if (value) editor.chain().focus().setFontFamily(value).run();
              else editor.chain().focus().unsetFontFamily().run();
            }}
            title="Schriftart"
          >
            <option value="">Schrift</option>
            <option value='-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'>SF Pro</option>
            <option value='"Helvetica Neue", Helvetica, Arial, sans-serif'>Helvetica Neue</option>
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value='Georgia, "Times New Roman", serif'>Georgia</option>
            <option value='"Times New Roman", Times, serif'>Times New Roman</option>
            <option value="Verdana, Geneva, sans-serif">Verdana</option>
            <option value='"Courier New", Courier, monospace'>Courier New</option>
          </select>

          <select
            className="compose-select small"
            onChange={e => {
              if (!editor) return;
              const value = e.target.value;
              if (value) (editor.commands as any).setFontSize(value);
              else (editor.commands as any).unsetFontSize();
            }}
            title="Schriftgröße"
          >
            <option value="">Größe</option>
            {[10, 11, 12, 13, 14, 16, 18, 20, 24].map(s => (
              <option key={s} value={`${s}px`}>{s}</option>
            ))}
          </select>

          <span className="toolbar-divider" />

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
          <button
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={editor?.isActive('bulletList') ? 'active' : ''}
            title="Liste"
          >
            •
          </button>
          <button
            onClick={() => {
              const url = window.prompt('Link URL:');
              if (url) editor?.chain().focus().setLink({ href: url }).run();
            }}
            className={editor?.isActive('link') ? 'active' : ''}
            title="Link"
          >
            <Icon name="command" size={15} />
          </button>

          <span className="toolbar-divider" />

          <button onClick={() => fileInputRef.current?.click()} title="Anhang hinzufügen">
            <Icon name="attachment" size={15} />
          </button>
          <button onClick={() => imageInputRef.current?.click()} title="Bild einfügen">
            <Icon name="envelope" size={15} />
          </button>

          <span className="toolbar-spacer" />

          <select
            className="compose-select"
            value={selectedSignature ?? ''}
            onChange={e => applySignature(Number(e.target.value) || null)}
            title="Signatur"
          >
            <option value="">Keine Signatur</option>
            {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div
          className="compose-editor"
          style={{ fontFamily: composeFont.family, fontSize: composeFont.size }}
        >
          <EditorContent editor={editor} />
        </div>

        {attachments.length > 0 && (
          <div className="compose-attachments">
            {attachments.map((file, i) => (
              <span key={`${file.name}-${i}`} className="compose-att-chip">
                <Icon name="attachment" size={12} />
                {file.name}
                <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}>
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <div className="compose-error">{error}</div>}

        <div className="compose-footer">
          <button className="draft-btn" onClick={handleSaveDraft} disabled={savingDraft}>
            {savingDraft ? 'Speichern...' : 'Als Entwurf speichern'}
          </button>
          <button className="send-btn" onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? 'Senden...' : 'Senden'}
          </button>
        </div>

        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
      </div>
    </div>
  );
}

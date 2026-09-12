// Windows toast + sound + taskbar flash. The desktop WebView only
// receives this while it is still running (minimized is fine, closed is not).
// Permission is requested only from an explicit button click.

import { flashTaskbarAttention } from './appBadge';
import { scheduleNewMailSound, unlockNotifySound } from './notifySound';

export type MailPreview = {
  subject?: string;
  fromName?: string;
  fromAddress?: string;
  count?: number;
};

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unavailable';

let lastAt = 0;

function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const invoke = (window as Window & {
    __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
  }).__TAURI__?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

export function getNotifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unavailable';
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  unlockNotifySound();

  const invoke = tauriInvoke();
  if (invoke) {
    try {
      const granted = await invoke('plugin:notification|is_permission_granted');
      if (granted === true) return 'granted';
    } catch {}
    try {
      const result = await invoke('plugin:notification|request_permission');
      if (result === 'granted' || result === true) return 'granted';
      if (result === 'denied' || result === false) return 'denied';
    } catch {}
  }

  if (typeof Notification === 'undefined') return 'unavailable';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted' || result === 'denied') return result;
    return Notification.permission;
  } catch {
    return Notification.permission;
  }
}

async function showTauriToast(title: string, body: string): Promise<boolean> {
  const invoke = tauriInvoke();
  if (!invoke) return false;
  try {
    await invoke('plugin:notification|notify', { title, body });
    return true;
  } catch {
    return false;
  }
}

function showBrowserToast(title: string, body: string, silent = false): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }
  try {
    const n = new Notification(title, {
      body,
      icon: `${window.location.origin}/favicon-32.png`,
      tag: 'pulse-mail-inbox',
      renotify: true,
      silent
    });
    n.onclick = () => {
      try { window.focus(); } catch {}
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function toastCopy(preview?: MailPreview) {
  const count = Math.max(1, preview?.count || 1);
  const from = (preview?.fromName || preview?.fromAddress || '').trim() || 'Pulse Mail';
  const subject = (preview?.subject || '').trim()
    || (count > 1 ? `${count} neue Nachrichten` : 'Neue Nachricht im Posteingang');
  return {
    title: count > 1 ? `Pulse Mail (${count})` : from,
    body: count > 1 ? `${count} neue Nachrichten` : subject
  };
}

export function announceNewMail(opts: {
  preview?: MailPreview;
  playSound?: boolean;
  desktop?: boolean;
  whenFocused?: boolean;
} = {}) {
  const now = Date.now();
  if (now - lastAt < 2500) return;
  lastAt = now;

  flashTaskbarAttention();

  const unfocused = typeof document !== 'undefined'
    && (document.hidden || !document.hasFocus());

  if (opts.desktop !== false && (unfocused || opts.whenFocused)) {
    const { title, body } = toastCopy(opts.preview);
    if (!showBrowserToast(title, body, opts.playSound === true)) {
      void showTauriToast(title, body);
    }
  }

  if (opts.playSound !== false) {
    scheduleNewMailSound(0);
  }
}

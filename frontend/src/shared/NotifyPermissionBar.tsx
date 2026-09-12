import { useEffect, useState } from 'react';
import {
  getNotifyPermission,
  isDesktopShell,
  requestNotifyPermission,
  resolveNotifyPermission,
  type NotifyPermission
} from './notifyMail';

const DISMISS_KEY = 'pulse:notifyPromptDismissed';

interface Props {
  enabled: boolean;
}

function wasDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

function rememberDismissed() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
}

export function NotifyPermissionBar({ enabled }: Props) {
  const [permission, setPermission] = useState<NotifyPermission>(getNotifyPermission);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void resolveNotifyPermission().then(setPermission);
  }, [enabled]);

  const hide = !enabled
    || dismissed
    || isDesktopShell()
    || permission === 'granted'
    || permission === 'unavailable';

  if (hide) return null;

  const allow = async () => {
    setBusy(true);
    const next = await requestNotifyPermission();
    setPermission(next);
    setBusy(false);
    if (next !== 'granted') {
      rememberDismissed();
      setDismissed(true);
    }
  };

  const dismiss = () => {
    rememberDismissed();
    setDismissed(true);
  };

  return (
    <div className="notify-permission-bar" role="status">
      <span className="notify-permission-bar-text">
        {permission === 'denied'
          ? 'Benachrichtigungen sind blockiert. In den Browser- oder Windows-Einstellungen für diese Seite erlauben.'
          : 'Damit neue Mails im Hintergrund einen Hinweis zeigen, Benachrichtigungen zulassen. Ton und Ungelesen-Zahl laufen auch so.'}
      </span>
      <div className="notify-permission-bar-actions">
        {permission !== 'denied' && (
          <button type="button" className="remote-images-bar-btn" onClick={allow} disabled={busy}>
            Zulassen
          </button>
        )}
        <button type="button" className="remote-images-bar-btn subtle" onClick={dismiss}>
          Nicht mehr anzeigen
        </button>
      </div>
    </div>
  );
}

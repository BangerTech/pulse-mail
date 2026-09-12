import { useEffect, useState } from 'react';
import { getNotifyPermission, requestNotifyPermission, type NotifyPermission } from './notifyMail';

const DISMISS_KEY = 'pulse:notifyPromptDismissed';

interface Props {
  enabled: boolean;
}

export function NotifyPermissionBar({ enabled }: Props) {
  const [permission, setPermission] = useState<NotifyPermission>(getNotifyPermission);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getNotifyPermission());
  }, [enabled]);

  if (!enabled || dismissed || permission === 'granted') return null;

  const unavailable = permission === 'unavailable';

  const allow = async () => {
    setBusy(true);
    const next = await requestNotifyPermission();
    setPermission(next);
    setBusy(false);
  };

  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div className="notify-permission-bar" role="status">
      <span className="notify-permission-bar-text">
        {unavailable
          ? 'Diese Hülle kann keine System-Benachrichtigungen anzeigen. Ton und Tab-Zahl funktionieren trotzdem.'
          : permission === 'denied'
            ? 'Benachrichtigungen sind blockiert. In den Browser- oder Windows-Einstellungen für diese Seite erlauben.'
            : 'Damit neue Mails im Hintergrund einen Hinweis und eine Zahl in der Taskleiste zeigen, Benachrichtigungen zulassen.'}
      </span>
      <div className="notify-permission-bar-actions">
        {!unavailable && permission !== 'denied' && (
          <button type="button" className="remote-images-bar-btn" onClick={allow} disabled={busy}>
            Zulassen
          </button>
        )}
        <button type="button" className="remote-images-bar-btn subtle" onClick={later}>
          Später
        </button>
      </div>
    </div>
  );
}

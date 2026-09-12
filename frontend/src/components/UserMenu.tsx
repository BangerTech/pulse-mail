import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api, clearToken } from '../api';
import UserAvatar from './UserAvatar';

export default function UserMenu() {
  const appUser = useStore(s => s.appUser);
  const setAppUser = useStore(s => s.setAppUser);
  const setShowSettings = useStore(s => s.setShowSettings);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!appUser) return null;

  const logout = async () => {
    try { await api.logout(); } catch {}
    clearToken();
    setAppUser(null);
    setOpen(false);
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-button"
        onClick={() => setOpen(v => !v)}
        title={appUser.name}
        aria-label={`${appUser.name}, Benutzermenü`}
        aria-expanded={open}
      >
        <UserAvatar user={appUser} />
      </button>
      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-who">
            <UserAvatar user={appUser} size={36} />
            <div>
              <strong>{appUser.name}</strong>
              <span>@{appUser.username}{appUser.role === 'admin' ? ' · Admin' : ''}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={() => { setShowSettings(true); setOpen(false); }}>
            Einstellungen
          </button>
          <button type="button" role="menuitem" onClick={logout}>
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

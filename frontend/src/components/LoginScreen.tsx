import { useEffect, useState } from 'react';
import { api, setToken } from '../api';
import { useStore } from '../store';
import '../styles/login.css';

export default function LoginScreen({ mode }: { mode: 'setup' | 'login' }) {
  const setAppUser = useStore(s => s.setAppUser);
  const [formMode, setFormMode] = useState(mode);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFormMode(mode); }, [mode]);
  useEffect(() => {
    api.authStatus()
      .then(s => setFormMode(s.needsSetup ? 'setup' : 'login'))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = formMode === 'setup'
        ? await api.setup({ name, username, password })
        : await api.login({ username, password });
      setToken(data.token);
      setAppUser(data.user);
    } catch (err: any) {
      setError(err.message || 'Anmeldung fehlgeschlagen');
    }
    setBusy(false);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="" className="login-logo" />
        <h1>Pulse Mail</h1>
        <p className="login-lead">
          {formMode === 'setup'
            ? 'Ersten Benutzer anlegen. Die bisherigen Postfächer gehören danach diesem Benutzer.'
            : 'Mit deinem Pulse-Mail-Benutzer anmelden.'}
        </p>
        {formMode === 'setup' && (
          <label>
            Anzeigename
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label>
          Benutzername
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={formMode === 'setup' ? 'new-password' : 'current-password'} required minLength={4} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Bitte warten…' : formMode === 'setup' ? 'Benutzer anlegen' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

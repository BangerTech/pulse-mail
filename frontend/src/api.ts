const BASE = '/api';
const TOKEN_KEY = 'pulse:session';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...((options?.headers as Record<string, string>) || {})
  };
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearToken();
    window.dispatchEvent(new Event('pulse:logout'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export interface SearchFilters {
  accountId?: number;
  folder?: string;
  from?: string;
  hasAttachments?: boolean;
  since?: string;
  before?: string;
}

export const api = {
  authStatus: () => request('/auth/status'),
  setup: (data: { name: string; username: string; password: string; color?: string }) =>
    request('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
  updateMe: (data: { name?: string; color?: string; password?: string }) =>
    request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append('image', file);
    return fetch(`${BASE}/auth/me/avatar`, { method: 'POST', body, headers: authHeaders() }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Bild konnte nicht gespeichert werden');
      return data;
    });
  },
  removeAvatar: () => request('/auth/me/avatar', { method: 'DELETE' }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getUsers: () => request('/users'),
  addUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: number) => request(`/users/${id}`, { method: 'DELETE' }),

  getAccounts: () => request('/accounts'),
  addAccount: (data: any) => request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: any) =>
    request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) => request(`/accounts/${id}`, { method: 'DELETE' }),
  getFolders: (accountId: number) => request(`/accounts/${accountId}/folders`),

  getMessages: (accountId: number, folder: string, limit = 50, offset = 0) =>
    request(`/mail/${accountId}/messages?folder=${encodeURIComponent(folder)}&limit=${limit}&offset=${offset}`),
  getUnifiedInbox: (limit = 50, offset = 0) =>
    request(`/mail/unified/inbox?limit=${limit}&offset=${offset}`),
  getUnifiedUnread: () => request('/mail/unified/unread'),
  getMessage: (accountId: number, uid: number, folder: string) =>
    request(`/mail/${accountId}/message/${uid}?folder=${encodeURIComponent(folder)}`),
  getUnreadCounts: (accountId: number) => request(`/mail/${accountId}/unread-counts`),

  sendMail: (accountId: number, formData: FormData) =>
    fetch(`${BASE}/mail/${accountId}/send`, { method: 'POST', body: formData, headers: authHeaders() }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Senden fehlgeschlagen');
      return data;
    }),
  saveDraft: (accountId: number, formData: FormData) =>
    fetch(`${BASE}/mail/${accountId}/draft`, { method: 'POST', body: formData, headers: authHeaders() }).then(r => r.json()),

  moveMail: (accountId: number, uids: number[], from: string, to: string) =>
    request(`/mail/${accountId}/move`, { method: 'POST', body: JSON.stringify({ uids, from, to }) }),
  archiveMail: (accountId: number, uids: number[], folder: string) =>
    request(`/mail/${accountId}/archive`, { method: 'POST', body: JSON.stringify({ uids, folder }) }),
  deleteMail: (accountId: number, uids: number[], folder: string) =>
    request(`/mail/${accountId}/delete`, { method: 'POST', body: JSON.stringify({ uids, folder }) }),
  setFlags: (accountId: number, uids: number[], folder: string, flags: string[], action: 'add' | 'remove') =>
    request(`/mail/${accountId}/flags`, { method: 'POST', body: JSON.stringify({ uids, folder, flags, action }) }),

  search: (q: string, filters: SearchFilters = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filters.accountId) params.set('accountId', String(filters.accountId));
    if (filters.folder) params.set('folder', filters.folder);
    if (filters.from) params.set('from', filters.from);
    if (filters.hasAttachments) params.set('hasAttachments', 'true');
    if (filters.since) params.set('since', filters.since);
    if (filters.before) params.set('before', filters.before);
    return request(`/mail/search?${params.toString()}`);
  },

  getSignatures: () => request('/signatures'),
  addSignature: (data: any) => request('/signatures', { method: 'POST', body: JSON.stringify(data) }),
  updateSignature: (id: number, data: any) => request(`/signatures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSignature: (id: number) => request(`/signatures/${id}`, { method: 'DELETE' }),
};

const BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
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
    fetch(`${BASE}/mail/${accountId}/send`, { method: 'POST', body: formData }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Senden fehlgeschlagen');
      return data;
    }),
  saveDraft: (accountId: number, formData: FormData) =>
    fetch(`${BASE}/mail/${accountId}/draft`, { method: 'POST', body: formData }).then(r => r.json()),

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

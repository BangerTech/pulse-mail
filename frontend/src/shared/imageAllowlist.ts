// Persistent allowlist of sender addresses/domains whose external images
// may load automatically. Stored under a shared key so both the production
// and the prototype reader see the same set.

const STORAGE_KEY = 'pulse:imageAllowlist:v1';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String).map((s) => s.toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

function save(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

function normalize(addressOrDomain: string): { address?: string; domain?: string } {
  const s = (addressOrDomain || '').trim().toLowerCase();
  if (!s) return {};
  const at = s.indexOf('@');
  if (at >= 0) {
    const domain = s.slice(at + 1);
    return { address: s, domain };
  }
  return { domain: s };
}

// A sender is allowed if the exact address or its domain (or any parent
// domain we've allowed) is on the list.
export function isSenderAllowed(address?: string): boolean {
  if (!address) return false;
  const set = load();
  const { address: addr, domain } = normalize(address);
  if (addr && set.has(addr)) return true;
  if (!domain) return false;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

export function allowSender(addressOrDomain: string): void {
  const { address, domain } = normalize(addressOrDomain);
  if (!address && !domain) return;
  const set = load();
  set.add(address ?? domain!);
  save(set);
  window.dispatchEvent(new CustomEvent('pulse:allowlist-changed'));
}

export function revokeSender(addressOrDomain: string): void {
  const s = (addressOrDomain || '').trim().toLowerCase();
  if (!s) return;
  const set = load();
  set.delete(s);
  save(set);
  window.dispatchEvent(new CustomEvent('pulse:allowlist-changed'));
}

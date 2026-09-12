const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'mac.com',
  'gmx.de', 'gmx.net', 'gmx.at', 'web.de', 't-online.de', 'freenet.de',
  'proton.me', 'protonmail.com', 'mailbox.org', 'posteo.de', 'aol.com'
]);

const failed = new Set<string>();

export function emailDomain(address?: string) {
  const host = String(address || '').split('@')[1]?.trim().toLowerCase();
  return host || '';
}

export function iconCandidatesForEmail(address?: string): string[] {
  const domain = emailDomain(address);
  if (!domain || PERSONAL_DOMAINS.has(domain) || failed.has(domain)) return [];

  const parts = domain.split('.').filter(Boolean);
  const hosts = [domain];
  if (parts.length > 2) hosts.push(parts.slice(-2).join('.'));

  const urls: string[] = [];
  for (const host of hosts) {
    if (PERSONAL_DOMAINS.has(host) || failed.has(host)) continue;
    urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`);
  }
  return urls;
}

export function rememberFailedIcon(src: string) {
  try {
    const host = new URL(src).searchParams.get('domain')
      || new URL(src).pathname.split('/').pop()?.replace(/\.ico$/, '');
    if (host) failed.add(host.toLowerCase());
  } catch {}
}

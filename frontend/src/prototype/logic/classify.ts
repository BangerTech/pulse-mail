import type { RawMessage } from '../data/types';

export type Lane = 'human' | 'feed' | 'transactional' | 'notification';

export type Category =
  | 'human'
  | 'newsletter'
  | 'marketing'
  | 'transactional'
  | 'receipt'
  | 'parcel'
  | 'calendar'
  | 'otp'
  | 'suspicious';

export interface Trust {
  spf: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'unknown';
  dkim: 'pass' | 'fail' | 'neutral' | 'none' | 'unknown';
  dmarc: 'pass' | 'fail' | 'neutral' | 'none' | 'unknown';
  dkimDomain?: string;
  aligned: boolean;
  overall: 'good' | 'warn' | 'bad';
  reasons: string[];
}

export interface Classification {
  lane: Lane;
  category: Category;
  isBulk: boolean;
  isAutomated: boolean;
  hasOneClickUnsub: boolean;
  listId?: string;
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
  trust: Trust;
  spoofing: {
    lookalikeDomain: boolean;
    displayNameSpoof: boolean;
    reasons: string[];
  };
}

const KNOWN_BRANDS: { name: string; domain: string }[] = [
  { name: 'paypal', domain: 'paypal.de' },
  { name: 'paypal', domain: 'paypal.com' },
  { name: 'amazon', domain: 'amazon.de' },
  { name: 'amazon', domain: 'amazon.com' },
  { name: 'apple', domain: 'apple.com' },
  { name: 'dhl', domain: 'dhl.de' },
  { name: 'netflix', domain: 'netflix.com' },
  { name: 'spotify', domain: 'spotify.com' },
  { name: 'github', domain: 'github.com' },
  { name: 'microsoft', domain: 'microsoft.com' }
];

export function domainOf(address?: string): string {
  if (!address) return '';
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

export function rootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  // Simple two-level heuristic: co.uk / com.au etc. get one extra
  if (['co', 'com', 'net', 'org', 'gov'].includes(sld) && tld.length === 2) {
    return parts.slice(-3).join('.');
  }
  return `${sld}.${tld}`;
}

function parseAuthResults(header?: string): Pick<Trust, 'spf' | 'dkim' | 'dmarc' | 'dkimDomain'> {
  if (!header) return { spf: 'unknown', dkim: 'unknown', dmarc: 'unknown' };
  const lc = header.toLowerCase();
  const spfMatch = lc.match(/spf=(pass|fail|softfail|neutral|none)/);
  const dkimMatch = lc.match(/dkim=(pass|fail|neutral|none)/);
  const dmarcMatch = lc.match(/dmarc=(pass|fail|neutral|none)/);
  const dkimDomainMatch = lc.match(/header\.d=([\w.-]+)/);
  return {
    spf: (spfMatch?.[1] as Trust['spf']) ?? 'unknown',
    dkim: (dkimMatch?.[1] as Trust['dkim']) ?? 'unknown',
    dmarc: (dmarcMatch?.[1] as Trust['dmarc']) ?? 'unknown',
    dkimDomain: dkimDomainMatch?.[1]
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function detectLookalike(fromDomain: string, displayName: string): { hit: boolean; brand?: string; reason?: string } {
  const dRoot = rootDomain(fromDomain);
  for (const brand of KNOWN_BRANDS) {
    if (dRoot === brand.domain) return { hit: false };
    // Substring or edit-distance close to a known brand-root but not equal
    const dist = levenshtein(dRoot, brand.domain);
    const dnLower = displayName.toLowerCase();
    const claimsBrand = dnLower.includes(brand.name);
    if (claimsBrand && dist > 0 && dist <= 3) {
      return { hit: true, brand: brand.name, reason: `Absender behauptet "${brand.name}", Domain ist ${dRoot}` };
    }
    // Number/letter tricks (0/o, 1/l, rn/m)
    if (claimsBrand && /[0-9]/.test(dRoot.replace(/\.[a-z]+$/, '')) && !/[0-9]/.test(brand.domain)) {
      return { hit: true, brand: brand.name, reason: `Ziffern in Domain ${dRoot}` };
    }
  }
  return { hit: false };
}

function parseUnsubscribeHeader(header?: string): { url?: string; mailto?: string } {
  if (!header) return {};
  const urls = [...header.matchAll(/<([^>]+)>/g)].map(m => m[1]);
  return {
    url: urls.find(u => u.startsWith('http')),
    mailto: urls.find(u => u.startsWith('mailto:'))?.replace(/^mailto:/, '')
  };
}

export function classify(msg: RawMessage): Classification {
  const h = msg.headers;
  const listId = h['List-Id'] || h['list-id'];
  const listUnsub = h['List-Unsubscribe'] || h['list-unsubscribe'];
  const listUnsubPost = h['List-Unsubscribe-Post'] || h['list-unsubscribe-post'];
  const precedence = (h['Precedence'] || h['precedence'] || '').toLowerCase();
  const autoSubmitted = (h['Auto-Submitted'] || h['auto-submitted'] || '').toLowerCase();
  const feedbackId = (h['Feedback-ID'] || h['feedback-id'] || '').toLowerCase();

  const { url: unsubUrl, mailto: unsubMailto } = parseUnsubscribeHeader(listUnsub);

  const fromDomain = domainOf(msg.from.address);
  const auth = parseAuthResults(h['Authentication-Results']);
  const aligned = !!auth.dkimDomain && rootDomain(auth.dkimDomain) === rootDomain(fromDomain);

  const reasons: string[] = [];
  let overall: Trust['overall'] = 'good';
  if (auth.dmarc === 'fail' || auth.dkim === 'fail' || auth.spf === 'fail') {
    overall = 'bad';
    if (auth.dmarc === 'fail') reasons.push('DMARC fehlgeschlagen');
    if (auth.dkim === 'fail') reasons.push('DKIM-Signatur fehlgeschlagen');
    if (auth.spf === 'fail') reasons.push('SPF fehlgeschlagen');
  } else if (auth.dmarc === 'unknown' && auth.dkim === 'unknown') {
    overall = 'warn';
    reasons.push('Keine Authentifizierungs-Header');
  } else if (!aligned && auth.dkimDomain) {
    overall = 'warn';
    reasons.push(`DKIM-Domain (${rootDomain(auth.dkimDomain)}) weicht von Absender ab`);
  }

  // Spoofing / Lookalike
  const lookalike = detectLookalike(fromDomain, msg.from.name);
  const displayNameSpoof = /\b(paypal|amazon|apple|dhl|netflix|spotify|github)\b/i.test(msg.from.name) &&
    !KNOWN_BRANDS.some(b => rootDomain(fromDomain) === b.domain);

  const spoofingReasons: string[] = [];
  if (lookalike.hit && lookalike.reason) spoofingReasons.push(lookalike.reason);
  if (displayNameSpoof && !lookalike.hit) {
    spoofingReasons.push(`Anzeigename nennt bekannte Marke, Domain (${rootDomain(fromDomain)}) gehoert nicht dazu`);
  }
  if (spoofingReasons.length) overall = 'bad';

  // Automated / Bulk
  const isBulk = !!(listId || precedence === 'bulk' || listUnsub);
  const isAutomated = isBulk || autoSubmitted === 'auto-generated' || /no[-_]?reply|noreply/i.test(msg.from.address);
  const hasOneClickUnsub = !!listUnsubPost && /one-?click/i.test(listUnsubPost);

  // Category
  let category: Category = 'human';
  const subj = msg.subject.toLowerCase();

  if (spoofingReasons.length || overall === 'bad') {
    category = 'suspicious';
  } else if (
    msg.ics ||
    /\.(ics)\b/i.test((msg.attachments || []).map(a => a.filename).join(' ')) ||
    /\b(terminbestätigung|kalendereinladung|meeting invitation|ics-datei)\b/i.test(subj) ||
    (/\b(webinar|konferenz|messe|ifa)\b/i.test(subj) && /\b(einladung|invite|termin)\b/i.test(subj))
  ) {
    category = 'calendar';
  } else if (
    /\b(code|verifizier|tan|sicherheitscode|sign[- ]?in|verification|otp|einmal(passwort|code))\b/i.test(subj) ||
    /\b(dein|ihr|your)\b.*(code|tan)\b/i.test(subj)
  ) {
    category = 'otp';
  } else if (
    msg.jsonLd?.['@type'] === 'ParcelDelivery' ||
    /\b(paket|sendung|zustellung|tracking|unterwegs|versandt)\b/i.test(subj)
  ) {
    category = 'parcel';
  } else if (
    msg.jsonLd?.['@type'] === 'Order' ||
    /\b(rechnung|proforma|mahnung|zahlungserinnerung|kaufbestätigung|beleg|receipt|invoice)\b/i.test(subj)
  ) {
    category = 'receipt';
  } else if (feedbackId.includes('marketing') || /\b(sale|angebot|-\d+%|jetzt\s+kaufen|nur\s+heute)\b/i.test(subj)) {
    category = 'marketing';
  } else if (isBulk && listId) {
    category = 'newsletter';
  } else if (isAutomated) {
    category = 'transactional';
  }

  // Lane
  let lane: Lane;
  if (category === 'suspicious') lane = 'notification';
  else if (category === 'otp' || category === 'calendar') lane = 'notification';
  else if (category === 'parcel' || category === 'receipt' || category === 'transactional') lane = 'transactional';
  else if (category === 'newsletter' || category === 'marketing') lane = 'feed';
  else lane = 'human';

  return {
    lane,
    category,
    isBulk,
    isAutomated,
    hasOneClickUnsub,
    listId,
    unsubscribeUrl: unsubUrl,
    unsubscribeMailto: unsubMailto,
    trust: {
      spf: auth.spf,
      dkim: auth.dkim,
      dmarc: auth.dmarc,
      dkimDomain: auth.dkimDomain,
      aligned,
      overall,
      reasons
    },
    spoofing: {
      lookalikeDomain: lookalike.hit,
      displayNameSpoof,
      reasons: spoofingReasons
    }
  };
}

/** Hue aus Domain in [0..360). Konstante Helligkeit/Chroma erlaubt konsistente Farbdichten. */
export function domainHue(address: string): number {
  const root = rootDomain(domainOf(address));
  let hash = 5381;
  for (let i = 0; i < root.length; i++) hash = ((hash << 5) + hash + root.charCodeAt(i)) >>> 0;
  return hash % 360;
}

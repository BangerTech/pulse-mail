import type { RawMessage } from '../data/types';
import { classify, domainOf, rootDomain } from './classify';

export type EntityKind = 'parcel' | 'order' | 'subscription' | 'event' | 'otp' | 'invoice';

export interface ParcelEntity {
  kind: 'parcel';
  msgId: string;
  trackingNumber: string;
  carrier?: string;
  status: 'unknown' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered';
  expectedFrom?: string;
  expectedUntil?: string;
  itemName?: string;
  merchant?: string;
  date: string;
}

export interface OrderEntity {
  kind: 'order';
  msgId: string;
  orderNumber: string;
  merchant?: string;
  total?: { value: number; currency: string };
  items?: { name: string; price?: number }[];
  date: string;
}

export interface SubscriptionEntity {
  kind: 'subscription';
  msgId: string;
  service: string;
  amount: { value: number; currency: string };
  cycle: 'month' | 'year' | 'unknown';
  lastCharged?: string;
  date: string;
}

export interface EventEntity {
  kind: 'event';
  msgId: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  organizer?: string;
  date: string;
}

export interface OtpEntity {
  kind: 'otp';
  msgId: string;
  code: string;
  service: string;
  expiresAt?: string;
  date: string;
}

export interface InvoiceEntity {
  kind: 'invoice';
  msgId: string;
  invoiceNumber?: string;
  amount?: { value: number; currency: string };
  dueDate?: string;
  iban?: string;
  merchant: string;
  date: string;
  status: 'invoice' | 'reminder';
}

export type Entity =
  | ParcelEntity
  | OrderEntity
  | SubscriptionEntity
  | EventEntity
  | OtpEntity
  | InvoiceEntity;

export function decodeHtmlEntities(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/\uFFFD/g, '')
    .replace(/=\r?\n/g, '');
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function parseJsonLd(html?: string): any | undefined {
  if (!html) return undefined;
  const m = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return undefined;
  try { return JSON.parse(m[1]); } catch { return undefined; }
}

function corpusOf(msg: RawMessage): { text: string; jsonLd: any } {
  const jsonLd = msg.jsonLd || parseJsonLd(msg.bodyHtml);
  const parts = [
    msg.subject,
    decodeHtmlEntities(msg.bodyText || ''),
    msg.bodyHtml ? stripHtml(msg.bodyHtml) : ''
  ];
  return { text: parts.join('\n'), jsonLd };
}

// ---------- ICS parsing ----------
function parseIcs(ics: string) {
  const lines = ics.split(/\r?\n/);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf(':');
    if (eq < 0) continue;
    const key = line.slice(0, eq).split(';')[0].toUpperCase();
    const value = line.slice(eq + 1);
    if (!(key in map)) map[key] = value;
  }
  const parseDt = (s?: string) => {
    if (!s) return undefined;
    const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return undefined;
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}`;
    return new Date(iso).toISOString();
  };
  return {
    summary: map.SUMMARY,
    start: parseDt(map.DTSTART),
    end: parseDt(map.DTEND),
    location: map.LOCATION,
    organizer: map.ORGANIZER?.replace(/^.*?:mailto:/, '')
  };
}

const MONTHS_DE: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, maerz: 2, april: 3, mai: 4,
  juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11
};

function isoDate(y: number, m: number, d: number): string | undefined {
  const dt = new Date(Date.UTC(y, m, d, 9, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString();
}

function monthIndex(name: string): number | undefined {
  const n = name.toLowerCase();
  if (n in MONTHS_DE) return MONTHS_DE[n];
  const hit = Object.keys(MONTHS_DE).find(k => k.startsWith(n) || n.startsWith(k.slice(0, 4)));
  return hit ? MONTHS_DE[hit] : undefined;
}

function parseGermanEventDates(text: string): { start: string; end?: string } | undefined {
  const yearFallback = text.match(/\b(20\d{2})\b/)?.[1];
  const range = text.match(/vom\s+(\d{1,2})\.?\s*(?:bis\s+)?(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,})(?:\s*(\d{4}))?/i);
  if (range) {
    const month = monthIndex(range[3]);
    const year = parseInt(range[4] || yearFallback || '', 10);
    if (month !== undefined && year) {
      const start = isoDate(year, month, parseInt(range[1], 10));
      const end = isoDate(year, month, parseInt(range[2], 10));
      if (start) return { start, end };
    }
  }
  const named = text.match(/\b(?:am\s+)?(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]{3,})\s*(\d{4})\b/i);
  if (named) {
    const month = monthIndex(named[2]);
    if (month !== undefined) {
      const start = isoDate(parseInt(named[3], 10), month, parseInt(named[1], 10));
      if (start) return { start };
    }
  }
  const numeric = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (numeric) {
    const start = isoDate(parseInt(numeric[3], 10), parseInt(numeric[2], 10) - 1, parseInt(numeric[1], 10));
    if (start) return { start };
  }
  return undefined;
}

// ---------- Regex helpers ----------
const RX_TRACKING = /\b(?:\d{20}|H\d{13,14}|1Z[0-9A-Z]{16}|JD\d{18}|00340\d{16})\b/g;
const RX_AMOUNT = /(?:€|EUR|USD|\$)\s*(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d{1,5}[.,]\d{2})|(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d{1,5}[.,]\d{2})\s*(?:€|EUR|USD|\$)/i;
const RX_IBAN = /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30})\b/;
const RX_OTP_CODE = /\b(?:code|tan|otp|sicherheitscode|einmal(?:passwort|code))[^0-9]{0,24}(\d{4,8})\b/i;
const RX_OTP_STANDALONE = /(^|[^\d])(\d{6})(?!\d)/;
const RX_DATE_DE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/;
const RX_INVOICE_NR = /(?:Rechnungs?(?:[-\s])?(?:nummer|Nr\.?)|Invoice(?:\s*(?:Number|No\.?))?|Proforma(?:\s*nummer)?|Beleg(?:-Nr\.?)?|Ref(?:erenz)?)\s*[:#-]?\s*([A-Z]{0,6}[-\/]?\d[A-Z0-9\-\/]{2,24})\b/i;
const RX_ORDER_NR = /(?:Bestellung(?:snummer)?|Order(?:\s*(?:Number|No\.?|ID))?|Auftrag)\s*(?:nr\.?|nummer|#|:)?\s*([A-Z]{0,6}\d[\w-]{2,20})/i;
const RX_CARRIER = /\b(DHL|DPD|Hermes|GLS|UPS|FedEx|Deutsche\s+Post)\b/i;

function parseMoneyDe(s?: string): number | undefined {
  if (!s) return undefined;
  const neg = /^-/.test(s.trim());
  let raw = s.replace(/-/g, '').trim();
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) raw = raw.replace(/,/g, '');
  else if (lastComma >= 0) raw = raw.replace(',', '.');
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return undefined;
  return neg ? -n : n;
}

function currencyOf(s?: string): string {
  if (!s) return 'EUR';
  if (/\$|USD/i.test(s)) return 'USD';
  return 'EUR';
}

function findAmount(text: string): { value: number; currency: string } | undefined {
  const labeled = text.match(
    /(?:gesamt(?:betrag|saldo|summe)?|rechnungsbetrag|proforma\s*wert|zahlbetrag|offener\s+betrag|höhe von|\btotal\b)[^\d€$]{0,48}(?:(€|EUR|USD|\$)\s*)?(-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d{1,5}[.,]\d{2})(?:\s*(€|EUR|USD|\$))?/i
  );
  if (labeled) {
    const value = parseMoneyDe(labeled[2]);
    if (value !== undefined && value !== 0 && Math.abs(value) < 20000) {
      return { value, currency: currencyOf(labeled[1] || labeled[3]) };
    }
  }
  const matches = [...text.matchAll(new RegExp(RX_AMOUNT.source, 'gi'))];
  const parsed = matches
    .map(m => {
      const raw = m[2] || m[1];
      const value = parseMoneyDe(raw);
      const currency = currencyOf(m[0]);
      return value !== undefined ? { value, currency, abs: Math.abs(value) } : undefined;
    })
    .filter((x): x is { value: number; currency: string; abs: number } => !!x && x.abs >= 1 && x.abs < 20000);
  if (!parsed.length) return undefined;
  parsed.sort((a, b) => b.abs - a.abs);
  return { value: parsed[0].value, currency: parsed[0].currency };
}

function invoiceNumberFrom(text: string, attachments?: RawMessage['attachments']): string | undefined {
  const labeled = text.match(RX_INVOICE_NR);
  if (labeled?.[1] && !/herunterladen|download/i.test(labeled[1])) return labeled[1];
  const mahnung = text.match(/\bMahnung\s+\d{1,2}\.\d{1,2}\.\d{4}\s+(\d{5,12})\b/i)
    || text.match(/\bMahnung\b[^0-9]{0,12}(\d{5,12})\b/i);
  if (mahnung) return mahnung[1];
  const fromFile = (attachments || [])
    .map(a => a.filename)
    .find(n => /\.(pdf)$/i.test(n || '') && /RE|RG|FV|PR|INV|Rechnung|Mahnung/i.test(n || ''));
  if (fromFile) {
    const m = fromFile.match(/([A-Z]{0,4}\d[\w-]{3,})/i);
    if (m) return m[1].replace(/\.[a-z]+$/i, '');
  }
  return undefined;
}

const SUB_SERVICES: { re: RegExp; name: string }[] = [
  { re: /\bnetflix\b/i, name: 'Netflix' },
  { re: /\badobe\b|creative\s*cloud/i, name: 'Adobe' },
  { re: /\bspotify\b/i, name: 'Spotify' },
  { re: /\bdisney\+?|disneyplus/i, name: 'Disney+' },
  { re: /\byoutube\s*premium/i, name: 'YouTube Premium' },
  { re: /\bapple\s*(one|music|icloud|tv\+)/i, name: 'Apple' },
  { re: /\bmicrosoft\s*365|office\s*365/i, name: 'Microsoft 365' },
  { re: /\bgoogle\s*one\b/i, name: 'Google One' },
  { re: /\bdropbox\b/i, name: 'Dropbox' }
];

const INVOICE_HINT = /\b(rechnung|proforma|mahnung|zahlungserinnerung|invoice|dunning)\b/i;
const PARCEL_HINT = /\b(paket|sendung|zustellung|tracking|unterwegs|versandt|verschickt|zugestellt|geliefert|dhl|dpd|hermes|gls|ups|postnord|snus)\b/i;
const ORDER_HINT = /\b(bestell(?:ung|t|eingang)|auftragsbestätigung|order\s+confirm)\b/i;

export function extract(msg: RawMessage): Entity[] {
  const c = classify(msg);
  const out: Entity[] = [];
  const { text, jsonLd } = corpusOf(msg);
  const merchant = msg.from.name || rootDomain(domainOf(msg.from.address));
  const amount = findAmount(text);

  const isReminder = /\b(mahnung|zahlungserinnerung|dunning|overdue|zahlungsverzug)\b/i.test(text);
  const isInvoice = isReminder || INVOICE_HINT.test(text) || c.category === 'receipt';
  const isParcel = PARCEL_HINT.test(msg.subject) || c.category === 'parcel' || jsonLd?.['@type'] === 'ParcelDelivery';
  const isOrder = ORDER_HINT.test(text) || jsonLd?.['@type'] === 'Order';

  if (isParcel || jsonLd?.['@type'] === 'ParcelDelivery') {
    const jl = jsonLd?.['@type'] === 'ParcelDelivery' ? jsonLd : undefined;
    const tracking = jl?.trackingNumber
      ?? [...text.matchAll(RX_TRACKING)].map(m => m[0])[0]
      ?? '';
    const orderRef = text.match(RX_ORDER_NR)?.[1];
    const statusName: string = jl?.deliveryStatus?.name || '';
    const status: ParcelEntity['status'] =
      /deliver/i.test(statusName) || /zugestellt/i.test(text) ? 'delivered'
      : /out.?for.?delivery|zustellfahrzeug|heute\s+bei\s+dir/i.test(text) ? 'out_for_delivery'
      : /transit|unterwegs/i.test(text) ? 'in_transit'
      : /versandt|verschickt|shipped/i.test(text) ? 'shipped'
      : tracking || orderRef ? 'in_transit'
      : 'unknown';
    if (tracking || orderRef || jl) {
      out.push({
        kind: 'parcel',
        msgId: msg.id,
        trackingNumber: tracking || orderRef || '—',
        carrier: jl?.carrier?.name || text.match(RX_CARRIER)?.[1] || merchant,
        status,
        expectedFrom: jl?.expectedArrivalFrom,
        expectedUntil: jl?.expectedArrivalUntil,
        itemName: jl?.itemShipped?.name || (orderRef ? `Bestellung ${orderRef}` : undefined),
        merchant,
        date: msg.date
      });
    }
  }

  if ((jsonLd?.['@type'] === 'Order' || (isOrder && !isReminder)) && !isParcel) {
    const jl = jsonLd?.['@type'] === 'Order' ? jsonLd : undefined;
    const orderNumber = jl?.orderNumber || text.match(RX_ORDER_NR)?.[1];
    if (orderNumber) {
      const price = jl ? parseFloat(jl.price ?? jl.totalPrice ?? '0') : undefined;
      out.push({
        kind: 'order',
        msgId: msg.id,
        orderNumber,
        merchant: jl?.merchant?.name || merchant,
        total: price
          ? { value: price, currency: jl.priceCurrency || 'EUR' }
          : amount,
        items: (jl?.acceptedOffer || []).map((o: any) => ({
          name: o.itemOffered?.name,
          price: o.price ? parseFloat(o.price) : undefined
        })),
        date: msg.date
      });
    }
  }

  const subHit = SUB_SERVICES.find(s =>
    s.re.test(msg.subject) || s.re.test(msg.from.address) || s.re.test(msg.from.name || '')
  );
  const paypalPayee = `${msg.subject}\n${msg.bodyText || ''}`.match(/zahlung an\s+([^,\n]+)/i)?.[1]?.trim();
  const subName = subHit?.name
    || (paypalPayee && SUB_SERVICES.find(s => s.re.test(paypalPayee))?.name)
    || undefined;
  if (subName && amount && amount.value > 0 && amount.value < 500) {
    const isYearly = /\b(jahr|jährlich|jaehrlich|yearly|annual|\/yr)\b/i.test(text);
    out.push({
      kind: 'subscription',
      msgId: msg.id,
      service: subName,
      amount,
      cycle: isYearly ? 'year' : 'month',
      lastCharged: msg.date,
      date: msg.date
    });
  }

  if (msg.ics) {
    const ev = parseIcs(msg.ics);
    if (ev.start && ev.summary) {
      out.push({
        kind: 'event',
        msgId: msg.id,
        title: ev.summary,
        start: ev.start,
        end: ev.end,
        location: ev.location,
        organizer: ev.organizer,
        date: msg.date
      });
    }
  } else if (!isInvoice && !isParcel && (msg.ics || c.category === 'calendar' || /\b(einladung|invite|terminbestätigung)\b/i.test(msg.subject))) {
    const dates = parseGermanEventDates(text);
    if (dates?.start) {
      const loc = text.match(/\b(?:Stand|Ort|Location)\s*[:*]?\s*([A-Z0-9][^\n,]{2,40})/i);
      out.push({
        kind: 'event',
        msgId: msg.id,
        title: msg.subject.replace(/^(\[.*?\]|re:\s*|aw:\s*)/i, '').trim(),
        start: dates.start,
        end: dates.end,
        location: loc?.[1]?.trim(),
        organizer: merchant,
        date: msg.date
      });
    }
  }

  if (c.category === 'otp') {
    const labelled = text.match(RX_OTP_CODE);
    const standalone = !labelled ? msg.subject.match(RX_OTP_STANDALONE) : null;
    const code = labelled?.[1] ?? standalone?.[2];
    if (code && code.length >= 4) {
      const expiryMatch = text.match(/(\d{1,3})\s*(Minuten|min|minutes)/i);
      const expiresAt = expiryMatch
        ? new Date(new Date(msg.date).getTime() + parseInt(expiryMatch[1]) * 60_000).toISOString()
        : undefined;
      out.push({
        kind: 'otp',
        msgId: msg.id,
        code,
        service: merchant,
        expiresAt,
        date: msg.date
      });
    }
  }

  const isOrderBeleg = /\bbeleg zur bestellung\b/i.test(msg.subject);
  const isPaymentBeleg = /\bbeleg für ihre zahlung\b/i.test(msg.subject);
  if (!isPaymentBeleg && (isReminder || INVOICE_HINT.test(msg.subject) || isOrderBeleg)) {
    const dueMatch = text.match(/(?:zahlbar\s+bis|fällig|faellig|due)[^0-9]{0,20}(\d{1,2}\.\d{1,2}\.\d{4})/i);
    const dueFromSubject = isReminder ? msg.subject.match(RX_DATE_DE) : null;
    out.push({
      kind: 'invoice',
      msgId: msg.id,
      invoiceNumber: invoiceNumberFrom(`${msg.subject}\n${text}`, msg.attachments),
      amount,
      dueDate: dueMatch?.[1] || dueFromSubject?.[0],
      iban: text.match(RX_IBAN)?.[1]?.replace(/\s+/g, ''),
      merchant,
      date: msg.date,
      status: isReminder ? 'reminder' : 'invoice'
    });
  }

  return out;
}

const TRACKER_HOSTS: { host: RegExp; name: string }[] = [
  { host: /(^|\.)mailchimp\.com|list-manage\.com/i, name: 'Mailchimp' },
  { host: /hubspot\.com|hs-analytics/i, name: 'HubSpot' },
  { host: /sendgrid\.net|sparkpost/i, name: 'SendGrid' },
  { host: /doubleclick\.net|googletagmanager\.com|google-analytics\.com/i, name: 'Google' },
  { host: /facebook\.com|fbcdn/i, name: 'Facebook' },
  { host: /track\./i, name: 'Tracking-Pixel' },
  { host: /licdn\.com/i, name: 'LinkedIn' },
  { host: /substackcdn\.com/i, name: 'Substack' }
];

export function trackersIn(msg: RawMessage): string[] {
  const hosts = msg.remoteImageHosts ?? [];
  const found = new Set<string>();
  for (const h of hosts) {
    for (const t of TRACKER_HOSTS) if (t.host.test(h)) found.add(t.name);
  }
  return [...found];
}

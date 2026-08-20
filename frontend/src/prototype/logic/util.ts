import type { RawMessage } from '../data/types';

export function formatRelative(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = now.getTime() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'jetzt';
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 7) return `vor ${d} Tagen`;
  if (d < 30) return `vor ${Math.round(d / 7)} Wo.`;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

export function formatMoney(v: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(v);
}

export function initials(name?: string, address?: string): string {
  const src = (name || address || '?').trim();
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Frequenz pro Sender (List-Id oder From-Root).
 * Ergebnis pro Bucket: Anzahl in letzten 30 Tagen.
 */
export function frequencyByListOrSender(messages: RawMessage[]): Map<string, { count: number; per: string }> {
  const now = Date.now();
  const buckets = new Map<string, number>();
  for (const m of messages) {
    const key = (m.headers['List-Id'] || m.from.address).toLowerCase();
    const age = now - new Date(m.date).getTime();
    if (age <= 30 * 24 * 3600_000) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const out = new Map<string, { count: number; per: string }>();
  for (const [k, count] of buckets) {
    let per: string;
    if (count >= 20) per = `${Math.round(count / 30 * 7)}\u00d7 pro Woche`;
    else if (count >= 4) per = `${count}\u00d7 pro Monat`;
    else per = `${count}\u00d7 in 30 Tagen`;
    out.set(k, { count, per });
  }
  return out;
}

export function groupByThread<T extends { threadId: string; date: string }>(items: T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const arr = map.get(it.threadId) || [];
    arr.push(it);
    map.set(it.threadId, arr);
  }
  return [...map.values()].map(arr => arr.sort((a, b) => a.date.localeCompare(b.date)));
}

export function densityByWeek(messages: RawMessage[]): { week: string; count: number }[] {
  const map = new Map<string, number>();
  for (const m of messages) {
    const d = new Date(m.date);
    // ISO week key (rough)
    const year = d.getUTCFullYear();
    const jan = new Date(Date.UTC(year, 0, 1));
    const week = Math.floor((d.getTime() - jan.getTime()) / (7 * 24 * 3600_000));
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

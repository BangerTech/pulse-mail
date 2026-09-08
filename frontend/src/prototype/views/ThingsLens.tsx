import React, { useMemo, useState } from 'react';
import type { Entity, ParcelEntity, OrderEntity, SubscriptionEntity, EventEntity, OtpEntity, InvoiceEntity } from '../logic/extract';
import type { RawMessage } from '../data/types';
import type { Classification } from '../logic/classify';
import { onActivateKey } from '../../shared/keyboard';
import { formatMoney, formatRelative } from '../logic/util';

interface Props {
  entities: Entity[];
  items: { msg: RawMessage; cls: Classification; ents: Entity[] }[];
  onOpen: (id: string) => void;
}

function dedupeByKey<T extends { date: string }>(
  items: T[],
  keyOf: (item: T) => string,
  prefer: (keep: T, next: T) => T
): T[] {
  const map = new Map<string, T>();
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  for (const item of sorted) {
    const key = keyOf(item);
    const keep = map.get(key);
    map.set(key, keep ? prefer(keep, item) : item);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const STATUS_RANK: Record<ParcelEntity['status'], number> = {
  unknown: 0, shipped: 1, in_transit: 2, out_for_delivery: 3, delivered: 4
};

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function dedupeParcels(parcels: ParcelEntity[]): ParcelEntity[] {
  const map = new Map<string, ParcelEntity>();
  const sorted = [...parcels].sort((a, b) => b.date.localeCompare(a.date));
  for (const p of sorted) {
    const key = (p.trackingNumber || p.itemName || p.msgId).toUpperCase();
    const keep = map.get(key);
    if (!keep) { map.set(key, p); continue; }
    map.set(key, STATUS_RANK[p.status] > STATUS_RANK[keep.status] ? p : keep);
  }
  return [...map.values()]
    .map(p => {
      if ((p.status === 'in_transit' || p.status === 'shipped') && daysAgo(p.date) >= 6) {
        return { ...p, status: 'delivered' as const };
      }
      return p;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function ThingsLens({ entities, onOpen }: Props) {
  const parcels = useMemo(() => dedupeParcels(
    entities.filter((e): e is ParcelEntity => e.kind === 'parcel')
  ), [entities]);
  const orders = useMemo(() => dedupeByKey(
    entities.filter((e): e is OrderEntity => e.kind === 'order'),
    o => o.orderNumber.toUpperCase(),
    (keep, next) => (!keep.total && next.total) ? next : keep
  ), [entities]);
  const subs = entities.filter((e): e is SubscriptionEntity => e.kind === 'subscription');
  const events = entities.filter((e): e is EventEntity => e.kind === 'event')
    .sort((a, b) => a.start.localeCompare(b.start));
  const otps = entities.filter((e): e is OtpEntity => e.kind === 'otp')
    .sort((a, b) => b.date.localeCompare(a.date));
  const invoices = useMemo(() => dedupeByKey(
    entities.filter((e): e is InvoiceEntity => e.kind === 'invoice'),
    inv => (inv.invoiceNumber || inv.merchant).toUpperCase(),
    (keep, next) => (!keep.amount && next.amount) ? next : keep
  ), [entities]);

  const subsPerYear = useMemo(() => {
    // Nur letzte Instanz pro Service, hochgerechnet
    const latest = new Map<string, SubscriptionEntity>();
    for (const s of subs) {
      const existing = latest.get(s.service);
      if (!existing || existing.date < s.date) latest.set(s.service, s);
    }
    let total = 0;
    for (const s of latest.values()) {
      const mul = s.cycle === 'year' ? 1 : 12;
      total += s.amount.value * mul;
    }
    return { total, uniqueServices: latest.size, list: [...latest.values()] };
  }, [subs]);

  return (
    <section className="lens things">
      <header className="lens-head">
        <h1>Sachen</h1>
        <p className="lens-sub">Was tatsaechlich in deinen Mails steckt — nicht die Mails selbst.</p>
      </header>

      <div className="things-grid">
        {otps.length > 0 && (
          <div className="card card-featured">
            <div className="card-title">
              <span>Aktuelle Codes</span>
              <span className="card-badge">{otps.length}</span>
            </div>
            <div className="otp-list">
              {otps.slice(0, 4).map(otp => <OtpCard key={otp.msgId} otp={otp} onOpen={onOpen} />)}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">
            <span>Pakete</span>
            <span className="card-badge">{parcels.length}</span>
          </div>
          <ParcelTimeline parcels={parcels} onOpen={onOpen} />
        </div>

        <div className="card">
          <div className="card-title">
            <span>Abos</span>
            <span className="card-badge">{subsPerYear.uniqueServices}</span>
          </div>
          <div className="card-figure">
            <div className="figure-value">{formatMoney(subsPerYear.total)}</div>
            <div className="figure-label">pro Jahr, hochgerechnet</div>
          </div>
          <ul className="sub-list">
            {subsPerYear.list.map(s => (
              <li
                key={s.msgId}
                className="sub-row"
                onClick={() => onOpen(s.msgId)}
                onKeyDown={(e) => onActivateKey(e, () => onOpen(s.msgId))}
                role="button"
                tabIndex={0}
              >
                <span className="sub-service">{s.service}</span>
                <span className="sub-cycle">/{s.cycle === 'year' ? 'Jahr' : 'Monat'}</span>
                <span className="sub-amount">{formatMoney(s.amount.value, s.amount.currency)}</span>
              </li>
            ))}
            {subsPerYear.list.length === 0 && <li className="empty">Keine Abos erkannt.</li>}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Termine</span>
            <span className="card-badge">{events.length}</span>
          </div>
          <ul className="event-list">
            {events.map(e => (
              <li
                key={e.msgId}
                className="event-row"
                onClick={() => onOpen(e.msgId)}
                onKeyDown={(ev) => onActivateKey(ev, () => onOpen(e.msgId))}
                role="button"
                tabIndex={0}
              >
                <div className="event-date">
                  <span className="event-day">{new Date(e.start).toLocaleDateString('de-DE', { day: '2-digit' })}</span>
                  <span className="event-month">{new Date(e.start).toLocaleDateString('de-DE', { month: 'short' })}</span>
                </div>
                <div className="event-body">
                  <div className="event-title">{e.title}</div>
                  <div className="event-meta">
                    {new Date(e.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {e.location && <> · {e.location}</>}
                  </div>
                </div>
              </li>
            ))}
            {events.length === 0 && <li className="empty">Keine Termine erkannt.</li>}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Bestellungen</span>
            <span className="card-badge">{orders.length}</span>
          </div>
          <ul className="order-list">
            {orders.map(o => (
              <li
                key={o.msgId}
                className="order-row"
                onClick={() => onOpen(o.msgId)}
                onKeyDown={(e) => onActivateKey(e, () => onOpen(o.msgId))}
                role="button"
                tabIndex={0}
              >
                <div className="order-merchant">{o.merchant}</div>
                <div className="order-number">Nr. {o.orderNumber}</div>
                {o.total && <div className="order-total">{formatMoney(o.total.value, o.total.currency)}</div>}
              </li>
            ))}
            {orders.length === 0 && <li className="empty">Keine Bestellungen.</li>}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Rechnungen</span>
            <span className="card-badge">{invoices.length}</span>
          </div>
          <ul className="invoice-list">
            {invoices.map(inv => (
              <li
                key={inv.msgId}
                className={`invoice-row ${inv.status === 'reminder' ? 'is-reminder' : ''}`}
                onClick={() => onOpen(inv.msgId)}
                onKeyDown={(e) => onActivateKey(e, () => onOpen(inv.msgId))}
                role="button"
                tabIndex={0}
              >
                <div className="invoice-merchant">
                  {inv.status === 'reminder' && <span className="invoice-flag">Mahnung</span>}
                  {inv.merchant}
                </div>
                <div className="invoice-nr">{inv.invoiceNumber || '\u2014'}</div>
                <div className="invoice-amount">
                  {inv.amount ? formatMoney(inv.amount.value, inv.amount.currency) : 'kein Betrag'}
                </div>
                {inv.dueDate && <div className="invoice-due">fällig {inv.dueDate}</div>}
              </li>
            ))}
            {invoices.length === 0 && <li className="empty">Keine offenen Rechnungen.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallthrough */ }
  // Fallback für Kontexte ohne Clipboard-API (unsicherer Kontext, ältere
  // Browser). Nutzt ein temporäres Textarea + execCommand('copy').
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function OtpCard({ otp, onOpen }: { otp: OtpEntity; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const doCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(otp.code);
    setStatus(ok ? 'copied' : 'failed');
    window.setTimeout(() => setStatus('idle'), 1600);
  };

  const stillValid = !otp.expiresAt || new Date(otp.expiresAt).getTime() > Date.now();
  const actionLabel =
    status === 'copied' ? 'Kopiert ✓' :
    status === 'failed' ? 'Kopieren fehlgeschlagen — bitte manuell markieren' :
    'Klicken zum Kopieren';

  return (
    <div
      className={`otp-card ${stillValid ? '' : 'expired'} ${status === 'copied' ? 'is-copied' : ''}`}
      role="button"
      tabIndex={0}
      onClick={doCopy}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') doCopy(e as any); }}
      title="Klicken zum Kopieren"
    >
      <div className="otp-code" onClick={doCopy}>{otp.code}</div>
      <div className="otp-meta">
        <span>{otp.service}</span>
        <span className="dot" />
        <span>{formatRelative(otp.date)}</span>
      </div>
      <div className={`otp-action ${status}`}>
        <span>{actionLabel}</span>
        <button
          type="button"
          className="otp-open"
          onClick={e => { e.stopPropagation(); onOpen(otp.msgId); }}
        >Mail öffnen</button>
      </div>
    </div>
  );
}

function ParcelTimeline({ parcels, onOpen }: { parcels: ParcelEntity[]; onOpen: (id: string) => void }) {
  if (parcels.length === 0) return <div className="empty">Keine offenen Pakete.</div>;
  const statusLabel: Record<ParcelEntity['status'], string> = {
    unknown: 'unbekannt',
    shipped: 'verschickt',
    in_transit: 'unterwegs',
    out_for_delivery: 'in Zustellung',
    delivered: 'zugestellt'
  };
  const statusStep: Record<ParcelEntity['status'], number> = {
    unknown: 0, shipped: 1, in_transit: 2, out_for_delivery: 3, delivered: 4
  };
  return (
    <ul className="parcel-list">
      {parcels.map(p => (
        <li
          key={p.msgId}
          className={`parcel-row status-${p.status}`}
          onClick={() => onOpen(p.msgId)}
          onKeyDown={(e) => onActivateKey(e, () => onOpen(p.msgId))}
          role="button"
          tabIndex={0}
        >
          <div className="parcel-item">{p.itemName || p.carrier || 'Sendung'}</div>
          <div className="parcel-track">
            <span className="parcel-carrier">{p.carrier}</span>
            <code className="parcel-number">{p.trackingNumber}</code>
          </div>
          <div className="parcel-progress">
            {['shipped', 'in_transit', 'out_for_delivery', 'delivered'].map((s, i) => (
              <span key={s} className={`step ${i < statusStep[p.status] ? 'done' : ''} ${i + 1 === statusStep[p.status] ? 'current' : ''}`} />
            ))}
          </div>
          <div className="parcel-status">{statusLabel[p.status]}</div>
        </li>
      ))}
    </ul>
  );
}

import { type ReactNode } from 'react';
import type { RawMessage } from '../data/types';
import type { Classification } from '../logic/classify';
import { domainHue } from '../logic/classify';
import { formatRelative, initials } from '../logic/util';

interface Props {
  msg: RawMessage;
  cls: Classification;
  active: boolean;
  onClick: () => void;
  right?: ReactNode;
  hideSnippet?: boolean;
}

export function MessageRow({ msg, cls, active, onClick, right, hideSnippet }: Props) {
  const hue = domainHue(msg.from.address);
  const unread = !msg.flags.includes('\\Seen');

  return (
    <article
      className={`row ${active ? 'active' : ''} ${unread ? 'unread' : ''} ${cls.category === 'suspicious' ? 'danger' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{ ['--row-hue' as any]: hue }}
    >
      <div className="row-avatar" aria-hidden style={{ background: `oklch(58% 0.14 ${hue})` }}>
        <span>{initials(msg.from.name, msg.from.address)}</span>
      </div>
      <div className="row-body">
        <div className="row-line-1">
          <span className="row-from">{msg.from.name || msg.from.address}</span>
          <span className="row-date">{formatRelative(msg.date)}</span>
        </div>
        <div className="row-line-2">
          <span className="row-subject">{msg.subject}</span>
        </div>
        {!hideSnippet && msg.bodyText && (
          <div className="row-snippet">
            {msg.bodyText.replace(/\n+/g, ' ').slice(0, 140)}
          </div>
        )}
      </div>
      {right && <div className="row-right">{right}</div>}
      {unread && <span className="row-unread" aria-hidden />}
    </article>
  );
}

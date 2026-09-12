import { useEffect, useState, type ReactNode } from 'react';
import { iconCandidatesForEmail, isPlaceholderFavicon, rememberFailedIcon } from './senderIcon';
import './sender-avatar.css';

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];

function initials(name?: string, address?: string) {
  const source = (name || address || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.charAt(0).toUpperCase();
}

function avatarColor(address?: string) {
  if (!address) return '#8E8E93';
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = address.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function SenderAvatar({
  name,
  address,
  className,
  title,
  allowRemote = true,
  children
}: {
  name?: string;
  address?: string;
  className?: string;
  title?: string;
  allowRemote?: boolean;
  children?: ReactNode;
}) {
  const urls = allowRemote ? iconCandidatesForEmail(address) : [];
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const src = urls[index] || '';

  useEffect(() => {
    setIndex(0);
    setReady(false);
  }, [address, allowRemote]);

  useEffect(() => { setReady(false); }, [src]);

  const reject = () => {
    if (src) rememberFailedIcon(src);
    setReady(false);
    setIndex(i => i + 1);
  };

  const showIcon = Boolean(src);

  return (
    <div
      className={`${className || ''}${showIcon ? ' has-icon' : ''}`}
      style={{ background: showIcon ? undefined : avatarColor(address) }}
      title={title}
      aria-hidden
    >
      {showIcon ? (
        <span className="sender-icon-clip">
          <img
            src={src}
            alt=""
            className={ready ? 'is-ready' : ''}
            onLoad={(e) => {
              if (isPlaceholderFavicon(e.currentTarget)) reject();
              else setReady(true);
            }}
            onError={reject}
          />
        </span>
      ) : initials(name, address)}
      {children}
    </div>
  );
}

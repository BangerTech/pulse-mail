import { useEffect, useState, type ReactNode } from 'react';
import { iconCandidatesForEmail, rememberFailedIcon } from './senderIcon';

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
  const src = urls[index] || '';

  useEffect(() => { setIndex(0); }, [address, allowRemote]);

  const showIcon = Boolean(src);

  return (
    <div
      className={`${className || ''}${showIcon ? ' has-icon' : ''}`}
      style={{ background: showIcon ? undefined : avatarColor(address) }}
      title={title}
      aria-hidden
    >
      {showIcon ? (
        <img
          src={src}
          alt=""
          onError={() => {
            rememberFailedIcon(src);
            setIndex(i => i + 1);
          }}
        />
      ) : initials(name, address)}
      {children}
    </div>
  );
}

import type { CSSProperties } from 'react';
import type { AppUser } from '../store';

export default function UserAvatar({
  user,
  className = 'account-avatar',
  size
}: {
  user: Pick<AppUser, 'name' | 'username' | 'color' | 'avatarUrl'>;
  className?: string;
  size?: number;
}) {
  const initial = (user.name || user.username || '?').charAt(0).toUpperCase();
  const style: CSSProperties = {
    background: user.color || 'var(--accent-color)',
    ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : {})
  };
  return (
    <span className={className} style={style} aria-hidden>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" />
        : initial}
    </span>
  );
}

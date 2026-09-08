// Small banner shown above the mail body when external images are blocked.
// Two actions: load once for this mail, or add the sender to the allowlist
// so future mails from them load automatically.

interface Props {
  blockedCount: number;
  hosts: string[];
  senderAddress?: string;
  onLoadOnce: () => void;
  onAllowSender: () => void;
}

function senderDomain(address?: string): string | null {
  const at = (address || '').indexOf('@');
  return at >= 0 ? (address as string).slice(at + 1) : null;
}

export function RemoteImagesBar({ blockedCount, hosts, senderAddress, onLoadOnce, onAllowSender }: Props) {
  if (!blockedCount) return null;
  const domain = senderDomain(senderAddress);
  const hostList = hosts.slice(0, 3).join(', ') + (hosts.length > 3 ? ` +${hosts.length - 3}` : '');
  return (
    <div className="remote-images-bar" role="status" aria-live="polite">
      <span className="remote-images-bar-text">
        {blockedCount} externe {blockedCount === 1 ? 'Ressource' : 'Ressourcen'} blockiert
        {hostList && <span className="remote-images-bar-hosts" title={hosts.join(', ')}> ({hostList})</span>}
      </span>
      <div className="remote-images-bar-actions">
        <button type="button" className="remote-images-bar-btn" onClick={onLoadOnce}>
          Laden
        </button>
        {domain && (
          <button type="button" className="remote-images-bar-btn subtle" onClick={onAllowSender}>
            {domain} immer erlauben
          </button>
        )}
      </div>
    </div>
  );
}

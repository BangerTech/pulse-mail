// Shared keyboard helper: treat Enter/Space as an activation, matching
// native button behaviour. Used on role="button" elements that aren't <button>.

export function isActivateKey(e: { key: string }): boolean {
  return e.key === 'Enter' || e.key === ' ';
}

export function onActivateKey(
  e: { key: string; preventDefault: () => void },
  fn: () => void
) {
  if (!isActivateKey(e)) return;
  e.preventDefault();
  fn();
}

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.4.0';

export const APP_BUILD =
  typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';

export function formatBuildTime(iso = APP_BUILD) {
  if (!iso || iso === 'dev') return 'Entwicklung';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

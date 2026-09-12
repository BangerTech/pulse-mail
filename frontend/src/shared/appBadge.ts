// Drive unread count into the browser tab and into Pake/Tauri desktop shells.
// Pake intercepts navigator.setAppBadge and forwards it to set_dock_badge
// (macOS dock, Linux/Windows taskbar when the wrapper supports it).

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

type TauriWindow = {
  setOverlayIcon?: (icon?: Uint8Array | null) => Promise<void>;
  requestUserAttention?: (mode?: number | null) => Promise<void>;
};

const FAVICON_BASE = '/favicon-32.png';

let lastCount = -1;
let originals: { href: string; el: HTMLLinkElement }[] | null = null;

function tauriApi() {
  return (window as Window & {
    __TAURI__?: {
      core?: { invoke?: TauriInvoke };
      window?: { getCurrentWindow?: () => TauriWindow };
    };
  }).__TAURI__;
}

function tauriInvoke(): TauriInvoke | null {
  const invoke = tauriApi()?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

function badgeLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

function drawBadge(ctx: CanvasRenderingContext2D, size: number, label: string) {
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#FF3B30';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${label.length > 2 ? 11 : 16}px system-ui, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 1);
}

function overlayPng(count: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('canvas'));
      return;
    }
    drawBadge(ctx, size, badgeLabel(count));
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('blob'));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}

async function setWindowsTaskbarOverlay(count: number) {
  const win = tauriApi()?.window?.getCurrentWindow?.();
  if (!win?.setOverlayIcon) return;
  try {
    if (count <= 0) {
      await win.setOverlayIcon(undefined as unknown as null);
      return;
    }
    await win.setOverlayIcon(await overlayPng(count));
  } catch {
    // Stock Pake often lacks core:window:allow-set-overlay-icon.
  }
}

function rememberFavicons() {
  if (originals) return;
  originals = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'))
    .map(el => ({ el, href: el.getAttribute('href') || el.href }));
}

function restoreFavicons() {
  if (!originals) return;
  for (const { el, href } of originals) el.href = href;
}

function paintFavicon(count: number) {
  rememberFavicons();
  if (count <= 0) {
    restoreFavicons();
    return;
  }

  const label = badgeLabel(count);
  const img = new Image();
  img.onload = () => {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, size, size);

    const badge = label.length > 1 ? 18 : 14;
    const x = size - badge / 2 - 1;
    const y = badge / 2 + 1;
    ctx.beginPath();
    ctx.arc(x, y, badge / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF3B30';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${label.length > 2 ? 8 : 11}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);

    const href = canvas.toDataURL('image/png');
    rememberFavicons();
    for (const { el } of originals || []) el.href = href;
  };
  img.onerror = () => restoreFavicons();
  img.src = FAVICON_BASE;
}

export function flashTaskbarAttention() {
  try {
    const win = tauriApi()?.window?.getCurrentWindow?.();
    // 1 = Critical: flash the Windows taskbar button until the window is focused.
    void win?.requestUserAttention?.(1);
  } catch {}
}

export function setUnreadAppBadge(count: number) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === lastCount) return;
  lastCount = n;

  try {
    if (n > 0) void navigator.setAppBadge?.(n);
    else void navigator.clearAppBadge?.();
  } catch {}

  const invoke = tauriInvoke();
  if (invoke) {
    if (n > 0) invoke('set_dock_badge', { count: n }).catch(() => {});
    else invoke('clear_dock_badge').catch(() => {});
  }

  void setWindowsTaskbarOverlay(n);
  paintFavicon(n);
}

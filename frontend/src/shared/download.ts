import { authHeaders } from '../api';

function isTauri(): boolean {
  return typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== 'undefined'
    || typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
}

function getInvoke(): ((cmd: string, args?: object) => Promise<unknown>) | null {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke: (cmd: string, args?: object) => Promise<unknown> } };
  };
  return w.__TAURI__?.core?.invoke ?? null;
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Native “Save As” via Tauri (desktop). Returns saved path, or null if cancelled. */
async function saveViaTauri(filename: string, bytes: Uint8Array): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const path = await invoke('save_attachment', {
      filename,
      base64: await bytesToBase64(bytes),
    });
    return typeof path === 'string' ? path : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // User closed the dialog
    if (/abgebrochen|cancel/i.test(msg)) return null;
    // Old desktop build without the command — signal caller to fall back
    throw err;
  }
}

async function saveViaFilePicker(filename: string, blob: Blob): Promise<boolean> {
  const w = window as unknown as {
    showSaveFilePicker?: (opts: { suggestedName?: string }) => Promise<{
      createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  };
  if (typeof w.showSaveFilePicker !== 'function') return false;
  const handle = await w.showSaveFilePicker({ suggestedName: filename });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

/**
 * Save a URL to disk. Desktop (Tauri) opens a native Save-As dialog.
 * Browser uses the File System Access API when available, else a download link.
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const name = filename || 'download';
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Download fehlgeschlagen');
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([buffer], {
    type: res.headers.get('Content-Type') || 'application/octet-stream',
  });

  if (isTauri()) {
    try {
      await saveViaTauri(name, bytes);
      return;
    } catch {
      // Command missing in older .exe — fall through to browser-style download
    }
  }

  try {
    if (await saveViaFilePicker(name, blob)) return;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// New-mail ding. Web Audio stays muted until a gesture, and Pake/WebView2
// suspends the context again after idle — that is why the sound used to
// play only when the user clicked the new message. We unlock a reusable
// HTMLAudio player on the first gesture and keep resuming it.

let ctx: AudioContext | null = null;
let pendingTimer: number | undefined;
let armed = false;
let ready = false;
let queued = false;
let queuedAt = 0;
let dingUrl: string | null = null;
let player: HTMLAudioElement | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ctx.addEventListener('statechange', () => {
      if (ctx?.state === 'suspended') ready = false;
    });
  }
  return ctx;
}

function writeFour(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function toneSamples(freq: number, durationMs: number, sampleRate: number) {
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const env = Math.min(1, i / 180) * Math.min(1, (samples - i) / 350);
    out[i] = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * 0.28 * env * 32767;
  }
  return out;
}

function buildDingUrl() {
  if (dingUrl) return dingUrl;
  const sampleRate = 22050;
  const first = toneSamples(880, 120, sampleRate);
  const gap = new Int16Array(Math.floor(sampleRate * 0.04));
  const second = toneSamples(1175, 170, sampleRate);
  const pcm = new Int16Array(first.length + gap.length + second.length);
  pcm.set(first, 0);
  pcm.set(second, first.length + gap.length);

  const bytes = 44 + pcm.length * 2;
  const buf = new ArrayBuffer(bytes);
  const view = new DataView(buf);
  writeFour(view, 0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeFour(view, 8, 'WAVE');
  writeFour(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeFour(view, 36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);

  dingUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return dingUrl;
}

function ensurePlayer() {
  if (player) return player;
  player = new Audio(buildDingUrl());
  player.preload = 'auto';
  player.volume = 0.5;
  return player;
}

function flushQueue() {
  if (!queued) return;
  queued = false;
  // A stale queue would replay the ding when the user later clicks a
  // message — that was the old "sound only on click" bug.
  if (Date.now() - queuedAt > 2000) return;
  playNewMailSound();
}

export function unlockNotifySound() {
  const audio = getCtx();
  if (audio?.state === 'suspended') void audio.resume().then(() => {
    if (audio.state === 'running') ready = true;
    flushQueue();
  }).catch(() => {});

  const el = ensurePlayer();
  if (ready) return;

  const prev = el.volume;
  el.volume = 0.001;
  void el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    el.volume = prev || 0.5;
    ready = true;
    flushQueue();
  }).catch(() => {
    el.volume = prev || 0.5;
  });
}

export function armNotifySoundUnlock() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const wake = () => unlockNotifySound();
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
}

export function playNewMailSound() {
  const el = ensurePlayer();
  if (ready) {
    try {
      el.pause();
      el.currentTime = 0;
      el.volume = 0.5;
      void el.play().catch(() => {
        ready = false;
        queued = true;
        queuedAt = Date.now();
        unlockNotifySound();
      });
    } catch {
      queued = true;
      queuedAt = Date.now();
    }
    return;
  }

  queued = true;
  queuedAt = Date.now();
  unlockNotifySound();
}

export function scheduleNewMailSound(delayMs = 0) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => playNewMailSound(), delayMs);
}

if (typeof window !== 'undefined') armNotifySoundUnlock();

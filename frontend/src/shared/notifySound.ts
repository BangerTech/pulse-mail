// New-mail ding via a reusable HTMLAudio element. Unlock on gesture only
// prepares the player — it must not play the ding, or the sound appears
// when the user later clicks a message.

let pendingTimer: number | undefined;
let armed = false;
let ready = false;
let volume = 0.7;
let player: HTMLAudioElement | null = null;

function dingSrc() {
  return `${window.location.origin}/notify.wav`;
}

function ensurePlayer() {
  if (player) return player;
  player = new Audio(dingSrc());
  player.preload = 'auto';
  player.volume = volume;
  return player;
}

export function setNotifyVolume(n: number) {
  volume = Math.max(0, Math.min(1, Number(n) || 0));
  if (player) player.volume = volume;
}

export function getNotifySoundStatus() {
  return { ready, volume };
}

export function unlockNotifySound() {
  const el = ensurePlayer();
  if (ready) return;
  const prev = el.volume;
  el.volume = 0.001;
  void el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    el.volume = prev || volume;
    ready = true;
  }).catch(() => {
    el.volume = prev || volume;
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
  try {
    el.pause();
    el.currentTime = 0;
    el.volume = volume;
    void el.play().then(() => {
      ready = true;
    }).catch(() => {
      ready = false;
    });
  } catch {
    ready = false;
  }
}

export function scheduleNewMailSound(delayMs = 0) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => playNewMailSound(), delayMs);
}

if (typeof window !== 'undefined') armNotifySoundUnlock();

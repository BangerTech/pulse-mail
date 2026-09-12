// Short two-tone ding for new mail. Generated with Web Audio so we do not
// ship an asset. Browsers mute AudioContext until a user gesture, so the
// first click/key unlocks it.

let ctx: AudioContext | null = null;
let pending: number | undefined;
let armed = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockNotifySound() {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}

export function armNotifySoundUnlock() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const once = () => {
    unlockNotifySound();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

function beep(audio: AudioContext, freq: number, start: number, duration: number, gain: number) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.018);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playNewMailSound() {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const t = audio.currentTime + 0.01;
  beep(audio, 880, t, 0.11, 0.07);
  beep(audio, 1175, t + 0.09, 0.16, 0.06);
}

export function scheduleNewMailSound(delayMs = 800) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(pending);
  pending = window.setTimeout(() => playNewMailSound(), delayMs);
}

if (typeof window !== 'undefined') armNotifySoundUnlock();

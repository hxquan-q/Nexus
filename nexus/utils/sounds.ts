/**
 * Sound notification utilities using Web Audio API.
 * Generates simple tones without requiring audio files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if audio is not available
  }
}

export function playSentSound(): void {
  playTone(880, 0.1);
}

export function playReceivedSound(): void {
  playTone(660, 0.15);
}

export function playErrorSound(): void {
  playTone(220, 0.3, 'square');
}

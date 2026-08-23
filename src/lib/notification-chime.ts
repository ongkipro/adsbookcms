/**
 * A short, soft chime for a newly arrived admin notification.
 *
 * Synthesised with the Web Audio API rather than shipped as an audio file: the
 * whole sound is three sine tones, so it costs no request, no bytes on the
 * install's R2 or asset binding, and works offline. An mp3 of the same length
 * would be tens of kilobytes on every admin page load for half a second of
 * sound.
 *
 * The shape is deliberately restrained — an ascending A major triad (A5, C#6,
 * E6) at 70 ms apart, each with a soft 8 ms attack and a bell-like exponential
 * decay, at a low master gain. Soft attacks matter: a square edge on a sine is
 * heard as a click.
 */

const NOTES_HZ = [880, 1108.73, 1318.51];
const NOTE_SPACING_S = 0.07;
const ATTACK_S = 0.008;
const DECAY_S = 0.45;
const MASTER_GAIN = 0.12;
/** exponentialRampToValueAtTime cannot reach 0. */
const SILENCE = 0.0001;

const MUTE_KEY = "adsbook-notification-muted";

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext || scope.webkitAudioContext;
}

/** Reused across chimes: a context per notification would leak audio threads. */
let context: AudioContext | undefined;

export function isNotificationMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    // Private mode, or storage blocked. Audible is the useful default.
    return false;
  }
}

export function setNotificationMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
  } catch {
    /* the preference simply does not persist */
  }
}

/**
 * Plays the chime unless muted. Never throws and never rejects: a browser that
 * refuses audio must not break the notification poll that called it.
 *
 * Before the operator's first gesture the context is created "suspended" by
 * autoplay policy. `resume()` is attempted and, if it is refused, the chime is
 * dropped silently — the in-app badge and list still carry the notification.
 */
export function playNotificationChime(): void {
  if (isNotificationMuted()) return;

  const Ctor = audioContextConstructor();
  if (!Ctor) return;

  try {
    if (!context) context = new Ctor();
    const ctx = context;

    const start = () => {
      const now = ctx.currentTime;
      for (const [index, frequency] of NOTES_HZ.entries()) {
        const at = now + index * NOTE_SPACING_S;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, at);

        gain.gain.setValueAtTime(SILENCE, at);
        gain.gain.exponentialRampToValueAtTime(MASTER_GAIN, at + ATTACK_S);
        gain.gain.exponentialRampToValueAtTime(SILENCE, at + ATTACK_S + DECAY_S);

        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + ATTACK_S + DECAY_S + 0.02);
      }
    };

    if (ctx.state === "suspended") {
      void ctx.resume().then(start, () => {});
      return;
    }
    start();
  } catch {
    /* no audio device, or the context was refused */
  }
}

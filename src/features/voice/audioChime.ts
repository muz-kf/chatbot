/**
 * Procedural Web Audio API Synthesizer for Voice Mode UI Sound Effects.
 * Emits clean, futuristic chimes (like Alexa / Jarvis activation tones)
 * without requiring any external audio files or network requests.
 * Compatible with Web browsers, Electron, Tauri, and React Native Web.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtx();
  }

  if (sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

/**
 * Alexa / Jarvis Listen Chime:
 * A crisp, high-tech two-tone rising chime (D5 587.33 Hz -> A5 880 Hz)
 * with a high harmonic overtone that signals "I'm listening".
 */
export function playListenChime(volume = 0.22): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Primary low tone (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(volume * 0.85, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.23);

    // Primary high tone (A5) - delayed slightly for the iconic two-tone signature
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.075);
    gain2.gain.setValueAtTime(0, now + 0.075);
    gain2.gain.linearRampToValueAtTime(volume, now + 0.095);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.075);
    osc2.stop(now + 0.49);

    // Subtle holographic shimmer harmonic (triangle wave at 1760 Hz)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(1760, now + 0.075);
    gain3.gain.setValueAtTime(0, now + 0.075);
    gain3.gain.linearRampToValueAtTime(volume * 0.18, now + 0.095);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.075);
    osc3.stop(now + 0.36);
  } catch (err) {
    // Non-blocking if audio output is blocked by browser policy before user interaction
    console.debug("[AudioChime] Chime skipped:", err);
  }
}

/**
 * Response-Completed / Ready-to-Listen Chime:
 * A subtle, warm single chime with gentle shimmer signaling the turn is handed back to user.
 */
export function playTurnReadyChime(volume = 0.18): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(783.99, now); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12); // C6

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.39);
  } catch (err) {
    console.debug("[AudioChime] Turn chime skipped:", err);
  }
}

/**
 * Iron Man Jarvis Holographic Arc Reactor Activation Sweep:
 * Sci-Fi power-up sweep used when entering Voice Mode.
 */
export function playJarvisStartupSweep(volume = 0.2): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pitch sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(330, now); // E4
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.28); // A5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume * 0.7, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);

    // High harmonic resonance ping
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = "triangle";
    ping.frequency.setValueAtTime(1318.51, now + 0.2); // E6
    pingGain.gain.setValueAtTime(0, now + 0.2);
    pingGain.gain.linearRampToValueAtTime(volume * 0.35, now + 0.22);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    ping.connect(pingGain);
    pingGain.connect(ctx.destination);
    ping.start(now + 0.2);
    ping.stop(now + 0.56);
  } catch (err) {
    console.debug("[AudioChime] Startup sweep skipped:", err);
  }
}

/**
 * Deactivation Tone: Soft descending chime when leaving Voice Mode or muting.
 */
export function playDeactivationChime(volume = 0.16): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.22); // A4

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  } catch (err) {
    console.debug("[AudioChime] Deactivation tone skipped:", err);
  }
}


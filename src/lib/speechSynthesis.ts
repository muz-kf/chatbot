/**
 * Helper utility for Browser Native Web Speech Synthesis (Text-to-Speech).
 * Runs completely client-side in all modern browsers without requiring any external
 * subscription, cloud API key, or third-party audio service.
 */

export interface VoiceSettings {
  enabled: boolean;
  voiceName: string;
  rate: number;
  pitch: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  voiceName: "",
  rate: 1.0,
  pitch: 1.0,
};

let voicesCache: SpeechSynthesisVoice[] = [];

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  if (voicesCache.length > 0) return voicesCache;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    voicesCache = voices;
  }
  return voices;
}

export function initVoicesListener(callback?: (voices: SpeechSynthesisVoice[]) => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const update = () => {
    voicesCache = window.speechSynthesis.getVoices();
    if (callback) callback(voicesCache);
  };

  update();
  if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = update;
  }
}

/**
 * Clean markdown symbols, html tags, iframe embeds, and URLs so speech sounds natural.
 */
export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return "";

  return rawText
    // Remove iframes and code blocks
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/```[\s\S]*?```/g, "Code snippet omitted.")
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove raw URLs
    .replace(/https?:\/\/\S+/gi, "")
    // Remove markdown bold / italic / headers / lists
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove emojis or special symbols
    .replace(/[🗺️📍⚠️⚡💡🚀🤖✨]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking;
}

export function speakText(
  text: string,
  settings: VoiceSettings,
  onEnd?: () => void,
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  // Cancel any ongoing speech
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(cleaned);
  const voices = getVoices();

  if (settings.voiceName) {
    const matchedVoice = voices.find((v) => v.name === settings.voiceName);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
  } else {
    // Default to an English voice if available, otherwise first default
    const englishVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.default || v.localService),
    ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
  }

  utterance.rate = Math.max(0.5, Math.min(2.0, settings.rate || 1.0));
  utterance.pitch = Math.max(0.5, Math.min(2.0, settings.pitch || 1.0));

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  window.speechSynthesis.speak(utterance);
}


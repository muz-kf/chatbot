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
const activeUtterances = new Set<SpeechSynthesisUtterance>();

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

  activeUtterances.add(utterance);
  utterance.onend = () => {
    activeUtterances.delete(utterance);
    onEnd?.();
  };
  utterance.onerror = () => {
    activeUtterances.delete(utterance);
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Streaming TTS Queue for continuous real-time audio playback during token streaming.
 * Breaks incoming tokens into natural sentences/clauses and plays them sequentially
 * so speech begins immediately while tokens are still arriving.
 */
export class StreamingTTSQueue {
  private buffer: string = "";
  private settings: VoiceSettings;
  private queue: string[] = [];
  private isPlaying: boolean = false;
  private stopped: boolean = false;
  private isFlushed: boolean = false;
  private onEndCallback: (() => void) | null = null;

  constructor(settings: VoiceSettings, onEnd?: () => void) {
    this.settings = settings;
    if (onEnd) {
      this.onEndCallback = onEnd;
    }
  }

  updateSettings(settings: VoiceSettings): void {
    this.settings = settings;
  }

  pushToken(token: string): void {
    if (this.stopped || !this.settings.enabled) return;
    this.buffer += token;

    // Sentence delimiters: period, question mark, exclamation, semicolon, or newline followed by whitespace
    const sentenceDelimiterRegex = /([.!?\n]+(?:\s+|$)|[;:]\s+)/;
    let match = this.buffer.match(sentenceDelimiterRegex);

    while (match && match.index !== undefined) {
      const boundaryEnd = match.index + match[0].length;
      const sentence = this.buffer.slice(0, boundaryEnd);
      this.buffer = this.buffer.slice(boundaryEnd);

      const cleaned = cleanTextForSpeech(sentence);
      if (cleaned) {
        this.enqueue(cleaned);
      }
      match = this.buffer.match(sentenceDelimiterRegex);
    }

    // Split long clauses on commas if buffer exceeds 120 characters
    if (this.buffer.length > 120 && /, \s*/.test(this.buffer)) {
      const commaIndex = this.buffer.lastIndexOf(", ");
      if (commaIndex > 30) {
        const clause = this.buffer.slice(0, commaIndex + 2);
        this.buffer = this.buffer.slice(commaIndex + 2);
        const cleaned = cleanTextForSpeech(clause);
        if (cleaned) {
          this.enqueue(cleaned);
        }
      }
    }
  }

  flush(onEnd?: () => void): void {
    if (onEnd) {
      this.onEndCallback = onEnd;
    }
    this.isFlushed = true;

    if (this.stopped || !this.settings.enabled) {
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
      return;
    }

    if (this.buffer.trim()) {
      const cleaned = cleanTextForSpeech(this.buffer);
      this.buffer = "";
      if (cleaned) {
        this.enqueue(cleaned);
      }
    }

    if (!this.isPlaying && this.queue.length === 0) {
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
    }
  }

  private enqueue(text: string): void {
    this.queue.push(text);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playNext(): void {
    if (this.stopped || this.queue.length === 0) {
      this.isPlaying = false;
      if (this.isFlushed && !this.stopped && this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.isPlaying = false;
      if (this.isFlushed && !this.stopped && this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
      return;
    }

    this.isPlaying = true;
    const textToSpeak = this.queue.shift()!;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    const voices = getVoices();

    if (this.settings.voiceName) {
      const matched = voices.find((v) => v.name === this.settings.voiceName);
      if (matched) utterance.voice = matched;
    } else {
      const english = voices.find(
        (v) => v.lang.startsWith("en") && (v.default || v.localService)
      ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
      if (english) utterance.voice = english;
    }

    utterance.rate = Math.max(0.5, Math.min(2.0, this.settings.rate || 1.0));
    utterance.pitch = Math.max(0.5, Math.min(2.0, this.settings.pitch || 1.0));

    activeUtterances.add(utterance);

    utterance.onend = () => {
      activeUtterances.delete(utterance);
      if (!this.stopped) {
        this.playNext();
      }
    };
    utterance.onerror = () => {
      activeUtterances.delete(utterance);
      if (!this.stopped) {
        this.playNext();
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    this.stopped = true;
    this.isFlushed = false;
    this.onEndCallback = null;
    this.buffer = "";
    this.queue = [];
    this.isPlaying = false;
    activeUtterances.clear();
    stopSpeaking();
  }
}

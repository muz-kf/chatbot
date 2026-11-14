import React, { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Radio,
  CornerDownLeft,
  ChevronLeft,
  Settings2,
  Palette,
} from "lucide-react";
import { JarvisArcReactor } from "./JarvisArcReactor";
import { useVoiceAssistant, type VoiceAssistantStatus } from "./useVoiceAssistant";
import { playJarvisStartupSweep, playDeactivationChime } from "./audioChime";
import type { VoiceSettings } from "../../lib/speechSynthesis";
import { themes, type ThemeChoice, type AiProvider, type Message, type UserLocation } from "../../types/chat";

export interface VoiceModeViewProps {
  chatId: string | null;
  aiName: string;
  provider: AiProvider;
  voiceSettings: VoiceSettings;
  theme?: string;
  userLocation?: UserLocation | null;
  onExit: () => void;
  onTurnComplete?: (userMsg: Message, assistantMsg: Message, chatId: string) => void;
  onCreateChat?: (firstMessage: string) => Promise<string>;
  onThemeChange?: (nextTheme: ThemeChoice) => void;
}

export function VoiceModeView({
  chatId,
  aiName,
  provider,
  voiceSettings,
  theme = "dazz",
  userLocation,
  onExit,
  onTurnComplete,
  onCreateChat,
  onThemeChange,
}: VoiceModeViewProps) {
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);

  const {
    status,
    transcript,
    interimTranscript,
    lastAssistantReply,
    error,
    muted,
    audioLevel,
    startListening,
    interrupt,
    toggleMute,
    sendManualPrompt,
  } = useVoiceAssistant({
    chatId,
    aiName,
    provider,
    voiceSettings,
    userLocation,
    soundEffectsEnabled,
    onTurnComplete,
    onCreateChat,
  });

  // On mount: Play Jarvis startup sound sweep and start listening automatically
  useEffect(() => {
    if (soundEffectsEnabled) {
      playJarvisStartupSweep();
    }
    const timer = setTimeout(() => {
      startListening();
    }, 400);

    return () => {
      clearTimeout(timer);
      if (soundEffectsEnabled) {
        playDeactivationChime();
      }
    };
  }, []);

  // Keyboard shortcut listener: Space/M = toggle mute, Esc = exit, Enter = quick send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === " " && status === "speaking") {
        e.preventDefault();
        interrupt();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interrupt, onExit, status, toggleMute]);

  const getStatusLabel = (s: VoiceAssistantStatus) => {
    switch (s) {
      case "listening":
        return `${aiName.toUpperCase()} // LISTENING TO VOCAL INPUT`;
      case "thinking":
        return `${aiName.toUpperCase()} // PROCESSING NEURAL QUERY...`;
      case "speaking":
        return `${aiName.toUpperCase()} // VOCAL SYNTHESIS ACTIVE`;
      default:
        return muted
          ? `${aiName.toUpperCase()} // MICROPHONE MUTED`
          : `${aiName.toUpperCase()} // STANDBY - READY`;
    }
  };

  return (
    <div className={`jarvis-voice-mode-root theme-${theme}`} data-theme={theme}>
      {/* Background Holographic Atmosphere */}
      <div className="jarvis-grid-backdrop" aria-hidden="true" />
      <div className="jarvis-radial-vignette" aria-hidden="true" />

      {/* Top HUD Telemetry Bar */}
      <header className="jarvis-hud-top">
        <div className="hud-corner-mark top-left" aria-hidden="true">
          <span className="hud-bracket" />
          <span className="hud-code">STARK IND. // NEURAL OS</span>
        </div>

        <div className="hud-center-title">
          <div className="hud-title-badge">
            <Radio size={14} className="hud-beacon-icon animate-pulse" />
            <span className="hud-title-text">{aiName} VOICE MODE</span>
            <span className="hud-provider-tag">{provider.toUpperCase()}</span>
          </div>
        </div>

        <div className="hud-corner-mark top-right">
          <div className="hud-actions-strip">
            {onThemeChange && (
              <div className="hud-theme-picker" title="Switch Voice Mode Theme">
                <Palette size={14} className="hud-theme-icon" />
                <select
                  value={theme}
                  onChange={(e) => onThemeChange(e.target.value as ThemeChoice)}
                  className="hud-theme-select"
                  aria-label="Select Voice Mode Theme"
                >
                  {themes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className={`hud-icon-btn ${soundEffectsEnabled ? "is-active" : ""}`}
              onClick={() => setSoundEffectsEnabled((prev) => !prev)}
              aria-label={soundEffectsEnabled ? "Mute interface chimes" : "Enable interface chimes"}
              title={soundEffectsEnabled ? "Sound chimes: ON" : "Sound chimes: OFF"}
            >
              {soundEffectsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              type="button"
              className="hud-exit-btn"
              onClick={onExit}
              aria-label="Exit Voice Mode (Esc)"
              title="Return to regular chat view (Esc)"
            >
              <X size={16} />
              <span>Exit Voice Mode</span>
              <kbd>Esc</kbd>
            </button>
          </div>
          <span className="hud-bracket" />
        </div>
      </header>

      {/* Center Stage: Iron Man Arc Reactor & Audio Waveform */}
      <main className="jarvis-center-stage">
        <div className="reactor-wrapper">
          <JarvisArcReactor
            status={status}
            audioLevel={audioLevel}
            aiName={aiName}
            theme={theme}
            onClick={() => {
              if (status === "speaking") {
                interrupt();
              } else if (status === "listening") {
                toggleMute();
              } else {
                startListening();
              }
            }}
          />
        </div>

        {/* Status Line */}
        <div className="jarvis-status-line">
          <span className={`status-led status-${status}`} />
          <h2 className="status-label">{getStatusLabel(status)}</h2>
        </div>

        {error && (
          <div className="jarvis-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Live Conversation Subtitle / Transcoding Glass Card */}
        <div className="jarvis-subtitle-card" aria-live="polite">
          {/* User Live Speech Transcription */}
          {(transcript || interimTranscript) && (
            <div className="subtitle-turn user-turn">
              <span className="turn-label">YOU</span>
              <p className="turn-text">
                {transcript}
                {interimTranscript && (
                  <span className="interim-text"> {interimTranscript}</span>
                )}
                <span className="hud-cursor" />
              </p>
            </div>
          )}

          {/* Assistant Live Reply */}
          {lastAssistantReply && (
            <div className="subtitle-turn assistant-turn">
              <span className="turn-label">{aiName.toUpperCase()}</span>
              <p className="turn-text">
                {lastAssistantReply}
                {status === "speaking" && <span className="hud-cursor" />}
              </p>
            </div>
          )}

          {/* Default Placeholder when waiting */}
          {!transcript && !interimTranscript && !lastAssistantReply && (
            <div className="subtitle-placeholder">
              <Sparkles size={16} className="placeholder-icon" />
              <span>
                {muted
                  ? "Microphone is muted. Tap below to speak."
                  : "Speak freely. Your voice is transcoded in real time."}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Floating Control Deck */}
      <footer className="jarvis-control-deck">
        <div className="hud-corner-mark bottom-left" aria-hidden="true">
          <span className="hud-bracket" />
          <span className="hud-code">FREQ: 44.1 kHz // DUAL BUFFER</span>
        </div>

        <div className="control-cluster">
          {/* Main Action / Interrupt Button */}
          {status === "speaking" ? (
            <button
              type="button"
              className="jarvis-pill-button btn-interrupt"
              onClick={interrupt}
              aria-label="Tap to interrupt AI and speak"
            >
              <Mic size={18} />
              <span>Tap to Interrupt</span>
              <kbd>Space</kbd>
            </button>
          ) : (
            <button
              type="button"
              className={`jarvis-pill-button btn-mic ${muted ? "is-muted" : "is-active"}`}
              onClick={toggleMute}
              aria-label={muted ? "Unmute microphone (M)" : "Mute microphone (M)"}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
              <span>{muted ? "Microphone Muted" : "Listening Active"}</span>
              <kbd>M</kbd>
            </button>
          )}

          {/* Quick Return Link */}
          <button
            type="button"
            className="jarvis-return-link"
            onClick={onExit}
            title="Switch back to text view"
          >
            <ChevronLeft size={16} />
            <span>Chat History</span>
          </button>
        </div>

        <div className="hud-corner-mark bottom-right" aria-hidden="true">
          <span className="hud-bracket" />
          <span className="hud-code">ENC: WEBAUDIO // LATENCY: LOW</span>
        </div>
      </footer>
    </div>
  );
}


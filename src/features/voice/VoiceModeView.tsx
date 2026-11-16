import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Radio,
  CornerDownLeft,
  Settings2,
} from "lucide-react";
import { JarvisArcReactor } from "./JarvisArcReactor";
import { useVoiceAssistant, type VoiceAssistantStatus } from "./useVoiceAssistant";
import { playJarvisStartupSweep, playDeactivationChime } from "./audioChime";
import type { VoiceSettings } from "../../lib/speechSynthesis";
import type { AiProvider, Message, UserLocation } from "../../types/chat";

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
}: VoiceModeViewProps) {
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to latest token / speech stream without requiring manual scrolling
  useEffect(() => {
    if (subtitleContainerRef.current) {
      subtitleContainerRef.current.scrollTo({
        top: subtitleContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [lastAssistantReply, transcript, interimTranscript]);

  // Moving the animator to the top zone is only needed when AI begins streaming back response text.
  // When text is transcribed and sending to the chatbot or thinking, the animator circle stays in the center (fig 2).
  const hasAiResponse = Boolean(lastAssistantReply && lastAssistantReply.trim().length > 0);
  const hasUserSpeech = Boolean(transcript || interimTranscript);
  const hasContent = hasAiResponse || hasUserSpeech;

  const totalContentLength = (
    (transcript || "") +
    " " +
    (interimTranscript || "") +
    " " +
    (lastAssistantReply || "")
  ).trim().length;

  const contentScale = !hasContent
    ? "empty"
    : totalContentLength < 100
      ? "short"
      : totalContentLength < 350
        ? "medium"
        : "expanded";

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
        <div className="hud-corner-mark top-left">
          <span className="hud-bracket" />
          <span className="hud-code hud-brand-stacked">
            <span className="brand-main">MZA</span>
            <span className="brand-sub">Corp</span>
          </span>
        </div>

        <div className="hud-corner-mark top-right">
          <div className="hud-actions-strip">
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
              title="Exit Voice Mode (Esc)"
              data-tooltip="Exit Voice Mode (Esc)"
            >
              <X size={18} />
            </button>
          </div>
          <span className="hud-bracket" />
        </div>
      </header>

      {/* Center Stage: Iron Man Arc Reactor & Audio Waveform */}
      <main className={`jarvis-center-stage ${hasAiResponse ? "has-content" : "is-new-chat"} ${hasUserSpeech ? "has-transcription" : ""}`}>
        {/* Fixed Hero Animator Section (~400px desktop, 330px mobile in center when new/transcribing) */}
        <div className={`reactor-fixed-section ${hasAiResponse ? "has-content" : "is-new-chat"}`}>
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
        </div>

        {/* Live Conversation Subtitle / Transcoding Text Stream (Without bg box, with scrollbar) */}
        <div
          ref={subtitleContainerRef}
          className={`jarvis-subtitle-card jarvis-speech-stream ${hasAiResponse ? "has-content" : "is-new-chat"} ${hasUserSpeech ? "has-transcription" : ""}`}
          aria-live="polite"
        >
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
        </div>

        <div className="hud-corner-mark bottom-right" aria-hidden="true">
          <span className="hud-bracket" />
          <span className="hud-code">ENC: WEBAUDIO // LATENCY: LOW</span>
        </div>
      </footer>
    </div>
  );
}


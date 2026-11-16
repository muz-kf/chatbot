import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ChevronDown,
  LogOut,
  Palette,
  Radio,
  Settings2,
  Sparkles,
  Type,
  User,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { ThemedScrollArea } from "../ui/ThemedScrollArea";
import {
  fonts,
  themes,
  type AiProvider,
  type FontChoice,
  type ThemeChoice,
  type UserProfile,
} from "../../types/chat";
import {
  getVoices,
  initVoicesListener,
  speakText,
  type VoiceSettings,
} from "../../lib/speechSynthesis";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  font: FontChoice;
  onFontChange: (font: FontChoice) => void;
  provider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
  defaultAiName: string;
  onDefaultAiNameChange: (name: string) => void;
  sendOnVoiceEnd: boolean;
  onSendOnVoiceEndChange: (enabled: boolean) => void;
  autoListenOnResponse: boolean;
  onAutoListenOnResponseChange: (enabled: boolean) => void;
  voiceSettings: VoiceSettings;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
  user: UserProfile | null;
  onSignOut: () => void;
}

type SettingsTab = "voice" | "appearance" | "ai" | "account";

export function SettingsDialog({
  open,
  onClose,
  theme,
  onThemeChange,
  font,
  onFontChange,
  provider,
  onProviderChange,
  defaultAiName,
  onDefaultAiNameChange,
  sendOnVoiceEnd,
  onSendOnVoiceEndChange,
  autoListenOnResponse,
  onAutoListenOnResponseChange,
  voiceSettings,
  onVoiceSettingsChange,
  user,
  onSignOut,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("voice");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const list = getVoices();
    if (list.length > 0) setAvailableVoices(list);
    initVoicesListener((voices) => setAvailableVoices(voices));
  }, []);

  // Keyboard shortcut listener: Escape key closes modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleTestVoice = () => {
    speakText(
      `Greetings! I am ${defaultAiName || "Assistant"}. Your audio preferences are configured.`,
      voiceSettings,
    );
  };

  if (!open) return null;

  return (
    <div
      className="settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden="true"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`settings-dialog-root theme-${theme}`}
        data-theme={theme}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="settings-dialog-header">
          <div className="settings-header-left">
            <div className="settings-header-icon-wrap">
              <Settings2 size={20} className="settings-header-icon" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="settings-dialog-title">
                Settings & Preferences
              </h2>
              <p className="settings-dialog-subtitle">
                Customize your AI persona, acoustic speech settings, and workspace theme
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-dialog-close-btn"
            onClick={onClose}
            aria-label="Close settings (Esc)"
            title="Close settings (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        {/* Dialog Layout: Tabs + Content */}
        <div className="settings-dialog-body">
          {/* Navigation Tabs */}
          <nav className="settings-tabs-sidebar" aria-label="Settings Categories">
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "voice" ? "is-active" : ""}`}
              onClick={() => setActiveTab("voice")}
            >
              <Volume2 size={16} />
              <span>Voice & Audio</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "appearance" ? "is-active" : ""}`}
              onClick={() => setActiveTab("appearance")}
            >
              <Palette size={16} />
              <span>Themes & Styling</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "ai" ? "is-active" : ""}`}
              onClick={() => setActiveTab("ai")}
            >
              <Bot size={16} />
              <span>AI & Model</span>
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === "account" ? "is-active" : ""}`}
              onClick={() => setActiveTab("account")}
            >
              <User size={16} />
              <span>Account & Profile</span>
            </button>
          </nav>

          {/* Main Tab Content Panel */}
          <div className="settings-tab-content">
            <ThemedScrollArea className="settings-scroll-area">
              <div className="settings-panel-inner">
                {/* 1. VOICE & AUDIO TAB */}
                {activeTab === "voice" && (
                  <div className="settings-section-group">
                    <div className="settings-section-head">
                      <h3>Voice Interaction & Acoustic Feedback</h3>
                      <p>Control hands-free mic listening, continuous speech flow, and voice synthesis</p>
                    </div>

                    {/* Auto-Listen on AI Response */}
                    <div className="settings-card-item">
                      <div className="setting-toggle-row">
                        <div className="setting-toggle-text">
                          <label htmlFor="auto-listen-toggle" className="setting-label-bold">
                            Auto-listen on response
                          </label>
                          <span className="setting-desc-text">
                            Automatically triggers microphone back when AI finishes speaking for seamless two-way conversation
                          </span>
                        </div>
                        <label
                          className={`voice-sender-switch ${autoListenOnResponse ? "is-checked" : ""}`}
                          htmlFor="auto-listen-toggle"
                        >
                          <input
                            type="checkbox"
                            id="auto-listen-toggle"
                            checked={autoListenOnResponse}
                            onChange={(e) => onAutoListenOnResponseChange(e.target.checked)}
                            className="voice-sender-checkbox"
                          />
                          <span className="voice-sender-knob" />
                        </label>
                      </div>
                    </div>

                    {/* Send on Voice Note */}
                    <div className="settings-card-item">
                      <div className="setting-toggle-row">
                        <div className="setting-toggle-text">
                          <label htmlFor="settings-voice-auto-send" className="setting-label-bold">
                            Send on voice note
                          </label>
                          <span className="setting-desc-text">
                            Auto-send transcribed voice message immediately when speech pause is detected
                          </span>
                        </div>
                        <label
                          className={`voice-sender-switch ${sendOnVoiceEnd ? "is-checked" : ""}`}
                          htmlFor="settings-voice-auto-send"
                        >
                          <input
                            type="checkbox"
                            id="settings-voice-auto-send"
                            checked={sendOnVoiceEnd}
                            onChange={(e) => onSendOnVoiceEndChange(e.target.checked)}
                            className="voice-sender-checkbox"
                          />
                          <span className="voice-sender-knob" />
                        </label>
                      </div>
                    </div>

                    {/* Read Aloud (TTS) */}
                    <div className="settings-card-item">
                      <div className="setting-toggle-row">
                        <div className="setting-toggle-text">
                          <label htmlFor="voice-speech-toggle" className="setting-label-bold">
                            Read aloud (Text-to-Speech)
                          </label>
                          <span className="setting-desc-text">
                            Stream voice vocalization back in real-time as words appear on screen
                          </span>
                        </div>
                        <label
                          className={`voice-sender-switch ${voiceSettings.enabled ? "is-checked" : ""}`}
                          htmlFor="voice-speech-toggle"
                        >
                          <input
                            type="checkbox"
                            id="voice-speech-toggle"
                            checked={voiceSettings.enabled}
                            onChange={(e) =>
                              onVoiceSettingsChange({ ...voiceSettings, enabled: e.target.checked })
                            }
                            className="voice-sender-checkbox"
                          />
                          <span className="voice-sender-knob" />
                        </label>
                      </div>

                      {voiceSettings.enabled && (
                        <div className="settings-nested-controls">
                          {/* Voice Persona Picker */}
                          <div className="settings-field">
                            <label htmlFor="voice-choice" className="setting-label-bold">
                              Voice Persona
                            </label>
                            <div className="setting-select-wrap">
                              <select
                                id="voice-choice"
                                className="setting-select"
                                value={voiceSettings.voiceName}
                                onChange={(e) =>
                                  onVoiceSettingsChange({ ...voiceSettings, voiceName: e.target.value })
                                }
                              >
                                <option value="">Browser Default Voice</option>
                                {availableVoices.map((v) => (
                                  <option key={v.name} value={v.name}>
                                    {v.name} ({v.lang})
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={14} aria-hidden="true" />
                            </div>
                          </div>

                          {/* Speech Speed Range */}
                          <div className="settings-field">
                            <div className="voice-rate-header">
                              <label htmlFor="voice-rate" className="setting-label-bold">
                                Speed ({voiceSettings.rate.toFixed(1)}x)
                              </label>
                              <button
                                type="button"
                                className="test-voice-btn"
                                onClick={handleTestVoice}
                                title="Preview voice synthesis"
                              >
                                <Volume2 size={13} /> Test Voice
                              </button>
                            </div>
                            <input
                              id="voice-rate"
                              type="range"
                              min="0.7"
                              max="1.5"
                              step="0.1"
                              value={voiceSettings.rate}
                              onChange={(e) =>
                                onVoiceSettingsChange({
                                  ...voiceSettings,
                                  rate: parseFloat(e.target.value),
                                })
                              }
                              className="setting-range-slider"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. APPEARANCE & THEMES TAB */}
                {activeTab === "appearance" && (
                  <div className="settings-section-group">
                    <div className="settings-section-head">
                      <h3>Theme Selection (12 Holographic Styles)</h3>
                      <p>Select your preferred ambient lighting, Arc Reactor accents, and window styling</p>
                    </div>

                    <div className="theme-grid-selector" role="radiogroup" aria-label="Select Theme">
                      {themes.map(({ value, label }) => {
                        const isSelected = theme === value;
                        return (
                          <button
                            type="button"
                            key={value}
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => onThemeChange(value)}
                            className={`theme-card-option theme-card-${value} ${isSelected ? "is-selected" : ""}`}
                          >
                            <div className="theme-card-preview">
                              <span className={`theme-swatch theme-swatch-${value}`} />
                              {isSelected && <Check size={14} className="theme-card-check" />}
                            </div>
                            <span className="theme-card-label">{label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="settings-section-head mt-8">
                      <h3>Interface Typography</h3>
                      <p>Choose an editorial font suited to your reading preference</p>
                    </div>

                    <div className="settings-field">
                      <label htmlFor="font-choice" className="setting-label-bold">Interface Font</label>
                      <div className="setting-select-wrap">
                        <select
                          id="font-choice"
                          className="setting-select"
                          value={font}
                          onChange={(e) => onFontChange(e.target.value as FontChoice)}
                        >
                          {fonts.map((fontName) => (
                            <option key={fontName} value={fontName}>
                              {fontName}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. AI & MODEL TAB */}
                {activeTab === "ai" && (
                  <div className="settings-section-group">
                    <div className="settings-section-head">
                      <h3>AI Engine & Persona Defaults</h3>
                      <p>Configure which LLM provider powers the reasoning core and default identifier</p>
                    </div>

                    {/* Provider Selection */}
                    <div className="provider-grid">
                      <button
                        type="button"
                        className={`provider-card ${provider === "groq" ? "is-selected" : ""}`}
                        onClick={() => onProviderChange("groq")}
                      >
                        <div className="provider-card-head">
                          <span className="provider-badge-fast">Ultra-Fast</span>
                          {provider === "groq" && <Check size={16} className="provider-check" />}
                        </div>
                        <h4 className="provider-name">Groq Llama 3.3</h4>
                        <p className="provider-desc">
                          Sub-second latency token streaming. Recommended for real-time Voice Mode and instant responses.
                        </p>
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${provider === "openrouter" ? "is-selected" : ""}`}
                        onClick={() => onProviderChange("openrouter")}
                      >
                        <div className="provider-card-head">
                          <span className="provider-badge-alt">Mistral Free</span>
                          {provider === "openrouter" && <Check size={16} className="provider-check" />}
                        </div>
                        <h4 className="provider-name">OpenRouter</h4>
                        <p className="provider-desc">
                          Free-tier community models including Mistral 7B. Ideal backup provider for flexible chat.
                        </p>
                      </button>
                    </div>

                    {/* Default AI Persona Name */}
                    <div className="settings-card-item mt-6">
                      <div className="settings-field">
                        <label htmlFor="default-ai-name" className="setting-label-bold">
                          Default Assistant Name
                        </label>
                        <span className="setting-desc-text block mb-2">
                          Default persona name for new chats (e.g. DAZZ, Jarvis). You can also tell the AI "From now on call yourself &lt;name&gt;" in any chat to name it dynamically.
                        </span>
                        <input
                          id="default-ai-name"
                          type="text"
                          className="setting-text-input"
                          value={defaultAiName}
                          onChange={(e) => onDefaultAiNameChange(e.target.value)}
                          placeholder="e.g. DAZZ, Jarvis, Nova"
                          maxLength={30}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ACCOUNT & PROFILE TAB */}
                {activeTab === "account" && (
                  <div className="settings-section-group">
                    <div className="settings-section-head">
                      <h3>User Profile & Session</h3>
                      <p>Your authentication identity and local session credentials</p>
                    </div>

                    {user ? (
                      <div className="settings-card-item profile-info-card">
                        <div className="profile-card-header">
                          <div className="profile-card-avatar">
                            {user.name.trim().slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="profile-card-name">{user.name}</h4>
                            <p className="profile-card-email">{user.email}</p>
                            {user.dateOfBirth && (
                              <p className="profile-card-dob">Date of Birth: {user.dateOfBirth}</p>
                            )}
                          </div>
                        </div>

                        <div className="profile-card-actions">
                          <Button
                            variant="outline"
                            className="sign-out-dialog-btn"
                            onClick={() => {
                              onClose();
                              onSignOut();
                            }}
                          >
                            <LogOut size={15} />
                            <span>Sign out of session</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="settings-card-item">
                        <p>No active authenticated session detected.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ThemedScrollArea>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

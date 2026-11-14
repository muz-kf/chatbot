import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Settings2,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { ThemedScrollArea } from "../ui/ThemedScrollArea";
import { DazzMark } from "./DazzMark";
import {
  fonts,
  themes,
  type AiProvider,
  type ChatSummary,
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

type ChatSidebarProps = {
  open: boolean;
  settingsOpen: boolean;
  font: FontChoice;
  theme: ThemeChoice;
  chats: ChatSummary[];
  activeChatId: string | null;
  user: UserProfile;
  sendOnVoiceEnd: boolean;
  autoListenOnResponse: boolean;
  provider: AiProvider;
  defaultAiName: string;
  voiceSettings: VoiceSettings;
  onSendOnVoiceEndChange: (enabled: boolean) => void;
  onAutoListenOnResponseChange: (enabled: boolean) => void;
  onProviderChange: (provider: AiProvider) => void;
  onDefaultAiNameChange: (name: string) => void;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSignOut: () => void;
  onToggleSettings: () => void;
  onFontChange: (font: FontChoice) => void;
  onThemeChange: (theme: ThemeChoice) => void;
};

export function ChatSidebar({
  open,
  settingsOpen,
  font,
  theme,
  chats,
  activeChatId,
  user,
  sendOnVoiceEnd,
  autoListenOnResponse,
  provider,
  defaultAiName,
  voiceSettings,
  onSendOnVoiceEndChange,
  onAutoListenOnResponseChange,
  onProviderChange,
  onDefaultAiNameChange,
  onVoiceSettingsChange,
  onClose,
  onNewChat,
  onSelectChat,
  onSignOut,
  onToggleSettings,
  onFontChange,
  onThemeChange,
}: ChatSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    const list = getVoices();
    if (list.length > 0) setAvailableVoices(list);
    initVoicesListener((voices) => setAvailableVoices(voices));
  }, []);

  const handleTestVoice = () => {
    speakText(
      `Hello! I am ${defaultAiName || "Assistant"}. How does my voice sound?`,
      voiceSettings,
    );
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close sidebar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sidebar-scrim"
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <aside
        ref={sidebarRef}
        className={`sidebar-glass ${open ? "sidebar-open" : ""}`}
        aria-hidden={!open}
      >
        <div className="sidebar-brand">
          <a href="#" className="brand-lockup" aria-label="Home">
            <span className="brand-mark"><DazzMark /></span>
            <span>DAZZ<span className="brand-period">.</span></span>
          </a>
          <Button variant="ghost" size="icon" className="sidebar-close" aria-label="Close sidebar" onClick={onClose}>
            <X size={18} className="mobile-only" />
            <PanelLeftClose size={18} className="desktop-only" />
          </Button>
        </div>

        <Button variant="outline" className="new-chat-button" onClick={onNewChat}>
          <Plus size={16} />
          <span>New conversation</span>
        </Button>

        <div className="sidebar-section-label">YOUR SPACE</div>
        <ThemedScrollArea className="conversation-list" aria-label="Saved conversations">
          {chats.length === 0 ? (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><Sparkles size={17} /></div>
              <p>A little room to think</p>
              <span>Your conversations will appear here.</span>
            </div>
          ) : chats.map((chat) => (
            <button
              type="button"
              className={`conversation-item ${activeChatId === chat.id ? "is-active" : ""}`}
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              title={chat.title}
            >
              <MessageSquare size={15} className="conversation-item-icon shrink-0" />
              <span className="conversation-item-title">{chat.title}</span>
            </button>
          ))}
        </ThemedScrollArea>

        <div className="sidebar-voice-option">
          <label className="voice-sender-toggle" htmlFor="voice-auto-send">
            <input
              type="checkbox"
              id="voice-auto-send"
              checked={sendOnVoiceEnd}
              onChange={(e) => onSendOnVoiceEndChange(e.target.checked)}
              className="voice-sender-checkbox"
            />
            <span className="voice-sender-info">
              <span className="voice-sender-label">Send on voice sender</span>
              <span className="voice-sender-sub">Auto-send transcript on finish</span>
            </span>
            <span className={`voice-sender-switch ${sendOnVoiceEnd ? "is-checked" : ""}`} aria-hidden="true">
              <span className="voice-sender-knob" />
            </span>
          </label>
        </div>

        <div className="sidebar-settings">
          <Button
            variant="ghost"
            className="settings-toggle"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <span className="settings-toggle-label">
              <Settings2 size={16} />
              <span>Settings</span>
            </span>
            <ChevronDown
              size={15}
              className={`settings-chevron ${settingsOpen ? "is-expanded" : ""}`}
              aria-hidden="true"
            />
          </Button>
          <AnimatePresence initial={false}>
            {settingsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="settings-content"
              >
                {/* AI Provider Switch */}
                <div className="settings-field">
                  <label htmlFor="provider-choice">AI Provider</label>
                  <div className="setting-select-wrap">
                    <select
                      id="provider-choice"
                      className="setting-select"
                      value={provider}
                      onChange={(event) => onProviderChange(event.target.value as AiProvider)}
                    >
                      <option value="groq">Groq (Ultra-Fast / Llama 3.3)</option>
                      <option value="openrouter">OpenRouter (Free Tier / Mistral)</option>
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </div>
                </div>

                {/* Default AI Persona Name */}
                <div className="settings-field">
                  <label htmlFor="default-ai-name">Default AI Persona Name</label>
                  <input
                    id="default-ai-name"
                    type="text"
                    className="setting-text-input"
                    value={defaultAiName}
                    onChange={(event) => onDefaultAiNameChange(event.target.value)}
                    placeholder="e.g. Jarvis, Nova, Assistant"
                    maxLength={30}
                  />
                </div>

                {/* Theme & Font */}
                <div className="settings-field">
                  <label htmlFor="font-choice">Interface font</label>
                  <div className="setting-select-wrap">
                    <select
                      id="font-choice"
                      className="setting-select"
                      value={font}
                      onChange={(event) => onFontChange(event.target.value as FontChoice)}
                    >
                      {fonts.map((fontName) => (
                        <option key={fontName} value={fontName}>{fontName}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} aria-hidden="true" />
                  </div>
                </div>
                <div className="settings-field">
                  <label htmlFor="theme-choice">Theme</label>
                  <div className="setting-select-wrap">
                    <select
                      id="theme-choice"
                      className="setting-select theme-choice-select"
                      value={theme}
                      onChange={(event) => onThemeChange(event.target.value as ThemeChoice)}
                    >
                      {themes.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <span className={`theme-swatch theme-swatch-${theme}`} aria-hidden="true" />
                    <ChevronDown size={14} aria-hidden="true" />
                  </div>
                </div>

                {/* Voice Customization */}
                <div className="settings-field voice-settings-field">
                  <div className="setting-toggle-row">
                    <label htmlFor="voice-speech-toggle" className="setting-toggle-text">
                      <span className="font-medium text-xs">Read aloud (TTS)</span>
                      <small className="block opacity-70 text-[10px]">Speak AI responses automatically</small>
                    </label>
                    <label className={`voice-sender-switch ${voiceSettings.enabled ? "is-checked" : ""}`} htmlFor="voice-speech-toggle">
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
                </div>

                {/* Auto-listen after response */}
                <div className="settings-field voice-settings-field">
                  <div className="setting-toggle-row">
                    <label htmlFor="auto-listen-toggle" className="setting-toggle-text">
                      <span className="font-medium text-xs">Auto-listen on response</span>
                      <small className="block opacity-70 text-[10px]">Trigger microphone back when AI finishes (with voice sender)</small>
                    </label>
                    <label className={`voice-sender-switch ${autoListenOnResponse ? "is-checked" : ""}`} htmlFor="auto-listen-toggle">
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

                {voiceSettings.enabled && (
                  <>
                    <div className="settings-field">
                      <label htmlFor="voice-choice">Voice persona</label>
                      <div className="setting-select-wrap">
                        <select
                          id="voice-choice"
                          className="setting-select"
                          value={voiceSettings.voiceName}
                          onChange={(e) =>
                            onVoiceSettingsChange({ ...voiceSettings, voiceName: e.target.value })
                          }
                        >
                          <option value="">Browser Default</option>
                          {availableVoices.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} aria-hidden="true" />
                      </div>
                    </div>

                    <div className="settings-field">
                      <div className="voice-rate-header">
                        <label htmlFor="voice-rate">Speed ({voiceSettings.rate.toFixed(1)}x)</label>
                        <button
                          type="button"
                          className="test-voice-btn"
                          onClick={handleTestVoice}
                          title="Preview selected voice"
                        >
                          <Volume2 size={12} /> Test
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
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="sidebar-profile">
          <span className="profile-avatar">{user.name.trim().slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
          <Button
            variant="ghost"
            size="icon"
            className="sign-out-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={onSignOut}
          >
            <LogOut size={16} />
          </Button>
        </div>
      </aside>
    </>
  );
}

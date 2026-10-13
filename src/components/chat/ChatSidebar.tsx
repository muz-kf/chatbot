import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, MessageSquare, PanelLeftClose, Plus, Settings2, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import { DazzMark } from "./DazzMark";
import { VoiceToTextWidget } from "./VoiceToTextWidget";
import {
  fonts,
  themes,
  type ChatSummary,
  type FontChoice,
  type ThemeChoice,
  type UserProfile,
} from "../../types/chat";

type ChatSidebarProps = {
  open: boolean;
  settingsOpen: boolean;
  font: FontChoice;
  theme: ThemeChoice;
  chats: ChatSummary[];
  activeChatId: string | null;
  user: UserProfile;
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
  onClose,
  onNewChat,
  onSelectChat,
  onSignOut,
  onToggleSettings,
  onFontChange,
  onThemeChange,
}: ChatSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (sidebarRef.current) sidebarRef.current.inert = !open;
  }, [open]);

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
          <a href="#" className="brand-lockup" aria-label="DAZZ home">
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
          <kbd>⌘ K</kbd>
        </Button>

        <div className="sidebar-section-label">YOUR SPACE</div>
        <VoiceToTextWidget />
        <div className="conversation-list" aria-label="Saved conversations">
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
              <MessageSquare size={14} />
              <span>{chat.title}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-settings">
          <Button
            variant="ghost"
            className="settings-toggle"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <Settings2 size={16} />
            Settings
          </Button>
          <AnimatePresence initial={false}>
            {settingsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="settings-content"
              >
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
            <LogOut size={15} />
          </Button>
        </div>
      </aside>
    </>
  );
}

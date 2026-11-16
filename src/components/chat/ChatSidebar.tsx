import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LogOut,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Radio,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { ThemedScrollArea } from "../ui/ThemedScrollArea";
import { DazzMark } from "./DazzMark";
import type {
  ChatSummary,
  UserProfile,
} from "../../types/chat";

type ChatSidebarProps = {
  open: boolean;
  chats: ChatSummary[];
  activeChatId: string | null;
  user: UserProfile;
  sendOnVoiceEnd: boolean;
  onSendOnVoiceEndChange: (enabled: boolean) => void;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSignOut: () => void;
  onToggleSettings: () => void;
  onOpenVoiceMode?: () => void;
  [key: string]: any;
};

export function ChatSidebar({
  open,
  chats,
  activeChatId,
  user,
  sendOnVoiceEnd,
  onSendOnVoiceEndChange,
  onClose,
  onNewChat,
  onSelectChat,
  onSignOut,
  onToggleSettings,
  onOpenVoiceMode,
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

        {onOpenVoiceMode && (
          <Button
            variant="outline"
            className="new-chat-button voice-mode-launch-btn"
            onClick={onOpenVoiceMode}
            title="Launch Voice Mode (Jarvis Iron Man HUD)"
          >
            <Radio size={15} className="voice-launch-icon" />
            <span>Launch Voice Mode</span>
          </Button>
        )}

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
              <span className="voice-sender-label">Send on voice note</span>
              <span className="voice-sender-sub">Auto-send transcript on pause</span>
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
            aria-label="Open settings"
            onClick={onToggleSettings}
          >
            <span className="settings-toggle-label">
              <Settings2 size={16} />
              <span>Settings</span>
            </span>
          </Button>
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

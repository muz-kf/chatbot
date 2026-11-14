import { ArrowDown, PanelLeftClose, PanelLeftOpen, Radio } from "lucide-react";
import { Button } from "../ui/button";
import { DazzMark } from "./DazzMark";
import type { AiProvider } from "../../types/chat";

type ChatHeaderProps = {
  sidebarOpen: boolean;
  aiName: string;
  provider: AiProvider;
  onToggleSidebar: () => void;
  onScrollLatest: () => void;
  onOpenVoiceMode?: () => void;
};

export function ChatHeader({
  sidebarOpen,
  aiName,
  provider,
  onToggleSidebar,
  onScrollLatest,
  onOpenVoiceMode,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="header-leading">
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-toggle desktop-only"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
        </Button>
        <button
          type="button"
          className="header-identity header-identity-btn header-ai-badge"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Close sidebar menu" : "Open sidebar menu"}
          title="Toggle sidebar menu"
        >
          <span className="header-logo"><DazzMark /></span>
          <div>
            <h1 className="header-ai-name">{aiName}</h1>
          </div>
        </button>
      </div>
      <div className="header-trailing">
        {onOpenVoiceMode && (
          <Button
            variant="outline"
            className="header-voice-mode-btn"
            aria-label="Enter Voice Mode"
            title="Enter Voice Mode (Hands-free voice assistant)"
            onClick={onOpenVoiceMode}
          >
            <Radio size={13} className="header-voice-icon" />
            <span>Voice Mode</span>
          </Button>
        )}
        <span className="model-pill">
          <span /> {aiName} · {provider === "groq" ? "Groq" : "OpenRouter"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="scroll-latest"
          aria-label="Scroll to latest"
          onClick={onScrollLatest}
        >
          <ArrowDown size={17} />
        </Button>
      </div>
    </header>
  );
}

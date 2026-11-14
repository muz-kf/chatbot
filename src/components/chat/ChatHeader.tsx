import { useState, useEffect, type FormEvent } from "react";
import { ArrowDown, PanelLeftClose, PanelLeftOpen, Pencil } from "lucide-react";
import { Button } from "../ui/button";
import { DazzMark } from "./DazzMark";
import type { AiProvider } from "../../types/chat";

type ChatHeaderProps = {
  sidebarOpen: boolean;
  aiName: string;
  provider: AiProvider;
  onToggleSidebar: () => void;
  onScrollLatest: () => void;
  onRenameAi?: (newName: string) => void;
};

export function ChatHeader({
  sidebarOpen,
  aiName,
  provider,
  onToggleSidebar,
  onScrollLatest,
  onRenameAi,
}: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(aiName);

  useEffect(() => {
    setTempName(aiName);
  }, [aiName]);

  const handleSave = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = tempName.trim();
    if (trimmed && onRenameAi) {
      onRenameAi(trimmed);
    } else {
      setTempName(aiName);
    }
    setIsEditing(false);
  };

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
        <div className="header-identity">
          <button
            type="button"
            className="header-identity-btn"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Close sidebar menu" : "Open sidebar menu"}
            title="Toggle sidebar menu"
          >
            <span className="header-logo"><DazzMark /></span>
          </button>

          {isEditing ? (
            <form onSubmit={handleSave} className="ai-name-form">
              <input
                type="text"
                className="ai-name-input"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => handleSave()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setTempName(aiName);
                    setIsEditing(false);
                  }
                }}
                autoFocus
                maxLength={30}
                placeholder="Name your AI..."
              />
            </form>
          ) : (
            <div
              className="header-ai-badge"
              onClick={() => setIsEditing(true)}
              title="Click to rename AI for this chat"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditing(true);
              }}
            >
              <h1>{aiName}</h1>
              <Pencil size={11} className="ai-rename-pencil" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
      <div className="header-trailing">
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

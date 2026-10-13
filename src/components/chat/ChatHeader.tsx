import { ArrowDown, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "../ui/button";
import { DazzMark } from "./DazzMark";

type ChatHeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onScrollLatest: () => void;
};

export function ChatHeader({ sidebarOpen, onToggleSidebar, onScrollLatest }: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="header-leading">
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-toggle"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <Menu size={19} className="mobile-only" />
          {sidebarOpen ? <PanelLeftClose size={19} className="desktop-only" /> : <PanelLeftOpen size={19} className="desktop-only" />}
        </Button>
        <div className="header-identity">
          <span className="header-logo"><DazzMark /></span>
          <div><h1>DAZZ</h1><p><span className="status-dot" />Your AI companion</p></div>
        </div>
      </div>
      <div className="header-trailing">
        <span className="model-pill"><span /> DAZZ · Smart</span>
        <Button variant="ghost" size="icon" className="scroll-latest" aria-label="Scroll to latest" onClick={onScrollLatest}>
          <ArrowDown size={17} />
        </Button>
      </div>
    </header>
  );
}

import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { ArrowUp, CircleStop, Paperclip, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type ChatComposerProps = {
  value: string;
  error: string;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
};

export function ChatComposer({
  value,
  error,
  streaming,
  textareaRef,
  onChange,
  onSubmit,
  onKeyDown,
  onStop,
}: ChatComposerProps) {
  return (
    <div className="composer-area">
      {error && <div className="chat-error" role="alert">{error}</div>}
      <form onSubmit={onSubmit} className="composer-glass">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message DAZZ..."
          maxLength={12_000}
          rows={1}
          disabled={streaming}
          aria-label="Message DAZZ"
          className="composer-input"
        />
        <div className="composer-footer">
          <div className="composer-tools">
            <button type="button" className="composer-tool" aria-label="Attachments are coming soon" title="Attachments coming soon">
              <Paperclip size={16} />
            </button>
            <span className="composer-hint">AI can make mistakes. Check important details.</span>
          </div>
          {streaming ? (
            <Button size="icon" aria-label="Stop response" onClick={onStop} className="send-button stop-button">
              <CircleStop size={17} />
            </Button>
          ) : (
            <Button
              size="icon"
              type="submit"
              disabled={!value.trim()}
              aria-label="Send message"
              className="send-button"
            >
              {value.trim() ? <ArrowUp size={18} strokeWidth={2.4} /> : <Sparkles size={16} />}
            </Button>
          )}
        </div>
      </form>
      <p className="keyboard-hint"><kbd>Enter</kbd> to send <span>·</span> <kbd>Shift + Enter</kbd> for a new line</p>
    </div>
  );
}

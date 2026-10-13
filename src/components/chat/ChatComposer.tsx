import { useRef, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, CircleStop, FileText, Mic, Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import type { ChatAttachment } from "../../types/chat";

type ChatComposerProps = {
  value: string;
  error: string;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  attachments: ChatAttachment[];
  recording: boolean;
  recordingTranscript: string;
  onChange: (value: string) => void;
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
  onRecord: () => void;
};

export function ChatComposer({
  value,
  error,
  streaming,
  textareaRef,
  attachments,
  recording,
  recordingTranscript,
  onChange,
  onFiles,
  onRemoveAttachment,
  onSubmit,
  onKeyDown,
  onStop,
  onRecord,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="composer-area">
      {error && <div className="chat-error" role="alert">{error}</div>}
      {recordingTranscript && <div className="recording-transcript" aria-live="polite">{recordingTranscript}</div>}
      <form onSubmit={onSubmit} className="composer-glass">
        {attachments.length > 0 && (
          <div className="attachment-list" aria-label="Attached files">
            {attachments.map((attachment) => (
              <div className="attachment-chip" key={attachment.id}>
                {attachment.mimeType.startsWith("image/") && attachment.data ? (
                  <img
                    className="attachment-thumbnail"
                    src={`data:${attachment.mimeType};base64,${attachment.data}`}
                    alt=""
                  />
                ) : <FileText size={15} />}
                <span className="attachment-chip-name" title={attachment.name}>{attachment.name}</span>
                {attachment.transcript && <span className="attachment-chip-note">voice</span>}
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  className="attachment-remove"
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
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
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept="image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json,.docx,audio/*,video/*"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) onFiles(files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="composer-tool"
              aria-label="Attach files"
              title="Attach images, documents, audio, or video"
              disabled={streaming}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </button>
            <button
              type="button"
              className={`composer-tool record-tool ${recording ? "is-recording" : ""}`}
              aria-label={recording ? "Stop voice recording" : "Record voice message"}
              title={recording ? "Stop and send voice message" : "Record a voice message"}
              disabled={streaming}
              onClick={onRecord}
            >
              {recording ? <CircleStop size={16} /> : <Mic size={16} />}
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
              disabled={!value.trim() && attachments.length === 0}
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

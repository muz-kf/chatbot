import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUp, CircleStop, FileText, Mic, MicOff, Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import type { ChatAttachment } from "../../types/chat";
import { createSpeechRecognition } from "../../lib/speechRecognition";

type ChatComposerProps = {
  value: string;
  error: string;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  attachments: ChatAttachment[];
  recording?: boolean;
  recordingTranscript?: string;
  sendOnVoiceEnd?: boolean;
  onDismissError?: () => void;
  onChange: (value: string) => void;
  onFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onStop: () => void;
  onRecord?: () => void;
};

export function ChatComposer({
  value,
  error,
  streaming,
  textareaRef,
  attachments,
  sendOnVoiceEnd = false,
  onDismissError,
  onChange,
  onFiles,
  onRemoveAttachment,
  onSubmit,
  onKeyDown,
  onStop,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

  // Keep a ref to latest value for speech recognition callbacks
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function triggerAutoSend() {
    if (streaming) return;
    const currentText = valueRef.current.trim();
    if (currentText || attachments.length > 0) {
      onSubmit({ preventDefault: () => {} } as FormEvent<HTMLFormElement>);
    }
  }

  function stopListening(autoSubmit = false) {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
    if (autoSubmit && sendOnVoiceEnd) {
      requestAnimationFrame(() => {
        triggerAutoSend();
      });
    }
  }

  function toggleListening() {
    if (listening) {
      stopListening(true);
      return;
    }

    setVoiceError("");
    setInterimText("");

    try {
      const recognition = createSpeechRecognition(
        (finalText, interim) => {
          if (finalText) {
            const current = valueRef.current;
            const updated = current
              ? `${current.trimEnd()} ${finalText.trim()}`
              : finalText.trim();
            onChange(updated);
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }
          setInterimText(interim);
        },
        (errorMessage) => {
          setVoiceError(errorMessage);
          stopListening(false);
        },
        () => {
          setListening(false);
          setInterimText("");
          if (sendOnVoiceEnd) {
            requestAnimationFrame(() => {
              triggerAutoSend();
            });
          }
        },
      );
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? err.message
          : "Live voice recognition is not available in this browser. Try Chrome, Edge, or Safari.",
      );
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (listening) {
      stopListening(false);
    }
    onSubmit(event);
  }

  return (
    <div className="composer-area">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="chat-error-card"
            role="alert"
          >
            <div className="chat-error-badge" aria-hidden="true">
              <AlertTriangle size={15} />
            </div>
            <div className="chat-error-body">
              <div className="chat-error-title-row">
                <span className="chat-error-title">Server Error</span>
                {onDismissError && (
                  <button
                    type="button"
                    className="chat-error-close"
                    onClick={onDismissError}
                    aria-label="Dismiss error"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="chat-error-desc">{error}</div>
            </div>
          </motion.div>
        )}
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="chat-error-card voice-error-card"
            role="alert"
          >
            <div className="chat-error-badge" aria-hidden="true">
              <MicOff size={15} />
            </div>
            <div className="chat-error-body">
              <div className="chat-error-title-row">
                <span className="chat-error-title">Voice Recognition Notice</span>
                <button
                  type="button"
                  className="chat-error-close"
                  onClick={() => setVoiceError("")}
                  aria-label="Dismiss voice notice"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="chat-error-desc">{voiceError}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleFormSubmit} className={`composer-glass ${listening ? "is-listening" : ""}`}>
        {/* Live Voice-to-Text Recognition Preview Banner */}
        {listening && (
          <div className="voice-dictation-banner" aria-live="polite">
            <div className="dictation-header">
              <div className="dictation-indicator">
                <span className="dictation-dot" />
                <span className="dictation-label">Live Voice Recognition</span>
              </div>
              <button
                type="button"
                className="dictation-done-btn"
                onClick={() => stopListening(true)}
                aria-label="Stop voice recognition"
              >
                Done
              </button>
            </div>
            <p className="dictation-text">
              {interimText ? (
                <span className="dictation-active">"{interimText}"</span>
              ) : (
                <span className="dictation-placeholder">Speak now — words will appear directly here...</span>
              )}
            </p>
          </div>
        )}

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
          placeholder={listening ? "Listening... speak now..." : "Message DAZZ..."}
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

            {/* Voice to text in the chat box */}
            <button
              type="button"
              className={`composer-tool voice-tool ${listening ? "is-listening" : ""}`}
              aria-label={listening ? "Stop voice to text" : "Voice to text recognition"}
              title={listening ? "Stop voice recognition" : "Voice to text (speak to write)"}
              disabled={streaming}
              onClick={toggleListening}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
              {listening && <span className="mic-pulse-ring" />}
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
    </div>
  );
}

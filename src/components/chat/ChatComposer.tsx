import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, CircleStop, FileText, Loader2, Mic, MicOff, Paperclip, Sparkles, X } from "lucide-react";
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
  showScrollBottom?: boolean;
  onScrollBottom?: () => void;
  onSendText?: (text: string) => void;
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
  sendOnVoiceEnd = true,
  showScrollBottom = false,
  onScrollBottom,
  onSendText,
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
  const [isFinishing, setIsFinishing] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

  const accumulatedTextRef = useRef("");
  const interimTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const isSendingRef = useRef(false);

  // Keep a ref to latest value for speech recognition callbacks
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      recognitionRef.current?.abort();
    };
  }, []);

  function completeVoiceNoteAndSend() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore if already stopped
    }
    recognitionRef.current = null;
    setListening(false);
    setIsFinishing(false);

    let fullText = accumulatedTextRef.current.trim();
    const pendingInterim = interimTextRef.current.trim();
    if (pendingInterim && !fullText.endsWith(pendingInterim)) {
      fullText = fullText ? `${fullText} ${pendingInterim}` : pendingInterim;
    }

    setInterimText("");
    interimTextRef.current = "";

    if (sendOnVoiceEnd && fullText) {
      if (isSendingRef.current || streaming) return;
      isSendingRef.current = true;
      hasSpokenRef.current = false;

      // Clear the composer input immediately so previous voice transcript never lingers
      accumulatedTextRef.current = "";
      valueRef.current = "";
      onChange("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }

      if (onSendText) {
        onSendText(fullText);
      } else {
        onSubmit({ preventDefault: () => {} } as FormEvent<HTMLFormElement>);
      }

      setTimeout(() => {
        isSendingRef.current = false;
      }, 600);
    } else {
      // Manual mode: retain the transcript in the input box for user editing/review
      accumulatedTextRef.current = fullText;
      onChange(fullText);
    }
  }

  function toggleListening() {
    if (listening) {
      completeVoiceNoteAndSend();
      return;
    }

    setVoiceError("");
    setInterimText("");
    setIsFinishing(false);
    accumulatedTextRef.current = valueRef.current.trim();
    interimTextRef.current = "";
    hasSpokenRef.current = false;
    isSendingRef.current = false;

    try {
      const recognition = createSpeechRecognition(
        (finalText, interim) => {
          if (finalText) {
            hasSpokenRef.current = true;
            const current = accumulatedTextRef.current;
            const updated = current
              ? `${current.trimEnd()} ${finalText.trim()}`
              : finalText.trim();
            accumulatedTextRef.current = updated;
            onChange(updated);
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }

          if (interim) {
            hasSpokenRef.current = true;
          }
          interimTextRef.current = interim;
          setInterimText(interim);

          // Reset silence timer and finish state on every incoming speech chunk
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
            setIsFinishing(false);
          }

          // When user speaks and sendOnVoiceEnd is enabled:
          // Immediately show loading indicator on the send button during the 1.5s silence delay
          if (hasSpokenRef.current && sendOnVoiceEnd) {
            setIsFinishing(true);
            silenceTimerRef.current = setTimeout(() => {
              completeVoiceNoteAndSend();
            }, 1500);
          }
        },
        (errorMessage) => {
          setVoiceError(errorMessage);
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          try {
            recognitionRef.current?.stop();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
          setListening(false);
          setIsFinishing(false);
        },
        () => {
          // Trigger send on speech end if user spoke something
          if (hasSpokenRef.current && sendOnVoiceEnd) {
            completeVoiceNoteAndSend();
          } else {
            setListening(false);
            setIsFinishing(false);
            setInterimText("");
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
      completeVoiceNoteAndSend();
    }
    onSubmit(event);
  }

  return (
    <div className="composer-area">
      {/* Floating scroll to bottom button (ChatGPT Reference Layout) */}
      <AnimatePresence>
        {showScrollBottom && onScrollBottom && (
          <motion.button
            type="button"
            className="floating-scroll-btn"
            aria-label="Scroll to latest messages"
            title="Scroll to latest messages"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.16 }}
            onClick={onScrollBottom}
          >
            <ArrowDown size={17} />
          </motion.button>
        )}
      </AnimatePresence>

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
                <span className={`dictation-dot ${isFinishing ? "is-sending" : ""}`} />
                <span className="dictation-label">
                  {isFinishing
                    ? "Sending voice note to DAZZ..."
                    : sendOnVoiceEnd
                      ? "Voice Note (auto-sends on pause)"
                      : "Live Voice Recognition"}
                </span>
              </div>
              <button
                type="button"
                className="dictation-done-btn"
                onClick={() => completeVoiceNoteAndSend()}
                aria-label="Finish and send voice note"
              >
                {sendOnVoiceEnd ? "Done & Send" : "Done"}
              </button>
            </div>
            <p className="dictation-text">
              {interimText ? (
                <span className="dictation-active">"{interimText}"</span>
              ) : (
                <span className="dictation-placeholder">
                  {sendOnVoiceEnd
                    ? "Speak your question — it will send automatically when you pause..."
                    : "Speak now — words will appear directly here..."}
                </span>
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
          ) : isFinishing ? (
            <Button
              size="icon"
              disabled
              aria-label="Sending voice note..."
              title="Sending voice note automatically..."
              className="send-button is-loading-pause"
            >
              <Loader2 size={17} className="animate-spin" />
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

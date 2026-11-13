import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  FileAudio2,
  FileText,
  Film,
  MapPin,
  MoreHorizontal,
  Pencil,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../types/chat";

type MessageListProps = {
  messages: Message[];
  streaming: boolean;
  sendOnVoiceEnd?: boolean;
  copiedId: string;
  bottomRef: RefObject<HTMLDivElement>;
  onCopy: (message: Message) => void;
  onEdit?: (message: Message) => void;
};

const IFRAME_REGEX = /<iframe[\s\S]*?src=["']([^"']+)["'][\s\S]*?(?:<\/iframe>|\/>)/gi;

function renderMessageParts(content: string) {
  IFRAME_REGEX.lastIndex = 0;
  const parts: Array<{ type: "text" | "iframe"; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = IFRAME_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = content.slice(lastIndex, match.index);
      if (textChunk.trim()) {
        parts.push({ type: "text", content: textChunk });
      }
    }
    parts.push({ type: "iframe", content: match[1] });
    lastIndex = IFRAME_REGEX.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: "text", content: remaining });
    }
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content });
  }

  return parts;
}

export function MessageList({
  messages,
  streaming,
  sendOnVoiceEnd = true,
  copiedId,
  bottomRef,
  onCopy,
  onEdit,
}: MessageListProps) {
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [dislikedIds, setDislikedIds] = useState<Record<string, boolean>>({});
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const latestUserMsgRef = useRef<HTMLElement | null>(null);
  const lastScrolledTurnIdRef = useRef<string | null>(null);

  // Identify latest user message id to scroll to start of conversation turn
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const latestUserMessageId = latestUserMessage?.id;

  // Case 1: When sendOnVoiceEnd is OFF (manual mode):
  // Scroll to the start of the convo turn, then let content grow naturally downward without auto-scrolling
  useEffect(() => {
    if (sendOnVoiceEnd) return;
    if (latestUserMessageId && latestUserMessageId !== lastScrolledTurnIdRef.current) {
      lastScrolledTurnIdRef.current = latestUserMessageId;
      const timer = setTimeout(() => {
        latestUserMsgRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [latestUserMessageId, sendOnVoiceEnd]);

  function handleLike(id: string) {
    setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!likedIds[id]) {
      setDislikedIds((prev) => ({ ...prev, [id]: false }));
    }
  }

  function handleDislike(id: string) {
    setDislikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!dislikedIds[id]) {
      setLikedIds((prev) => ({ ...prev, [id]: false }));
    }
  }

  function handleSpeak(message: Message) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="message-list">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const isStreamingAssistant = message.role === "assistant" && streaming && isLast;
          const isLatestUserTurn = message.id === latestUserMessageId;

          return (
            <motion.article
              key={message.id}
              ref={isLatestUserTurn ? (latestUserMsgRef as RefObject<HTMLElement>) : undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"} ${
                isStreamingAssistant ? "is-streaming-assistant" : ""
              }`}
            >
              {message.role === "assistant" && (
                <div className="assistant-avatar">
                  <Sparkles size={16} />
                </div>
              )}

              <div className={`message-content ${message.role === "user" ? "user-content" : "assistant-content"}`}>
                {message.role === "user" ? (
                  <>
                    <div className="user-bubble">
                      {message.content && <p className="user-message-text">{message.content}</p>}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="message-attachments">
                          {message.attachments.map((attachment) => (
                            <div className="message-attachment" key={attachment.id}>
                              {attachment.mimeType.startsWith("image/") && attachment.data ? (
                                <img
                                  className="message-attachment-image"
                                  src={`data:${attachment.mimeType};base64,${attachment.data}`}
                                  alt={attachment.name}
                                />
                              ) : attachment.mimeType.startsWith("audio/") && attachment.data ? (
                                <audio
                                  className="message-attachment-audio"
                                  controls
                                  src={`data:${attachment.mimeType};base64,${attachment.data}`}
                                  aria-label={`Recorded voice message: ${attachment.name}`}
                                />
                              ) : (
                                <span className="message-attachment-icon">
                                  {attachment.mimeType.startsWith("video/") ? <Film size={15} /> :
                                    attachment.mimeType.startsWith("audio/") ? <FileAudio2 size={15} /> :
                                      <FileText size={15} />}
                                </span>
                              )}
                              <span className="message-attachment-name">{attachment.name}</span>
                              {attachment.transcript && (
                                <span className="message-attachment-transcript">
                                  “{attachment.transcript}”
                                </span>
                              )}
                              {attachment.frames && <span className="message-attachment-note">3 video frames sent to DAZZ</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action row underneath user bubble (Screenshot alignment) */}
                    <div className="user-action-row" aria-label="Message options">
                      <button
                        type="button"
                        className="msg-action-btn"
                        aria-label="Copy message"
                        title="Copy message"
                        onClick={() => onCopy(message)}
                      >
                        {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        type="button"
                        className="msg-action-btn is-dummy"
                        aria-label="Share message"
                        title="Share"
                      >
                        <Share2 size={14} />
                      </button>
                      {onEdit && (
                        <button
                          type="button"
                          className="msg-action-btn"
                          aria-label="Edit message"
                          title="Edit message"
                          onClick={() => onEdit(message)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {isStreamingAssistant && (
                      <div className="jarvis-voice-visualizer" aria-label="D.A.Z.Z vocal synthesis active">
                        <div className="jarvis-hud-badge">
                          <span className="jarvis-pulse-dot" />
                          <span className="jarvis-hud-label">D.A.Z.Z // VOCAL SYNTHESIS ACTIVE</span>
                        </div>
                        <div className="jarvis-soundwaves" aria-hidden="true">
                          <span className="wave-bar bar-1" />
                          <span className="wave-bar bar-2" />
                          <span className="wave-bar bar-3" />
                          <span className="wave-bar bar-4" />
                          <span className="wave-bar bar-5" />
                          <span className="wave-bar bar-6" />
                          <span className="wave-bar bar-7" />
                          <span className="wave-bar bar-8" />
                          <span className="wave-bar bar-9" />
                          <span className="wave-bar bar-10" />
                        </div>
                      </div>
                    )}

                    <div className="markdown-content">
                      {message.isError ||
                      (message.role === "assistant" &&
                        (message.content.startsWith("⚠️ This chat got interrupted") ||
                          message.content.includes("⚠️ *Response interrupted"))) ? (
                        <div className="fancy-error-card in-chat-error" role="alert">
                          <div className="fancy-error-header">
                            <AlertTriangle size={18} className="fancy-error-icon" />
                            <h4 className="fancy-error-title">DAZZ is temporarily unavailable</h4>
                          </div>
                          <p className="fancy-error-description">
                            {message.content.replace(/^⚠️\s*/, "") ||
                              "This chat got interrupted due to service disruption. Please try asking again."}
                          </p>
                          <div className="fancy-error-badge-row">
                            <span className="fancy-error-chip">AI Service Interruption</span>
                            <span className="fancy-error-hint">Please wait a moment and try asking again</span>
                          </div>
                        </div>
                      ) : message.content ? (
                        renderMessageParts(message.content).map((part, pIdx) => {
                          if (part.type === "iframe") {
                            const osmLink = part.content.replace("/export/embed.html", "");
                            return (
                              <div className="chat-map-card" key={`iframe-${pIdx}`}>
                                <iframe
                                  src={part.content}
                                  className="chat-map-iframe"
                                  title="Interactive Route Map"
                                  loading="lazy"
                                  allowFullScreen
                                />
                                <div className="chat-map-caption">
                                  <div className="chat-map-caption-left">
                                    <MapPin size={13} className="text-emerald-400" />
                                    <span>Interactive OpenStreetMap</span>
                                  </div>
                                  <a
                                    href={osmLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-map-link"
                                  >
                                    View full screen ↗
                                  </a>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <ReactMarkdown
                              key={`md-${pIdx}`}
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p>{children}</p>,
                                h1: ({ children }) => <h1>{children}</h1>,
                                h2: ({ children }) => <h2>{children}</h2>,
                                h3: ({ children }) => <h3>{children}</h3>,
                                ul: ({ children }) => <ul>{children}</ul>,
                                ol: ({ children }) => <ol>{children}</ol>,
                                blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                                pre: ({ children }) => <pre>{children}</pre>,
                                code: ({ children }) => <code>{children}</code>,
                                a: ({ children, href }) => {
                                  if (href && (href.includes("openstreetmap.org/export/embed.html") || href.includes("layer=mapnik"))) {
                                    return (
                                      <div className="chat-map-card">
                                        <iframe
                                          src={href}
                                          className="chat-map-iframe"
                                          title="OpenStreetMap Location"
                                          loading="lazy"
                                          allowFullScreen
                                        />
                                        <div className="chat-map-caption">
                                          <div className="chat-map-caption-left">
                                            <MapPin size={13} className="text-emerald-400" />
                                            <span>Interactive OpenStreetMap</span>
                                          </div>
                                          <a href={href.replace("/export/embed.html", "")} target="_blank" rel="noreferrer" className="chat-map-link">
                                            View in OSM ↗
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                                },
                                hr: () => <hr />,
                                table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
                              }}
                            >
                              {part.content}
                            </ReactMarkdown>
                          );
                        })
                      ) : isStreamingAssistant ? (
                        <div className="asking-dazz-container" role="status" aria-label="Asking DAZZ">
                          <div className="asking-dazz-hud">
                            <span className="asking-radar-ring" />
                            <Sparkles size={15} className="asking-dazz-sparkles animate-pulse" />
                            <span className="asking-dazz-label">Asking DAZZ...</span>
                          </div>
                          <div className="asking-dazz-details">
                            <span className="asking-pulse-dot" />
                            <span>Consulting real-time intelligence & tools</span>
                          </div>
                        </div>
                      ) : (
                        <div className="fancy-error-card in-chat-error" role="alert">
                          <div className="fancy-error-header">
                            <AlertTriangle size={18} className="fancy-error-icon" />
                            <h4 className="fancy-error-title">DAZZ is temporarily unavailable</h4>
                          </div>
                          <p className="fancy-error-description">
                            DAZZ did not generate a response. The AI provider may be temporarily busy, experiencing rate limits, or encountered a network timeout.
                          </p>
                          <div className="fancy-error-badge-row">
                            <span className="fancy-error-chip">AI Service Interruption</span>
                            <span className="fancy-error-hint">Please wait a moment and try asking again</span>
                          </div>
                        </div>
                      )}
                      {isStreamingAssistant && Boolean(message.content) && <span className="stream-cursor" />}
                    </div>

                    {/* Action row underneath assistant message (Screenshot alignment) */}
                    {message.content && !streaming && !message.isError && (
                      <div className="assistant-action-row" aria-label="Response options">
                        <button
                          type="button"
                          className="msg-action-btn"
                          aria-label="Copy response"
                          title="Copy response"
                          onClick={() => onCopy(message)}
                        >
                          {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                          type="button"
                          className={`msg-action-btn ${likedIds[message.id] ? "is-active text-emerald-400" : ""}`}
                          aria-label="Good response"
                          title="Good response"
                          onClick={() => handleLike(message.id)}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          type="button"
                          className={`msg-action-btn ${dislikedIds[message.id] ? "is-active text-rose-400" : ""}`}
                          aria-label="Bad response"
                          title="Bad response"
                          onClick={() => handleDislike(message.id)}
                        >
                          <ThumbsDown size={14} />
                        </button>
                        <button
                          type="button"
                          className={`msg-action-btn ${speakingId === message.id ? "is-active text-cyan-400" : ""}`}
                          aria-label={speakingId === message.id ? "Stop reading" : "Read aloud"}
                          title={speakingId === message.id ? "Stop reading" : "Read aloud"}
                          onClick={() => handleSpeak(message)}
                        >
                          {speakingId === message.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button
                          type="button"
                          className="msg-action-btn is-dummy"
                          aria-label="Share response"
                          title="Share"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="msg-action-btn is-dummy"
                          aria-label="More options"
                          title="More options"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.article>
          );
        })}
        {/* Fallback if user's chat is the last turn and there's no AI response */}
        {!streaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <motion.article
            key="interrupted-fallback-turn"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="message-row message-assistant"
          >
            <div className="assistant-avatar">
              <Sparkles size={16} />
            </div>
            <div className="message-content assistant-content">
              <div className="markdown-content">
                <div className="fancy-error-card in-chat-error" role="alert">
                  <div className="fancy-error-header">
                    <AlertTriangle size={18} className="fancy-error-icon" />
                    <h4 className="fancy-error-title">DAZZ is temporarily unavailable</h4>
                  </div>
                  <p className="fancy-error-description">
                    This chat got interrupted due to service disruption. Please try asking again.
                  </p>
                  <div className="fancy-error-badge-row">
                    <span className="fancy-error-chip">AI Service Interruption</span>
                    <span className="fancy-error-hint">Please wait a moment and try asking again</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.article>
        )}
      </AnimatePresence>

      <div ref={bottomRef} className="scroll-anchor" style={{ height: 1, minHeight: 1 }} />
    </div>
  );
}

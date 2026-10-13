import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, FileAudio2, FileText, Film, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../ui/button";
import type { Message } from "../../types/chat";

type MessageListProps = {
  messages: Message[];
  streaming: boolean;
  copiedId: string;
  bottomRef: RefObject<HTMLDivElement>;
  onCopy: (message: Message) => void;
};

export function MessageList({ messages, streaming, copiedId, bottomRef, onCopy }: MessageListProps) {
  return (
    <div className="message-list">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <motion.article
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`message-row ${message.role === "user" ? "message-user" : "message-assistant"}`}
          >
            {message.role === "assistant" && (
              <div className="assistant-avatar"><Sparkles size={16} /></div>
            )}
            <div className={`message-content ${message.role === "user" ? "user-content" : ""}`}>
              {message.role === "user" ? (
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
              ) : (
                <>
                  <div className="markdown-content">
                    {message.content ? (
                      <ReactMarkdown
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
                          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                          hr: () => <hr />,
                          table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (streaming ? <span className="thinking-dots" aria-label="DAZZ is thinking"><i /><i /><i /></span> : null)}
                    {streaming && message.content && <span className="stream-cursor" />}
                  </div>
                  {message.content && !streaming && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="copy-response"
                      aria-label="Copy response"
                      onClick={() => onCopy(message)}
                    >
                      {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                    </Button>
                  )}
                </>
              )}
            </div>
          </motion.article>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}

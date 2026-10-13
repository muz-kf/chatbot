import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CircleStop,
  Command,
  Copy,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  { title: "Make a plan", prompt: "Help me make a simple plan for this week." },
  { title: "Explain something", prompt: "Explain a complex idea in a simple, memorable way." },
  { title: "Write with me", prompt: "Help me write a clear and friendly email." },
];

const fonts = ["Poppins", "DM Sans", "Manrope"] as const;
type FontChoice = (typeof fonts)[number];

function getSavedFont(): FontChoice {
  const savedFont = window.localStorage.getItem("chat-font");
  return fonts.find((font) => font === savedFont) ?? "Poppins";
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.matchMedia("(min-width: 768px)").matches,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [font, setFont] = useState<FontChoice>(getSavedFont);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const fontStack = `"${font}", ui-sans-serif, system-ui, sans-serif`;
    document.documentElement.style.setProperty("--chat-font", fontStack);
    window.localStorage.setItem("chat-font", font);
  }, [font]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  function startChat(prompt: string) {
    const content = prompt.trim();
    if (!content || streaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setDraft("");
    setError("");
    setStreaming(true);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    void (async () => {
      const appendToken = (token: string) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: message.content + token }
              : message,
          ),
        );
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map(({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error || "The assistant could not complete this response.");
        }
        if (!response.body) {
          throw new Error("The chat response did not include a readable stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        const processLine = (line: string) => {
          if (!line.trim()) return;
          const event = JSON.parse(line) as { token?: string; error?: string };
          if (event.error) throw new Error(event.error);
          if (typeof event.token === "string") appendToken(event.token);
        };

        while (true) {
          const { done, value } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          lines.forEach(processLine);
          if (done) break;
        }
        processLine(pending);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The assistant could not complete this response. Please try again.",
          );
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setStreaming(false);
        }
      }
    })();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startChat(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim()) startChat(draft);
    }
  }

  function stopResponse() {
    requestRef.current?.abort();
    requestRef.current = null;
    setStreaming(false);
  }

  function newChat() {
    stopResponse();
    setMessages([]);
    setDraft("");
    setError("");
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
    draftRef.current?.focus();
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setError("Could not copy this response. Check your browser clipboard permissions.");
    }
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas text-ink">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[272px] flex-col border-r border-stone-200/80 bg-[#f3f3f1] px-3 py-4 transition-all duration-300 md:static md:shrink-0 ${
          sidebarOpen
            ? "translate-x-0 md:w-[272px]"
            : "-translate-x-full md:w-0 md:-translate-x-full md:overflow-hidden md:border-r-0 md:px-0"
        }`}
      >
        <div className="flex items-center justify-between px-2 pb-8">
          <a href="#" className="flex items-center gap-2.5" aria-label="Home">
            <div className="flex size-8 items-center justify-center rounded-[11px] bg-ink text-white">
              <Command size={17} strokeWidth={2.4} />
            </div>
            <span className="font-display text-[15px] font-bold tracking-tight">muse<span className="text-stone-400">.</span></span>
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={17} className="md:hidden" />
            <PanelLeftClose size={17} className="hidden md:block" />
          </Button>
        </div>

        <Button
          variant="outline"
          className="mb-7 w-full justify-start gap-2.5 border-stone-200/80 bg-white/80 px-3 text-[13px] shadow-sm"
          onClick={newChat}
        >
          <Plus size={16} />
          New conversation
          <span className="ml-auto text-[11px] text-stone-400">⌘ K</span>
        </Button>

        <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
          Your space
        </div>
        <div className="mt-3 flex flex-1 flex-col items-center justify-center px-5 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-sm">
            <Sparkles size={17} />
          </div>
          <p className="text-xs font-medium text-stone-500">A little room to think</p>
          <p className="mt-1 text-[11px] leading-5 text-stone-400">
            Your conversation history will appear here.
          </p>
        </div>

        <div className="mb-3">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2.5 px-3 text-[13px]"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={16} />
            Settings
          </Button>
          <AnimatePresence initial={false}>
            {settingsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <label
                  htmlFor="font-choice"
                  className="mb-1.5 mt-2 block px-3 text-[11px] font-medium text-stone-500"
                >
                  Interface font
                </label>
                <select
                  id="font-choice"
                  value={font}
                  onChange={(event) => setFont(event.target.value as FontChoice)}
                  className="mx-2 w-[calc(100%-1rem)] rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                >
                  {fonts.map((fontName) => (
                    <option key={fontName} value={fontName}>
                      {fontName}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-white/70 p-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#e9e2d9] text-[11px] font-semibold text-stone-600">
            Y
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">Your workspace</p>
            <p className="mt-0.5 text-[10px] text-stone-400">Personal</p>
          </div>
          <span className="size-1.5 rounded-full bg-emerald-500" title="Ready" />
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-stone-200/70 px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <Menu size={19} className="md:hidden" />
              {sidebarOpen ? (
                <PanelLeftClose size={19} className="hidden md:block" />
              ) : (
                <PanelLeftOpen size={19} className="hidden md:block" />
              )}
            </Button>
            <div>
              <h1 className="font-display text-sm font-bold tracking-tight">A thoughtful assistant</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                OpenRouter · streaming
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-9" aria-label="Scroll to latest" onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}>
            <ArrowDown size={17} className="text-stone-400" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-5 pb-12 pt-10 sm:px-10"
            >
              <div className="mb-6 flex size-12 items-center justify-center rounded-[18px] bg-white shadow-[0_3px_18px_rgba(0,0,0,0.06)]">
                <Sparkles size={21} className="text-[#b68858]" />
              </div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">A fresh start</p>
              <h2 className="font-display text-[clamp(2.2rem,6vw,3.65rem)] font-semibold leading-[1.1] tracking-[-0.055em]">
                Good ideas begin
                <br />
                <span className="text-stone-400">with a conversation.</span>
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-stone-500">
                Ask a question, untangle a thought, or make something new. We can figure it out together.
              </p>
              <div className="mt-10 grid gap-2 sm:grid-cols-3">
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + index * 0.08, duration: 0.35 }}
                    onClick={() => startChat(suggestion.prompt)}
                    className="group rounded-2xl border border-stone-200/80 bg-white/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)]"
                  >
                    <span className="mb-5 flex size-8 items-center justify-center rounded-xl bg-stone-100 text-stone-500 transition group-hover:bg-[#f0e8de] group-hover:text-[#986e44]">
                      {index === 0 ? <Command size={15} /> : index === 1 ? <Sparkles size={15} /> : <Bot size={15} />}
                    </span>
                    <span className="block text-xs font-semibold">{suggestion.title}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-stone-400">{suggestion.prompt}</span>
                  </motion.button>
                ))}
              </div>
            </motion.section>
          ) : (
            <div className="mx-auto w-full max-w-[760px] px-5 pb-8 pt-9 sm:px-10">
              <div className="space-y-8">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.article
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={message.role === "user" ? "flex justify-end" : "flex gap-3.5"}
                    >
                      {message.role === "assistant" && (
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#a17a54] shadow-sm ring-1 ring-stone-200/70">
                          <Sparkles size={15} />
                        </div>
                      )}
                      <div className={message.role === "user" ? "max-w-[85%]" : "min-w-0 flex-1 pt-1"}>
                        {message.role === "user" ? (
                          <div className="rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[14px] leading-6 text-white shadow-sm">
                            {message.content}
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-stone-700">
                              {message.content ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                    h1: ({ children }) => <h1 className="mb-3 mt-5 text-2xl font-semibold leading-tight text-ink first:mt-0">{children}</h1>,
                                    h2: ({ children }) => <h2 className="mb-2 mt-5 text-xl font-semibold leading-tight text-ink first:mt-0">{children}</h2>,
                                    h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-ink first:mt-0">{children}</h3>,
                                    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
                                    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
                                    blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-[#b68858] pl-4 text-stone-500">{children}</blockquote>,
                                    pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl bg-stone-100 p-4 font-mono text-xs leading-6">{children}</pre>,
                                    code: ({ children }) => <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.9em] text-[#8f4d29]">{children}</code>,
                                    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#986e44] underline underline-offset-2">{children}</a>,
                                    hr: () => <hr className="my-4 border-stone-200" />,
                                    table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
                                    th: ({ children }) => <th className="border-b border-stone-300 px-2 py-1.5 font-semibold text-ink">{children}</th>,
                                    td: ({ children }) => <td className="border-b border-stone-200 px-2 py-1.5">{children}</td>,
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              ) : (streaming ? <span className="inline-flex gap-1.5 py-2" aria-label="Thinking"><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400" /><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400 [animation-delay:150ms]" /><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400 [animation-delay:300ms]" /></span> : null)}
                              {streaming && message.content && <span className="ml-1 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full bg-[#b68858]" />}
                            </div>
                            {message.content && !streaming && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="mt-2 size-8 text-stone-400"
                                aria-label="Copy response"
                                onClick={() => void copyMessage(message)}
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
              </div>
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-3 pt-3 sm:px-8 sm:pb-5">
          <div className="mx-auto max-w-[760px]">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <form
              onSubmit={submit}
              className="rounded-[22px] border border-stone-200 bg-white p-2.5 shadow-[0_5px_25px_rgba(0,0,0,0.055)] transition focus-within:border-stone-300 focus-within:shadow-[0_7px_30px_rgba(0,0,0,0.08)]"
            >
              <Textarea
                ref={draftRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything, or just start typing..."
                maxLength={12_000}
                rows={1}
                disabled={streaming}
                aria-label="Message"
                className="max-h-40 min-h-10 px-2.5 py-2"
              />
              <div className="flex items-center justify-between px-1 pb-0.5 pt-1">
                <span className="hidden text-[10px] text-stone-400 sm:block">
                  <kbd className="rounded border border-stone-200 bg-stone-50 px-1 py-0.5 font-sans">↵</kbd> to send · <kbd className="rounded border border-stone-200 bg-stone-50 px-1 py-0.5 font-sans">shift ↵</kbd> for new line
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {streaming ? (
                    <Button size="icon" aria-label="Stop response" onClick={stopResponse} className="size-9 rounded-xl">
                      <CircleStop size={17} />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send message"
                      className="size-9 rounded-xl"
                    >
                      <ArrowUp size={18} strokeWidth={2.3} />
                    </Button>
                  )}
                </span>
              </div>
            </form>
            <p className="mt-2.5 text-center text-[10px] text-stone-400">
              A little curiosity goes a long way. AI can make mistakes, so check important details.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

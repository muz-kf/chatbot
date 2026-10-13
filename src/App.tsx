import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { httpSubscriptionLink, createTRPCClient } from "@trpc/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CircleStop,
  Command,
  Copy,
  Menu,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { AppRouter } from "../server/router";
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

const trpc = createTRPCClient<AppRouter>({
  links: [httpSubscriptionLink({ url: "/trpc" })],
});

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(
    () => () => {
      subscriptionRef.current?.unsubscribe();
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
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = trpc.chat.subscribe(
      { messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })) },
      {
        onData: (token) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + token }
                : message,
            ),
          );
        },
        onError: (streamError) => {
          setError(streamError.message);
          setStreaming(false);
          subscriptionRef.current = null;
        },
        onComplete: () => {
          setStreaming(false);
          subscriptionRef.current = null;
        },
      },
    );
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
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    setStreaming(false);
  }

  function newChat() {
    stopResponse();
    setMessages([]);
    setDraft("");
    setError("");
    setSidebarOpen(false);
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
        className={`fixed inset-y-0 left-0 z-30 flex w-[272px] flex-col border-r border-stone-200/80 bg-[#f3f3f1] px-3 py-4 transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
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
            className="size-8 md:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={17} />
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
              className="size-9 md:hidden"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
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
                              {message.content || (streaming ? <span className="inline-flex gap-1.5 py-2" aria-label="Thinking"><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400" /><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400 [animation-delay:150ms]" /><i className="size-1.5 animate-soft-pulse rounded-full bg-stone-400 [animation-delay:300ms]" /></span> : null)}
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

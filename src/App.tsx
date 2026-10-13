import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChatComposer } from "./components/chat/ChatComposer";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatSidebar } from "./components/chat/ChatSidebar";
import { MessageList } from "./components/chat/MessageList";
import { WelcomeScreen } from "./components/chat/WelcomeScreen";
import {
  isFontChoice,
  isThemeChoice,
  themeFonts,
  type FontChoice,
  type Message,
  type ThemeChoice,
} from "./types/chat";

function getSavedTheme(): ThemeChoice {
  const savedTheme = window.localStorage.getItem("chat-theme");
  return isThemeChoice(savedTheme) ? savedTheme : "purple";
}

function getSavedFont(theme: ThemeChoice): FontChoice {
  const savedFont = window.localStorage.getItem("chat-font");
  return isFontChoice(savedFont) ? savedFont : themeFonts[theme];
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
  const [theme, setTheme] = useState<ThemeChoice>(getSavedTheme);
  const [font, setFont] = useState<FontChoice>(() => getSavedFont(theme));
  const bottomRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--chat-font",
      `"${font}", ui-sans-serif, system-ui, sans-serif`,
    );
    window.localStorage.setItem("chat-font", font);
  }, [font]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("chat-theme", theme);
    const themeColors: Record<ThemeChoice, string> = {
      purple: "#08060c",
      green: "#06110d",
      white: "#f4f6fb",
      gold: "#111208",
    };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
  }, [theme]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebar = (event: MediaQueryListEvent) => setSidebarOpen(event.matches);
    desktopQuery.addEventListener("change", syncSidebar);
    return () => desktopQuery.removeEventListener("change", syncSidebar);
  }, []);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  function startChat(prompt: string) {
    const content = prompt.trim();
    if (!content || streaming) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
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
          throw new Error(result.error || "DAZZ could not complete this response.");
        }
        if (!response.body) throw new Error("The chat response did not include a readable stream.");

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
              : "DAZZ could not complete this response. Please try again.",
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

  function changeTheme(nextTheme: ThemeChoice) {
    setTheme(nextTheme);
    setFont(themeFonts[nextTheme]);
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
    <div className="app-shell">
      <div className="cosmic-backdrop" aria-hidden="true">
        <div className="cosmic-glow cosmic-glow-violet" />
        <div className="cosmic-glow cosmic-glow-blue" />
        <div className="cosmic-horizon" />
      </div>
      <ChatSidebar
        open={sidebarOpen}
        settingsOpen={settingsOpen}
        font={font}
        theme={theme}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onFontChange={setFont}
        onThemeChange={changeTheme}
      />
      <main className="chat-workspace">
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onScrollLatest={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <section className="conversation-viewport" aria-label="Conversation with DAZZ">
          {messages.length === 0 ? (
            <WelcomeScreen onPrompt={startChat} />
          ) : (
            <MessageList
              messages={messages}
              streaming={streaming}
              copiedId={copiedId}
              bottomRef={bottomRef}
              onCopy={(message) => void copyMessage(message)}
            />
          )}
        </section>
        <ChatComposer
          value={draft}
          error={error}
          streaming={streaming}
          textareaRef={draftRef}
          onChange={setDraft}
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          onStop={stopResponse}
        />
      </main>
    </div>
  );
}

export default App;

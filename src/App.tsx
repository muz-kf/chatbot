import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChatComposer } from "./components/chat/ChatComposer";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatSidebar } from "./components/chat/ChatSidebar";
import { MessageList } from "./components/chat/MessageList";
import { WelcomeScreen } from "./components/chat/WelcomeScreen";
import { processAttachment, recordedAudioToWav } from "./lib/attachmentProcessing";
import { createSpeechRecognition } from "./lib/speechRecognition";
import {
  isFontChoice,
  isThemeChoice,
  themeFonts,
  type FontChoice,
  type ChatAttachment,
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTranscript, setRecordingTranscript] = useState("");
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingFinalTextRef = useRef("");
  const recordingInterimTextRef = useRef("");
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

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
      recognitionRef.current?.abort();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function startChat(prompt: string, attachedFiles = attachments) {
    const content = prompt.trim();
    if ((!content && attachedFiles.length === 0) || streaming) return;

    const messageContent = content || `Please review the attached file${attachedFiles.length === 1 ? "" : "s"}: ${attachedFiles.map((file) => file.name).join(", ")}.`;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      attachments: attachedFiles,
    };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const nextMessages = [...messages, userMessage];
    const requestMessages = nextMessages.map((message) => ({
      role: message.role,
      content: message.content,
      attachments: message.attachments?.map((attachment) => {
        if (message.id === userMessage.id) return attachment;
        const { data: _data, frames: _frames, ...previousAttachment } = attachment;
        if (attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/")) {
          previousAttachment.text = [
            previousAttachment.text,
            "This file was attached to an earlier turn and its visual content is not re-sent in this request.",
          ].filter(Boolean).join("\n\n");
        }
        return previousAttachment;
      }),
    }));
    const requestBody = JSON.stringify({ messages: requestMessages });
    if (new Blob([requestBody]).size > 28 * 1024 * 1024) {
      setError("These attachments exceed the 28 MB request limit. Remove a file and try again.");
      return;
    }

    setMessages([...nextMessages, assistantMessage]);
    setDraft("");
    setAttachments([]);
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
          body: requestBody,
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
    cancelVoiceRecording();
    setMessages([]);
    setDraft("");
    setAttachments([]);
    setError("");
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
    draftRef.current?.focus();
  }

  function changeTheme(nextTheme: ThemeChoice) {
    setTheme(nextTheme);
    setFont(themeFonts[nextTheme]);
  }

  async function addFiles(files: File[]) {
    setError("");
    if (attachments.length + files.length > 6) {
      setError("Attach up to 6 files to one message.");
      return;
    }

    const processed: ChatAttachment[] = [];
    for (const file of files) {
      try {
        const attachment = await processAttachment(file);
        processed.push(attachment);
      } catch (processingError) {
        setError((current) => [
          current,
          processingError instanceof Error ? processingError.message : `Could not read ${file.name}.`,
        ].filter(Boolean).join(" "));
      }
    }

    if (processed.length === 0) return;
    const combined = [...attachments, ...processed];
    const payloadSize = combined.reduce(
      (total, item) =>
        total +
        (item.data?.length ?? 0) +
        (item.text?.length ?? 0) +
        (item.frames?.reduce((size, frame) => size + frame.length, 0) ?? 0),
      0,
    );
    if (payloadSize > 24 * 1024 * 1024) {
      setError("Attachments exceed the 24 MB message limit. Remove a file and try again.");
      return;
    }
    setAttachments(combined);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function startVoiceRecording() {
    if (recording || streaming) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      setError("");
      setRecordingTranscript("");
      recordingFinalTextRef.current = "";
      recordingInterimTextRef.current = "";
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setRecording(false);

        void (async () => {
          try {
            const wav = await recordedAudioToWav(audioBlob);
            if (wav.size > 12 * 1024 * 1024) {
              throw new Error("This recording is too large to send. Please record a shorter voice message.");
            }
            const attachment = await processAttachment(
              new File([wav], "dazz-voice-message.wav", { type: "audio/wav" }),
            );
            const transcript = [
              recordingFinalTextRef.current.trim(),
              recordingInterimTextRef.current.trim(),
            ].filter(Boolean).join(" ");
            attachment.transcript = transcript;
            const instruction = transcript
              ? `Please respond to my voice message. The live transcript is: "${transcript}"`
              : "Please listen to the attached voice message and respond.";
            startChat(instruction, [...attachments, attachment]);
            setRecordingTranscript("");
          } catch (recordingError) {
            setError(recordingError instanceof Error ? recordingError.message : "Could not process the voice recording.");
          }
        })();
      };

      try {
        recognitionRef.current = createSpeechRecognition(
          (finalText, interimText) => {
            if (finalText) recordingFinalTextRef.current += finalText;
            recordingInterimTextRef.current = interimText;
            setRecordingTranscript(`${recordingFinalTextRef.current}${interimText}`);
          },
          (message) => setError(`${message} The audio recording will still be attached.`),
          () => undefined,
        );
        recognitionRef.current.start();
      } catch (recognitionError) {
        setError(
          recognitionError instanceof Error
            ? `${recognitionError.message} The audio recording will still be attached.`
            : "Live transcription is unavailable; the audio recording will still be attached.",
        );
      }

      recorder.start();
      setRecording(true);
    } catch (recordingError) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setError(
        recordingError instanceof Error
          ? `Could not access the microphone: ${recordingError.message}`
          : "Could not access the microphone.",
      );
    }
  }

  function stopVoiceRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancelVoiceRecording() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      recorder.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setRecording(false);
    setRecordingTranscript("");
    recordingFinalTextRef.current = "";
    recordingInterimTextRef.current = "";
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
          attachments={attachments}
          recording={recording}
          recordingTranscript={recordingTranscript}
          textareaRef={draftRef}
          onChange={setDraft}
          onFiles={(files) => void addFiles(files)}
          onRemoveAttachment={removeAttachment}
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          onStop={stopResponse}
          onRecord={() => (recording ? stopVoiceRecording() : void startVoiceRecording())}
        />
      </main>
    </div>
  );
}

export default App;

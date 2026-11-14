import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareDashed, Plus } from "lucide-react";
import { Button } from "./components/ui/button";
import { AuthGate } from "./components/chat/AuthGate";
import { ChatComposer } from "./components/chat/ChatComposer";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatSidebar } from "./components/chat/ChatSidebar";
import { MessageList } from "./components/chat/MessageList";
import { WelcomeScreen } from "./components/chat/WelcomeScreen";
import { processAttachment, recordedAudioToWav } from "./lib/attachmentProcessing";
import { ApiError, apiRequest, queryKeys } from "./lib/api";
import { createSpeechRecognition } from "./lib/speechRecognition";
import {
  isFontChoice,
  isThemeChoice,
  themeFonts,
  type AiProvider,
  type FontChoice,
  type ChatAttachment,
  type ChatSummary,
  type Message,
  type ThemeChoice,
  type UserLocation,
  type UserProfile,
} from "./types/chat";
import { getRandomId } from "./lib/utils";
import {
  type VoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  StreamingTTSQueue,
  speakText,
} from "./lib/speechSynthesis";

type AuthState = "loading" | "authenticated" | "unauthenticated";

function normalizeChatMessages(rawMessages: Message[]): Message[] {
  if (!rawMessages || rawMessages.length === 0) return [];
  const normalized = [...rawMessages];
  const lastIndex = normalized.length - 1;
  const lastMsg = normalized[lastIndex];

  if (lastMsg.role === "user") {
    normalized.push({
      id: `interrupted-${lastMsg.id || Date.now()}`,
      role: "assistant",
      content: "⚠️ This chat got interrupted due to service disruption. Please try asking again.",
      isError: true,
    });
  } else if (lastMsg.role === "assistant" && !lastMsg.content.trim()) {
    normalized[lastIndex] = {
      ...lastMsg,
      content: "⚠️ This chat got interrupted due to service disruption. Please try asking again.",
      isError: true,
    };
  }

  return normalized;
}

function getSavedTheme(): ThemeChoice {
  const savedTheme = window.localStorage.getItem("chat-theme");
  if (savedTheme === "jarvis") return "dazz";
  return isThemeChoice(savedTheme) ? savedTheme : "purple";
}

function getSavedFont(theme: ThemeChoice): FontChoice {
  const savedFont = window.localStorage.getItem("chat-font");
  return isFontChoice(savedFont) ? savedFont : themeFonts[theme];
}

function App() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatNotFound, setChatNotFound] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const initialLoadAttemptedRef = useRef(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authError, setAuthError] = useState("");
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
  const [sendOnVoiceEnd, setSendOnVoiceEnd] = useState<boolean>(() => {
    const saved = window.localStorage.getItem("chat-send-on-voice-sender");
    return saved !== null ? saved === "true" : true;
  });

  const handleSendOnVoiceEndChange = (enabled: boolean) => {
    setSendOnVoiceEnd(enabled);
    window.localStorage.setItem("chat-send-on-voice-sender", String(enabled));
  };
  const [autoListenOnResponse, setAutoListenOnResponse] = useState<boolean>(() => {
    const saved = window.localStorage.getItem("chat-auto-listen-on-response");
    return saved !== null ? saved === "true" : false;
  });

  const handleAutoListenOnResponseChange = (enabled: boolean) => {
    setAutoListenOnResponse(enabled);
    window.localStorage.setItem("chat-auto-listen-on-response", String(enabled));
  };
  const [theme, setTheme] = useState<ThemeChoice>(getSavedTheme);
  const [font, setFont] = useState<FontChoice>(() => getSavedFont(theme));
  const [provider, setProvider] = useState<AiProvider>(() => {
    const saved = window.localStorage.getItem("chat-ai-provider");
    return saved === "openrouter" ? "openrouter" : "groq";
  });
  const [defaultAiName, setDefaultAiName] = useState<string>(() => {
    return window.localStorage.getItem("chat-default-ai-name") || "DAZZ";
  });
  const [chatAiNames, setChatAiNames] = useState<Record<string, string>>({});

  const activeAiName = activeChatId
    ? (chatAiNames[activeChatId] || window.localStorage.getItem(`chat-ai-name-${activeChatId}`) || defaultAiName)
    : defaultAiName;

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    try {
      const saved = window.localStorage.getItem("chat-voice-settings");
      return saved ? JSON.parse(saved) : DEFAULT_VOICE_SETTINGS;
    } catch {
      return DEFAULT_VOICE_SETTINGS;
    }
  });

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    window.localStorage.setItem("chat-ai-provider", newProvider);
  };

  const handleDefaultAiNameChange = (name: string) => {
    const trimmed = name.trim() || "DAZZ";
    setDefaultAiName(trimmed);
    window.localStorage.setItem("chat-default-ai-name", trimmed);
  };

  const handleRenameActiveAi = (newName: string) => {
    const trimmed = newName.trim() || "DAZZ";
    if (activeChatId) {
      window.localStorage.setItem(`chat-ai-name-${activeChatId}`, trimmed);
      setChatAiNames((prev) => ({ ...prev, [activeChatId]: trimmed }));
    } else {
      handleDefaultAiNameChange(trimmed);
    }
  };

  const handleVoiceSettingsChange = (settings: VoiceSettings) => {
    setVoiceSettings(settings);
    window.localStorage.setItem("chat-voice-settings", JSON.stringify(settings));
  };

  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => apiRequest<{ user: UserProfile }>("/api/auth/session"),
    retry: false,
  });
  const chatsQuery = useQuery({
    queryKey: queryKeys.chats,
    queryFn: () => apiRequest<{ chats: ChatSummary[] }>("/api/chats"),
    enabled: authState === "authenticated",
    retry: false,
  });
  const createChatMutation = useMutation({
    mutationFn: (title: string) =>
      apiRequest<{ chat: ChatSummary }>("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
  });
  const chatTurnMutation = useMutation({
    mutationFn: async (input: {
      chatId: string;
      message: Message;
      signal: AbortSignal;
      onToken: (token: string) => void;
      aiName?: string;
    }) => {
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch(`/api/chats/${input.chatId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: input.chatId,
          message: input.message,
          clientTimezone,
          clientLocation: userLocation,
          provider,
          aiName: input.aiName || activeAiName,
        }),
        signal: input.signal,
      });
      if (!response.ok) {
        let errorMessage = `${activeAiName} could not complete this response.`;
        try {
          const result = (await response.json()) as { error?: string };
          if (result?.error) errorMessage = result.error;
        } catch {
          errorMessage = `Server error (${response.status} ${response.statusText || "Error"}). Please try again later.`;
        }
        throw new ApiError(errorMessage, response.status);
      }
      if (!response.body) throw new Error("The chat response did not include a readable stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { token?: string; error?: string };
        if (event.error) throw new Error(event.error);
        if (typeof event.token === "string") input.onToken(event.token);
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
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () =>
      apiRequest<void>("/api/auth/logout", { method: "POST" }),
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const userScrolledUpRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChatId;
  const ttsQueueRef = useRef<StreamingTTSQueue | null>(null);

  interface InFlightTurn {
    chatId: string;
    controller: AbortController;
    userMessage: Message;
    assistantMessage: Message;
    historyBeforeTurn: Message[];
  }
  const inFlightRef = useRef<InFlightTurn | null>(null);

  const draftRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingFinalTextRef = useRef("");
  const recordingInterimTextRef = useRef("");
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

  useEffect(() => {
    if (sessionQuery.isSuccess) {
      setUser(sessionQuery.data.user);
      setAuthState("authenticated");
      setAuthError("");
    } else if (sessionQuery.isError) {
      setUser(null);
      setAuthState("unauthenticated");
      if (!(sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401)) {
        setAuthError(sessionQuery.error.message || "Could not load your profile.");
      }
    }
  }, [sessionQuery.data, sessionQuery.error, sessionQuery.isError, sessionQuery.isSuccess]);

  useEffect(() => {
    if (chatsQuery.isSuccess) setChats(chatsQuery.data.chats);
    if (chatsQuery.isError) {
      setAuthError(chatsQuery.error.message || "Could not load saved conversations.");
    }
  }, [chatsQuery.data, chatsQuery.error, chatsQuery.isError, chatsQuery.isSuccess]);

  useEffect(() => {
    if (authState === "authenticated" && !initialLoadAttemptedRef.current) {
      initialLoadAttemptedRef.current = true;
      const urlChatId = new URLSearchParams(window.location.search).get("chatId");
      if (urlChatId) {
        void openChat(urlChatId);
      }
    }
  }, [authState]);

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
    const themeColors: Record<string, string> = {
      purple: "#0e051c",
      green: "#02160d",
      white: "#f3f6fc",
      gold: "#171203",
      dazz: "#020e1a",
      jarvis: "#020e1a",
      red: "#a81926",
      orange: "#c2410c",
      maroon: "#50071c",
      skyblue: "#f0f7ff",
      pink: "#b81d6d",
      zyricon: "#130d1d",
      miracle: "#f4f0ff",
    };
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme] || "#08060c");
  }, [theme]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebar = (event: MediaQueryListEvent) => setSidebarOpen(event.matches);
    desktopQuery.addEventListener("change", syncSidebar);
    return () => desktopQuery.removeEventListener("change", syncSidebar);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    } else {
      bottomRef.current?.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    }
  }, []);

  // Monitor scroll position on the conversation viewport
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isUp = distanceFromBottom > 80;
      setShowScrollBottom(isUp);
      userScrolledUpRef.current = isUp;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when sendOnVoiceEnd is ON:
  // Glides down to the bottom as new tokens arrive without animation stutter
  useEffect(() => {
    if (!sendOnVoiceEnd || !streaming) return;

    if (!userScrolledUpRef.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages, streaming, sendOnVoiceEnd]);

  useEffect(() => {
    if (!streaming && sendOnVoiceEnd && !userScrolledUpRef.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [streaming, sendOnVoiceEnd]);

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
      id: getRandomId(),
      role: "user",
      content: messageContent,
      attachments: attachedFiles,
    };
    const assistantMessage: Message = { id: getRandomId(), role: "assistant", content: "" };
    const requestBody = JSON.stringify({ message: userMessage });
    if (new Blob([requestBody]).size > 28 * 1024 * 1024) {
      setError("These attachments exceed the 28 MB request limit. Remove a file and try again.");
      return;
    }

    const currentHistory = [...messages];
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setAttachments([]);
    setError("");
    setStreaming(true);

    // Conversational user name adoption
    const userNameMatch = content.match(/\b(?:call me|my name is|you can call me)\s+([A-Za-z0-9_-]{2,25})\b/i);
    if (userNameMatch && userNameMatch[1]) {
      const candidate = userNameMatch[1].trim();
      const lower = candidate.toLowerCase();
      const ignore = ["a", "an", "the", "back", "again", "later", "please", "now", "here", "today", "tomorrow", "something", "whatever"];
      if (!ignore.includes(lower)) {
        const formatted = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        setUser((prev) => (prev ? { ...prev, name: formatted } : prev));
      }
    }

    // Conversational AI persona name adoption
    let turnAiName = activeAiName;
    const aiNameMatch = content.match(/\b(?:call yourself|your name is|i(?:'ll| will) call you|from now on you are|name yourself)\s+([A-Za-z0-9_-]{2,25})\b/i);
    if (aiNameMatch && aiNameMatch[1]) {
      const candidate = aiNameMatch[1].trim();
      const lower = candidate.toLowerCase();
      const ignore = ["a", "an", "the", "back", "again", "later", "please", "now", "here", "today", "tomorrow", "something", "whatever", "dazz", "assistant"];
      if (!ignore.includes(lower)) {
        const formatted = candidate.charAt(0).toUpperCase() + candidate.slice(1);
        turnAiName = formatted;
        if (activeChatId) {
          window.localStorage.setItem(`chat-ai-name-${activeChatId}`, formatted);
          setChatAiNames((prev) => ({ ...prev, [activeChatId]: formatted }));
        } else {
          setDefaultAiName(formatted);
          window.localStorage.setItem("chat-default-ai-name", formatted);
        }
      }
    }

    // Initialize real-time streaming TTS queue
    ttsQueueRef.current?.stop();
    if (voiceSettings.enabled) {
      ttsQueueRef.current = new StreamingTTSQueue(voiceSettings);
    } else {
      ttsQueueRef.current = null;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (sendOnVoiceEnd) {
      userScrolledUpRef.current = false;
      setShowScrollBottom(false);
      setTimeout(() => {
        scrollToBottom(true);
      }, 50);
    }

    void (async () => {
      let chatId = activeChatId;
      try {
        if (!chatId) {
          const { chat: createdChat } = await createChatMutation.mutateAsync(
            messageContent.slice(0, 120) || "New conversation",
          );
          chatId = createdChat.id;
          setActiveChatId(chatId);
          setChats((current) => [createdChat, ...current]);
          const newChatId = createdChat.id;
          if (turnAiName) {
            window.localStorage.setItem(`chat-ai-name-${newChatId}`, turnAiName);
            setChatAiNames((prev) => ({ ...prev, [newChatId]: turnAiName }));
          }
          const newUrl = `${window.location.pathname}?chatId=${encodeURIComponent(createdChat.id)}`;
          window.history.replaceState({ chatId: createdChat.id }, "", newUrl);
        }

        let accumulatedContent = "";
        inFlightRef.current = {
          chatId,
          controller,
          userMessage: { ...userMessage },
          assistantMessage: { ...assistantMessage },
          historyBeforeTurn: currentHistory,
        };

        const appendToken = (token: string) => {
          accumulatedContent += token;
          if (inFlightRef.current && inFlightRef.current.chatId === chatId) {
            inFlightRef.current.assistantMessage.content = accumulatedContent;
          }
          ttsQueueRef.current?.pushToken(token);
          if (activeChatIdRef.current === chatId) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: accumulatedContent }
                  : message,
              ),
            );
          }
        };

        await chatTurnMutation.mutateAsync({
          chatId,
          message: userMessage,
          signal: controller.signal,
          onToken: appendToken,
          aiName: turnAiName,
        });

        await queryClient.invalidateQueries({ queryKey: queryKeys.chats });
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat(chatId) });

        const triggerMicIfAutoListen = () => {
          if (sendOnVoiceEnd && autoListenOnResponse && !controller.signal.aborted) {
            setTimeout(() => {
              if (activeChatIdRef.current === chatId) {
                void startVoiceRecording();
              }
            }, 600);
          }
        };

        // Flush remaining tokens in the streaming TTS buffer
        if (voiceSettings.enabled && ttsQueueRef.current) {
          ttsQueueRef.current.flush(triggerMicIfAutoListen);
        } else {
          ttsQueueRef.current?.flush();
          triggerMicIfAutoListen();
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          const rawError =
            requestError instanceof Error
              ? requestError.message
              : `${activeAiName} could not complete this response. Please try again.`;

          if (activeChatIdRef.current === chatId) {
            setMessages((current) =>
              current.map((msg) => {
                if (msg.id === assistantMessage.id) {
                  return {
                    ...msg,
                    isError: true,
                    content:
                      msg.content.trim().length > 0
                        ? `${msg.content}\n\n⚠️ *Response interrupted: ${rawError}*`
                        : rawError,
                  };
                }
                return msg;
              }),
            );
            setError(rawError);
          }
        }
      } finally {
        if (inFlightRef.current?.controller === controller) {
          inFlightRef.current = null;
        }
        if (requestRef.current === controller) {
          requestRef.current = null;
          setStreaming(false);
        }
      }
    })();
  }

  function toggleLocation() {
    if (userLocation) {
      setUserLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLocationLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationLoading(false);
      },
      (err) => {
        setLocationLoading(false);
        setError(`Could not access live location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function handleDirectSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    setDraft("");
    startChat(trimmed);
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
    ttsQueueRef.current?.stop();
    inFlightRef.current?.controller.abort();
    inFlightRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    setStreaming(false);
  }

  function newChat() {
    // When navigating to a new chat, do NOT abort in-flight generation of the previous chat.
    // The previous chat will continue in the background and commit cleanly to the database.
    ttsQueueRef.current?.stop();
    setStreaming(false);
    cancelVoiceRecording();
    setMessages([]);
    setActiveChatId(null);
    setChatNotFound(false);
    setDraft("");
    setAttachments([]);
    setError("");
    window.history.replaceState({}, "", window.location.pathname);
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
    draftRef.current?.focus();
  }

  async function openChat(chatId: string) {
    ttsQueueRef.current?.stop();
    if (chatId === activeChatId) {
      if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
      return;
    }
    setError("");
    setChatNotFound(false);

    // If returning to a chat that is actively generating in the background,
    // seamlessly restore its streaming view without waiting or triggering interrupted state
    if (inFlightRef.current && inFlightRef.current.chatId === chatId) {
      setActiveChatId(chatId);
      setMessages([
        ...inFlightRef.current.historyBeforeTurn,
        inFlightRef.current.userMessage,
        { ...inFlightRef.current.assistantMessage },
      ]);
      setStreaming(true);
      setDraft("");
      setAttachments([]);
      const newUrl = `${window.location.pathname}?chatId=${encodeURIComponent(chatId)}`;
      window.history.replaceState({ chatId }, "", newUrl);
      if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
      setTimeout(() => scrollToBottom(false), 60);
      return;
    }

    setStreaming(false);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: queryKeys.chat(chatId),
        queryFn: () =>
          apiRequest<{ chat: { id: string; chats: Message[] } }>(`/api/chats/${chatId}`),
      });
      setActiveChatId(result.chat.id);
      setMessages(normalizeChatMessages(result.chat.chats));
      setDraft("");
      setAttachments([]);
      const newUrl = `${window.location.pathname}?chatId=${encodeURIComponent(result.chat.id)}`;
      window.history.replaceState({ chatId: result.chat.id }, "", newUrl);
      if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
      setTimeout(() => scrollToBottom(false), 60);
    } catch (loadError) {
      setActiveChatId(null);
      setMessages([]);
      setChatNotFound(true);
      setError(loadError instanceof Error ? loadError.message : "Conversation not found.");
    }
  }

  async function completeSignIn(signedInUser: UserProfile) {
    setUser(signedInUser);
    setAuthError("");
    queryClient.setQueryData(queryKeys.session, { user: signedInUser });
    setAuthState("authenticated");
    await queryClient.invalidateQueries({ queryKey: queryKeys.chats });
  }

  async function signOut() {
    stopResponse();
    try {
      await logoutMutation.mutateAsync();
    } catch {
      setError("Could not confirm sign-out with the server.");
    }
    queryClient.removeQueries({ queryKey: queryKeys.session });
    queryClient.removeQueries({ queryKey: queryKeys.chats });
    setUser(null);
    setChats([]);
    setMessages([]);
    setActiveChatId(null);
    setAuthState("unauthenticated");
    setSidebarOpen(false);
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
        chats={chats}
        activeChatId={activeChatId}
        user={user ?? { email: "", name: "" }}
        sendOnVoiceEnd={sendOnVoiceEnd}
        autoListenOnResponse={autoListenOnResponse}
        provider={provider}
        defaultAiName={defaultAiName}
        voiceSettings={voiceSettings}
        onSendOnVoiceEndChange={handleSendOnVoiceEndChange}
        onAutoListenOnResponseChange={handleAutoListenOnResponseChange}
        onProviderChange={handleProviderChange}
        onDefaultAiNameChange={handleDefaultAiNameChange}
        onVoiceSettingsChange={handleVoiceSettingsChange}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onSelectChat={(chatId) => void openChat(chatId)}
        onSignOut={() => void signOut()}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onFontChange={setFont}
        onThemeChange={changeTheme}
      />
      <main className="chat-workspace">
        <ChatHeader
          sidebarOpen={sidebarOpen}
          aiName={activeAiName}
          provider={provider}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onScrollLatest={() => scrollToBottom(true)}
        />
        <section ref={viewportRef} className="conversation-viewport" aria-label={`Conversation with ${activeAiName}`}>
          {chatNotFound ? (
            <div className="chat-not-found-screen" role="alert">
              <div className="chat-not-found-card">
                <div className="not-found-icon-wrap">
                  <MessageSquareDashed size={34} className="not-found-icon" />
                </div>
                <h3 className="not-found-title">No chats found</h3>
                <p className="not-found-desc">
                  The requested conversation could not be found or may have been deleted.
                </p>
                <Button variant="default" className="not-found-button" onClick={newChat}>
                  <Plus size={16} />
                  <span>Start a new conversation</span>
                </Button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen aiName={activeAiName} onPrompt={startChat} />
          ) : (
            <MessageList
              messages={messages}
              streaming={streaming}
              sendOnVoiceEnd={sendOnVoiceEnd}
              copiedId={copiedId}
              bottomRef={bottomRef}
              aiName={activeAiName}
              voiceSettings={voiceSettings}
              onCopy={(message) => void copyMessage(message)}
              onEdit={(message) => {
                setDraft(message.content);
                draftRef.current?.focus();
              }}
            />
          )}
        </section>
        <ChatComposer
          value={draft}
          error={error}
          streaming={streaming}
          attachments={attachments}
          userLocation={userLocation}
          locationLoading={locationLoading}
          onToggleLocation={toggleLocation}
          recording={recording}
          recordingTranscript={recordingTranscript}
          sendOnVoiceEnd={sendOnVoiceEnd}
          showScrollBottom={showScrollBottom}
          onScrollBottom={() => scrollToBottom(true)}
          onSendText={handleDirectSend}
          onDismissError={() => setError("")}
          textareaRef={draftRef}
          onChange={setDraft}
          onFiles={(files) => void addFiles(files)}
          onRemoveAttachment={removeAttachment}
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          onStop={stopResponse}
          onRecord={() => (recording ? stopVoiceRecording() : void startVoiceRecording())}
          aiName={activeAiName}
        />
      </main>
      {authState === "loading" && (
        <div className="auth-overlay">
          <div className="auth-loading" role="status">Restoring your session...</div>
        </div>
      )}
      {authState === "unauthenticated" && (
        <AuthGate onAuthenticated={(profile) => void completeSignIn(profile)} />
      )}
      {authError && authState !== "authenticated" && (
        <div className="auth-load-error" role="alert">{authError}</div>
      )}
    </div>
  );
}

export default App;

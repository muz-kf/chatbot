import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeechRecognition } from "../../lib/speechRecognition";
import { StreamingTTSQueue, type VoiceSettings } from "../../lib/speechSynthesis";
import { apiRequest } from "../../lib/api";
import { getRandomId } from "../../lib/utils";
import type { AiProvider, Message, UserLocation } from "../../types/chat";
import { playListenChime, playTurnReadyChime } from "./audioChime";

export type VoiceAssistantStatus = "idle" | "listening" | "thinking" | "speaking";

export interface UseVoiceAssistantOptions {
  chatId: string | null;
  aiName: string;
  provider: AiProvider;
  voiceSettings: VoiceSettings;
  userLocation?: UserLocation | null;
  soundEffectsEnabled?: boolean;
  onTurnComplete?: (userMsg: Message, assistantMsg: Message, chatId: string) => void;
  onCreateChat?: (firstMessage: string) => Promise<string>;
}

export function useVoiceAssistant({
  chatId,
  aiName,
  provider,
  voiceSettings,
  userLocation,
  soundEffectsEnabled = true,
  onTurnComplete,
  onCreateChat,
}: UseVoiceAssistantOptions) {
  const [status, setStatus] = useState<VoiceAssistantStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [lastAssistantReply, setLastAssistantReply] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);
  const ttsQueueRef = useRef<StreamingTTSQueue | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioSimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accumulatedSpeechRef = useRef("");
  const hasSpokenRef = useRef(false);
  const inFlightRef = useRef(false);
  const activeChatIdRef = useRef<string | null>(chatId);
  activeChatIdRef.current = chatId;

  const statusRef = useRef<VoiceAssistantStatus>(status);
  statusRef.current = status;

  // Audio level oscillation helper for reactive visualizer
  const startAudioSimulation = useCallback((intensity = 0.8) => {
    if (audioSimTimerRef.current) clearInterval(audioSimTimerRef.current);
    audioSimTimerRef.current = setInterval(() => {
      const base = 0.35 * intensity;
      const jitter = Math.random() * 0.65 * intensity;
      setAudioLevel(Math.min(1, Math.max(0.1, base + jitter)));
    }, 80);
  }, []);

  const stopAudioSimulation = useCallback(() => {
    if (audioSimTimerRef.current) {
      clearInterval(audioSimTimerRef.current);
      audioSimTimerRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Dispatch speech to AI backend
  const sendSpeechToAi = useCallback(
    async (spokenPrompt: string) => {
      const prompt = spokenPrompt.trim();
      if (!prompt || inFlightRef.current) return;

      inFlightRef.current = true;
      setStatus("thinking");
      startAudioSimulation(0.4);
      setError("");
      setLastAssistantReply("");

      // Stop speech recognition while AI is thinking/speaking
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;

      let targetChatId = activeChatIdRef.current;
      if (!targetChatId && onCreateChat) {
        try {
          targetChatId = await onCreateChat(prompt.slice(0, 100));
        } catch (chatCreateErr) {
          setError(
            chatCreateErr instanceof Error
              ? chatCreateErr.message
              : "Could not create conversation session.",
          );
          setStatus("idle");
          inFlightRef.current = false;
          stopAudioSimulation();
          return;
        }
      }

      if (!targetChatId) {
        setError("Conversation ID not available.");
        setStatus("idle");
        inFlightRef.current = false;
        stopAudioSimulation();
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Prepare TTS Queue
      ttsQueueRef.current?.stop();
      ttsQueueRef.current = new StreamingTTSQueue({
        ...voiceSettings,
        enabled: true, // Voice mode forces audio playback
      });

      let accumulatedContent = "";
      let hasStartedSpeaking = false;

      const userMessage: Message = {
        id: getRandomId(),
        role: "user",
        content: prompt,
        attachments: [],
      };

      const assistantMessage: Message = {
        id: getRandomId(),
        role: "assistant",
        content: "",
        attachments: [],
      };

      const handleToken = (token: string) => {
        accumulatedContent += token;
        setLastAssistantReply(accumulatedContent);

        if (!hasStartedSpeaking && accumulatedContent.trim().length > 0) {
          hasStartedSpeaking = true;
          setStatus("speaking");
          startAudioSimulation(0.9);
        }

        ttsQueueRef.current?.pushToken(token);
      };

      try {
        const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const response = await fetch(`/api/chats/${targetChatId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: targetChatId,
            message: userMessage,
            clientTimezone,
            clientLocation: userLocation,
            provider,
            aiName,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errMsg = `Failed to get voice reply (${response.status}).`;
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson?.error) errMsg = errJson.error;
          } catch {
            // ignore
          }
          throw new Error(errMsg);
        }

        if (!response.body) {
          throw new Error("Voice stream response was empty.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processLine = (line: string) => {
          if (!line.trim()) return;
          try {
            const parsed = JSON.parse(line) as { token?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (typeof parsed.token === "string") handleToken(parsed.token);
          } catch (lineErr) {
            if (lineErr instanceof Error && lineErr.message.includes("error")) {
              throw lineErr;
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(processLine);
          if (done) break;
        }
        processLine(buffer);

        assistantMessage.content = accumulatedContent;
        if (onTurnComplete) {
          onTurnComplete(userMessage, assistantMessage, targetChatId);
        }

        // When TTS completes playback: play turn chime and re-trigger microphone
        const onSpeechFinish = () => {
          if (controller.signal.aborted) return;
          inFlightRef.current = false;
          stopAudioSimulation();
          setStatus("idle");
          setTranscript("");
          setInterimTranscript("");

          if (!muted) {
            setTimeout(() => {
              if (!controller.signal.aborted) {
                if (soundEffectsEnabled) playTurnReadyChime();
                startListening();
              }
            }, 350);
          }
        };

        if (ttsQueueRef.current) {
          ttsQueueRef.current.flush(onSpeechFinish);
        } else {
          onSpeechFinish();
        }
      } catch (reqError) {
        if (!controller.signal.aborted) {
          const errText =
            reqError instanceof Error ? reqError.message : "Voice request interrupted.";
          setError(errText);
          setStatus("idle");
          inFlightRef.current = false;
          stopAudioSimulation();
        }
      }
    },
    [aiName, muted, onCreateChat, onTurnComplete, provider, soundEffectsEnabled, userLocation, voiceSettings, startAudioSimulation, stopAudioSimulation],
  );

  // Start Speech Recognition
  const startListening = useCallback(() => {
    if (muted || inFlightRef.current) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    accumulatedSpeechRef.current = "";
    hasSpokenRef.current = false;
    setTranscript("");
    setInterimTranscript("");
    setError("");
    setStatus("listening");
    startAudioSimulation(0.65);

    if (soundEffectsEnabled) {
      playListenChime();
    }

    try {
      const recognition = createSpeechRecognition(
        (finalChunk, interimChunk) => {
          if (finalChunk) {
            hasSpokenRef.current = true;
            accumulatedSpeechRef.current = accumulatedSpeechRef.current
              ? `${accumulatedSpeechRef.current.trim()} ${finalChunk.trim()}`
              : finalChunk.trim();
            setTranscript(accumulatedSpeechRef.current);
          }

          if (interimChunk) {
            hasSpokenRef.current = true;
          }
          setInterimTranscript(interimChunk);

          // Reset silence timer on incoming words
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }

          // Trigger dispatch after 1.4s of user silence
          if (hasSpokenRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              const fullText = [
                accumulatedSpeechRef.current.trim(),
                interimChunk.trim(),
              ]
                .filter(Boolean)
                .join(" ");

              if (fullText) {
                void sendSpeechToAi(fullText);
              }
            }, 1400);
          }
        },
        (errMsg) => {
          setError(errMsg);
          setStatus("idle");
          stopAudioSimulation();
        },
        () => {
          // On speech recognition end: if user spoke something, dispatch it
          if (hasSpokenRef.current && !inFlightRef.current) {
            const fullText = accumulatedSpeechRef.current.trim();
            if (fullText) {
              void sendSpeechToAi(fullText);
            }
          } else if (!inFlightRef.current && statusRef.current === "listening") {
            // Natural silence: keep ready
            stopAudioSimulation();
            setStatus("idle");
          }
        },
      );

      recognitionRef.current = recognition;
      recognition.start();
    } catch (startErr) {
      setError(
        startErr instanceof Error
          ? startErr.message
          : "Voice recognition is unavailable in this environment.",
      );
      setStatus("idle");
      stopAudioSimulation();
    }
  }, [muted, sendSpeechToAi, soundEffectsEnabled, startAudioSimulation, stopAudioSimulation]);

  const stopListening = useCallback(() => {
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
    stopAudioSimulation();
    setStatus("idle");
  }, [stopAudioSimulation]);

  // Interrupt active speech / AI response and immediately listen to user
  const interrupt = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    ttsQueueRef.current?.stop();
    inFlightRef.current = false;
    stopAudioSimulation();
    setLastAssistantReply("");
    startListening();
  }, [startListening, stopAudioSimulation]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        stopListening();
        ttsQueueRef.current?.stop();
      } else {
        startListening();
      }
      return next;
    });
  }, [startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (audioSimTimerRef.current) clearInterval(audioSimTimerRef.current);
      recognitionRef.current?.abort();
      ttsQueueRef.current?.stop();
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    status,
    transcript,
    interimTranscript,
    lastAssistantReply,
    error,
    muted,
    audioLevel,
    startListening,
    stopListening,
    interrupt,
    toggleMute,
    sendManualPrompt: sendSpeechToAi,
  };
}

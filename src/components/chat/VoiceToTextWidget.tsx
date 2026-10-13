import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, RotateCcw } from "lucide-react";
import { createSpeechRecognition } from "../../lib/speechRecognition";

export function VoiceToTextWidget() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(null);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
    },
    [],
  );

  function stop() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }

  function toggle() {
    if (listening) {
      stop();
      return;
    }

    setError("");
    try {
      const recognition = createSpeechRecognition(
        (finalText, interimText) => {
          if (finalText) setTranscript((current) => `${current}${finalText}`);
          setInterim(interimText);
        },
        (message) => setError(message),
        () => setListening(false),
      );
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (recognitionError) {
      setError(
        recognitionError instanceof Error
          ? recognitionError.message
          : "Could not start speech recognition.",
      );
    }
  }

  return (
    <div className="voice-to-text">
      <button
        type="button"
        className={`voice-to-text-toggle ${listening ? "is-listening" : ""}`}
        aria-pressed={listening}
        onClick={toggle}
      >
        <span className="voice-to-text-icon">{listening ? <MicOff size={15} /> : <Mic size={15} />}</span>
        <span>{listening ? "Stop listening" : "Voice to text"}</span>
        {listening && <i className="voice-listening-dot" />}
      </button>
      {(transcript || interim || error || listening) && (
        <div className="voice-transcript-panel" aria-live="polite">
          <div className="voice-transcript-heading">
            <span>{listening ? "Listening now" : "Transcription"}</span>
            {transcript && (
              <button type="button" aria-label="Clear transcription" onClick={() => setTranscript("")}>
                <RotateCcw size={12} />
              </button>
            )}
          </div>
          <p>
            {transcript}
            {interim && <span className="voice-interim">{transcript ? " " : ""}{interim}</span>}
            {!transcript && !interim && listening && <span className="voice-interim">Start speaking…</span>}
            {!transcript && !interim && !listening && !error && "Your words will appear here."}
          </p>
          {error && <span className="voice-transcript-error" role="alert">{error}</span>}
        </div>
      )}
    </div>
  );
}

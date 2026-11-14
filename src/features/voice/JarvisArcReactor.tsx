import React from "react";
import type { VoiceAssistantStatus } from "./useVoiceAssistant";

export interface JarvisArcReactorProps {
  status: VoiceAssistantStatus;
  audioLevel: number; // 0 to 1
  onClick?: () => void;
  aiName?: string;
  theme?: string;
}

export function JarvisArcReactor({
  status,
  audioLevel,
  onClick,
  aiName = "JARVIS",
  theme = "dazz",
}: JarvisArcReactorProps) {
  // Dynamic scale and pulse factors based on status and audio reactivity
  const scale = 1 + (status === "speaking" || status === "listening" ? audioLevel * 0.15 : 0.03);
  const ringSpeedClass =
    status === "thinking"
      ? "speed-turbo"
      : status === "speaking"
      ? "speed-fast"
      : status === "listening"
      ? "speed-medium"
      : "speed-slow";

  const numBars = 32;
  const bars = Array.from({ length: numBars }).map((_, i) => {
    const angle = (i / numBars) * 360;
    const height =
      status === "speaking"
        ? 12 + Math.sin((i / numBars) * Math.PI * 4 + Date.now() / 200) * 10 * audioLevel + audioLevel * 14
        : status === "listening"
        ? 8 + Math.abs(Math.sin((i / numBars) * Math.PI * 2)) * 12 * audioLevel
        : status === "thinking"
        ? 6 + ((i % 4) * 3)
        : 5;
    return { angle, height };
  });

  return (
    <div
      className={`jarvis-arc-container status-${status} theme-${theme}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${aiName} Arc Reactor Core - Current state: ${status}. Click to interact.`}
      title={
        status === "speaking"
          ? "Click to interrupt"
          : status === "listening"
          ? "Listening... Click to pause"
          : "Click to speak"
      }
    >
      {/* Background Radial Glow */}
      <div
        className="arc-glow-aura"
        style={{
          transform: `scale(${scale})`,
          opacity: status === "speaking" ? 0.9 : status === "listening" ? 0.75 : 0.45,
        }}
      />

      {/* SVG Arc Reactor Structure */}
      <svg
        className="arc-reactor-svg"
        viewBox="0 0 360 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="reactorCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--reactor-core-light, #ffffff)" stopOpacity="1" />
            <stop offset="45%" stopColor="var(--reactor-core-cyan, #00f0ff)" stopOpacity="0.8" />
            <stop offset="75%" stopColor="var(--reactor-core-blue, #0077ff)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          <filter id="arcBloom" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer Ring 1: Static Border & Tick Marks */}
        <circle
          cx="180"
          cy="180"
          r="170"
          stroke="var(--reactor-accent, #00f0ff)"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="4 6"
        />

        {/* Outer Ring 2: Rotating Segmented HUD Chassis */}
        <g className={`arc-ring-outer ${ringSpeedClass}`}>
          <circle
            cx="180"
            cy="180"
            r="156"
            stroke="var(--reactor-accent, #00f0ff)"
            strokeOpacity="0.75"
            strokeWidth="2.5"
            strokeDasharray="70 20 15 20 40 20"
          />
          <circle
            cx="180"
            cy="180"
            r="146"
            stroke="var(--reactor-accent, #00f0ff)"
            strokeOpacity="0.3"
            strokeWidth="1"
            strokeDasharray="2 8"
          />
        </g>

        {/* Middle Ring 3: Counter-rotating Targeting Calibrations */}
        <g className={`arc-ring-middle ${ringSpeedClass}`}>
          <circle
            cx="180"
            cy="180"
            r="132"
            stroke="var(--reactor-accent, #00f0ff)"
            strokeOpacity="0.6"
            strokeWidth="3"
            strokeDasharray="110 30 40 30"
          />
          {/* Cardinal Targeting Chevrons */}
          <path d="M 180 38 L 184 46 L 176 46 Z" fill="var(--reactor-accent, #00f0ff)" />
          <path d="M 180 322 L 184 314 L 176 314 Z" fill="var(--reactor-accent, #00f0ff)" />
          <path d="M 38 180 L 46 184 L 46 176 Z" fill="var(--reactor-accent, #00f0ff)" />
          <path d="M 322 180 L 314 184 L 314 176 Z" fill="var(--reactor-accent, #00f0ff)" />
        </g>

        {/* Soundwave Frequency Ring */}
        <g className="arc-soundwave-ring">
          {bars.map((bar, idx) => (
            <line
              key={idx}
              x1="180"
              y1={180 - 108}
              x2="180"
              y2={180 - 108 - bar.height}
              stroke="var(--reactor-accent, #00f0ff)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeOpacity={status === "idle" ? 0.35 : 0.85}
              transform={`rotate(${bar.angle} 180 180)`}
              style={{
                transition: "y2 0.08s ease-out, stroke-opacity 0.15s ease",
              }}
            />
          ))}
        </g>

        {/* Inner Reactor Chamber Ring */}
        <circle
          cx="180"
          cy="180"
          r="92"
          stroke="var(--reactor-accent, #00f0ff)"
          strokeOpacity="0.85"
          strokeWidth="2"
          filter="url(#arcBloom)"
        />

        {/* Concentric Energy Core Spokes (Tri-sectional Iron Man Reactor) */}
        <g className={`arc-ring-inner ${ringSpeedClass}`}>
          <circle
            cx="180"
            cy="180"
            r="70"
            stroke="var(--reactor-core-cyan, #00f0ff)"
            strokeOpacity="0.9"
            strokeWidth="4"
            strokeDasharray="45 15"
          />
          <circle
            cx="180"
            cy="180"
            r="54"
            stroke="var(--reactor-accent, #00f0ff)"
            strokeOpacity="0.5"
            strokeWidth="1.5"
            strokeDasharray="8 6"
          />
        </g>

        {/* Kinetic Center Core Glow */}
        <circle
          cx="180"
          cy="180"
          r={status === "speaking" ? 44 + audioLevel * 8 : status === "listening" ? 38 + audioLevel * 6 : 34}
          fill="url(#reactorCoreGlow)"
          filter="url(#arcBloom)"
        />
        <circle
          cx="180"
          cy="180"
          r={16 + (status === "speaking" ? audioLevel * 5 : 0)}
          fill="#ffffff"
          opacity="0.95"
          filter="url(#arcBloom)"
        />
      </svg>

      {/* Ripple Wave Emitters (Active during Speech) */}
      {status === "speaking" && (
        <div className="arc-sound-ripples" aria-hidden="true">
          <span className="sound-ripple ripple-1" />
          <span className="sound-ripple ripple-2" />
          <span className="sound-ripple ripple-3" />
        </div>
      )}

      {/* Kinetic Center Icon / State Badge */}
      <div className="arc-status-badge">
        <span className={`status-dot dot-${status}`} />
        <span className="status-text">{status.toUpperCase()}</span>
      </div>
    </div>
  );
}


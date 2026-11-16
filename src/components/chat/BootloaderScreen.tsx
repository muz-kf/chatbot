import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { JarvisArcReactor } from "../../features/voice/JarvisArcReactor";
import type { ThemeChoice } from "../../types/chat";

interface BootloaderScreenProps {
  theme: ThemeChoice;
  aiName?: string;
  onBootComplete?: () => void;
}

const BOOT_STAGES = [
  "Initializing neural core...",
  "Picking up where we left off...",
  "Restoring session memory...",
  "Synchronizing workspace...",
  "Systems nominal. Ready.",
];

export function BootloaderScreen({
  theme,
  aiName = "DAZZ",
  onBootComplete,
}: BootloaderScreenProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [simulatedLevel, setSimulatedLevel] = useState(0.3);

  // Progressive telemetry text update
  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIndex((prev) => {
        if (prev < BOOT_STAGES.length - 1) return prev + 1;
        clearInterval(stageTimer);
        return prev;
      });
    }, 280);

    // Dynamic subtle breathing audio level for the arc reactor
    const pulseTimer = setInterval(() => {
      setSimulatedLevel((prev) => (prev > 0.6 ? 0.2 : prev + 0.15));
    }, 150);

    return () => {
      clearInterval(stageTimer);
      clearInterval(pulseTimer);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.35, ease: "easeInOut" } }}
      className={`bootloader-screen-root theme-${theme}`}
      data-theme={theme}
      role="status"
      aria-live="polite"
      aria-label="Booting DAZZ workspace"
    >
      {/* Background Holographic Atmosphere */}
      <div className="jarvis-grid-backdrop" aria-hidden="true" />
      <div className="jarvis-radial-vignette" aria-hidden="true" />

      <div className="bootloader-content">
        {/* Arc Reactor Core */}
        <div className="bootloader-reactor-wrap">
          <JarvisArcReactor
            status="thinking"
            audioLevel={simulatedLevel}
            aiName={aiName}
            theme={theme}
          />
        </div>

        {/* Telemetry Branding & Progress */}
        <div className="bootloader-telemetry">
          <div className="bootloader-badge">
            <span className="bootloader-pulse" />
            <span className="bootloader-badge-text">{aiName} // NEURAL OS</span>
          </div>

          <h1 className="bootloader-title">Picking up where we left off...</h1>

          <div className="bootloader-status-container">
            <span className="bootloader-chevron">&gt;</span>
            <span className="bootloader-stage-text">{BOOT_STAGES[stageIndex]}</span>
          </div>

          {/* Glowing theme-accurate progress bar */}
          <div className="bootloader-progress-track">
            <motion.div
              className="bootloader-progress-fill"
              initial={{ width: "10%" }}
              animate={{ width: `${Math.min(100, (stageIndex + 1) * 22)}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

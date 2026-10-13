import { motion } from "framer-motion";
import { ArrowUpRight, Compass, Lightbulb, WandSparkles } from "lucide-react";
import { DazzMark } from "./DazzMark";

const suggestions = [
  { title: "Make a plan", prompt: "Help me make a simple plan for this week.", icon: Compass },
  { title: "Explain something", prompt: "Explain a complex idea in a simple, memorable way.", icon: Lightbulb },
  { title: "Write with me", prompt: "Help me write a clear and friendly email.", icon: WandSparkles },
];

type WelcomeScreenProps = {
  onPrompt: (prompt: string) => void;
};

export function WelcomeScreen({ onPrompt }: WelcomeScreenProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="welcome-screen"
    >
      <div className="welcome-orb-wrap" aria-hidden="true">
        <div className="welcome-orb"><span /><DazzMark /></div>
      </div>
      <div className="welcome-eyebrow"><span /> YOUR AI, IN A NEW LIGHT</div>
      <h2>Hey there.<br /><span>What’s on your mind?</span></h2>
      <p className="welcome-copy">I’m DAZZ. Ask me anything, explore an idea, or let’s make something great together.</p>
      <div className="suggestion-grid">
        {suggestions.map(({ title, prompt, icon: Icon }, index) => (
          <motion.button
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 + index * 0.08, duration: 0.35 }}
            onClick={() => onPrompt(prompt)}
            className="suggestion-card"
          >
            <span className="suggestion-icon"><Icon size={17} /></span>
            <span className="suggestion-text"><strong>{title}</strong><small>{prompt}</small></span>
            <ArrowUpRight size={15} className="suggestion-arrow" />
          </motion.button>
        ))}
      </div>
    </motion.section>
  );
}

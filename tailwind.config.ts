import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#171717",
        muted: "#777777",
        canvas: "#f8f8f7",
      },
      keyframes: {
        "soft-pulse": {
          "0%, 100%": { opacity: "0.38", transform: "scale(0.88)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "soft-pulse": "soft-pulse 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;

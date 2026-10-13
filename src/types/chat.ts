export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export const fonts = ["Poppins", "DM Sans", "Manrope"] as const;
export type FontChoice = (typeof fonts)[number];

export const themes = [
  { value: "violet", label: "Cosmic Violet" },
  { value: "gold", label: "Midnight Gold" },
] as const;
export type ThemeChoice = (typeof themes)[number]["value"];

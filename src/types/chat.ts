export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data?: string;
  format?: string;
  text?: string;
  transcript?: string;
  frames?: string[];
};

export type UserProfile = {
  email: string;
  name: string;
  dateOfBirth?: string;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export const fonts = [
  "Sora",
  "Poppins",
  "DM Sans",
  "Manrope",
  "Space Grotesk",
  "Outfit",
  "Orbitron",
  "Rajdhani",
  "Oxanium",
] as const;
export type FontChoice = (typeof fonts)[number];

export const themes = [
  { value: "purple", label: "Neon Purple" },
  { value: "green", label: "Neon Green" },
  { value: "white", label: "Cloud White" },
  { value: "gold", label: "Midnight Gold" },
] as const;
export type ThemeChoice = (typeof themes)[number]["value"];

export const themeFonts: Record<ThemeChoice, FontChoice> = {
  purple: "Sora",
  green: "Rajdhani",
  white: "DM Sans",
  gold: "Oxanium",
};

export function isFontChoice(value: string | null): value is FontChoice {
  return fonts.some((font) => font === value);
}

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return themes.some((theme) => theme.value === value);
}

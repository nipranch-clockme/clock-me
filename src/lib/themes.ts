export const THEME_COOKIE = "tsink-theme";
export const THEMES = [
  { id: "light", name: "Light", note: "Clean and crisp, soft grey and a trustworthy blue", swatch: ["#F8F9FB", "#FFFFFF", "#0168DA"] },
  { id: "dark", name: "Dark", note: "Deep slate that is easy on the eyes all day", swatch: ["#0F1216", "#1F242A", "#2F7BE5"] },
  { id: "neon", name: "Neon", note: "Near-black with glowing cyan and pink", swatch: ["#07070F", "#14142A", "#00E5FF", "#FF2E97"] },
  { id: "minimal", name: "Minimal", note: "Black on white, type and space do the work", swatch: ["#FFFFFF", "#F5F5F5", "#111111"] },
  { id: "glass", name: "Glass", note: "Frosted panels over a colourful backdrop", swatch: ["#1E1B4B", "#9D174D", "#075985", "#9BE7FF"] },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const themeOf = (v: string | undefined): ThemeId => (THEMES.find((t) => t.id === v)?.id ?? "light");

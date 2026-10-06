export const THEME_COOKIE = "tsink-theme";
export const THEMES = ["light", "dark"] as const;
export type ThemeId = (typeof THEMES)[number];
export const themeOf = (v: string | undefined): ThemeId => (v === "dark" ? "dark" : "light");

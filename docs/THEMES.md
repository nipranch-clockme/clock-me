# Themes

Two looks, Light (default) and Dark, switched with the round sun/moon button next to the profile picture in the top bar. The choice is saved per browser in the `tsink-theme` cookie and applied as `data-theme` on `<html>`. All colours are CSS variables at the end of `src/app/globals.css`, so a theme is one block.

| Theme | Background | Accent | Notes |
|---|---|---|---|
| Light (default) | `#F8F9FB`, cards `#F6F7F9` | `#0168DA` blue | Soft off-white, never pure white |
| Dark | `#0F1216`, cards `#171B20` | `#2F7BE5` blue | Text `#E6E9ED`, about 14:1 contrast |

Neon, Minimal and Glass themes were built and set aside. They are in git history (commit 7bed0d2 has all five with a picker; the neon glow and glass blur recipes are in `docs/THEMES.md` at that commit).

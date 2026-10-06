# Themes

Three themes, chosen under **Settings, Appearance** or on **My profile**. The choice is saved per browser in the `tsink-theme` cookie and applied as `data-theme` on `<html>`. All colours are CSS variables at the end of `src/app/globals.css`, so a theme is one block.

| Theme | Background | Accent | Notes |
|---|---|---|---|
| Light (default) | `#F8F9FB`, cards `#F6F7F9` | `#0168DA` blue | Soft off-white, never pure white |
| Dark | `#0F1216`, cards `#171B20` | `#2F7BE5` blue | Text `#E6E9ED`, about 14:1 contrast |
| Neon | `#07070F`, cards `#0E0E1C` | `#00E5FF` cyan, `#FF2E97` pink, `#B6FF00` lime | Glow effects below |

## Neon glow (box-shadow recipe)
A glow is a stack of shadows: a 1px ring in the colour, a tight blur for the bright core, a wide blur for the haze.
- Primary button: `0 0 0 1px rgba(0,229,255,.6), 0 0 14px rgba(0,229,255,.55), 0 0 34px rgba(0,229,255,.25)`; on hover `0 0 0 1px #5CF0FF, 0 0 20px rgba(0,229,255,.8), 0 0 48px rgba(0,229,255,.4)`
- Cards: border `rgba(0,229,255,.28)`, shadow `0 0 18px rgba(0,229,255,.10)`
- Focused fields: `0 0 0 1px #00E5FF, 0 0 14px rgba(0,229,255,.5)`
- Secondary button hover (pink): `0 0 0 1px rgba(255,46,151,.7), 0 0 14px rgba(255,46,151,.4)`
- Headings and big numbers: `text-shadow: 0 0 10px to 12px` at 45 to 50% cyan

Minimal and Glass themes were built and set aside; they are in git history (commit 7bed0d2).

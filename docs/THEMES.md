# Themes

Five themes, chosen under **Settings, Appearance** or on **My profile**. The choice is saved per browser in the `tsink-theme` cookie and applied as `data-theme` on `<html>`. All colours are CSS variables at the end of `src/app/globals.css`, so a theme is one block.

| Theme | Background | Accent | Notes |
|---|---|---|---|
| Light (default) | `#F8F9FB`, cards `#F6F7F9` | `#0168DA` blue | Soft off-white, never pure white |
| Dark | `#0F1216`, cards `#171B20` | `#2F7BE5` blue | Text `#E6E9ED`, about 14:1 contrast |
| Neon | `#07070F`, cards `#0E0E1C` | `#00E5FF` cyan, `#FF2E97` pink, `#B6FF00` lime | Glow effects below |
| Minimal | `#FFFFFF` | `#111111` | Black, greys and one muted brick `#8A4B2A` for warnings. No shadows, 3px corners |
| Glass | Violet, magenta and blue gradient | `#9BE7FF` | Frosted cards below |

## Neon glow (box-shadow recipe)
A glow is a stack of shadows: a 1px ring in the colour, a tight blur for the bright core, a wide blur for the haze.
- Primary button: `0 0 0 1px rgba(0,229,255,.6), 0 0 14px rgba(0,229,255,.55), 0 0 34px rgba(0,229,255,.25)`; on hover `0 0 0 1px #5CF0FF, 0 0 20px rgba(0,229,255,.8), 0 0 48px rgba(0,229,255,.4)`
- Cards: border `rgba(0,229,255,.28)`, shadow `0 0 18px rgba(0,229,255,.10)`
- Focused fields: `0 0 0 1px #00E5FF, 0 0 14px rgba(0,229,255,.5)`
- Secondary button hover (pink): `0 0 0 1px rgba(255,46,151,.7), 0 0 14px rgba(255,46,151,.4)`
- Headings and big numbers: `text-shadow: 0 0 10px to 12px` at 45 to 50% cyan

## Glass (frosted glass values)
- Page backdrop: `radial-gradient` blobs `#9d174d` (top left), `#075985` (top right), `#5b21b6` (bottom) over `linear-gradient(135deg, #1e1b4b, #2e1065 50%, #0c2a5e)`, fixed
- Cards: `rgba(255,255,255,.14)`, `backdrop-filter: blur(18px) saturate(150%)`, border `1px solid rgba(255,255,255,.32)`, shadow `0 8px 32px rgba(8,4,40,.25)`
- Sidebar: `rgba(255,255,255,.10)`, `blur(24px) saturate(150%)`, border `rgba(255,255,255,.22)`
- Popups: `rgba(30,20,70,.55)`, `blur(28px) saturate(150%)`, border `rgba(255,255,255,.35)`
- Fields: `rgba(255,255,255,.16)` with border `rgba(255,255,255,.35)`
- The blur is on a `::before` layer of each card, because a `backdrop-filter` on the card itself would break the hover tooltips that position against the screen

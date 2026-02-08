# Speed Reader Font Options

## Current Font
**JetBrains Mono** - Switched Feb 1, 2026

## Previous Font
**System Monospace** (`font-mono` in Tailwind = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`)

---

## Font Options to Try

### Monospace (Best for ORP centering)
| Font | Google Fonts Link | Notes |
|------|-------------------|-------|
| **JetBrains Mono** ✅ | `family=JetBrains+Mono:wght@400;700` | Currently active. Clear, readable, good letter distinction |
| Fira Code | `family=Fira+Code:wght@400;700` | Wide characters, coding font |
| IBM Plex Mono | `family=IBM+Plex+Mono:wght@400;700` | Clean, modern |
| Source Code Pro | `family=Source+Code+Pro:wght@400;700` | Adobe's mono font |
| Roboto Mono | `family=Roboto+Mono:wght@400;700` | Google's mono font |

### Sans-Serif (Alternative approach)
| Font | Google Fonts Link | Notes |
|------|-------------------|-------|
| Inter | `family=Inter:wght@400;700` | Extremely legible for screens |
| Atkinson Hyperlegible | `family=Atkinson+Hyperlegible:wght@400;700` | Designed for accessibility |
| Lexend | `family=Lexend:wght@400;700` | Research-backed for reading fluency |
| Open Sans | `family=Open+Sans:wght@400;700` | Clean, neutral |

---

## How to Switch Fonts

1. Update `index.html` Google Fonts link
2. Update `SpeedReader.jsx` font-family in WordDisplay component

### Example for Fira Code:
```html
<!-- index.html -->
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap" rel="stylesheet">
```

```jsx
// SpeedReader.jsx - WordDisplay
style={{ fontFamily: "'Fira Code', monospace", ... }}
```

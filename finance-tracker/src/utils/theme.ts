export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system']

export function parseThemePreference(v: unknown): ThemePreference | undefined {
  return typeof v === 'string' && (THEME_PREFERENCES as readonly string[]).includes(v) ? v as ThemePreference : undefined
}

// The theme picked on this device before signing in (login/register toggle).
// Sent along when an account is created so the server default doesn't
// replace it on the first profile load.
export function storedThemePreference(): ThemePreference | undefined {
  try { return parseThemePreference(localStorage.getItem('theme_preference')) } catch { return undefined }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

// ── Color math helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0, s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

// ── Accent color ─────────────────────────────────────────────────────────────
// The accent picker in Settings sets `--accent-color`, `--aurora-violet` and
// the older v3 `--violet` token — nearly every button, active nav pill,
// "today" marker etc. across the app is styled off those, which is what
// makes the picker actually change anything on screen.
//
// `--aurora-fuchsia` (the gradient's second stop, e.g.
// `linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))`) used
// to stay pinned to a fixed pink regardless of the chosen accent — so e.g.
// green paired with a hardcoded pink read as a jarring, unrelated "rainbow"
// combination. It's now derived from the chosen accent itself (same hue,
// shifted lightness), so every accent produces a coherent monochromatic
// two-tone gradient instead — see accentFill / accentFillEnd below.
export const ACCENT_COLOR_KEY = 'accent_color'
export const DEFAULT_ACCENT_COLOR = '#3B82F6'

// ── Accent as a text colour ──────────────────────────────────────────────────
// Most accents are mid-tone (default blue #3B82F6 is ~3:1 on both themes), fine
// for fills and icons but below WCAG AA (4.5:1) for small text. Links, chips,
// "today" markers etc. use `--aurora-violet-text` instead, which index.css maps
// per theme to a same-hue variant lightened (dark) / darkened (light) until it
// reaches AA on the lightest (dark mode) / darkest (light mode) surface that
// such text sits on — an accent-tinted chip over the glass card.
const ACCENT_TEXT_SURFACES: Record<ResolvedTheme, string[]> = {
  dark: ['#26366B', '#1E3A57'],
  light: ['#DAEAFA', '#E2DDFC'],
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function readableAccent(color: string, theme: ResolvedTheme, min = 4.6): string {
  const [h, s, l0] = rgbToHsl(...hexToRgb(color))
  const surfaces = ACCENT_TEXT_SURFACES[theme]
  const step = theme === 'dark' ? 1 : -1
  for (let l = l0; l >= 0 && l <= 100; l += step) {
    const hex = rgbToHex(...hslToRgb(h, s, l))
    if (surfaces.every(bg => contrastRatio(hex, bg) >= min)) return hex
  }
  return theme === 'dark' ? '#ffffff' : '#000000'
}

// Primary buttons, active nav pills, badges etc. put white text on
// `linear-gradient(var(--aurora-violet), var(--aurora-fuchsia))`. Most picker
// accents are too light for that (white on #3B82F6 is 3.7:1, on #10B981 2.5:1),
// so the fill is the accent darkened just enough for white text to reach AA,
// and the gradient's second stop goes a little darker still instead of lighter.
export function accentFill(color: string, min = 4.6): string {
  const [h, s, l0] = rgbToHsl(...hexToRgb(color))
  for (let l = l0; l >= 0; l -= 1) {
    const hex = rgbToHex(...hslToRgb(h, s, l))
    if (contrastRatio(hex, '#ffffff') >= min) return hex
  }
  return '#000000'
}

export function accentFillEnd(color: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(accentFill(color)))
  return rgbToHex(...hslToRgb(h, s, Math.max(0, l - 8)))
}

export function applyAccentColor(color: string) {
  const html = document.documentElement
  html.style.setProperty('--accent-color', color)
  html.style.setProperty('--aurora-violet', accentFill(color))
  html.style.setProperty('--violet', accentFill(color))
  html.style.setProperty('--aurora-fuchsia', accentFillEnd(color))
  html.style.setProperty('--accent-text-dark', readableAccent(color, 'dark'))
  html.style.setProperty('--accent-text-light', readableAccent(color, 'light'))
}

// ── Background color ─────────────────────────────────────────────────────────
// Revolut-style per-theme page background: a radial glow anchored at the
// top-left corner of the viewport, fading into a darker (dark mode) or
// near-flat (light mode) base tone. Applied via `--aurora-bg-image` to the
// app shell's outermost surface only — the sidebar and main column stay
// transparent so this single gradient shows through both continuously,
// exactly matching the reference. `--aurora-bg` keeps holding a plain solid
// color (used as a border/box-shadow color in a few spots that can't take a
// gradient value) and `--aurora-panel` — the card/panel surface — is never
// touched by any of this.
export const BG_COLOR_KEY_DARK = 'bg_color_dark'
export const BG_COLOR_KEY_LIGHT = 'bg_color_light'
export const DEFAULT_BG_COLOR_DARK = '#002041'
export const DEFAULT_BG_COLOR_LIGHT = '#DAEAFA'

export function bgColorStorageKey(theme: ResolvedTheme): string {
  return theme === 'light' ? BG_COLOR_KEY_LIGHT : BG_COLOR_KEY_DARK
}

export function defaultBgColor(theme: ResolvedTheme): string {
  return theme === 'light' ? DEFAULT_BG_COLOR_LIGHT : DEFAULT_BG_COLOR_DARK
}

// Dark mode base tone: ~40% channel intensity of the glow color — matches
// the measured Navy reference pair (glow #002041 → base #000D19).
function darkBaseTone(glow: string): string {
  const [r, g, b] = hexToRgb(glow)
  return rgbToHex(r * 0.4, g * 0.4, b * 0.4)
}

// Light mode base tone: the swatch color itself, near-uniform — light mode's
// glow effect is deliberately gentler/flatter than dark mode's.
function lightCornerTint(swatch: string): string {
  const [r, g, b] = hexToRgb(swatch)
  return rgbToHex(r + (255 - r) * 0.4, g + (255 - g) * 0.4, b + (255 - b) * 0.4)
}

export function backgroundImage(color: string, theme: ResolvedTheme): string {
  if (theme === 'light') {
    return `radial-gradient(1400px circle at 0% 0%, ${lightCornerTint(color)} 0%, ${color} 70%)`
  }
  return `radial-gradient(1300px circle at 0% 0%, ${color} 0%, ${darkBaseTone(color)} 60%)`
}

export function applyBackgroundColor(color: string, theme: ResolvedTheme) {
  const html = document.documentElement
  html.style.setProperty('--aurora-bg', theme === 'light' ? color : darkBaseTone(color))
  html.style.setProperty('--aurora-bg-image', backgroundImage(color, theme))
}

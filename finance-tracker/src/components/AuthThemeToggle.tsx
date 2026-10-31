import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { resolveTheme, type ThemePreference } from '../utils/theme'

// Segmented Dark / Light theme switcher for the pre-auth screens (Login /
// Register). "System" is intentionally omitted here — Nastavenia → Vzhľad
// keeps all 3 options. Writes `theme_preference` + resolves it onto
// `data-theme`; App.tsx's MutationObserver re-applies the chosen background
// tint whenever `data-theme` flips.
export function AuthThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => {
    try { return (localStorage.getItem('theme_preference') as ThemePreference) ?? 'dark' } catch { return 'dark' }
  })

  const apply = (next: ThemePreference) => {
    setPref(next)
    try { localStorage.setItem('theme_preference', next) } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', resolveTheme(next))
  }

  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: 4 }}>
      {([
        { id: 'dark', icon: Moon, label: 'Dark' },
        { id: 'light', icon: Sun, label: 'Light' },
      ] as const).map(({ id, icon: Icon, label }) => {
        const active = pref === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => apply(id)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 10, cursor: 'pointer',
              border: active ? '1px solid var(--aurora-violet)' : '1px solid transparent',
              background: active ? 'rgba(139,92,246,0.16)' : 'transparent',
              color: active ? 'var(--aurora-violet-text)' : 'var(--aurora-lo)',
              transition: 'all 0.15s',
            }}
          >
            <Icon size={15} />
          </button>
        )
      })}
    </div>
  )
}

import type { ReactNode } from 'react'
import { useTranslation } from '../i18n'
import { formatMoneyParts } from '../utils/format'
import { LanguageSwitcher } from './LanguageSwitcher'
import { AuthThemeToggle } from './AuthThemeToggle'
import { GlassCard } from './GlassCard'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Rendered next to the page, e.g. a full-screen modal. */
  overlay?: ReactNode
}

/**
 * Shared frame of the pre-login pages (sign in, register, password reset, e-mail
 * check). Desktop: an aside with the pitch and an example card next to the form.
 * Mobile: logo and form only. Layout classes live in index.css (.auth-*).
 */
export function AuthShell({ title, subtitle, children, overlay }: AuthShellProps) {
  const { t, locale } = useTranslation()
  const demoBalance = formatMoneyParts(1011.2, locale)

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--aurora-bg-image)', position: 'relative', overflow: 'hidden' }}>

      {/* Atmospheric blob */}
      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

      {/* Top controls: language switcher + theme toggle */}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 100 }}>
        <LanguageSwitcher />
        <AuthThemeToggle />
      </div>

      <div className="auth-split">
        <aside className="auth-aside" aria-hidden="true">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo.svg" alt="" style={{ width: 46, height: 46, borderRadius: 14 }} />
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 30, fontWeight: 600, color: 'var(--aurora-hi)' }}>Finvu</span>
          </div>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(34px, 3.6vw, 52px)', lineHeight: 1.1, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0, maxWidth: '14ch', textWrap: 'balance' }}>{t.auth.asideHeadline}</p>
          <GlassCard radius={24} style={{ padding: 28, maxWidth: 480 }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 16, fontWeight: 600, color: 'var(--aurora-lo)' }}>{t.auth.demoBalance}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, color: 'var(--aurora-hi)', lineHeight: 1.15, margin: '6px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontSize: 64 }}>+{demoBalance.main}</span><span style={{ fontSize: 34 }}>{demoBalance.rest}</span>
            </div>
            {[{ name: t.auth.demoCat1, pct: 48 }, { name: t.auth.demoCat2, pct: 26 }].map(c => (
              <div key={c.name} style={{ marginTop: 16, fontFamily: "'Manrope', sans-serif", fontSize: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--aurora-hi)' }}>
                  <span>{c.name}</span><b style={{ color: 'var(--aurora-emerald)', fontVariantNumeric: 'tabular-nums' }}>{c.pct} %</b>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--aurora-glass)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', background: 'var(--aurora-emerald)' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 20, fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>{t.auth.demoNote}</div>
          </GlassCard>
        </aside>

        <div className="auth-form-col">
          <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px 28px', position: 'relative', zIndex: 1 }}>
            {/* Brand row (mobile; on desktop the brand sits in the aside) */}
            <div className="mb-only fade-up" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <img src="/logo.svg" alt="" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'var(--aurora-hi)' }}>Finvu</span>
            </div>
            <div className="fade-up" style={{ marginBottom: 28 }}>
              <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 600, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>{title}</h1>
              {subtitle && <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-lo)', margin: 0 }}>{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>

      {overlay}
    </div>
  )
}

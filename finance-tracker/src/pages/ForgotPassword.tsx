import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { useTranslation } from '../i18n'
import { forgotPassword } from '../api/auth'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AuthThemeToggle } from '../components/AuthThemeToggle'

interface ForgotPasswordPageProps {
  onNavigateLogin: () => void
}

export function ForgotPasswordPage({ onNavigateLogin }: ForgotPasswordPageProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [focused, setFocused] = useState(false)
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email) return
    setIsLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } finally {
      setIsLoading(false)
    }
  }

  const pillInput: React.CSSProperties = {
    width: '100%',
    background: 'var(--aurora-glass)',
    color: 'var(--aurora-hi)',
    borderRadius: 16,
    padding: '14px 16px',
    fontSize: 14,
    fontFamily: "'Manrope', sans-serif",
    border: `1px solid ${focused ? 'var(--aurora-violet)' : 'var(--aurora-gline)'}`,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focused ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--aurora-lo)',
    fontFamily: "'Manrope', sans-serif",
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--aurora-bg-image)', position: 'relative', overflow: 'hidden' }}>

      {/* Atmospheric blob */}
      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />

      {/* Top controls: language switcher + theme toggle */}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 100 }}>
        <LanguageSwitcher />
        <AuthThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px 28px', position: 'relative', zIndex: 1 }}>

        {/* Brand row */}
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <img src="/logo.svg" alt="Finvu" style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 27, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>{t.auth.forgotPasswordTitle}</h1>
            {!sent && (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', margin: 0 }}>
                {t.auth.forgotPasswordDesc}
              </p>
            )}
          </div>
        </div>

        {sent ? (
          <div style={{
            width: '100%',
            background: 'var(--aurora-glass)',
            border: '1px solid var(--aurora-gline)',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            textAlign: 'center',
          }}>
            <CheckCircle size={40} color="var(--aurora-violet)" />
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, lineHeight: 1.6, color: 'var(--aurora-hi)', margin: 0 }}>{t.auth.resetLinkSent}</p>
          </div>
        ) : (
          <>
            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="forgot-email" style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>{t.auth.email}</label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={pillInput}
              />
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={isLoading || !email}
              style={{
                height: 48, width: '100%', marginTop: 8,
                background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
                color: 'white', border: 'none', borderRadius: 16,
                fontSize: 14, fontWeight: 700, cursor: isLoading || !email ? 'not-allowed' : 'pointer',
                boxShadow: isLoading || !email ? 'none' : '0 4px 20px rgba(139,92,246,0.4)',
                opacity: isLoading || !email ? 0.6 : 1,
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              {isLoading ? (
                <>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', animation: 'spin 0.7s linear infinite' }} />
                  Odosielam...
                </>
              ) : t.auth.sendResetLink}
            </button>
          </>
        )}

        {/* Back to login */}
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--aurora-lo)', margin: '28px 0 0', fontFamily: "'Manrope', sans-serif" }}>
          <button
            type="button"
            onClick={onNavigateLogin}
            style={{ color: 'var(--aurora-violet-text)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}
          >
            ← {t.auth.backToLogin}
          </button>
        </p>

      </div>
    </div>
  )
}

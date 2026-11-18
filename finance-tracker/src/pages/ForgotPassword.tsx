import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { useTranslation } from '../i18n'
import { forgotPassword } from '../api/auth'
import { AuthShell } from '../components/AuthShell'
import { authLabelStyle, authInputStyle, authButtonStyle, authFooterStyle, authLinkButtonStyle, authSpinnerStyle } from '../components/authStyles'

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

  return (
    <AuthShell title={t.auth.forgotPasswordTitle} subtitle={sent ? undefined : t.auth.forgotPasswordDesc}>
      {sent ? (
        <div role="status" style={{
          background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16,
          padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
        }}>
          <CheckCircle size={40} color="var(--aurora-violet)" />
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, lineHeight: 1.6, color: 'var(--aurora-hi)', margin: 0 }}>{t.auth.resetLinkSent}</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="forgot-email" style={{ ...authLabelStyle, display: 'block', marginBottom: 8 }}>{t.auth.email}</label>
            <input
              id="forgot-email" name="email" type="email" inputMode="email" autoComplete="username"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder={t.auth.emailPlaceholder} value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={authInputStyle(focused)}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading || !email}
            style={authButtonStyle(isLoading ? 'busy' : !email ? 'disabled' : 'idle')}
          >
            {isLoading ? (<><div style={authSpinnerStyle} />{t.auth.sendingDots}</>) : t.auth.sendResetLink}
          </button>
        </>
      )}

      <p style={authFooterStyle}>
        <button type="button" onClick={onNavigateLogin} style={authLinkButtonStyle}>{t.auth.backToLogin}</button>
      </p>
    </AuthShell>
  )
}

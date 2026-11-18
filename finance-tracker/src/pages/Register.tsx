import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '../i18n'
import { apiErrorMessage } from '../utils/apiError'
import { useAuth } from '../context/AuthContext'
import { AuthShell } from '../components/AuthShell'
import { authLabelStyle, authInputStyle, authButtonStyle, authErrorStyle, authFooterStyle, authLinkButtonStyle, authSpinnerStyle } from '../components/authStyles'

interface RegisterPageProps {
  onNavigateLogin: () => void
  onNavigatePrivacyPolicy: () => void
}

export function RegisterPage({ onNavigateLogin, onNavigatePrivacyPolicy }: RegisterPageProps) {
  const { t } = useTranslation()
  const { register } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [gdprConsent, setGdprConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleRegister = async () => {
    setError(null)
    if (!name.trim() || name.trim().length < 2) { setError(t.auth.nameMin2); return }
    if (!email) { setError(t.auth.enterEmail); return }
    if (password.length < 8) { setError(t.auth.passwordMin8); return }
    if (password !== confirmPassword) { setError(t.settings.passwordMismatch); return }
    if (!gdprConsent) { setError(t.auth.gdprRequired); return }

    setIsLoading(true)
    try {
      await register(email, password, name.trim(), gdprConsent)
      setVerificationSent(true)
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t.auth.registerFailed, t))
    } finally {
      setIsLoading(false)
    }
  }

  const eyeStyle: React.CSSProperties = {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-lo)',
    display: 'flex', alignItems: 'center', padding: 2,
  }
  const fieldBox: React.CSSProperties = { marginBottom: 14 }
  const lbl: React.CSSProperties = { ...authLabelStyle, display: 'block', marginBottom: 8 }

  if (verificationSent) {
    return (
      <AuthShell title={t.auth.verifyEmailTitle}>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-lo)', lineHeight: 1.6, margin: 0 }}>{t.auth.verificationSent}</p>
        <p style={{ ...authFooterStyle, textAlign: 'left', marginTop: 20 }}>
          <button type="button" onClick={onNavigateLogin} style={authLinkButtonStyle}>{t.auth.backToLogin}</button>
        </p>
      </AuthShell>
    )
  }

  const busy = isLoading
  const blocked = !gdprConsent

  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      {error && <div role="alert" style={authErrorStyle}>{error}</div>}

      <div style={fieldBox}>
        <label htmlFor="register-name" style={lbl}>{t.auth.nameLabel}</label>
        <input
          id="register-name" name="name" type="text" autoComplete="name" autoCapitalize="words"
          placeholder={t.auth.namePlaceholder} value={name}
          onChange={e => setName(e.target.value)}
          onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
          style={authInputStyle(focused === 'name')}
        />
      </div>

      <div style={fieldBox}>
        <label htmlFor="register-email" style={lbl}>{t.auth.email}</label>
        <input
          id="register-email" name="email" type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder={t.auth.emailPlaceholder} value={email}
          onChange={e => setEmail(e.target.value)}
          onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
          style={authInputStyle(focused === 'email')}
        />
      </div>

      <div style={fieldBox}>
        <label htmlFor="register-password" style={lbl}>{t.auth.password}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="register-password" name="new-password" autoComplete="new-password"
            type={showPassword ? 'text' : 'password'} placeholder={t.auth.minChars} value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            style={authInputStyle(focused === 'password', true)}
          />
          <button
            type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? t.auth.hidePasswordLabel : t.auth.showPasswordLabel}
            style={eyeStyle}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div style={fieldBox}>
        <label htmlFor="register-confirm" style={lbl}>{t.auth.confirmPassword}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="register-confirm" name="confirm-password" autoComplete="new-password"
            type={showConfirm ? 'text' : 'password'} value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()}
            style={authInputStyle(focused === 'confirm', true)}
          />
          <button
            type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)}
            aria-label={showConfirm ? t.auth.hidePasswordLabel : t.auth.showPasswordLabel}
            style={eyeStyle}
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4 }}>
        <input
          type="checkbox" id="gdpr" checked={gdprConsent}
          onChange={e => setGdprConsent(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--aurora-violet)', colorScheme: 'var(--aurora-color-scheme)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
        />
        <label htmlFor="gdpr" style={{ fontSize: 13, color: 'var(--aurora-lo)', cursor: 'pointer', lineHeight: 1.5, fontFamily: "'Manrope', sans-serif" }}>
          {t.auth.gdprConsent}{' '}
          <button
            type="button" onClick={onNavigatePrivacyPolicy}
            style={{ color: 'var(--aurora-violet-text)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
          >
            ({t.auth.privacyPolicy})
          </button>
        </label>
      </div>

      <button
        type="button" onClick={handleRegister} disabled={busy || blocked}
        style={{ ...authButtonStyle(busy ? 'busy' : blocked ? 'disabled' : 'idle'), marginTop: 20 }}
      >
        {busy ? (<><div style={authSpinnerStyle} />{t.common.saving}</>) : t.auth.createAccount}
      </button>

      <p style={authFooterStyle}>
        {t.auth.hasAccount}{' '}
        <button type="button" onClick={onNavigateLogin} style={authLinkButtonStyle}>{t.auth.login}</button>
      </p>
    </AuthShell>
  )
}

import { useState, useEffect } from 'react'
import { useTranslation } from '../i18n'
import { apiErrorMessage } from '../utils/apiError'
import { resetPassword } from '../api/auth'
import { AuthShell } from '../components/AuthShell'
import { authLabelStyle, authInputStyle, authButtonStyle, authErrorStyle, authFooterStyle, authLinkButtonStyle, authSpinnerStyle } from '../components/authStyles'

interface ResetPasswordPageProps {
  token: string
  onNavigateLogin: () => void
}

export function ResetPasswordPage({ token, onNavigateLogin }: ResetPasswordPageProps) {
  const { t } = useTranslation()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [focused, setFocused] = useState<'p1' | 'p2' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (!success) return
    if (countdown <= 0) { onNavigateLogin(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [success, countdown, onNavigateLogin])

  const handleSubmit = async () => {
    setError(null)
    if (newPassword.length < 8) { setError(t.auth.passwordMin8); return }
    if (newPassword !== confirmPassword) { setError(t.settings.passwordMismatch); return }
    setIsLoading(true)
    try {
      await resetPassword(token, newPassword)
      setSuccess(true)
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t.auth.linkExpired, t))
    } finally {
      setIsLoading(false)
    }
  }

  const missing = !newPassword || !confirmPassword

  return (
    <AuthShell title={t.auth.resetPasswordTitle} subtitle={success ? undefined : t.auth.resetPasswordDesc}>
      {success ? (
        <div role="status" style={{
          background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16,
          padding: 20, textAlign: 'center', fontFamily: "'Manrope', sans-serif",
        }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--aurora-hi)', margin: '0 0 8px' }}>{t.auth.resetSuccessMsg}</p>
          <p style={{ fontSize: 13, color: 'var(--aurora-lo)', margin: 0 }}>{t.auth.redirectingIn.replace('{n}', String(countdown))}</p>
        </div>
      ) : (
        <>
          {error && <div role="alert" style={authErrorStyle}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="reset-password" style={{ ...authLabelStyle, display: 'block', marginBottom: 8 }}>{t.auth.newPasswordLabel}</label>
            <input
              id="reset-password" name="new-password" type="password" autoComplete="new-password"
              placeholder={t.auth.minChars} value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={() => setFocused('p1')} onBlur={() => setFocused(null)}
              style={authInputStyle(focused === 'p1')}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="reset-confirm" style={{ ...authLabelStyle, display: 'block', marginBottom: 8 }}>{t.auth.confirmPassword}</label>
            <input
              id="reset-confirm" name="confirm-password" type="password" autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onFocus={() => setFocused('p2')} onBlur={() => setFocused(null)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={authInputStyle(focused === 'p2')}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={isLoading || missing}
            style={authButtonStyle(isLoading ? 'busy' : missing ? 'disabled' : 'idle')}
          >
            {isLoading ? (<><div style={authSpinnerStyle} />{t.auth.saving}</>) : t.auth.resetPasswordBtn}
          </button>
        </>
      )}

      <p style={authFooterStyle}>
        <button type="button" onClick={onNavigateLogin} style={authLinkButtonStyle}>{t.auth.backToLogin}</button>
      </p>
    </AuthShell>
  )
}

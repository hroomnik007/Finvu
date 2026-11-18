import { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import { verifyEmail } from '../api/auth'
import { AuthShell } from '../components/AuthShell'
import { authButtonStyle, authFooterStyle, authLinkButtonStyle } from '../components/authStyles'

interface VerifyEmailPageProps {
  token: string
  onNavigateLogin: () => void
}

export function VerifyEmailPage({ token, onNavigateLogin }: VerifyEmailPageProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  const text: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 14, lineHeight: 1.6, margin: 0 }

  return (
    <AuthShell title={t.auth.verifyEmailTitle}>
      {status === 'loading' && <p role="status" style={{ ...text, color: 'var(--aurora-lo)' }}>{t.auth.verifyingEmail}</p>}
      {status === 'success' && (
        <>
          <p role="status" style={{ ...text, color: 'var(--aurora-hi)' }}>{t.auth.verifyEmailSuccess}</p>
          <button type="button" onClick={onNavigateLogin} style={{ ...authButtonStyle(), marginTop: 24 }}>{t.auth.login}</button>
        </>
      )}
      {status === 'error' && (
        <>
          <p role="alert" style={{ ...text, color: 'var(--aurora-rose)' }}>{t.auth.verifyEmailError}</p>
          <p style={{ ...authFooterStyle, textAlign: 'left', marginTop: 20 }}>
            <button type="button" onClick={onNavigateLogin} style={authLinkButtonStyle}>{t.auth.backToLogin}</button>
          </p>
        </>
      )}
    </AuthShell>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { Eye, EyeOff, ArrowRight, X } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useGoogleLogin } from '@react-oauth/google'
import { getPinDeviceStatus, resendVerification, webauthnAuthenticateOptions, webauthnAuthenticateVerify } from '../api/auth'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AuthThemeToggle } from '../components/AuthThemeToggle'
import { PinKeypad } from '../components/PinKeypad'
import { authErrorMessage } from '../utils/authError'

interface LoginPageProps {
  onNavigateRegister: () => void
  onNavigateForgotPassword: () => void
}

export function LoginPage({ onNavigateRegister, onNavigateForgotPassword }: LoginPageProps) {
  const { t } = useTranslation()
  const { login, loginDemo, loginWithGoogle, loginWithPin, loginWithToken } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [focused, setFocused] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  // null = still checking; this is what tells the modal apart from a "wrong
  // PIN" screen when the device was simply never bound (see backend's
  // pin-device-status endpoint / PIN device-binding architecture).
  const [pinDeviceRegistered, setPinDeviceRegistered] = useState<boolean | null>(null)

  // Whether this browser holds a valid PIN-device cookie. Decided by the cookie
  // alone, never by the typed email, so the form doesn't reveal which emails
  // have an account or which sign-in methods they use.
  const [pinOnThisDevice, setPinOnThisDevice] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const lastPinTapRef = useRef(0)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== 'true') return
    setEmail('demo@finvu.sk')
    setPassword('demo123')
  }, [])

  useEffect(() => {
    let cancelled = false
    getPinDeviceStatus()
      .then(({ deviceRegistered }) => { if (!cancelled) setPinOnThisDevice(deviceRegistered) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const googleLogin = useGoogleLogin({
    onSuccess: async tokenResponse => {
      setIsGoogleLoading(true)
      setError(null)
      try {
        await loginWithGoogle(tokenResponse.access_token)
      } catch {
        setError(t.auth.googleError)
      } finally {
        setIsGoogleLoading(false)
      }
    },
    onError: () => setError(t.auth.googleError),
  })

  const handleLogin = async () => {
    if (!email || !password) return
    setError(null)
    setNeedsVerification(false)
    setResendSent(false)
    setIsLoading(true)
    try {
      if (email === 'demo@finvu.sk') {
        await loginDemo()
      } else {
        await login(email, password)
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data
      setError(authErrorMessage(err, t.auth.loginFailed, t.auth.tooManyAttempts))
      setNeedsVerification(data?.code === 'EMAIL_NOT_VERIFIED')
    } finally {
      setIsLoading(false)
    }
  }

  // Passkey sign-in: with an e-mail the server restricts the prompt to that
  // user's credentials, without one the browser offers its discoverable passkeys.
  const handlePasskeyLogin = async () => {
    setError(null)
    setNeedsVerification(false)
    setPasskeyLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const options = await webauthnAuthenticateOptions(email.includes('@') ? email : undefined) as { _challengeKey: string }
      const assertion = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON })
      const { user: me, accessToken, sessionId } = await webauthnAuthenticateVerify({ ...assertion, _challengeKey: options._challengeKey })
      loginWithToken(me, accessToken, sessionId)
    } catch (err: unknown) {
      // The user dismissing the browser prompt is not an error worth showing
      if ((err as { name?: string })?.name === 'NotAllowedError') return
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? t.auth.passkeyFailed)
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleResendVerification = async () => {
    try {
      await resendVerification(email)
    } catch { /* the server answers identically either way; nothing to surface */ }
    setResendSent(true)
  }

  const handlePinLogin = useCallback(async (pin: string) => {
    if (!email || pin.length !== 4) return
    setPinError(null)
    setPinLoading(true)
    try {
      await loginWithPin(email, pin)
      setPinModalOpen(false)
    } catch (err: unknown) {
      setPinError(authErrorMessage(err, t.auth.wrongPin, t.auth.tooManyAttempts))
      setPinValue('')
    } finally {
      setPinLoading(false)
    }
  }, [email, loginWithPin, t.auth.wrongPin, t.auth.tooManyAttempts])

  // Trigger verification once 4 digits have actually committed to state —
  // never inside the setPinValue updater itself. React 18 StrictMode
  // double-invokes updater functions (to surface impure updaters), which
  // previously caused handlePinLogin to fire twice for the same PIN when the
  // submit was scheduled from inside the updater.
  useEffect(() => {
    if (pinValue.length !== 4) return
    const timer = setTimeout(() => handlePinLogin(pinValue), 100)
    return () => clearTimeout(timer)
  }, [pinValue, handlePinLogin])

  const handlePinKey = useCallback((k: string) => {
    if (pinLoading) return
    const now = Date.now()
    if (now - lastPinTapRef.current < 80) return
    lastPinTapRef.current = now
    if (k === 'backspace') { setPinValue(v => v.slice(0, -1)); setPinError(null); return }
    setPinValue(prev => (prev.length >= 4 ? prev : prev + k))
  }, [pinLoading])

  // Physical-keyboard entry is now handled inside PinKeypad itself (see
  // components/PinKeypad.tsx) — it's only rendered below while pinModalOpen
  // && pinDeviceRegistered !== false, and disabled (which also mutes its
  // keyboard listener) while pinDeviceRegistered === null or pinLoading.

  // Checked on every modal open, not just once — the PIN device cookie can
  // change between opens (e.g. PIN was just set up on this browser in
  // another tab). Falls back to "registered" on a network error so a
  // transient failure doesn't block the existing, previously-working flow.
  useEffect(() => {
    if (!pinModalOpen) return
    setPinDeviceRegistered(null)
    let cancelled = false
    getPinDeviceStatus()
      .then(({ deviceRegistered }) => { if (!cancelled) setPinDeviceRegistered(deviceRegistered) })
      .catch(() => { if (!cancelled) setPinDeviceRegistered(true) })
    return () => { cancelled = true }
  }, [pinModalOpen])

  const pillInput = (name: string): React.CSSProperties => ({
    width: '100%',
    background: 'var(--aurora-glass)',
    color: 'var(--aurora-hi)',
    borderRadius: 16,
    padding: name === 'password' ? '14px 44px 14px 16px' : '14px 16px',
    fontSize: 14,
    fontFamily: "'Manrope', sans-serif",
    border: `1px solid ${focused === name ? 'var(--aurora-violet)' : 'var(--aurora-gline)'}`,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxShadow: focused === name ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none',
    boxSizing: 'border-box' as const,
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--aurora-lo)',
    fontFamily: "'Manrope', sans-serif",
  }

  const altPillStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
    borderRadius: 14, padding: '12px 8px',
    color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif",
    fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
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
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 27, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>{t.auth.welcomeBackTitle}</h1>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', margin: 0 }}>{t.auth.welcomeBackSubtitle}</p>
          </div>
        </div>

        {error && (
          <div style={{ borderRadius: 14, padding: '10px 14px', fontSize: 13, background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)', border: '1px solid rgba(251,113,133,0.3)', marginBottom: 14, fontFamily: "'Manrope', sans-serif" }}>
            {error}
            {needsVerification && (
              resendSent ? (
                <div style={{ marginTop: 8 }}>{t.auth.resendVerificationSent}</div>
              ) : (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  style={{ display: 'block', marginTop: 8, padding: 0, background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}
                >
                  {t.auth.resendVerification}
                </button>
              )
            )}
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>{t.auth.email}</label>
          <input
            type="email"
            placeholder={t.auth.emailPlaceholder}
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={pillInput('email')}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={labelStyle}>{t.auth.password}</label>
            <button
              type="button"
              onClick={onNavigateForgotPassword}
              style={{ fontSize: 12, color: 'var(--aurora-violet-text)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", padding: 0 }}
            >
              {t.auth.forgotPasswordLink}
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={pillInput('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              tabIndex={-1}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-lo)', display: 'flex', alignItems: 'center', padding: 2 }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={isLoading || !email || !password}
          style={{
            height: 48, width: '100%', marginTop: 8,
            background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
            color: 'white', border: 'none', borderRadius: 16,
            fontSize: 14, fontWeight: 700, cursor: isLoading || !email || !password ? 'not-allowed' : 'pointer',
            boxShadow: isLoading || !email || !password ? 'none' : '0 4px 20px rgba(139,92,246,0.4)',
            opacity: isLoading || !email || !password ? 0.6 : 1,
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          {isLoading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', animation: 'spin 0.7s linear infinite' }} />
              {t.auth.loggingInDots}
            </>
          ) : (
            <>{t.auth.login} <ArrowRight size={14} /></>
          )}
        </button>

        {/* Alt sign-in methods */}
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, margin: '24px 0 10px' }}>{t.auth.continueWithLabel}</p>

        {pinOnThisDevice ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (!email.includes('@')) { setError(t.auth.enterEmail); return }
                setError(null); setPinModalOpen(true); setPinValue(''); setPinError(null)
              }}
              style={{ ...altPillStyle, flex: 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="10" width="18" height="10" rx="2"/><path d="M7 10V7a5 5 0 0110 0v3"/></svg>
              {t.auth.loginWithPin}
            </button>
            <button
              type="button"
              onClick={() => googleLogin()}
              disabled={isGoogleLoading}
              style={{ ...altPillStyle, flex: 1, opacity: isGoogleLoading ? 0.6 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22 12.2c0-.7-.06-1.4-.19-2H12v3.8h5.6a4.8 4.8 0 01-2.08 3.15v2.6h3.36c1.97-1.8 3.1-4.47 3.1-7.55z"/>
                <path fill="#34A853" d="M12 22c2.8 0 5.15-.93 6.87-2.5l-3.36-2.6c-.93.63-2.13 1-3.5 1-2.7 0-4.98-1.8-5.8-4.24H2.7v2.65A10 10 0 0012 22z"/>
                <path fill="#FBBC05" d="M6.2 13.66a6 6 0 010-3.84V7.17H2.7a10 10 0 000 8.98z"/>
                <path fill="#EA4335" d="M12 6.4c1.5 0 2.85.5 3.9 1.5l2.9-2.9C16.94 3.3 14.6 2.4 12 2.4a10 10 0 00-9.3 5.77l3.5 2.65C6.02 8.4 8.3 6.4 12 6.4z"/>
              </svg>
              Google
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => googleLogin()}
            disabled={isGoogleLoading}
            style={{ ...altPillStyle, width: '100%', opacity: isGoogleLoading ? 0.6 : 1 }}
          >
            {isGoogleLoading ? (
              <span>{t.auth.loggingIn}</span>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22 12.2c0-.7-.06-1.4-.19-2H12v3.8h5.6a4.8 4.8 0 01-2.08 3.15v2.6h3.36c1.97-1.8 3.1-4.47 3.1-7.55z"/>
                  <path fill="#34A853" d="M12 22c2.8 0 5.15-.93 6.87-2.5l-3.36-2.6c-.93.63-2.13 1-3.5 1-2.7 0-4.98-1.8-5.8-4.24H2.7v2.65A10 10 0 0012 22z"/>
                  <path fill="#FBBC05" d="M6.2 13.66a6 6 0 010-3.84V7.17H2.7a10 10 0 000 8.98z"/>
                  <path fill="#EA4335" d="M12 6.4c1.5 0 2.85.5 3.9 1.5l2.9-2.9C16.94 3.3 14.6 2.4 12 2.4a10 10 0 00-9.3 5.77l3.5 2.65C6.02 8.4 8.3 6.4 12 6.4z"/>
                </svg>
                Google
              </>
            )}
          </button>
        )}

        {typeof window !== 'undefined' && 'PublicKeyCredential' in window && (
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={passkeyLoading}
            style={{ ...altPillStyle, width: '100%', marginTop: 10, opacity: passkeyLoading ? 0.6 : 1 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 016-6h2"/><circle cx="18" cy="15" r="2.5"/><path d="M18 17.5V22l-2 -1.5"/></svg>
            {passkeyLoading ? t.auth.loggingIn : t.auth.loginWithPasskey}
          </button>
        )}

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--aurora-lo)', margin: '28px 0 0', fontFamily: "'Manrope', sans-serif" }}>
          {t.auth.noAccount}{' '}
          <button
            type="button"
            onClick={onNavigateRegister}
            style={{ color: 'var(--aurora-violet-text)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}
          >
            {t.auth.registerArrow}
          </button>
        </p>

      </div>

      {/* PIN modal */}
      {pinModalOpen && (
        <div
          className="fade-in"
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--aurora-bg-image)', zIndex: 200 }}
          onClick={() => setPinModalOpen(false)}
        >
          <div
            className="modal-in"
            style={{ width: '100%', maxWidth: 340, padding: 24, borderRadius: 26, background: 'var(--aurora-bg-image)', border: '1px solid var(--aurora-gline)', boxShadow: '0 30px 70px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.auth.enterPinTitle}</p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', margin: '4px 0 0' }}>{t.auth.pin4Digit}</p>
              </div>
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                aria-label={t.common.close}
                style={{ position: 'absolute', top: 24, right: 24, width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            {pinDeviceRegistered === false ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--aurora-lo)', margin: 0, fontFamily: "'Manrope', sans-serif", lineHeight: 1.5 }}>
                  {t.auth.pinDeviceNotRegistered}
                </p>
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  style={{
                    width: '100%', height: 44,
                    background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
                    color: 'white', border: 'none', borderRadius: 14,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {t.auth.pinDeviceNotRegisteredCta}
                </button>
              </div>
            ) : (
              <>
                <PinKeypad length={4} digits={pinValue.length} disabled={pinLoading || pinDeviceRegistered === null} onKey={handlePinKey} />
                {pinError && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--aurora-rose)', margin: '16px 0 0', fontFamily: "'Manrope', sans-serif" }}>{pinError}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

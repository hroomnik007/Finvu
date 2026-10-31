import { useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePinLock } from '../hooks/usePinLock'
import { PinSetupModal } from './PinSetupModal'
import { startRegistration } from '@simplewebauthn/browser'
import { webauthnRegisterVerify } from '../api/auth'
import { ceremonyErrorKind, fetchRegisterOptions } from '../lib/webauthnCeremony'
import { currentUa, suggestPasskeyName } from '../lib/passkeyName'
import { useTranslation } from '../i18n'

const STEP_EMOJIS = ['🎉', '💰', '📊', '🐷', '🏠', '⚙️', '🔐']

interface OnboardingTutorialProps {
  onComplete: () => void
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0)
  const [exiting, setExiting] = useState(false)
  const { user } = useAuth()
  const { setupPin } = usePinLock()
  const { t } = useTranslation()

  const STEPS = [
    { title: t.onboarding.step0Title, description: t.onboarding.step0Desc, emoji: STEP_EMOJIS[0] },
    { title: t.onboarding.step1Title, description: t.onboarding.step1Desc, emoji: STEP_EMOJIS[1] },
    { title: t.onboarding.step2Title, description: t.onboarding.step2Desc, emoji: STEP_EMOJIS[2] },
    { title: t.onboarding.step3Title, description: t.onboarding.step3Desc, emoji: STEP_EMOJIS[3] },
    { title: t.onboarding.step4Title, description: t.onboarding.step4Desc, emoji: STEP_EMOJIS[4] },
    { title: t.onboarding.step5Title, description: t.onboarding.step5Desc, emoji: STEP_EMOJIS[5] },
    { title: t.onboarding.step6Title, description: t.onboarding.step6Desc, emoji: STEP_EMOJIS[6] },
  ]
  const [pinSetupOpen, setPinSetupOpen] = useState(false)
  const [webauthnDone, setWebauthnDone] = useState(false)
  const [webauthnLoading, setWebauthnLoading] = useState(false)
  const [webauthnError, setWebauthnError] = useState<string | null>(null)
  // Registering a passkey re-checks the current password (or PIN for accounts
  // without one); the field appears on the first press, the second performs it.
  const [webauthnSecretOpen, setWebauthnSecretOpen] = useState(false)
  const [webauthnSecret, setWebauthnSecret] = useState('')
  const [pinDone, setPinDone] = useState(false)

  const isLastStep = step === STEPS.length - 1
  const isLoginMethodStep = step === STEPS.length - 1

  function handleNext() {
    if (isLastStep) {
      handleComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  function handleComplete() {
    setExiting(true)
    setTimeout(onComplete, 300)
  }

  const reauthFactor: 'password' | 'pin' | null = user?.has_password ? 'password' : user?.has_pin ? 'pin' : null

  const handleWebAuthnSetup = async () => {
    if (reauthFactor && !webauthnSecretOpen) {
      setWebauthnSecretOpen(true)
      return
    }
    if (reauthFactor && !webauthnSecret) return
    setWebauthnLoading(true)
    setWebauthnError(null)
    try {
      // Tap -> one native fetch -> create() (see lib/webauthnCeremony).
      const options = await fetchRegisterOptions(
        reauthFactor === 'password' ? { currentPassword: webauthnSecret }
          : reauthFactor === 'pin' ? { currentPin: webauthnSecret }
          : {},
      )
      const response = await startRegistration({ optionsJSON: options })
      await webauthnRegisterVerify({ ...response, name: suggestPasskeyName(currentUa(), response.authenticatorAttachment, t.settings) })
      setWebauthnDone(true)
      setWebauthnSecret('')
    } catch (e: unknown) {
      const serverMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      const kind = serverMsg ? 'other' : ceremonyErrorKind(e)
      setWebauthnError(kind === 'cancelled' ? t.settings.passkeyCancelled
        : kind === 'exists' ? t.settings.passkeyExists
        : serverMsg ?? t.auth.registerFailed)
    } finally {
      setWebauthnLoading(false)
    }
  }

  const current = STEPS[step]

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: 'rgba(13,10,26,0.85)',
          backdropFilter: 'blur(6px)',
          opacity: exiting ? 0 : 1,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '24px',
            padding: '32px 28px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button type="button" className="hit-44" aria-label={t.common.close} title={t.common.close}
            onClick={handleComplete}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#9D84D4',
            }}
          >
            <X size={16} />
          </button>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: '3px',
                  flex: 1,
                  borderRadius: '2px',
                  backgroundColor: i <= step ? '#7C3AED' : 'var(--border-subtle)',
                  transition: 'background-color 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Emoji */}
          <div style={{ fontSize: '56px', marginBottom: '20px', textAlign: 'center' }}>
            {current.emoji}
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '12px',
            textAlign: 'center',
          }}>
            {current.title}
          </h2>

          {/* Description */}
          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            textAlign: 'center',
            marginBottom: '24px',
          }}>
            {current.description}
          </p>

          {/* Login method selection step */}
          {isLoginMethodStep && (
            user?.isDemo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', padding: '20px', borderRadius: '16px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', textAlign: 'center' }}>
                <span style={{ fontSize: 36 }}>🚀</span>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t.onboarding.demoTitle}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{t.onboarding.demoDesc}</p>
                <button
                  onClick={() => { window.location.hash = 'register' }}
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {t.onboarding.demoBtn}
                </button>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {/* Email+heslo — already done */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.3)',
                }}
              >
                <span style={{ fontSize: 24 }}>✉️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.onboarding.emailLabel}</p>
                  <p style={{ fontSize: 12, color: '#34d399' }}>{t.onboarding.emailActive}</p>
                </div>
              </div>

              {/* PIN */}
              <button
                onClick={() => { if (!pinDone) setPinSetupOpen(true) }}
                disabled={pinDone}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  background: pinDone ? 'rgba(52,211,153,0.08)' : 'var(--bg-elevated)',
                  border: pinDone ? '1px solid rgba(52,211,153,0.3)' : '1px solid var(--border-subtle)',
                  cursor: pinDone ? 'default' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: 24 }}>🔢</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.onboarding.pinLabel}</p>
                  <p style={{ fontSize: 12, color: pinDone ? '#34d399' : 'var(--text-muted)' }}>
                    {pinDone ? t.onboarding.pinSetLabel : t.onboarding.pinDesc}
                  </p>
                </div>
                {!pinDone && <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600 }}>{t.onboarding.setupBtn}</span>}
              </button>

              {/* WebAuthn */}
              {typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                <button
                  onClick={handleWebAuthnSetup}
                  disabled={webauthnDone || webauthnLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    borderRadius: '16px',
                    background: webauthnDone ? 'rgba(52,211,153,0.08)' : 'var(--bg-elevated)',
                    border: webauthnDone ? '1px solid rgba(52,211,153,0.3)' : '1px solid var(--border-subtle)',
                    cursor: webauthnDone || webauthnLoading ? 'default' : 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    opacity: webauthnLoading ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: 24 }}>🔐</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.onboarding.biometryLabel}</p>
                    <p style={{ fontSize: 12, color: webauthnDone ? '#34d399' : 'var(--text-muted)' }}>
                      {webauthnDone ? t.onboarding.biometrySetLabel : webauthnLoading ? t.onboarding.biometryLoading : t.onboarding.biometryDesc}
                    </p>
                  </div>
                  {!webauthnDone && !webauthnLoading && <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600 }}>{t.onboarding.setupBtn}</span>}
                </button>
              )}
              {webauthnSecretOpen && !webauthnDone && reauthFactor && (
                <input
                  type="password"
                  autoFocus
                  autoComplete={reauthFactor === 'pin' ? 'off' : 'current-password'}
                  inputMode={reauthFactor === 'pin' ? 'numeric' : undefined}
                  pattern={reauthFactor === 'pin' ? '[0-9]*' : undefined}
                  maxLength={reauthFactor === 'pin' ? 4 : undefined}
                  value={webauthnSecret}
                  onChange={e => setWebauthnSecret(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleWebAuthnSetup() }}
                  placeholder={reauthFactor === 'pin' ? t.onboarding.passkeyPinLabel : t.profile.currentPassword}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, fontSize: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              )}
              {webauthnError && (
                <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>{webauthnError}</p>
              )}
            </div>
            )
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleComplete}
              style={{
                flex: 1,
                height: '48px',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                color: 'var(--text-muted)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {t.onboarding.skip}
            </button>
            <button
              onClick={handleNext}
              style={{
                flex: 2,
                height: '48px',
                background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                border: 'none',
                borderRadius: '14px',
                color: 'white',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {isLastStep ? t.onboarding.start : t.onboarding.next}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>

      <PinSetupModal
        open={pinSetupOpen}
        onClose={() => setPinSetupOpen(false)}
        identityCheck={user?.has_password ? 'password' : null}
        onSetPin={async (pin, identity) => {
          await setupPin(pin, identity?.currentPassword, identity?.currentPin)
          setPinDone(true)
        }}
      />
    </>
  )
}

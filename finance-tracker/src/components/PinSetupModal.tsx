import { useState, useEffect } from 'react'
import { X, Delete, Check } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useModalA11y } from '../hooks/useModalA11y'

interface PinSetupModalProps {
  open: boolean
  onClose: () => void
  onSetPin: (pin: string, identity?: { currentPassword?: string; currentPin?: string }) => Promise<void>
  /**
   * Which re-auth factor the backend will require before accepting the new
   * PIN (see security audit run-1 — a valid access token alone is no longer
   * enough to plant/replace a PIN). 'pin' when the account already has one
   * (asks for it via the same keypad UI); 'password' for a first-time setup
   * on a password account. Omit/null when neither applies (e.g. a
   * Google-only account setting its very first PIN — nothing to confirm).
   */
  identityCheck?: 'pin' | 'password' | null
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export function PinSetupModal({ open, onClose, onSetPin, identityCheck = null }: PinSetupModalProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'identity' | 'enter' | 'confirm' | 'success'>(identityCheck ? 'identity' : 'enter')
  const [identityPin, setIdentityPin] = useState('')
  const [identityPassword, setIdentityPassword] = useState('')
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [first, setFirst] = useState('')
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset to the right starting step whenever the modal is (re)opened.
  useEffect(() => {
    if (open) setStep(identityCheck ? 'identity' : 'enter')
  }, [open, identityCheck])

  // Keyboard input — must be before any conditional return
  useEffect(() => {
    if (!open || step === 'success' || step === 'identity') return
    const onKey = (e: KeyboardEvent) => {
      if (saving) return
      if (e.key >= '0' && e.key <= '9') {
        setPin(prev => prev.length >= 4 ? prev : prev + e.key)
      } else if (e.key === 'Backspace') {
        setPin(p => p.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, saving])

  // Identity keypad input (currentPin case only — password uses a text input)
  useEffect(() => {
    if (!open || step !== 'identity' || identityCheck !== 'pin') return
    const onKey = (e: KeyboardEvent) => {
      if (saving) return
      if (e.key >= '0' && e.key <= '9') {
        setIdentityPin(prev => prev.length >= 4 ? prev : prev + e.key)
      } else if (e.key === 'Backspace') {
        setIdentityPin(p => p.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, identityCheck, saving])

  async function trySetPin(newPin: string, identity?: { currentPassword?: string; currentPin?: string }) {
    setSaving(true)
    try {
      await onSetPin(newPin, identity)
      setSaving(false)
      setStep('success')
      setTimeout(() => {
        setStep(identityCheck ? 'identity' : 'enter'); setFirst(''); setPin('')
        setIdentityPin(''); setIdentityPassword(''); setIdentityError(null)
        onClose()
      }, 1500)
    } catch {
      setSaving(false)
      setFirst(''); setPin('')
      if (identityCheck) {
        // Most likely cause: wrong current password/PIN — send the user back
        // to re-enter it rather than silently failing on the new-PIN screen.
        setIdentityError(identityCheck === 'password' ? t.auth.wrongPassword : t.profile.incorrectPin)
        setIdentityPin('')
        setStep('identity')
      } else {
        // No identity factor was required (e.g. Google-only first PIN) — a
        // failure here is a network/server error, not a wrong credential.
        setStep('enter')
      }
    }
  }

  // Identity PIN completion — advance to the new-PIN entry once 4 digits are in
  useEffect(() => {
    if (step !== 'identity' || identityCheck !== 'pin' || identityPin.length !== 4 || saving) return
    setIdentityError(null)
    setStep('enter')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityPin])

  // Pin completion logic — must be before any conditional return
  useEffect(() => {
    if (pin.length !== 4 || saving || step === 'success' || step === 'identity') return
    if (step === 'enter') {
      setFirst(pin)
      setTimeout(() => { setStep('confirm'); setPin('') }, 150)
    } else {
      if (pin !== first) {
        setShake(true)
        setTimeout(() => { setShake(false); setPin('') }, 600)
      } else {
        const identity = identityCheck === 'pin' ? { currentPin: identityPin }
          : identityCheck === 'password' ? { currentPassword: identityPassword }
          : undefined
        trySetPin(pin, identity)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const { panelRef, titleId, dialogProps } = useModalA11y({
    open, resetKey: step,
    onClose: saving || step === 'success' ? undefined : () => handleClose(),
    initialFocus: step === 'identity' && identityCheck !== 'pin' ? 'field' : 'heading',
  })

  if (!open) return null

  function handleClose() {
    setStep(identityCheck ? 'identity' : 'enter'); setFirst(''); setPin('')
    setIdentityPin(''); setIdentityPassword(''); setIdentityError(null)
    onClose()
  }

  function submitIdentityPassword() {
    if (!identityPassword) return
    setIdentityError(null)
    setStep('enter')
  }

  if (step === 'success') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} />
        <div ref={panelRef} {...dialogProps} style={{
          outline: 'none',
          position: 'relative', width: '100%', maxWidth: 340,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={28} color="#34d399" />
          </div>
          <p id={titleId} tabIndex={-1} style={{ outline: 'none', fontSize: 18, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{t.pin.pinSet}</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{t.pin.pinSetDesc}</p>
        </div>
      </div>
    )
  }

  if (step === 'identity') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={handleClose} />
        <div ref={panelRef} {...dialogProps} style={{
          outline: 'none',
          position: 'relative', width: '100%', maxWidth: 340,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <h2 id={titleId} tabIndex={-1} style={{ outline: 'none', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.pin.identityTitle}</h2>
            <button type="button" className="hit-44" aria-label={t.common.close} title={t.common.close} onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}><X size={18} /></button>
          </div>

          <div style={{ padding: '32px 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            {identityCheck === 'password' ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{t.pin.identityPasswordHint}</p>
                {identityError && <p style={{ fontSize: 12, color: '#f87171', margin: 0, textAlign: 'center' }}>{identityError}</p>}
                <input
                  type="password"
                  autoFocus
                  name="current-password"
                  autoComplete="current-password"
                  aria-label={t.profile.currentPassword}
                  placeholder={t.profile.currentPassword}
                  value={identityPassword}
                  onChange={e => setIdentityPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitIdentityPassword()}
                  style={{ height: 44, width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, color: 'var(--text)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <button
                  onClick={submitIdentityPassword}
                  disabled={!identityPassword}
                  style={{ height: 44, width: '100%', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--violet)', color: 'white', border: 'none', cursor: identityPassword ? 'pointer' : 'not-allowed', opacity: identityPassword ? 1 : 0.5, fontFamily: 'inherit' }}
                >
                  {t.common.continue}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{t.pin.identityPinHint}</p>
                {identityError && <p style={{ fontSize: 12, color: '#f87171', margin: 0, textAlign: 'center' }}>{identityError}</p>}
                <div style={{ display: 'flex', gap: 16 }} className={shake ? 'pin-shake' : ''}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: identityPin.length > i ? 'var(--violet)' : 'transparent',
                      border: '2px solid ' + (identityPin.length > i ? 'var(--violet)' : 'var(--border2)'),
                      transition: 'all 0.15s',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 10 }}>
                  {KEYS.map((k, i) => (
                    k === '' ? <div key={i} /> : (
                      <button
                        key={i}
                        onClick={() => {
                          if (saving) return
                          if (k === '⌫') { setIdentityPin(p => p.slice(0, -1)); return }
                          if (identityPin.length < 4) setIdentityPin(p => p + k)
                        }}
                        style={{
                          width: 64, height: 64, borderRadius: '50%',
                          background: k === '⌫' ? 'transparent' : 'var(--bg3)',
                          border: k === '⌫' ? 'none' : '1px solid var(--border2)',
                          color: 'var(--text)', fontSize: k === '⌫' ? 18 : 20, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: saving ? 0.5 : 1,
                        }}
                      >
                        {k === '⌫' ? <Delete size={18} /> : k}
                      </button>
                    )
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const title = step === 'enter' ? t.pin.enterNew : t.pin.confirm
  const sub = step === 'enter' ? t.pin.choose : t.pin.confirmDesc

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={handleClose} />
      <div ref={panelRef} {...dialogProps} style={{
        outline: 'none',
        position: 'relative', width: '100%', maxWidth: 340,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 id={titleId} tabIndex={-1} style={{ outline: 'none', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
          <button type="button" className="hit-44" aria-label={t.common.close} title={t.common.close} onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '32px 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
          <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>{sub}</p>

          <div style={{ display: 'flex', gap: 16 }} className={shake ? 'pin-shake' : ''}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: pin.length > i ? 'var(--violet)' : 'transparent',
                border: '2px solid ' + (pin.length > i ? 'var(--violet)' : 'var(--border2)'),
                transition: 'all 0.15s',
              }} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 10 }}>
            {KEYS.map((k, i) => (
              k === '' ? <div key={i} /> : (
                <button
                  key={i}
                  onClick={() => {
                    if (saving) return
                    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
                    if (pin.length < 4) setPin(p => p + k)
                  }}
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: k === '⌫' ? 'transparent' : 'var(--bg3)',
                    border: k === '⌫' ? 'none' : '1px solid var(--border2)',
                    color: 'var(--text)', fontSize: k === '⌫' ? 18 : 20, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: saving ? 0.5 : 1,
                  }}
                  onPointerDown={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.15)')}
                  onPointerUp={e => (e.currentTarget.style.background = k === '⌫' ? 'transparent' : 'var(--bg3)')}
                >
                  {k === '⌫' ? <Delete size={18} /> : k}
                </button>
              )
            ))}
          </div>
        </div>

        <style>{`
          .pin-shake { animation: pinShake 0.5s ease-in-out; }
          @keyframes pinShake {
            0%,100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-8px); }
            80% { transform: translateX(8px); }
          }
        `}</style>
      </div>
    </div>
  )
}

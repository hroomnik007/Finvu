import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '../i18n'
import { PinKeypad } from './PinKeypad'

interface PinLockProps {
  onVerify: (pin: string) => Promise<boolean>
  onFallbackToLogin?: () => void
}

export function PinLock({ onVerify, onFallbackToLogin }: PinLockProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(checking)
  checkingRef.current = checking
  const lastTapRef = useRef(0)

  function submitPin(candidate: string) {
    setChecking(true)
    onVerify(candidate).then(ok => {
      if (!ok) {
        setShake(true)
        setTimeout(() => { setShake(false); setPin(''); setChecking(false) }, 600)
      }
    })
  }

  function handleKey(k: string) {
    if (checkingRef.current) return
    const now = Date.now()
    if (now - lastTapRef.current < 80) return
    lastTapRef.current = now

    if (k === 'backspace') { setPin(p => p.slice(0, -1)); return }
    setPin(prev => (prev.length >= 4 ? prev : prev + k))
  }

  // Trigger verification once 4 digits have actually committed to state —
  // never inside the setPin updater itself. React 18 StrictMode double-invokes
  // updater functions (to surface impure updaters), which previously caused
  // onVerify to fire twice for the same PIN when the submit was scheduled
  // from inside the updater.
  useEffect(() => {
    if (pin.length !== 4) return
    const timer = setTimeout(() => submitPin(pin), 100)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--aurora-bg-image)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src="/logo.svg" alt="Finvu" style={{ width: 64, height: 64, borderRadius: 20, marginBottom: 20 }} />
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 19, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 4px' }}>{t.pin.enterPin}</p>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', margin: '0 0 26px' }}>{t.pin.appLocked}</p>

        <PinKeypad length={4} digits={pin.length} shake={shake} disabled={checking} onKey={handleKey} />

        {onFallbackToLogin && (
          <button
            onClick={onFallbackToLogin}
            style={{ marginTop: 28, fontFamily: "'Manrope', sans-serif", fontSize: 12.5, color: 'var(--aurora-lo)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t.auth.signInAnotherWay}
          </button>
        )}
      </div>
    </div>
  )
}

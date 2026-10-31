import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '../i18n'

interface StreakModalProps {
  currentStreak: number
  longestStreak: number
  onClose: () => void
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#FB923C', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginTop: 6 }}>{label}</div>
    </div>
  )
}

export function StreakModal({ currentStreak, longestStreak, onClose }: StreakModalProps) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 22, width: '100%', maxWidth: 360, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg,#3a1d0a 0%,#7c3a12 60%,#3a1d0a 100%)', padding: '28px 24px 22px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -60, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,146,60,0.35),transparent 65%)', filter: 'blur(24px)', pointerEvents: 'none' }} />
          <button
            onClick={onClose}
            aria-label={t.common.close}
            style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
          >
            <X size={16} />
          </button>
          <div style={{ fontSize: 52, lineHeight: 1, display: 'inline-block', animation: 'flame 1.4s ease-in-out infinite', transformOrigin: 'bottom center' }}>🔥</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: 'white', fontFamily: "'DM Mono', monospace", marginTop: 8, letterSpacing: '-1px' }}>{currentStreak}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{t.profile.days} {t.streak.inARow}</div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatBox label={t.streak.currentLabel.toUpperCase()} value={currentStreak} />
            <StatBox label={t.streak.longestLabel.toUpperCase()} value={longestStreak} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
            {t.streak.explanation}
          </p>
        </div>
      </div>
    </div>
  )
}

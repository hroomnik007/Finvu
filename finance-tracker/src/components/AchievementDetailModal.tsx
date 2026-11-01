import { useModalA11y } from '../hooks/useModalA11y'
import { X } from 'lucide-react'
import { useTranslation } from '../i18n'
import { formatDateLocale } from '../utils/format'

interface AchievementDetailModalProps {
  emoji: string
  color: string
  name: string
  desc: string
  hint: string
  unlocked: boolean
  unlockedAt: string | null
  onClose: () => void
}

export function AchievementDetailModal({ emoji, color, name, desc, hint, unlocked, unlockedAt, onClose }: AchievementDetailModalProps) {
  const { t, locale } = useTranslation()

  const { panelRef, titleId, dialogProps } = useModalA11y({ open: true, onClose })

  const unlockedDateStr = unlockedAt
    ? formatDateLocale(unlockedAt, locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        {...dialogProps}
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 22, width: '100%', maxWidth: 360, overflow: 'hidden', outline: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero */}
        <div
          style={{
            background: unlocked
              ? `linear-gradient(135deg,${color}22 0%,${color}55 60%,${color}22 100%)`
              : 'linear-gradient(135deg,#1a1630 0%,#211d3a 60%,#1a1630 100%)',
            padding: '28px 24px 22px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: -60, right: -30, width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle,${color}59,transparent 65%)`, filter: 'blur(24px)', pointerEvents: 'none' }} />
          <button
            onClick={onClose}
            aria-label={t.common.close}
            style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
          >
            <X size={16} />
          </button>
          <div
            style={{
              fontSize: 44, lineHeight: 1, display: 'inline-block',
              filter: unlocked ? 'none' : 'grayscale(0.7)',
              opacity: unlocked ? 1 : 0.55,
            }}
          >
            {emoji}
          </div>
          <h2 id={titleId} tabIndex={-1} style={{ margin: '10px 0 0', outline: 'none', fontSize: 19, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>{name}</h2>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{desc}</div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {unlocked ? (
            <div style={{ background: 'var(--bg3)', border: `1px solid ${color}30`, borderRadius: 14, padding: '12px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color }}>
                {t.achievements.unlockedOn.replace('{date}', unlockedDateStr ?? '')}
              </span>
            </div>
          ) : (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>{hint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { Flame } from 'lucide-react'
import { useTranslation } from '../i18n'

interface StreakBadgeProps {
  count: number
  size?: 'sm' | 'lg'
  onClick?: () => void
  variant?: 'default' | 'aurora'
}

export function StreakBadge({ count, size = 'lg', onClick, variant = 'default' }: StreakBadgeProps) {
  const { t } = useTranslation()
  if (count <= 0) return null
  const isLg = size === 'lg'
  const interactive = !!onClick
  const isAurora = variant === 'aurora'
  return (
    <button
      type="button"
      onClick={onClick}
      title={(interactive ? t.streak.badgeTitleInteractive : t.streak.badgeTitle).replace('{n}', String(count))}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: isLg ? '4px 9px' : '2px 6px',
        borderRadius: 99,
        background: isAurora ? 'rgba(251,191,36,.15)' : 'linear-gradient(135deg,rgba(251,146,60,0.18),rgba(248,113,113,0.15))',
        border: isAurora ? '1px solid rgba(251,191,36,.3)' : '1px solid rgba(251,146,60,0.3)',
        fontSize: isLg ? 13 : 12, fontWeight: 700, color: isAurora ? 'var(--aurora-amber)' : '#FB923C',
        cursor: interactive ? 'pointer' : 'default', userSelect: 'none',
        fontFamily: isAurora ? "'Manrope', sans-serif" : "'DM Mono', monospace",
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Flame size={isLg ? 12 : 11} strokeWidth={2} fill="currentColor" style={{ animation: 'flame 1.4s ease-in-out infinite', transformOrigin: 'bottom center' }} />
      {count}
    </button>
  )
}

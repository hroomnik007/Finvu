import type { CSSProperties } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useTranslation } from '../i18n'
import { GlassCard } from './GlassCard'

/** Shimmer placeholder (the `.skel` class in index.css). */
export function Skeleton({ width = '100%', height = 14, radius, style }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return <div className="skel" aria-hidden style={{ width, height, borderRadius: radius, ...style }} />
}

/** Placeholder rows shown while a list query loads, instead of the empty state. */
export function ListSkeleton({ rows = 4, radius = 18 }: { rows?: number; radius?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" aria-label={t.common.loading} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton width={120} height={14} style={{ margin: '10px 2px 2px' }} />
      {Array.from({ length: rows }, (_, i) => (
        <GlassCard key={i} radius={radius} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <Skeleton width={38} height={38} radius={12} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="30%" height={10} />
          </div>
          <Skeleton width={64} height={16} />
        </GlassCard>
      ))}
    </div>
  )
}

/** Shown when a query failed: a clear message and "Skúsiť znova" (refetch). */
export function QueryError({ onRetry, compact = false }: { onRetry: () => unknown; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <GlassCard radius={18} style={{ padding: compact ? '14px 16px' : '32px 20px' }}>
      <div role="alert" style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: compact ? 12 : 10, textAlign: compact ? 'left' : 'center' }}>
        <AlertTriangle size={compact ? 20 : 34} color="#f87171" aria-hidden style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: compact ? 14 : 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.common.loadFailed}</p>
          {!compact && <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: '4px 0 0' }}>{t.common.loadFailedHint}</p>}
        </div>
        <button
          type="button"
          onClick={() => { void onRetry() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            padding: '9px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
            color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Manrope', sans-serif",
            marginTop: compact ? 0 : 6,
          }}
        >
          <RotateCw size={14} aria-hidden /> {t.common.retry}
        </button>
      </div>
    </GlassCard>
  )
}

/** Stand-in for a hero total: a shimmer while loading, a dash after an error (never a fake 0,00 €). */
export function HeroAmountPlaceholder({ error }: { error: boolean }) {
  const { t } = useTranslation()
  if (error) return <div aria-label={t.common.loadFailed} style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 40, lineHeight: 1, color: 'var(--aurora-faint)' }}>—</div>
  return <div role="status" aria-busy="true" aria-label={t.common.loading}><Skeleton width={170} height={40} radius={10} /></div>
}

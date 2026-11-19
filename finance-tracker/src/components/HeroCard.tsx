import type { CSSProperties, ReactNode } from 'react'

type HeroCardVariant = 'neutral' | 'income' | 'expense' | 'fixed'

interface HeroCardProps {
  children: ReactNode
  variant?: HeroCardVariant
  style?: CSSProperties
  className?: string
  /** Sub-pages: tighter padding so the list starts higher; Dashboard keeps the full card. */
  compact?: boolean
}

const BLOB_COLORS: Record<HeroCardVariant, { b1: string; b2: string }> = {
  neutral: { b1: 'var(--aurora-violet)', b2: 'var(--aurora-fuchsia)' },
  income: { b1: 'var(--aurora-emerald)', b2: 'var(--aurora-cyan)' },
  expense: { b1: 'var(--aurora-rose)', b2: 'var(--aurora-amber)' },
  fixed: { b1: 'var(--aurora-amber)', b2: '#f59e0b' },
}

export function HeroCard({ children, variant = 'neutral', style, className, compact }: HeroCardProps) {
  const { b1, b2 } = BLOB_COLORS[variant]
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: compact ? 22 : 28,
        padding: compact ? '16px 18px' : 24,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--aurora-hero-bg)',
        border: '1px solid var(--aurora-gline)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: 'var(--aurora-hero-shadow)',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: 'var(--aurora-blob-opacity)', zIndex: 0, width: 180, height: 180, background: b1, top: -70, left: -50 }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: 'var(--aurora-blob-opacity)', zIndex: 0, width: 150, height: 150, background: b2, bottom: -60, right: -40 }} />
      <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: 'var(--aurora-blob-opacity-soft)', zIndex: 0, width: 110, height: 110, background: 'var(--aurora-cyan)', top: 20, right: 20 }} />
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </div>
  )
}

import type { CSSProperties, ReactNode } from 'react'

/** Day header for grouped lists: "18 Nedeľa" left, "2 transakcie · −35,60 €" right. */
export function DayHeader({ dayNum, weekday, full, summary }: { dayNum: number; weekday: string; full: string; summary: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '10px 2px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }} title={full}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)' }}>{dayNum}</span>
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{weekday}</span>
        <span className="sr-only">{full}</span>
      </div>
      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', whiteSpace: 'nowrap' }}>{summary}</span>
    </div>
  )
}

/** One card per group; direct children are separated by thin dividers (see .dense-card in index.css). */
export function DenseCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="dense-card" role="list" style={style}>{children}</div>
}

/** A row inside a DenseCard. Opaque so a swipe-to-delete action underneath does not bleed through. */
export function DenseRow({ children, onClick, selected, style, className }: { children: ReactNode; onClick?: () => void; selected?: boolean; style?: CSSProperties; className?: string }) {
  return (
    <div
      role="listitem"
      className={`dense-row${className ? ' ' + className : ''}`}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        cursor: onClick ? 'pointer' : undefined,
        outline: selected ? '2px solid var(--aurora-violet)' : undefined, outlineOffset: -2,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

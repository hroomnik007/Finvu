import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface BulkBarProps {
  count: number
  total: number
  /** Shown while nothing is selected yet. */
  hint: string
  /** "{n}" is replaced with the selected count. */
  countLabel: string
  selectAllLabel: string
  cancelLabel: string
  onCancel: () => void
  onSelectAll: () => void
  children: ReactNode
}

/**
 * Floating action bar of the multi-select mode. Leaving the mode (✕), selecting
 * everything and the actions all live here, so the mode has one place to start
 * ("Vybrať" button) and one place to end.
 */
export function BulkBar({ count, total, hint, countLabel, selectAllLabel, cancelLabel, onCancel, onSelectAll, children }: BulkBarProps) {
  return (
    <div
      className="fixed left-4 right-4 bottom-[calc(var(--nav-clearance)+12px)] lg:bottom-6 mx-auto"
      style={{ zIndex: 45, maxWidth: 600, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 18, background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}
    >
      <button type="button" onClick={onCancel} aria-label={cancelLabel} style={{ width: 34, height: 34, borderRadius: 11, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <X size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)' }}>
          {count > 0 ? countLabel.replace('{n}', String(count)) : hint}
        </div>
        {count < total && (
          <button type="button" onClick={onSelectAll} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-violet-text)' }}>
            {selectAllLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

import { Check, AlertCircle } from 'lucide-react'
import type { Toast } from '../hooks/useToast'
import { runToastAction } from '../lib/toastStore'

interface ToastContainerProps {
  toasts: Toast[]
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  const defaultToasts = toasts.filter(t => t.variant !== 'achievement')
  const achievementToasts = toasts.filter(t => t.variant === 'achievement')

  return (
    <>
      {/* Save / info / error toasts — bottom, above the nav, and above open
          modals (z 1000) so an error is visible while the form stays open.
          The live region is always mounted so screen readers announce new toasts. */}
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 flex flex-col gap-2 w-full max-w-[390px] px-4 bottom-[calc(112px+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-[calc(50%+120px)]"
        style={{ zIndex: 1100, pointerEvents: 'none' }}
      >
        {defaultToasts.map(toast => {
          const isError = toast.variant === 'error'
          const isSuccess = toast.variant === 'success'
          return (
            <div
              key={toast.id}
              className="px-4 py-3 text-sm shadow-xl fade-in"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                color: 'var(--text)',
                backgroundColor: 'var(--bg-elevated)',
                border: `1px solid ${isError ? 'rgba(248,113,113,.55)' : 'var(--border-medium)'}`,
                borderRadius: '16px',
                boxShadow: 'var(--shadow-elevated)',
                pointerEvents: 'auto',
              }}
            >
              {isSuccess && <Check size={16} color="#34D399" strokeWidth={2.6} aria-hidden style={{ flexShrink: 0 }} />}
              {isError && <AlertCircle size={16} color="#f87171" strokeWidth={2.4} aria-hidden style={{ flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => { void runToastAction(toast.id) }}
                  style={{
                    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--aurora-violet, #8B5CF6)', fontWeight: 700, fontSize: 13,
                    padding: '4px 6px', borderRadius: 8,
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Achievement unlock toasts — positioned below the top bar: full-width
          (small side margins) on mobile, top-right on desktop. */}
      {achievementToasts.length > 0 && (
        <div className="fixed z-[70] flex flex-col gap-2 left-3 right-3 top-[calc(52px+var(--safe-top)+10px)] lg:left-auto lg:right-5 lg:top-[76px] lg:w-[340px]">
          {achievementToasts.map(toast => (
            <div
              key={toast.id}
              className="fade-in"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 16,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-medium)',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{toast.icon ?? '🏆'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#FBBF24' }}>{toast.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

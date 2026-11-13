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
          Content-width pills that sit above the add button (.toast-stack).
          The live region is always mounted so screen readers announce new toasts. */}
      <div
        data-modal-keep
        role="status"
        aria-live="polite"
        className="toast-stack"
      >
        {defaultToasts.map(toast => {
          const isError = toast.variant === 'error'
          const isSuccess = toast.variant === 'success'
          const tone = isError ? 'var(--aurora-rose)' : 'var(--aurora-emerald)'
          return (
            <div
              key={toast.id}
              className="toast-pill fade-in"
              style={isError ? { borderColor: 'color-mix(in srgb, var(--aurora-rose) 55%, transparent)' } : undefined}
            >
              {(isSuccess || isError) && (
                <span
                  aria-hidden
                  className="toast-pill-icon"
                  style={{ color: tone, background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
                >
                  {isSuccess ? <Check size={14} strokeWidth={3} /> : <AlertCircle size={14} strokeWidth={2.6} />}
                </span>
              )}
              <span className="toast-pill-text">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  className="toast-pill-action"
                  onClick={() => { void runToastAction(toast.id) }}
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

import type { Toast } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  const defaultToasts = toasts.filter(t => t.variant !== 'achievement')
  const achievementToasts = toasts.filter(t => t.variant === 'achievement')

  return (
    <>
      {defaultToasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-full max-w-[390px] px-4 lg:left-[calc(50%+120px)]">
          {defaultToasts.map(toast => (
            <div
              key={toast.id}
              className="px-4 py-3 text-sm text-white shadow-xl fade-in"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-medium)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FBBF24' }}>{toast.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

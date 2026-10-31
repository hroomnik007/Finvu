import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useSubmitGuard } from '../hooks/useSubmitGuard'

interface ConfirmDialogProps {
  open: boolean
  message: string
  /** May return a promise: the confirm button shows a spinner until it settles. */
  onConfirm: () => void | Promise<unknown>
  onCancel: () => void
  /** Non-destructive confirmation: neutral accent button labelled "Potvrdiť" instead of the red "Zmazať". */
  neutral?: boolean
  /** Optional second line under the message. */
  detail?: string
  confirmLabel?: string
}

/**
 * Finvu-styled replacement for window.confirm: role="alertdialog", labelled by
 * its message, focus moves to "Zrušiť" (the safe choice) and is kept inside
 * the dialog, Escape cancels, focus returns to the opener on close.
 */
export function ConfirmDialog({ open, message, onConfirm, onCancel, neutral = false, detail, confirmLabel }: ConfirmDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const detailId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const guard = useSubmitGuard()

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (items.length === 0) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => {
      document.removeEventListener('keydown', handler, true)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open, onCancel])

  if (!open) return null

  const accent = neutral ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'linear-gradient(135deg,#FB7185,#e11d48)'

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center fade-in" style={{ zIndex: 1200 }}>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={() => { if (!guard.pending) onCancel() }}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={detail ? detailId : undefined}
        className="relative mx-4 w-full max-w-sm modal-in"
        style={{
          background: 'var(--aurora-panel)',
          border: '1px solid var(--aurora-gline)',
          borderRadius: 22,
          padding: 22,
          boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
          textAlign: 'center',
        }}
      >
        {!neutral && (
          <div aria-hidden style={{ width: 44, height: 44, borderRadius: 14, margin: '0 auto 12px', background: 'rgba(251,113,133,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} color="#FB7185" strokeWidth={2.2} />
          </div>
        )}
        <p id={titleId} style={{ color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{message}</p>
        {detail && <p id={detailId} style={{ color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", fontSize: 13, margin: '6px 0 0', lineHeight: 1.45 }}>{detail}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={guard.pending}
            style={{ flex: 1, background: 'var(--aurora-glass)', color: 'var(--aurora-hi)', border: '1px solid var(--aurora-gline)', borderRadius: 14, minHeight: 46, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={() => { void guard.run(onConfirm) }}
            disabled={guard.pending}
            aria-busy={guard.pending}
            style={{ flex: 1, background: accent, color: '#fff', border: 'none', borderRadius: 14, minHeight: 46, fontSize: 15, fontWeight: 700, cursor: guard.pending ? 'progress' : 'pointer', fontFamily: "'Manrope', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {guard.pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {confirmLabel ?? (neutral ? t.common.confirm : t.common.delete)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

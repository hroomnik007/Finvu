import { useCallback } from 'react'
import { X, Check, FileUp, Loader2, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useSubmitGuard } from '../hooks/useSubmitGuard'
import { useModalA11y } from '../hooks/useModalA11y'

interface CompactModalProps {
  open: boolean
  onClose: () => void
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  accent: string
  accent2: string
  /** May return a promise: while it is pending the save button shows a
   * spinner, is disabled and further submits are ignored. */
  onSubmit: () => void | Promise<unknown>
  submitDisabled?: boolean
  /** Extra busy flag for saves the parent tracks itself. */
  submitting?: boolean
  onImportCsv?: () => void
  children: React.ReactNode
  maxWidth?: number
  /** Focus the first amount field when the modal opens (add forms). */
  autoFocusAmount?: boolean
  /** Shows a visible "Zmazať" button next to save (edit forms). */
  onDelete?: () => void
}

export function CompactModal({
  open, onClose, icon: Icon, iconColor, iconBg, title,
  accent, accent2, onSubmit, submitDisabled, submitting, onImportCsv, children, maxWidth = 420, autoFocusAmount, onDelete,
}: CompactModalProps) {
  const { t } = useTranslation()
  const guard = useSubmitGuard()
  const busy = guard.pending || !!submitting
  const disabled = !!submitDisabled || busy
  const handleSubmit = () => {
    if (disabled) return
    void guard.run(onSubmit)
  }
  // Closing mid-save would hide an error toast's form; wait for the result.
  const requestClose = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  // Focus trap, Esc, focus return, inert page and scroll lock. Add forms
  // focus the amount; edit forms focus the title so no keyboard pops up.
  const { panelRef, titleId, dialogProps } = useModalA11y({
    open, onClose: requestClose, initialFocus: autoFocusAmount ? 'field' : 'heading',
  })

  // Enter in a single-line field saves (same guard as the button: ignored while
  // disabled or a save is pending). Not in textareas, on buttons or mid-IME.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    const el = e.target as HTMLElement
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return
    const type = (el as HTMLInputElement).type
    if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit') return
    e.preventDefault()
    handleSubmit()
  }

  if (!open) return null

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,3,8,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div
        className="modal-in"
        ref={panelRef}
        {...dialogProps}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', maxWidth,
          background: 'var(--aurora-panel)',
          border: '1px solid var(--aurora-gline)',
          borderRadius: 26,
          padding: 20,
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
          maxHeight: '90svh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          outline: 'none',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={17} color={iconColor} strokeWidth={2.2} />
          </div>
          <h2 id={titleId} tabIndex={-1} style={{ margin: 0, outline: 'none', fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', flex: 1, minWidth: 0 }}>{title}</h2>
          {onImportCsv && (
            <button
              type="button"
              onClick={onImportCsv}
              aria-label={t.settings.importStatement}
              title={t.settings.importStatement}
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}
            >
              <FileUp size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label={t.common.close}
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {children}
        </div>

        <div style={{ display: 'flex', justifyContent: onDelete ? 'space-between' : 'flex-end', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 14px',
                borderRadius: 14, background: 'rgba(251,113,133,.10)', border: '1px solid rgba(251,113,133,.35)',
                color: 'var(--aurora-rose, #FB7185)', fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              <Trash2 size={15} strokeWidth={2.2} aria-hidden />
              {t.common.delete}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
            aria-busy={busy}
            aria-label={busy ? t.common.saving : t.common.save}
            title={busy ? t.common.saving : t.common.save}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: `linear-gradient(135deg,${accent},${accent2})`,
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: disabled ? 'none' : `0 8px 22px ${accent}66`,
              cursor: busy ? 'progress' : disabled ? 'not-allowed' : 'pointer',
              opacity: submitDisabled && !busy ? 0.5 : busy ? 0.8 : 1,
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {busy
              ? <Loader2 size={18} color="#fff" strokeWidth={2.4} className="animate-spin" aria-hidden />
              : <Check size={18} color="#fff" strokeWidth={2.4} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}

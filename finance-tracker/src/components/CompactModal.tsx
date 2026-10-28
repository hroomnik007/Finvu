import { useEffect } from 'react'
import { X, Check, FileUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '../i18n'

interface CompactModalProps {
  open: boolean
  onClose: () => void
  icon: LucideIcon
  iconColor: string
  iconBg: string
  title: string
  accent: string
  accent2: string
  onSubmit: () => void
  submitDisabled?: boolean
  onImportCsv?: () => void
  children: React.ReactNode
  maxWidth?: number
}

export function CompactModal({
  open, onClose, icon: Icon, iconColor, iconBg, title,
  accent, accent2, onSubmit, submitDisabled, onImportCsv, children, maxWidth = 420,
}: CompactModalProps) {
  const { t } = useTranslation()
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

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
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="modal-in"
        style={{
          width: '100%', maxWidth,
          background: 'var(--aurora-panel)',
          border: '1px solid var(--aurora-gline)',
          borderRadius: 26,
          padding: 20,
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
          maxHeight: '90svh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={17} color={iconColor} strokeWidth={2.2} />
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', flex: 1, minWidth: 0 }}>{title}</div>
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
            onClick={onClose}
            aria-label={t.common.close}
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {children}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            aria-label={t.common.save}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: `linear-gradient(135deg,${accent},${accent2})`,
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: submitDisabled ? 'none' : `0 8px 22px ${accent}66`,
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              opacity: submitDisabled ? 0.5 : 1,
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            <Check size={18} color="#fff" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  )
}

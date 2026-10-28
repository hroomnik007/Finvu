import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '../i18n'

export type ExportFormat = 'CSV' | 'PDF' | 'XLSX'

export interface ExportPeriod {
  fromYear: number
  fromMonth: number // 1-12
  toYear: number
  toMonth: number // 1-12
}

interface ExportDataModalProps {
  open: boolean
  onClose: () => void
  onGenerate: (format: ExportFormat, period: ExportPeriod) => void
  generating?: boolean
}

const GRADIENT = 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))'

const FORMATS: ExportFormat[] = ['CSV', 'PDF', 'XLSX']

function monthKey(year: number, month: number) {
  return year * 12 + month
}

// ── Month picker (Od / Do) ──────────────────────────────────────────────────

function MonthPicker({
  title, year, month, onPick, onClose,
}: {
  title: string
  year: number
  month: number
  onPick: (year: number, month: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [cursorYear, setCursorYear] = useState(year)
  const now = new Date()
  const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1)

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
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
          width: '100%', maxWidth: 320,
          background: 'var(--aurora-panel)',
          border: '1px solid var(--aurora-gline)',
          borderRadius: 20,
          padding: 18,
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer' }}
          >
            <X size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setCursorYear(y => y - 1)}
            aria-label={t.common.prevYear}
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer' }}
          >
            <ChevronLeft size={15} />
          </button>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', minWidth: 52, textAlign: 'center' }}>{cursorYear}</div>
          <button
            type="button"
            onClick={() => setCursorYear(y => y + 1)}
            aria-label={t.common.nextYear}
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {t.monthsShort.map((label, idx) => {
            const m = idx + 1
            const key = monthKey(cursorYear, m)
            const isFuture = key > currentKey
            const isSelected = cursorYear === year && m === month
            return (
              <button
                key={label}
                type="button"
                disabled={isFuture}
                onClick={() => onPick(cursorYear, m)}
                style={{
                  padding: '9px 0',
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif",
                  background: isSelected ? GRADIENT : 'var(--aurora-glass)',
                  border: isSelected ? 'none' : '1px solid var(--aurora-gline)',
                  color: isSelected ? '#fff' : isFuture ? 'var(--aurora-faint)' : 'var(--aurora-lo)',
                  opacity: isFuture ? 0.4 : 1,
                  cursor: isFuture ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main export modal ───────────────────────────────────────────────────────

export function ExportDataModal({ open, onClose, onGenerate, generating }: ExportDataModalProps) {
  const { t } = useTranslation()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [format, setFormat] = useState<ExportFormat>('CSV')
  const [fromYear, setFromYear] = useState(currentYear)
  const [fromMonth, setFromMonth] = useState(currentMonth)
  const [toYear, setToYear] = useState(currentYear)
  const [toMonth, setToMonth] = useState(currentMonth)
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null)

  useEffect(() => {
    if (!open) return
    setFormat('CSV')
    setFromYear(currentYear)
    setFromMonth(currentMonth)
    setToYear(currentYear)
    setToMonth(currentMonth)
    setPickerOpen(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  function formatMonthLabel(year: number, month: number) {
    return `${t.months[month - 1]} ${year}`
  }

  function handlePick(year: number, month: number) {
    if (pickerOpen === 'from') {
      setFromYear(year)
      setFromMonth(month)
      // keep range valid — if "from" moves after "to", push "to" up as well
      if (monthKey(year, month) > monthKey(toYear, toMonth)) {
        setToYear(year)
        setToMonth(month)
      }
    } else if (pickerOpen === 'to') {
      setToYear(year)
      setToMonth(month)
      if (monthKey(year, month) < monthKey(fromYear, fromMonth)) {
        setFromYear(year)
        setFromMonth(month)
      }
    }
    setPickerOpen(null)
  }

  return (
    <>
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
            width: '100%', maxWidth: 380,
            background: 'var(--aurora-panel)',
            border: '1px solid var(--aurora-gline)',
            borderRadius: 20,
            padding: 20,
            boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
            maxHeight: '90svh',
            overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)' }}>
              {t.settings.exportModalTitle}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Format segmented control */}
          <div
            style={{
              display: 'flex', gap: 4, padding: 4, borderRadius: 14,
              background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
              marginBottom: 16,
            }}
          >
            {FORMATS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
                  fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 700,
                  background: format === f ? GRADIENT : 'transparent',
                  color: format === f ? '#fff' : 'var(--aurora-lo)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Period rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setPickerOpen('from')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', height: 48, padding: '0 14px', borderRadius: 12,
                background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.settings.exportFrom}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)' }}>{formatMonthLabel(fromYear, fromMonth)}</span>
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen('to')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', height: 48, padding: '0 14px', borderRadius: 12,
                background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.settings.exportTo}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)' }}>{formatMonthLabel(toYear, toMonth)}</span>
            </button>
          </div>

          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '0 0 18px' }}>
            {t.settings.exportPeriodNote}
          </p>

          <button
            type="button"
            disabled={generating}
            onClick={() => onGenerate(format, { fromYear, fromMonth, toYear, toMonth })}
            style={{
              width: '100%', height: 48, borderRadius: 14, border: 'none',
              background: GRADIENT, color: '#fff', fontSize: 14.5, fontWeight: 700,
              fontFamily: "'Outfit', sans-serif", cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.6 : 1, transition: 'all 0.2s',
              boxShadow: '0 8px 22px rgba(139,92,246,0.4)',
            }}
          >
            {t.settings.exportGenerate}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <MonthPicker
          title={pickerOpen === 'from' ? t.settings.exportFrom : t.settings.exportTo}
          year={pickerOpen === 'from' ? fromYear : toYear}
          month={pickerOpen === 'from' ? fromMonth : toMonth}
          onPick={handlePick}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </>
  )
}

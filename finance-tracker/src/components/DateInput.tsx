import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { useSettingsContext } from '../context/SettingsContext'

interface DateInputProps {
  value: string // always YYYY-MM-DD
  onChange: (value: string) => void
  compact?: boolean
}

function formatForDisplay(dateStr: string, fmt: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const day   = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year  = d.getFullYear()
    switch (fmt) {
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`
      case 'MM/DD/YYYY': return `${month}/${day}/${year}`
      default:           return `${day}.${month}.${year}`
    }
  } catch {
    return dateStr
  }
}

export function DateInput({ value, onChange, compact }: DateInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const { settings } = useSettingsContext()
  const displayValue = formatForDisplay(value, settings.dateFormat)

  const openPicker = () => {
    if (!hiddenRef.current) return
    try {
      hiddenRef.current.showPicker()
    } catch {
      hiddenRef.current.click()
    }
  }

  if (compact) {
    return (
      <div
        onClick={openPicker}
        style={{
          position: 'relative', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
          borderRadius: 12, padding: '8px 12px', cursor: 'pointer',
        }}
      >
        <Calendar size={13} color="var(--aurora-lo)" style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-hi)', userSelect: 'none', whiteSpace: 'nowrap' }}>
          {displayValue || 'DD.MM.RRRR'}
        </span>
        <input
          ref={hiddenRef}
          type="date"
          value={value}
          onChange={e => { if (e.target.value) onChange(e.target.value) }}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 0, border: 'none', background: 'none', colorScheme: 'var(--aurora-color-scheme)' }}
        />
      </div>
    )
  }

  return (
    <div
      className="date-input-wrapper"
      onClick={openPicker}
      style={{
        position: 'relative',
        width: '100%',
        height: '52px',
        background: 'var(--aurora-glass)',
        border: '1px solid #4C3A8A',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.2s ease',
      }}
    >
      <span style={{
        color: displayValue ? '#E2D9F3' : 'rgba(157,132,212,0.4)',
        fontSize: '15px',
        fontFamily: 'inherit',
        userSelect: 'none',
      }}>
        {displayValue || 'DD.MM.RRRR'}
      </span>
      <Calendar size={16} style={{ color: '#6B5A9E', flexShrink: 0 }} />
      <input
        ref={hiddenRef}
        type="date"
        value={value}
        onChange={e => { if (e.target.value) onChange(e.target.value) }}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          width: '100%',
          height: '100%',
          cursor: 'pointer',
          fontSize: 0,
          border: 'none',
          background: 'none',
          colorScheme: 'var(--aurora-color-scheme)',
        }}
      />
    </div>
  )
}

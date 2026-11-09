import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import AmountInput from './AmountInput'
import { useTranslation } from '../i18n'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { decimalSeparator } from '../utils/amountInput'
import { applyAmountKey } from '../utils/amountKeypad'

/**
 * The big amount field of the add/edit forms. On touch devices it comes with
 * the app's own number pad and the field is read-only, so the system keyboard
 * (with keys an amount never needs) never opens. The pad is open while the
 * amount is being typed (from the start when the form focuses the field) and
 * folds away once the user taps anything else (a category, the date, the
 * note), so the rest of the form and its save button are in view; tapping the
 * amount opens it again. With a mouse and keyboard it is a normal text field.
 */
export function AmountEntry({ value, onValueChange, accent }: {
  value: string
  onValueChange: (value: string) => void
  /** Thin coloured bar at the end of the field (the form's accent). */
  accent?: string
}) {
  const { t, locale } = useTranslation()
  const touch = useCoarsePointer()
  const sep = decimalSeparator(locale)
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', sep, '0', '⌫']
  const boxRef = useRef<HTMLDivElement>(null)
  const [padOpen, setPadOpen] = useState(false)

  // Any tap outside the amount field and its pad folds the pad away. On click,
  // not on pointerdown: folding shifts everything below the pad up, so a click
  // still to come would land on whatever moved under the finger (or on the
  // backdrop). Capture phase because the modal panel stops click propagation;
  // the fold waits a frame so the tapped element handles its click first.
  useEffect(() => {
    if (!touch || !padOpen) return
    let frame = 0
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && e.target instanceof Node && !boxRef.current.contains(e.target)) {
        frame = requestAnimationFrame(() => setPadOpen(false))
      }
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true); cancelAnimationFrame(frame) }
  }, [touch, padOpen])

  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }}>
        <AmountInput
          placeholder="0"
          value={value}
          onValueChange={onValueChange}
          readOnly={touch}
          keypadOnly={touch}
          onFocus={() => setPadOpen(true)}
          onClick={() => setPadOpen(true)}
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 26, width: '100%', minWidth: 0 }}
        />
        <span style={{ fontSize: 15, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", flexShrink: 0 }}>€</span>
        {accent && <div style={{ width: 2, height: 20, borderRadius: 1, background: accent, flexShrink: 0 }} />}
      </div>
      {touch && padOpen && (
        <div role="group" aria-label={t.common.numberPad} className="amount-keypad">
          {keys.map(k => (
            <button
              key={k}
              type="button"
              aria-label={k === '⌫' ? t.common.deleteDigit : undefined}
              onClick={() => onValueChange(applyAmountKey(value, k, sep))}
            >
              {k === '⌫' ? <Delete size={20} strokeWidth={1.8} aria-hidden /> : k}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

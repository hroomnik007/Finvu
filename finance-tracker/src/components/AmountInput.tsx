import type { InputHTMLAttributes } from 'react'
import { useTranslation } from '../i18n'
import { decimalSeparator, nextAmountInput } from '../utils/amountInput'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string
  onValueChange: (value: string) => void
}

// Text input for money amounts: accepts "." or "," as the decimal separator,
// shows the locale's separator, max two decimals. Parse with parseAmountInput.
export default function AmountInput({ value, onValueChange, ...rest }: Props) {
  const { locale } = useTranslation()
  const sep = decimalSeparator(locale)
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={e => onValueChange(nextAmountInput(e.target.value, value, sep))}
    />
  )
}


import { nextAmountInput } from './amountInput'

/** One key of the in-app amount keypad applied to the current text ("⌫" deletes). */
export function applyAmountKey(value: string, key: string, sep: string): string {
  if (key === '⌫') return value.slice(0, -1)
  // A leading separator reads as "0,"; the usual rules (one separator, two decimals,
  // ten integer digits) come from the same normaliser the text field uses.
  const typed = key === sep && value === '' ? '0' + sep : value + key
  return nextAmountInput(typed, value, sep)
}

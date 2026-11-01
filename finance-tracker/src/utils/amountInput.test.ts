import { describe, expect, it } from 'vitest'
import { decimalSeparator, formatAmountInput, nextAmountInput, normalizeAmountInput, parseAmountInput } from './amountInput'

describe('parseAmountInput', () => {
  it('accepts both decimal separators', () => {
    expect(parseAmountInput('12.50')).toBe(12.5)
    expect(parseAmountInput('12,50')).toBe(12.5)
    expect(parseAmountInput('0.5')).toBe(0.5)
    expect(parseAmountInput(',5')).toBe(0.5)
    expect(parseAmountInput('12,')).toBe(12)
    expect(parseAmountInput('100')).toBe(100)
  })

  it('handles thousands separators', () => {
    expect(parseAmountInput('1 234,56')).toBe(1234.56)
    expect(parseAmountInput('1\u00a0234,56')).toBe(1234.56)
    expect(parseAmountInput('1\u202f234,56')).toBe(1234.56)
    expect(parseAmountInput('1.234,56')).toBe(1234.56)
    expect(parseAmountInput('1,234.56')).toBe(1234.56)
    expect(parseAmountInput('1.234.567')).toBe(1234567)
    expect(parseAmountInput('12 345 €')).toBe(12345)
  })

  it('returns null for empty or invalid input', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('   ')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput(',')).toBeNull()
    expect(parseAmountInput('1,2,3')).toBeNull()
    expect(parseAmountInput('12.5.0')).toBeNull()
    expect(parseAmountInput('1.234')).toBeNull() // ambiguous, three decimals
    expect(parseAmountInput('1,999')).toBeNull()
  })

  it('never multiplies by 100 (regression: "12.50" saved as 1250)', () => {
    expect(parseAmountInput('12.50')).not.toBe(1250)
  })
})

describe('normalizeAmountInput', () => {
  it('shows the locale decimal separator whatever the user typed', () => {
    expect(normalizeAmountInput('12.50', ',')).toBe('12,50')
    expect(normalizeAmountInput('12,50', ',')).toBe('12,50')
    expect(normalizeAmountInput('12,50', '.')).toBe('12.50')
    expect(normalizeAmountInput('12.', ',')).toBe('12,')
    expect(normalizeAmountInput('.5', ',')).toBe('0,5')
    expect(normalizeAmountInput('1 234,56', ',')).toBe('1234,56')
  })

  it('drops leading zeros and junk characters', () => {
    expect(normalizeAmountInput('007', ',')).toBe('7')
    expect(normalizeAmountInput('0', ',')).toBe('0')
    expect(normalizeAmountInput('0,05', ',')).toBe('0,05')
    expect(normalizeAmountInput('-12€', ',')).toBe('12')
    expect(normalizeAmountInput('', ',')).toBe('')
  })

  it('rejects a second separator, a third decimal and too many digits', () => {
    expect(normalizeAmountInput('12,5,', ',')).toBeNull()
    expect(normalizeAmountInput('12,5.', ',')).toBeNull()
    expect(normalizeAmountInput('12,505', ',')).toBeNull()
    expect(normalizeAmountInput('12345678901', ',')).toBeNull()
    expect(normalizeAmountInput('1234567890', ',')).toBe('1234567890')
  })
})

describe('nextAmountInput: typing', () => {
  const type = (start: string, keys: string, sep = ',') =>
    [...keys].reduce((v, k) => nextAmountInput(v + k, v, sep), start)

  it('typing 12.50 keystroke by keystroke gives 12,50', () => {
    expect(type('', '12.50')).toBe('12,50')
    expect(parseAmountInput(type('', '12.50'))).toBe(12.5)
  })

  it('ignores a second separator and a third decimal', () => {
    expect(type('', '12.5.0')).toBe('12,50')
    expect(type('', '1,999')).toBe('1,99')
  })

  it('editing 12.5: replacing the last digit keeps the decimal', () => {
    const shown = formatAmountInput(12.5, ',')
    expect(shown).toBe('12,50')
    // select the last two digits and type 9 → "12,9"
    const edited = nextAmountInput('12,9', shown, ',')
    expect(edited).toBe('12,9')
    expect(parseAmountInput(edited)).toBe(12.9)
    // backspace twice then type 75
    expect(parseAmountInput(type('12,', '75'))).toBe(12.75)
  })

  it('an old dotted value ("12.5") being edited is not corrupted to 129', () => {
    expect(parseAmountInput(nextAmountInput('12.9', '12.5', ','))).toBe(12.9)
  })

  it('clearing the field gives an empty value', () => {
    expect(nextAmountInput('', '12,50', ',')).toBe('')
    expect(parseAmountInput('')).toBeNull()
  })
})

describe('formatAmountInput', () => {
  it('formats for editing in the locale, without grouping', () => {
    expect(formatAmountInput(12.5, ',')).toBe('12,50')
    expect(formatAmountInput(12.5, '.')).toBe('12.50')
    expect(formatAmountInput(1234.56, ',')).toBe('1234,56')
    expect(formatAmountInput(100, ',')).toBe('100')
    expect(formatAmountInput('40.00', ',')).toBe('40')
    expect(formatAmountInput(0.1 + 0.2, ',')).toBe('0,30')
    expect(formatAmountInput(null, ',')).toBe('')
    expect(formatAmountInput(NaN, ',')).toBe('')
  })

  it('round-trips through parseAmountInput', () => {
    for (const n of [0.5, 12.5, 99.99, 1234.56, 100]) {
      expect(parseAmountInput(formatAmountInput(n, ','))).toBe(n)
      expect(parseAmountInput(formatAmountInput(n, '.'))).toBe(n)
    }
  })
})

describe('decimalSeparator', () => {
  it('reads the separator from Intl', () => {
    expect(decimalSeparator('sk-SK')).toBe(',')
    expect(decimalSeparator('cs-CZ')).toBe(',')
    expect(decimalSeparator('en-GB')).toBe('.')
  })
})

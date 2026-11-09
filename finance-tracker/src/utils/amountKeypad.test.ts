import { describe, it, expect } from 'vitest'
import { applyAmountKey } from './amountKeypad'

const type = (keys: string[], sep = ',') => keys.reduce((v, k) => applyAmountKey(v, k, sep), '')

describe('applyAmountKey', () => {
  it('types digits and one decimal separator', () => {
    expect(type(['1', '2', ',', '5', '0'])).toBe('12,50')
    expect(type(['1', ',', ',', '5'])).toBe('1,5')
  })
  it('keeps at most two decimals', () => {
    expect(type(['3', ',', '1', '4', '9'])).toBe('3,14')
  })
  it('starts "0," when the separator comes first', () => {
    expect(type([','])).toBe('0,')
    expect(type(['.'], '.')).toBe('0.')
  })
  it('deletes the last character', () => {
    expect(type(['4', '2', '⌫'])).toBe('4')
    expect(type(['⌫'])).toBe('')
  })
})

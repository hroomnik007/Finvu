import { describe, expect, it } from 'vitest'
import { pluralCount, pluralForm } from './plural'

const sk = { one: 'transakcia', few: 'transakcie', many: 'transakcií' }
const pl = { one: 'transakcja', few: 'transakcje', many: 'transakcji' }
const en = { one: 'transaction', few: 'transactions', many: 'transactions' }

describe('pluralForm', () => {
  it('sk/cs: 1 / 2–4 / 5+ / 0', () => {
    expect([0, 1, 2, 4, 5, 11, 21].map(n => pluralForm(n, sk, 'sk-SK'))).toEqual(
      ['transakcií', 'transakcia', 'transakcie', 'transakcie', 'transakcií', 'transakcií', 'transakcií'])
  })
  it('pl: 22 is few, 12 and 25 are many', () => {
    expect([1, 3, 12, 22, 25].map(n => pluralForm(n, pl, 'pl-PL'))).toEqual(
      ['transakcja', 'transakcje', 'transakcji', 'transakcje', 'transakcji'])
  })
  it('en/hu: one vs other', () => {
    expect(pluralForm(1, en, 'en-GB')).toBe('transaction')
    expect(pluralForm(2, en, 'en-GB')).toBe('transactions')
    expect(pluralForm(3, { one: 'tranzakció', few: 'tranzakció', many: 'tranzakció' }, 'hu-HU')).toBe('tranzakció')
  })
})

describe('pluralCount', () => {
  it('formats the number for the locale', () => {
    expect(pluralCount(3, sk, 'sk-SK')).toBe('3 transakcie')
    expect(pluralCount(1200, en, 'en-GB')).toBe('1,200 transactions')
  })
})

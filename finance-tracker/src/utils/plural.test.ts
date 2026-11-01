import { describe, expect, it } from 'vitest'
import { pluralCount, pluralForm, pluralText } from './plural'
import { sk as skT } from '../i18n/sk'
import { cs as csT } from '../i18n/cs'
import { pl as plT } from '../i18n/pl'

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

describe('pluralText', () => {
  it('fills the count into the right template', () => {
    expect(pluralText(4, skT.csv.records, 'sk')).toBe('4 záznamy')
    expect(pluralText(1, skT.csv.records, 'sk')).toBe('1 záznam')
    expect(pluralText(12, skT.csv.records, 'sk')).toBe('12 záznamov')
    expect(pluralText(3, csT.notifications.daysAgo, 'cs')).toBe('před 3 dny')
    expect(pluralText(22, plT.csv.importSuccess, 'pl')).toBe('Zaimportowano 22 transakcje')
    expect(pluralText(1, skT.expenses.fixed.countdown.days, 'sk')).toBe('o 1 deň')
  })
})

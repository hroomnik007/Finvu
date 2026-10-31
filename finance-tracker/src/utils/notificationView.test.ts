import { describe, expect, it } from 'vitest'
import { sk } from '../i18n/sk'
import { notificationView } from './notificationView'

const fmt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const count = (hay: string, needle: string) => hay.split(needle).length - 1

describe('notificationView', () => {
  it('budget: spent shown once, percent moved out of the title', () => {
    const v = notificationView({ id: 'b', kind: 'budget', categoryName: 'Reštaurácie', spent: 150.5, limit: 150 }, sk, fmt)
    expect(v.title).toBe('Limit Reštaurácie')
    expect(v.amount).toBe('150,50 €')
    expect(v.desc).toBe('100 % z limitu 150,00 €')
    const all = [v.title, v.amount, v.desc].join(' ')
    expect(count(all, '150,50 €')).toBe(1)
    expect(count(all, '150,00 €')).toBe(1)
  })
  it('fixedDue: label as title, the date stays in time', () => {
    const v = notificationView({ id: 'f', kind: 'fixedDue', label: 'Nájom', dayOfMonth: 5, daysUntil: 1, amount: 600 }, sk, fmt)
    expect(v).toMatchObject({ title: 'Nájom', amount: '600,00 €', time: 'zajtra', desc: 'Splatnosť 5. dňa v mesiaci' })
  })
  it('income: amount once, description as text', () => {
    const v = notificationView({ id: 'i', kind: 'income', description: 'Výplata', amount: 2000, daysAgo: 2 }, sk, fmt)
    expect(v).toMatchObject({ amount: '+2000,00 €', desc: 'Výplata', time: 'pred 2 dňami', read: true })
    expect(v.desc).not.toContain('2000')
  })
  it('savings: percent of target', () => {
    const v = notificationView({ id: 's', kind: 'savings', name: 'Dovolenka', icon: null, savedAmount: 250, targetAmount: 1000 }, sk, fmt)
    expect(v).toMatchObject({ title: 'Dovolenka', amount: '250,00 €', desc: '25 % z cieľa 1000,00 €' })
  })
})

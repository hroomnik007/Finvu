import { describe, expect, it } from 'vitest'
import { computeBudgetStatuses } from './useBudgetStatus'
import type { Category, FixedExpense, VariableExpense } from '../types'

// 16 Nov 2026, local noon
const TODAY = new Date(2026, 10, 16, 12)

const nakupy: Category = { id: 'cat-A', name: 'Nákupy', color: '#000', icon: 'x', type: 'expense', budgetLimit: 400, shared: true }
const doprava: Category = { id: 'cat-D', name: 'Doprava', color: '#000', icon: 'x', type: 'expense', budgetLimit: 100 }
const categories = [nakupy, doprava]

const v = (id: string, categoryId: string, categoryName: string, amount: number): VariableExpense =>
  ({ id, categoryId, categoryName, amount, note: '', date: '2026-11-03' })
const f = (id: string, categoryId: string, categoryName: string, amount: number, dayOfMonth: number): FixedExpense =>
  ({ id, categoryId, categoryName, amount, dayOfMonth, label: id, note: '' })

// own rows (cat-A is mine, cat-B is the partner's copy of Nákupy)
const ownVar = [v('v1', 'cat-A', 'Nákupy', 180), v('v2', 'cat-A', 'Nákupy', 120), v('d1', 'cat-D', 'Doprava', 30)]
const ownFix = [f('f1', 'cat-A', 'Nákupy', 80, 5), f('f2', 'cat-A', 'Nákupy', 50, 28)] // f2 not due yet
const partnerVar = [v('v3', 'cat-B', 'nákupy ', 272), v('p1', 'cat-P', 'Doprava', 500)]
const familyVar = [...ownVar, ...partnerVar]
const familyFix = [...ownFix, f('f3', 'cat-B', 'Nákupy', 0, 10)]

const pct = (rows: ReturnType<typeof computeBudgetStatuses>, id: string) => rows.find(r => r.categoryId === id)!.percentage

describe('computeBudgetStatuses', () => {
  it('personal view: own spending (variable + fixed already due) against the limit', () => {
    const rows = computeBudgetStatuses({ categories, variableExpenses: ownVar, fixedExpenses: ownFix, month: 11, year: 2026 }, TODAY)
    expect(rows.find(r => r.categoryId === 'cat-A')).toMatchObject({ spent: 380, limit: 400, percentage: 95 })
  })

  it('family view: a shared category counts every member (paired by name), a personal one stays own', () => {
    const rows = computeBudgetStatuses({ categories, variableExpenses: familyVar, fixedExpenses: familyFix, month: 11, year: 2026, family: true }, TODAY)
    expect(rows.find(r => r.categoryId === 'cat-A')).toMatchObject({ spent: 652, limit: 400, percentage: 163 })
    expect(rows.find(r => r.categoryId === 'cat-D')).toMatchObject({ spent: 30, limit: 100 })
  })

  it('the same inputs give the same percentage whichever page asks (Dashboard and Categories)', () => {
    for (const family of [false, true]) {
      const vars = family ? familyVar : ownVar
      const fixes = family ? familyFix : ownFix
      const dashboard = computeBudgetStatuses({ categories, variableExpenses: vars, fixedExpenses: fixes.filter(x => x.dayOfMonth <= 16), month: 11, year: 2026, family }, TODAY)
      const categoriesPage = computeBudgetStatuses({ categories, variableExpenses: vars, fixedExpenses: fixes, month: 11, year: 2026, family }, TODAY)
      expect(pct(dashboard, 'cat-A')).toBe(pct(categoriesPage, 'cat-A'))
    }
  })

  it('a category without a limit is left out', () => {
    expect(computeBudgetStatuses({ categories: [{ ...doprava, budgetLimit: undefined }], variableExpenses: ownVar, month: 11, year: 2026 }, TODAY)).toEqual([])
  })
})

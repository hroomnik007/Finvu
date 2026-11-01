import type { Page } from '../App'

export type BottomTabId = 'dashboard' | 'income' | 'expenses' | 'household' | 'more'

export const EXPENSE_MENU_PAGES: Page[] = ['variable-expenses', 'fixed-expenses', 'categories']

/** Pages behind the "Viac" sheet, in display order, for the given feature flags. */
export function moreMenuPages(opts: { savingsEnabled: boolean }): Page[] {
  return ['search', ...(opts.savingsEnabled ? ['savings' as Page] : []), 'annual', 'settings']
}

/** Bottom tabs: Prehľad · Príjmy · Výdavky · (Domácnosť) · Viac. */
export function bottomTabs(opts: { householdEnabled: boolean }): BottomTabId[] {
  return ['dashboard', 'income', 'expenses', ...(opts.householdEnabled ? ['household' as BottomTabId] : []), 'more']
}

/** Which tab is highlighted for the current page. */
export function activeBottomTab(current: Page): BottomTabId {
  if (current === 'dashboard' || current === 'income' || current === 'household') return current
  if (EXPENSE_MENU_PAGES.includes(current)) return 'expenses'
  return 'more' // search, savings, annual, settings
}

// First-run "Prvé kroky" checklist: which steps exist, which are done (derived
// from the user's data, never ticked by hand) and whether it should show.
export type FirstRunStepId = 'income' | 'expense' | 'budget' | 'household'

export interface FirstRunInput {
  hasIncome: boolean
  hasExpense: boolean
  hasBudget: boolean
  householdEnabled: boolean
  hasHouseholdMember: boolean
}

export interface FirstRunStep { id: FirstRunStepId; done: boolean; optional: boolean }

export function firstRunSteps(i: FirstRunInput): FirstRunStep[] {
  const steps: FirstRunStep[] = [
    { id: 'income', done: i.hasIncome, optional: false },
    { id: 'expense', done: i.hasExpense, optional: false },
    { id: 'budget', done: i.hasBudget, optional: false },
  ]
  if (i.householdEnabled) steps.push({ id: 'household', done: i.hasHouseholdMember, optional: true })
  return steps
}

/** Shown until every required step is done or the user dismisses it. */
export function shouldShowFirstRun(steps: FirstRunStep[], dismissed: boolean): boolean {
  return !dismissed && steps.some(s => !s.optional && !s.done)
}

export const FIRST_RUN_DISMISS_PREFIX = 'finvu_first_run_dismissed_'
export const firstRunDismissKey = (userId: string) => FIRST_RUN_DISMISS_PREFIX + userId

export function isFirstRunDismissed(userId: string | undefined): boolean {
  if (!userId) return false
  try { return localStorage.getItem(firstRunDismissKey(userId)) === '1' } catch { return false }
}

export function dismissFirstRun(userId: string): void {
  try { localStorage.setItem(firstRunDismissKey(userId), '1') } catch { /* ignore */ }
}

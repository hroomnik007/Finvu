// First-run "Prvé kroky" checklist: which steps exist, which are done (derived
// from the user's data, never ticked by hand) and whether it should show.
export type FirstRunStepId = 'template' | 'income' | 'expense' | 'budget' | 'tracking' | 'pin' | 'household'

export interface FirstRunInput {
  hasIncome: boolean
  hasExpense: boolean
  hasBudget: boolean
  householdEnabled: boolean
  hasHouseholdMember: boolean
  /** The budget-template offer is still open (new account, not applied or dismissed). */
  offerTemplate?: boolean
  /** A tracking start date was picked. */
  trackingSet?: boolean
  /** The tracking-start suggestion was dismissed earlier: don't offer it. */
  trackingDismissed?: boolean
  hasPin?: boolean
}

export interface FirstRunStep { id: FirstRunStepId; done: boolean; optional: boolean }

// The checklist is the whole onboarding: the budget template, the tracking
// start date and the PIN used to be a full-screen step, a tutorial step and
// two dashboard banners. They are optional, so they never keep it on screen.
export function firstRunSteps(i: FirstRunInput): FirstRunStep[] {
  const steps: FirstRunStep[] = []
  if (i.offerTemplate) steps.push({ id: 'template', done: false, optional: true })
  steps.push(
    { id: 'income', done: i.hasIncome, optional: false },
    { id: 'expense', done: i.hasExpense, optional: false },
    { id: 'budget', done: i.hasBudget, optional: false },
  )
  if (i.trackingSet || !i.trackingDismissed) steps.push({ id: 'tracking', done: !!i.trackingSet, optional: true })
  steps.push({ id: 'pin', done: !!i.hasPin, optional: true })
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

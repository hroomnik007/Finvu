import { useAuth } from '../context/AuthContext'

// Per-user flag: the budget-template offer was dismissed (or a template was
// applied) on this device. Holds the user's id so another account on the same
// device still gets the offer; cleared on logout via lib/userDataReset.
export const BUDGET_TEMPLATE_DISMISSED_KEY = 'budget_template_dismissed'

export function isBudgetTemplateDismissed(userId: string): boolean {
  try { return localStorage.getItem(BUDGET_TEMPLATE_DISMISSED_KEY) === userId } catch { return false }
}

export function dismissBudgetTemplate(userId: string): void {
  try { localStorage.setItem(BUDGET_TEMPLATE_DISMISSED_KEY, userId) } catch { /* ignore */ }
}

export function useBudgetTemplate() {
  const { user, isGuest } = useAuth()
  if (isGuest) return false
  // If user has completed onboarding (backend flag), skip template
  if (user?.onboardingComplete) return false
  return true
}

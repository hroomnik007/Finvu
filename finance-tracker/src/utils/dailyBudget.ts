export interface DailyBudget {
  /** What is left of the month's income after what is spent and the fixed payments still to come. */
  left: number
  /** Spendable per remaining day, today included; 0 once the month is over budget. */
  perDay: number
  daysLeft: number
  over: boolean
}

// null without income: there is nothing to measure the month against.
export function dailyBudget(input: {
  income: number
  spent: number
  pendingFixed: number
  day: number
  daysInMonth: number
}): DailyBudget | null {
  if (!(input.income > 0)) return null
  const left = input.income - input.spent - input.pendingFixed
  const daysLeft = Math.max(1, input.daysInMonth - input.day + 1)
  return { left, perDay: Math.max(0, left) / daysLeft, daysLeft, over: left < 0 }
}

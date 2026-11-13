// End-of-month balance prediction for the dashboard.
//
// Fixed expenses (rent, subscriptions) are counted once, in full, whether they
// are already paid or still to come this month. Only variable spending is
// extrapolated from the pace so far: dividing everything by the days elapsed
// would treat rent paid on the 1st as if it were paid every day.
export interface MonthForecast {
  /** Predicted balance at the end of the month. */
  balance: number
  /** Predicted expenses of the whole month. */
  expenses: number
  /** Variable spending per day so far. */
  variablePerDay: number
}

export function monthForecast(input: {
  income: number
  /** Fixed expenses already due this month. */
  fixedPaid: number
  /** Fixed expenses still to come this month. */
  fixedPending: number
  /** Variable spending so far this month (dated up to today). */
  variable: number
  /**
   * Variable spending already entered with a later date this month. It is known,
   * so it counts once and stays out of the daily pace.
   */
  variablePlanned?: number
  /** Days elapsed, today included (daysInMonth for a past month). */
  day: number
  daysInMonth: number
}): MonthForecast {
  const day = Math.min(Math.max(input.day, 1), input.daysInMonth)
  const variablePerDay = input.variable / day
  const expenses = input.fixedPaid + input.fixedPending + variablePerDay * input.daysInMonth + (input.variablePlanned ?? 0)
  return { balance: input.income - expenses, expenses, variablePerDay }
}

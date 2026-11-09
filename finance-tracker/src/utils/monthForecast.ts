// End-of-month balance prediction for the dashboard.
//
// Fixed expenses (rent, subscriptions) are counted once, in full, whether they
// are already paid or still to come this month. Only variable spending is
// extrapolated from the pace so far: dividing everything by the days elapsed
// would treat rent paid on the 1st as if it were paid every day.
export interface MonthForecast {
  /** Predicted balance at the end of the month. */
  balance: number
  /** Variable spending per day so far. */
  variablePerDay: number
}

export function monthForecast(input: {
  income: number
  /** Fixed expenses already due this month. */
  fixedPaid: number
  /** Fixed expenses still to come this month. */
  fixedPending: number
  /** Variable spending so far this month. */
  variable: number
  /** Days elapsed, today included (daysInMonth for a past month). */
  day: number
  daysInMonth: number
}): MonthForecast {
  const day = Math.min(Math.max(input.day, 1), input.daysInMonth)
  const variablePerDay = input.variable / day
  const balance = input.income - input.fixedPaid - input.fixedPending - variablePerDay * input.daysInMonth
  return { balance, variablePerDay }
}

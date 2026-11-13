// Day-by-day outlook of the account balance for the rest of the running month:
// where the balance bottoms out before the next income arrives.
//
// Starts from what is in the account today and walks to the month's last day.
// Each day applies what is already known for it (fixed expenses falling due,
// recurring incomes on their payday, one-off rows entered with a later date)
// plus the usual daily variable spending.
export interface CashFlowEvent {
  /** Day of the month the amount lands on. */
  day: number
  /** Positive = money in, negative = money out. */
  amount: number
}

export interface CashFlowOutlook {
  /** Lowest balance between today and the month's end (today included). */
  lowest: number
  /** Day of the month the lowest balance is reached. */
  lowestDay: number
  /** Balance on the month's last day. */
  end: number
}

export function cashFlowOutlook(input: {
  /** Balance today, without anything dated later. */
  balanceToday: number
  /** Today's day of the month. */
  today: number
  daysInMonth: number
  /** Known movements; only those after today are applied. */
  events: CashFlowEvent[]
  /** Usual variable spending per day, applied to every remaining day. */
  variablePerDay?: number
}): CashFlowOutlook {
  const perDay = Math.max(0, input.variablePerDay ?? 0)
  const byDay = new Map<number, number>()
  for (const e of input.events) {
    // A day past the month's end (31st in a 30-day month) lands on the last day
    const day = Math.min(e.day, input.daysInMonth)
    if (day <= input.today) continue
    byDay.set(day, (byDay.get(day) ?? 0) + e.amount)
  }
  let balance = input.balanceToday
  let lowest = balance
  let lowestDay = input.today
  for (let day = input.today + 1; day <= input.daysInMonth; day++) {
    balance += (byDay.get(day) ?? 0) - perDay
    if (balance < lowest) { lowest = balance; lowestDay = day }
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return { lowest: round(lowest), lowestDay, end: round(balance) }
}

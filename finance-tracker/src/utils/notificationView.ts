import type { NotificationFeedItem } from '../api/notifications'
import type { Translations } from '../i18n/sk'
import type { Page } from '../App'

/** Display model for one feed item: the amount appears exactly once. */
export interface NotificationView {
  title: string
  /** Highlighted amount shown at the start of the single detail line. */
  amount?: string
  /** Short text after the amount ("100 % z limitu 150,00 €"). */
  desc: string
  time: string
  read: boolean
  color: string
  kind: 'budget' | 'fixedDue' | 'income' | 'savings'
  target?: Page
}

export function notificationView(item: NotificationFeedItem, t: Translations, formatAmount: (n: number) => string): NotificationView {
  const n = t.notifications
  switch (item.kind) {
    case 'budget': {
      const pct = Math.round((item.spent / item.limit) * 100)
      return {
        kind: 'budget',
        title: n.budgetTitle.replace('{name}', item.categoryName),
        amount: formatAmount(item.spent),
        desc: n.budgetDesc.replace('{pct}', String(pct)).replace('{limit}', formatAmount(item.limit)),
        time: n.today,
        read: false,
        color: pct >= 100 ? 'var(--aurora-rose)' : 'var(--aurora-amber)',
        target: 'variable-expenses',
      }
    }
    case 'fixedDue': {
      const time = item.daysUntil === 0 ? n.today : item.daysUntil === 1 ? n.tomorrow : n.inDays.replace('{n}', String(item.daysUntil))
      return {
        kind: 'fixedDue',
        title: item.label,
        amount: formatAmount(item.amount),
        desc: n.dueDay.replace('{n}', String(item.dayOfMonth)),
        time,
        read: false,
        color: '#60A5FA',
        target: 'fixed-expenses',
      }
    }
    case 'income': {
      const time = item.daysAgo === 0 ? n.today : item.daysAgo === 1 ? n.yesterday : n.daysAgo.replace('{n}', String(item.daysAgo))
      return {
        kind: 'income',
        title: n.incomeReceived,
        amount: `+${formatAmount(item.amount)}`,
        desc: item.description ?? n.incomeDefault,
        time,
        read: item.daysAgo > 0,
        color: '#34d399',
        target: 'income',
      }
    }
    case 'savings': {
      const pct = Math.round((item.savedAmount / item.targetAmount) * 100)
      return {
        kind: 'savings',
        title: item.name,
        amount: formatAmount(item.savedAmount),
        desc: n.savingsDesc.replace('{pct}', String(pct)).replace('{target}', formatAmount(item.targetAmount)),
        time: n.currentTime,
        read: true,
        color: '#2DD4BF',
        target: 'savings',
      }
    }
  }
}

import { useEffect, useRef } from 'react'
import type { FixedExpense } from '../types'
import { toLocalISO } from '../utils/format'
import { useTranslation } from '../i18n'
import { useFormatters } from './useFormatters'

const STORAGE_KEY = 'fixed_expense_notified'
const SETTINGS_KEY = 'fixed_expense_notifications_enabled'

function getNotifiedDates(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function setNotifiedDate(expenseId: string, date: string) {
  const notified = getNotifiedDates()
  notified[expenseId] = date
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notified))
  } catch { /* ignore */ }
}

export function getNotificationsEnabled(): boolean {
  try {
    const val = localStorage.getItem(SETTINGS_KEY)
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

export function setNotificationsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SETTINGS_KEY, String(enabled))
  } catch { /* ignore */ }
}

export function useFixedExpenseNotifications(fixedExpenses: FixedExpense[], isAuthenticated = false) {
  const { t } = useTranslation()
  const { formatAmount } = useFormatters()
  // Latest translations/formatter without re-running the notification effect on every render.
  const textRef = useRef({ t, formatAmount })
  useEffect(() => { textRef.current = { t, formatAmount } })

  useEffect(() => {
    if (!isAuthenticated) return
    if (!getNotificationsEnabled()) return
    if (!('Notification' in window)) return

    const today = new Date()
    const todayDay = today.getDate()
    const todayStr = toLocalISO(today)

    async function checkAndNotify() {
      let permission = Notification.permission
      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }
      if (permission !== 'granted') return

      const notified = getNotifiedDates()

      for (const expense of fixedExpenses) {
        if (expense.dayOfMonth !== todayDay) continue
        if (notified[expense.id!] === todayStr) continue

        const { t: tr, formatAmount: fmt } = textRef.current
        new Notification(tr.notifications.fixedDueTitle, {
          body: tr.notifications.fixedDueBody
            .replace('{label}', expense.label)
            .replace('{amount}', fmt(Number(expense.amount))),
          icon: '/logo.svg',
        })

        setNotifiedDate(expense.id!, todayStr)
      }
    }

    checkAndNotify()
  }, [fixedExpenses, isAuthenticated])
}

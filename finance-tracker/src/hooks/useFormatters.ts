import { useSettingsContext } from '../context/SettingsContext'
import { useTranslation } from '../i18n'
import { formatMoney, formatMoneyParts, formatNumber, formatDateLocale } from '../utils/format'

// One place for UI formatting: amounts use the active language's number
// conventions (Intl) and the user's currency; dates use the active language.
export function useFormatters() {
  const { settings } = useSettingsContext()
  const { locale } = useTranslation()
  const currency = settings.currency || 'EUR'

  const formatAmount = (amount: number): string => formatMoney(amount, locale, currency)

  const formatAmountParts = (amount: number) => formatMoneyParts(amount, locale, currency)

  const formatNum = (value: number, options?: Intl.NumberFormatOptions): string => formatNumber(value, locale, options)

  // Numeric date following the user's explicit date-format preference (Settings).
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr + 'T00:00:00')
      if (Number.isNaN(d.getTime())) return dateStr
      const day   = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year  = d.getFullYear()
      switch (settings.dateFormat) {
        case 'YYYY-MM-DD': return `${year}-${month}-${day}`
        case 'MM/DD/YYYY': return `${month}/${day}/${year}`
        default:           return `${day}.${month}.${year}`
      }
    } catch {
      return dateStr
    }
  }

  // Date with month names etc. in the active language.
  const formatLongDate = (value: string | Date, options?: Intl.DateTimeFormatOptions): string =>
    formatDateLocale(value, locale, options)

  return { formatAmount, formatAmountParts, formatNumber: formatNum, formatDate, formatLongDate, locale, currency }
}

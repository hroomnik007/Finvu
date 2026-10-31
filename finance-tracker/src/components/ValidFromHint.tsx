import { useTranslation } from '../i18n'
import { formatMonthYearFrom } from '../utils/format'

/** "Platí od apríla 2026" under the date of a recurring item being added. */
export function ValidFromHint({ date }: { date: string | Date }) {
  const { t, locale } = useTranslation()
  const month = formatMonthYearFrom(date, locale)
  if (!month) return null
  return (
    <p
      data-testid="valid-from-hint"
      style={{ margin: '-2px 2px 0', fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)' }}
    >
      {t.common.validFrom.replace('{month}', month)}
    </p>
  )
}

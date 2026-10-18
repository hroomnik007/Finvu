import { GlassCard } from './GlassCard'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import type { DailyBudget } from '../utils/dailyBudget'

interface Props {
  budget: DailyBudget
  pendingFixed: number
}

export function DailyBudgetCard({ budget, pendingFixed }: Props) {
  const { t } = useTranslation()
  const { formatAmount } = useFormatters()
  const accent = budget.over ? 'var(--aurora-rose)' : 'var(--aurora-emerald)'
  const detail = budget.over
    ? t.dashboard.dailyBudgetOver.replace('{amount}', formatAmount(-budget.left))
    : (pendingFixed > 0 ? t.dashboard.dailyBudgetDetail : t.dashboard.dailyBudgetDetailNoFixed)
        .replace('{perDay}', formatAmount(budget.perDay))
        .replace('{days}', String(budget.daysLeft))
        .replace('{fixed}', formatAmount(pendingFixed))
  return (
    <GlassCard radius={18} style={{ padding: '12px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700 }}>
          {t.dashboard.dailyBudgetTitle}
        </span>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 800, color: accent }}>
          {formatAmount(Math.max(0, budget.left))}
        </span>
      </div>
      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '4px 0 0', lineHeight: 1.45 }}>{detail}</p>
    </GlassCard>
  )
}

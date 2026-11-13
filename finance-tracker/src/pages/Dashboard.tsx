import { useState, useMemo, type ReactNode } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, Tag, Target } from 'lucide-react'
import { ExpenseHeatmap } from '../components/ExpenseHeatmap'
import { CategoryDonutCard } from '../components/CategoryDonutCard'
import { ForecastCard } from '../components/ForecastCard'
import { StreakBadge } from '../components/StreakBadge'
import { StreakModal } from '../components/StreakModal'
import { GlassCard } from '../components/GlassCard'
import { HeroCard } from '../components/HeroCard'
import { HeroAmountPlaceholder, QueryError, Skeleton } from '../components/QueryState'
import { SubscriptionSuggestions } from '../components/SubscriptionSuggestions'
import { setFixedPrefill } from '../utils/fixedPrefill'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { SAVINGS_ICON_MAP } from '../utils/savingsIcons'
import { useIncomes } from '../hooks/useIncomes'
import { useFixedExpenses, isFixedExpenseDue, isEndedInMonth } from '../hooks/useFixedExpenses'
import { monthForecast } from '../utils/monthForecast'
import { cashFlowOutlook } from '../utils/cashFlow'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useCategories } from '../hooks/useCategories'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { pluralText } from '../utils/plural'
import { useSettingsContext } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import { getMonthlySeries, getSummaryCards } from '../api/transactions'
import { trackingStartOf } from '../utils/trackingStart'
import { updateUserSettings } from '../api/auth'
import { useBudgetStatus } from '../hooks/useBudgetStatus'
import { useSavings } from '../hooks/useSavings'
import { useHousehold } from '../hooks/useHousehold'
import { MemberAvatar } from '../components/MemberAvatar'
import { useCountUp } from '../hooks/useCountUp'
import type { Page } from '../App'
import type { Translations } from '../i18n/sk'
import { todayISO } from '../utils/format'
import { FirstRunChecklist } from '../components/FirstRunChecklist'

const FALLBACK_COLOR = '#6b7280'

function catBg(color: string) {
  return color + '26'
}

type AuroraSeverity = 'red' | 'warning' | null

function auroraSeverityStyle(severity: AuroraSeverity) {
  const tint = severity === 'red' ? 'var(--aurora-rose)' : severity === 'warning' ? 'var(--aurora-amber)' : null
  return {
    background: tint ? `color-mix(in srgb, ${tint} 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
    border: tint ? `1px solid color-mix(in srgb, ${tint} 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
    borderRadius: 20,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    padding: 16,
  }
}

function getGreeting(name: string, t: Translations): { text: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return { text: `${t.dashboard.greetingMorning}${name ? `, ${name}` : ''}` }
  if (hour >= 12 && hour < 18) return { text: `${t.dashboard.greetingDay}${name ? `, ${name}` : ''}` }
  if (hour >= 18 && hour < 22) return { text: `${t.dashboard.greetingEvening}${name ? `, ${name}` : ''}` }
  return { text: `${t.dashboard.greetingNight}${name ? `, ${name}` : ''}` }
}


// ─────────────────────────────────────────────────────────────────────────────

interface DashboardProps {
  month: number
  year: number
  onNavigate: (page: Page) => void
  dashView: 'personal' | 'family'
  /** Present while a new account is offered a budget template (see App). */
  budgetTemplateOffer?: { onOpen: () => void; onDismiss: () => void }
}

export function Dashboard({ month, year, onNavigate, dashView, budgetTemplateOffer }: DashboardProps) {
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const { dialogProps: trackingModalDialogProps, panelRef: trackingModalPanelRef } = useModalA11y({ open: showTrackingModal, onClose: () => setShowTrackingModal(false) })
  const [streakModalOpen, setStreakModalOpen] = useState(false)
  const [trackingDate, setTrackingDate] = useState(() => todayISO())
  const [trackingSaving, setTrackingSaving] = useState(false)

  // Family view lists every sharing member's rows; the server falls back to the
  // caller's own rows when they have no household / sharing is off.
  const { incomes: allIncomes, isLoading: incLoading, isError: incError, refetch: incRetry } = useIncomes(month, year, dashView)
  const { fixedExpenses: allMonthFixedExpenses, isLoading: fixLoading, isError: fixError, refetch: fixRetry } = useFixedExpenses(month, year, dashView)
  const { fixedExpenses: allFixedExpenses } = useFixedExpenses(undefined, undefined, dashView)
  const { variableExpenses: allVariableExpenses, isLoading: varLoading, isError: varError, refetch: varRetry } = useVariableExpenses(month, year, dashView)
  const { categories } = useCategories()
  // A fixed expense only counts once its due day in the viewed month has
  // actually passed — see isFixedExpenseDue.
  const fixedExpenses = useMemo(() =>
    allMonthFixedExpenses.filter(f => isFixedExpenseDue(f.dayOfMonth, month, year)),
  [allMonthFixedExpenses, month, year])
  const budgetStatuses = useBudgetStatus({ categories, variableExpenses: allVariableExpenses, fixedExpenses, month, year })
  const sortedBudgetStatuses = useMemo(() =>
    budgetStatuses
      .filter(b => b.limit > 0)
      // Closest to (or furthest over) its limit first: an exceeded category must
      // never drop out of the five just because it has few transactions.
      .sort((a, b) => b.percentage - a.percentage || b.spent - a.spent)
      .slice(0, 5),
    [budgetStatuses]
  )
  const { goals: savingsGoals } = useSavings()
  const { formatAmount, formatAmountParts, formatLongDate } = useFormatters()
  const { t, locale } = useTranslation()
  const { profileName } = useSettingsContext()
  const { user, refreshUser } = useAuth()
  const displayName = user?.name || profileName
  const householdEnabled = user?.household_enabled ?? false
  const { members } = useHousehold()
  // Family view mixes every member's bills: tag them with the owner and don't
  // offer 'show all' (the Výdavky module only lists the user's own).
  const familyView = householdEnabled && dashView === 'family'
  const ownerOf = (ownerId?: string) => members.find(m => m.id === ownerId)
  const greeting = getGreeting(displayName, t)

  const incomes = useMemo(() =>
    householdEnabled && dashView === 'personal'
      ? allIncomes.filter(i => i.created_by === user?.id || !i.created_by)
      : allIncomes,
  [householdEnabled, dashView, allIncomes, user?.id])

  const variableExpenses = useMemo(() =>
    householdEnabled && dashView === 'personal'
      ? allVariableExpenses.filter(e => e.created_by === user?.id || !e.created_by)
      : allVariableExpenses,
  [householdEnabled, dashView, allVariableExpenses, user?.id])

  // A recurring income counts once its payday in the viewed month has arrived,
  // like a fixed expense on its due day (the server cards use the same rule).
  // `plannedIncome` is the whole month's income, used by the forecast.
  const plannedIncome = useMemo(() => incomes.reduce((s, i) => s + i.amount, 0), [incomes])
  const totalIncome = useMemo(() => incomes
    .filter(i => !i.recurring || isFixedExpenseDue(Number(i.date.slice(8, 10)) || 1, month, year))
    .reduce((s, i) => s + i.amount, 0), [incomes, month, year])
  const totalFixed = useMemo(() => fixedExpenses.reduce((s, f) => s + f.amount, 0), [fixedExpenses])
  const totalVariable = useMemo(() => variableExpenses.reduce((s, v) => s + v.amount, 0), [variableExpenses])
  const totalExpenses = totalFixed + totalVariable
  const balance = totalIncome - totalExpenses

  // Grouped by category NAME: in the family view the rows include other members'
  // expenses, whose category ids belong to their own categories. Our own
  // category supplies the colour/icon when the name matches, otherwise the data
  // the API returned for the row is used.
  const pieData = useMemo(() => {
    const ownByName = new Map(categories.map(c => [c.name.trim().toLowerCase(), c]))
    const groups = new Map<string, { name: string; icon: string | null | undefined; color: string; value: number }>()
    const add = (row: { categoryName?: string | null; categoryIcon?: string | null; categoryColor?: string | null; amount: number }) => {
      // Rows without a category get their own slice: the centre shows all
      // expenses, so leaving them out made every percentage too high.
      const label = (row.categoryName ?? '').trim() || t.annual.noCategory
      const key = label.toLowerCase()
      const own = ownByName.get(key)
      const group = groups.get(key) ?? {
        name: own?.name ?? label,
        icon: own?.icon ?? row.categoryIcon,
        color: own?.color ?? row.categoryColor ?? '#6B7280',
        value: 0,
      }
      group.value += row.amount
      groups.set(key, group)
    }
    variableExpenses.forEach(add)
    fixedExpenses.forEach(add)
    return [...groups.values()].filter(d => d.value > 0)
  }, [categories, variableExpenses, fixedExpenses, t])

  // Expenses of the month before the viewed one (same recurring-item and
  // tracking-start rules as the cards), for the comparison below.
  const chartStart = trackingStartOf(user)
  const prevKey = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
  const { data: prevMonthExpenses = 0 } = useQuery({
    queryKey: ['dashboardChart', prevKey, chartStart, dashView],
    queryFn: async () => {
      if (chartStart && prevKey < chartStart.slice(0, 7)) return 0
      const series = await getMonthlySeries(prevKey, prevKey, dashView).catch(() => null)
      return series?.months[0]?.expense ?? 0
    },
    enabled: !!user,
  })

  const { data: summaryCards = null, isLoading: sumLoading, isError: sumError, refetch: sumRetry } = useQuery({
    queryKey: ['summaryCards', year, month, dashView],
    queryFn: () => getSummaryCards(year, month, dashView),
    enabled: !!user,
  })

  // Loading / error must not look like "no data" (0,00 €, "Žiadne výdavky").
  const dashLoading = incLoading || fixLoading || varLoading || (sumLoading && !summaryCards)
  const dashFailed = !dashLoading && (incError || fixError || varError || (sumError && !summaryCards))
  const retryDash = () => Promise.all([incRetry(), fixRetry(), varRetry(), sumRetry()])
  const heroValue = (node: ReactNode) => dashLoading
    ? <Skeleton width={64} height={14} style={{ marginTop: 2 }} />
    : dashFailed ? <span style={{ color: 'var(--aurora-faint)' }}>—</span> : node

  const todayStr = formatLongDate(new Date())

  const now = new Date()
  const daysInMonth = new Date(year, month, 0).getDate()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth
  const dailyAvgExpense = dayOfMonth > 0 ? totalExpenses / dayOfMonth : 0

  const monthChallengeTarget = prevMonthExpenses
  const challengeProgress = monthChallengeTarget > 0 ? Math.min(totalExpenses / monthChallengeTarget, 1) : 0

  function countdownBadge(daysUntil: number) {
    if (daysUntil === 0) return { text: t.expenses.fixed.countdown.today, color: 'var(--aurora-violet-text)', bg: 'rgba(139,92,246,0.15)' }
    const text = pluralText(daysUntil, t.expenses.fixed.countdown.days, locale)
    if (daysUntil <= 3) return { text, color: 'var(--aurora-rose)', bg: 'rgba(251,113,133,0.1)' }
    if (daysUntil <= 7) return { text, color: 'var(--aurora-amber)', bg: 'rgba(251,191,36,0.15)' }
    return { text, color: 'var(--aurora-emerald)', bg: 'rgba(52,211,153,0.15)' }
  }

const upcomingFixed = useMemo(() => {
    const n = new Date()
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate())
    // Whole viewed month is before the real current month → everything in it is already paid
    const isPastMonth = year < n.getFullYear() || (year === n.getFullYear() && month < n.getMonth() + 1)
    return allFixedExpenses
      .map(e => {
        // The real next due date: this month when the day is still ahead, otherwise
        // next month — each clamped to its own month's length (31st → 30th / 28th).
        const dueIn = (y: number, m0: number) => new Date(y, m0, Math.min(e.dayOfMonth, new Date(y, m0 + 1, 0).getDate()))
        let due = dueIn(today.getFullYear(), today.getMonth())
        if (due < today) due = dueIn(today.getFullYear(), today.getMonth() + 1)
        const dueYM = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`
        // The price valid in the month it falls due (a change may start next month)
        const price = [...(e.history ?? [])].reverse().find(h => h.from <= dueYM)?.amount ?? e.amount
        return { ...e, amount: isPastMonth ? e.amount : price, dueYM, daysUntil: Math.round((due.getTime() - today.getTime()) / 86400000), paid: isPastMonth }
      })
      .filter(e => isPastMonth || !isEndedInMonth(e.endedOn, e.dueYM))
      .sort((a, b) => isPastMonth ? a.dayOfMonth - b.dayOfMonth : a.daysUntil - b.daysUntil)
      .slice(0, 4)
  }, [allFixedExpenses, year, month])

  const motivationalMsg = (() => {
    if (totalIncome < 0.01) {
      if (totalExpenses > 0) return { msg: t.dashboard.motivationalNoIncome, color: 'var(--aurora-violet-text)' }
      return null
    }
    if (balance > 0 && balance > totalIncome * 0.3) {
      const savingsPct = totalIncome > 0 ? Math.floor((balance / totalIncome) * 100 / 5) * 5 : 30
      const pct = Math.max(savingsPct, 30)
      return { msg: t.dashboard.motivationalGood.replace('{pct}', String(pct)), color: 'var(--aurora-emerald)' }
    }
    if (balance < 0) return { msg: t.dashboard.motivationalBad, color: 'var(--aurora-rose)' }
    if (totalExpenses > 0 && dailyAvgExpense < 20) return { msg: t.dashboard.motivationalAvg, color: 'var(--aurora-violet-text)' }
    return null
  })()

  async function handleSaveTrackingDate() {
    if (!trackingDate) return
    setTrackingSaving(true)
    try {
      await updateUserSettings({ trackingStartDate: trackingDate })
      await refreshUser()
      setShowTrackingModal(false)
    } catch { /* non-critical */ }
    finally { setTrackingSaving(false) }
  }

  // ── Right panel urgency + severity tinting ─────────────────────────────────
  const budgetSeverity = sortedBudgetStatuses.some(b => b.percentage >= 100)
    ? 'red'
    : sortedBudgetStatuses.some(b => b.percentage >= 90)
      ? 'warning'
      : null

  // ── Forecast (end-of-month prediction) ──────────────────────────────────────
  const forecastProgressPct = daysInMonth > 0 ? (isFutureMonth ? 0 : (dayOfMonth / daysInMonth) * 100) : 0
  // Fixed bills count once; only variable spending up to today is extrapolated,
  // and expenses already entered with a later date count once (see monthForecast).
  const todayKey = todayISO()
  const variableSoFar = isFutureMonth ? 0 : variableExpenses.filter(v => !isCurrentMonth || v.date <= todayKey).reduce((s, v) => s + v.amount, 0)
  const forecast = monthForecast({
    income: plannedIncome,
    fixedPaid: totalFixed,
    fixedPending: allMonthFixedExpenses.filter(f => !isFixedExpenseDue(f.dayOfMonth, month, year)).reduce((s, f) => s + f.amount, 0),
    variable: variableSoFar,
    variablePlanned: totalVariable - variableSoFar,
    day: dayOfMonth,
    daysInMonth,
  })

  // Comparison with the month before. The running month is compared by where it
  // is heading (the forecast), not by what was spent so far — a month that is one
  // week old always looked "cheaper" than a whole one. A future month has nothing
  // to compare yet.
  const comparedExpenses = isCurrentMonth ? forecast.expenses : totalExpenses
  const hasMonthComparison = prevMonthExpenses > 0 && !isFutureMonth
  const comparisonDiffPct = hasMonthComparison
    ? Math.abs(((comparedExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : 0
  const comparisonIsUp = hasMonthComparison && comparedExpenses > prevMonthExpenses
  const comparisonText = isCurrentMonth
    ? (comparisonIsUp ? t.dashboard.spendingMore : t.dashboard.spendingLess)
    : (comparisonIsUp ? t.dashboard.spentMore : t.dashboard.spentLess)
  const insightMainText = hasMonthComparison
    ? comparisonText.replace('{pct}', String(Math.round(comparisonDiffPct)))
    : motivationalMsg?.msg ?? null
  const insightMainColor = hasMonthComparison
    ? (comparisonIsUp ? 'var(--aurora-rose)' : 'var(--aurora-emerald)')
    : (motivationalMsg?.color ?? 'var(--aurora-hi)')

  // Outlook of the account for the rest of the running month: where the total
  // balance bottoms out before the next income. The server's balance already
  // contains one-off rows dated later this month, so those are taken out first
  // and applied on their own day instead.
  const lowestAhead = (() => {
    if (!isCurrentMonth || !summaryCards) return null
    const dayOf = (iso: string) => Number(iso.slice(8, 10)) || 1
    const laterVariable = variableExpenses.filter(v => v.date > todayKey)
    const laterOneOffIncome = incomes.filter(i => !i.recurring && i.date > todayKey)
    const events = [
      ...allMonthFixedExpenses.filter(f => !isFixedExpenseDue(f.dayOfMonth, month, year)).map(f => ({ day: f.dayOfMonth, amount: -f.amount })),
      ...incomes.filter(i => i.recurring && !isFixedExpenseDue(dayOf(i.date), month, year)).map(i => ({ day: dayOf(i.date), amount: i.amount })),
      ...laterVariable.map(v => ({ day: dayOf(v.date), amount: -v.amount })),
      ...laterOneOffIncome.map(i => ({ day: dayOf(i.date), amount: i.amount })),
    ]
    const balanceToday = summaryCards.balance
      + laterVariable.reduce((s, v) => s + v.amount, 0)
      - laterOneOffIncome.reduce((s, i) => s + i.amount, 0)
    return cashFlowOutlook({ balanceToday, today: dayOfMonth, daysInMonth, events, variablePerDay: forecast.variablePerDay })
  })()

  const predictedBalance = forecast.balance
  const predictedBalanceText = `${predictedBalance >= 0 ? '+' : ''}${formatAmount(predictedBalance)}`
  const predictedBalanceColor = predictedBalance >= 0 ? 'var(--aurora-emerald)' : 'var(--aurora-rose)'
  const paceText = t.dashboard.pace.replace('{amount}', formatAmount(forecast.variablePerDay))

  // ── Shared JSX blocks ──────────────────────────────────────────────────────

  const greetingDesktop = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingBottom: 12, borderBottom: '1px solid var(--aurora-gline)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'var(--aurora-hi)', letterSpacing: '-0.3px', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{greeting.text}</span>
        <StreakBadge count={user?.currentStreak ?? 0} size="lg" variant="aurora" onClick={() => setStreakModalOpen(true)} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-faint)', marginBottom: 4 }}>{t.dashboard.today}</p>
        <p style={{ fontSize: 13, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", margin: 0 }}>{todayStr}</p>
      </div>
    </div>
  )

  const greetingRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 19, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{greeting.text}</span>
        <StreakBadge count={user?.currentStreak ?? 0} size="sm" variant="aurora" onClick={() => setStreakModalOpen(true)} />
      </div>
    </div>
  )

  // Hero section — wallet card style
  // summaryCards reflects the current dashView scope (personal|family) once loaded.
  // While loading/on error, only fall back to the client-computed totals for the
  // personal view — those are already correctly scoped; there's no equivalent
  // client-side "family" total to fall back to, so avoid silently showing personal
  // data under a "Rodinné" label.
  const heroBalance = summaryCards?.balance ?? (dashView === 'personal' ? balance : 0)
  const heroIncome = summaryCards?.income ?? (dashView === 'personal' ? totalIncome : 0)
  const heroExpenses = summaryCards?.expenses ?? (dashView === 'personal' ? totalExpenses : 0)
  const monthResult = heroIncome - heroExpenses
  const savRate = heroIncome > 0 ? Math.round(((heroIncome - heroExpenses) / heroIncome) * 100) : 0
  const animatedBalance = useCountUp(heroBalance, 800)
  const animatedIncome = useCountUp(heroIncome, 800)
  const animatedExpenses = useCountUp(heroExpenses, 800)
  // background-clip:text on a node whose text content is rewritten on every one
  // of the ~48 useCountUp animation frames can end up with its gradient paint
  // layer left blank by Chromium (a paint-invalidation bug — forcing a reflow
  // after the fact did not reliably fix it). Instead of clipping the gradient
  // to a rapidly-mutating node, the clipped span is only ever mounted with the
  // final, settled value — while the count-up is in flight, a plain solid-color
  // span (which Chromium never fails to repaint) shows the animating digits.
  // Float-tolerant: the eased count-up's last frame can land a hair off the
  // exact target (floating-point rounding), which would otherwise never
  // satisfy a strict === check and leave the gradient span permanently unmounted.
  const balanceSettled = Math.abs(animatedBalance - heroBalance) < 0.005
  const balanceSign = heroBalance >= 0 ? '+' : '−'
  const balanceParts = formatAmountParts(Math.abs(balanceSettled ? heroBalance : animatedBalance))
  const balanceText = balanceParts.main
  const balanceFontStyle = {
    fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
  } as const
  const heroSection = (
    <HeroCard variant="neutral">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, minWidth: 0 }}>
          {t.dashboard.totalBalance}
        </div>
        {/* Quiet link to the yearly overview (was a second primary button under the card) */}
        <button
          type="button"
          onClick={() => onNavigate('annual')}
          className="hero-link"
          aria-label={t.annual.link}
          title={t.annual.link}
        >
          <CalendarRange size={15} aria-hidden /> <span className="hero-link-text">{t.annual.link}</span>
        </button>
      </div>
      {dashFailed ? <QueryError compact onRetry={retryDash} /> : dashLoading ? <HeroAmountPlaceholder error={false} /> : (
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const }}>
        {balanceSettled ? (
          <span style={{
            ...balanceFontStyle,
            background: `linear-gradient(120deg, var(--aurora-hi), ${heroBalance < 0 ? 'var(--aurora-rose)' : 'var(--aurora-cyan)'})`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
          }}>
            {balanceSign}{balanceText}
          </span>
        ) : (
          <span style={{ ...balanceFontStyle, color: 'var(--aurora-hi)' }}>
            {balanceSign}{balanceText}
          </span>
        )}
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
          {balanceParts.rest}
        </span>
      </div>
      )}
      {/* The big figure is the running total since tracking began; the tiles below
          are this month's, so the month's own result is spelled out between them. */}
      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', marginTop: 10 }}>
        {t.dashboard.monthResult} · {t.months[month - 1]} {year}:{' '}
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: monthResult < 0 ? 'var(--aurora-rose)' : 'var(--aurora-emerald)' }}>
          {heroValue(`${monthResult >= 0 ? '+' : '−'}${formatAmount(Math.abs(monthResult))}`)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div
          onClick={() => onNavigate('income')}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--aurora-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--aurora-glass)' }}
          style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0, cursor: 'pointer', transition: 'background 0.15s' }}
        >
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.dashboard.income}</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-emerald)', lineHeight: 1.15, wordBreak: 'break-word' }}>{heroValue(formatAmount(animatedIncome))}</div>
        </div>
        <div
          onClick={() => onNavigate('variable-expenses')}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--aurora-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--aurora-glass)' }}
          style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0, cursor: 'pointer', transition: 'background 0.15s' }}
        >
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.dashboard.expenses}</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-rose)', lineHeight: 1.15, wordBreak: 'break-word' }}>{heroValue(formatAmount(animatedExpenses))}</div>
        </div>
        <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.dashboard.savingsRate}</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{heroValue(`${savRate}%`)}</div>
        </div>
      </div>
    </HeroCard>
  )

  // Monthly charges that look like subscriptions: one collapsed row under the
  // balance; adding one continues on the Fixed page
  const subscriptionHints = dashView === 'personal'
    ? <SubscriptionSuggestions max={2} onAdd={sub => { setFixedPrefill(sub); onNavigate('fixed-expenses') }} />
    : null

  const pieChartCard = (
    dashLoading || dashFailed ? (
      <GlassCard radius={20} style={{ padding: 20 }}>
        <div role={dashLoading ? 'status' : undefined} aria-busy={dashLoading || undefined} aria-label={dashLoading ? t.common.loading : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700 }}>{t.dashboard.expensesByCategory}</div>
          {dashLoading
            ? <Skeleton width={180} height={180} radius={90} />
            : <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: '40px 0' }}>{t.common.loadFailed}</p>}
        </div>
      </GlassCard>
    ) : (
      <CategoryDonutCard data={pieData} title={t.dashboard.expensesByCategory} total={totalExpenses} />
    )
  )

  const heatmapCard = (
    <ExpenseHeatmap
      expenses={variableExpenses}
      month={month}
      year={year}
      categories={categories}
      onNavigate={onNavigate}
    />
  )

  const rightPanelCards = (
    <>
      <GlassCard radius={20}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-hi)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{t.dashboard.upcomingPayments}</h3>
          {upcomingFixed.length > 0 && !familyView && (
            <button
              onClick={() => onNavigate('fixed-expenses')}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-cyan)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
            >
              {t.dashboard.showAll} →
            </button>
          )}
        </div>
        {upcomingFixed.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcomingFixed.map(fe => {
              const badge = fe.paid ? { text: t.expenses.paid, color: 'var(--aurora-emerald)', bg: 'rgba(52,211,153,0.15)' } : countdownBadge(fe.daysUntil)
              const cat = categories.find(c => c.id === fe.categoryId)
              const color = cat?.color ?? FALLBACK_COLOR
              const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
              return (
                <GlassCard key={fe.id ?? fe.label} radius={18} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 13, background: catBg(color), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={color} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{fe.label}</div>
                    {/* One non-wrapping row: the owner tag (family view) must never push the badge text or the card onto extra lines */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{badge.text}</span>
                      {familyView && ownerOf(fe.ownerId) && (
                        // Avatar instead of a name tag: always fits, the name is in the tooltip
                        <span title={ownerOf(fe.ownerId)!.name} aria-label={ownerOf(fe.ownerId)!.name} style={{ display: 'flex', flexShrink: 0 }}>
                          <MemberAvatar userId={ownerOf(fe.ownerId)!.id} userName={ownerOf(fe.ownerId)!.name} size={20} avatarUrl={ownerOf(fe.ownerId)!.avatar_url} />
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-rose)', flexShrink: 0 }}>
                    {formatAmount(fe.amount)}
                  </span>
                </GlassCard>
              )
            })}
          </div>
        ) : (
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{t.dashboard.noUpcomingPayments}</p>
        )}
      </GlassCard>

      <div style={auroraSeverityStyle(budgetSeverity)}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{t.dashboard.budget}</p>
        {sortedBudgetStatuses.map(b => {
          const bCat = categories.find(c => c.id === b.categoryId)
          const barColor = (bCat?.autoLimit && !bCat.limitReserve) ? 'var(--aurora-emerald)' : b.percentage >= 100 ? 'var(--aurora-rose)' : b.percentage >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-emerald)'
          return (
            <div key={b.categoryId} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => { const Icon = CATEGORY_ICON_MAP[b.categoryIcon ?? ''] ?? Tag; return <Icon size={14} color={bCat?.color ?? FALLBACK_COLOR} strokeWidth={1.8} style={{ flexShrink: 0 }} /> })()} {b.categoryName}
                </span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: barColor }}>{Math.round(b.percentage)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(b.percentage, 100)}%`, background: barColor }} />
              </div>
            </div>
          )
        })}
        {sortedBudgetStatuses.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{t.dashboard.noLimits}</p>
            <button
              onClick={() => onNavigate('categories')}
              style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-violet-text)', background: 'rgba(139,92,246,.14)', border: '1px solid rgba(139,92,246,0.25)', padding: '4px 8px', borderRadius: 8, cursor: 'pointer' }}
            >
              {t.dashboard.setLimits}
            </button>
          </div>
        )}
        {sortedBudgetStatuses.length > 0 && (
          <button
            onClick={() => onNavigate('categories')}
            style={{ marginTop: 4, fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-violet-text)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
          >
            {t.dashboard.showMore}
          </button>
        )}
      </div>

      {(insightMainText || monthChallengeTarget > 0) && (
        <GlassCard radius={20}>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{t.dashboard.howYouAreDoing}</p>
          {insightMainText && (
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: insightMainColor, margin: monthChallengeTarget > 0 ? '0 0 12px' : 0 }}>{insightMainText}</p>
          )}
          {monthChallengeTarget > 0 && (
            <>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%', borderRadius: 99,
                    width: `${Math.round(challengeProgress * 100)}%`,
                    background: challengeProgress < 0.8 ? 'var(--aurora-emerald)' : challengeProgress < 1 ? 'var(--aurora-amber)' : 'var(--aurora-rose)',
                    transition: 'width 0.4s',
                  }}
                />
              </div>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '6px 0 0' }}>
                {formatAmount(totalExpenses)} / {formatAmount(monthChallengeTarget)} ({Math.round(challengeProgress * 100)}%)
              </p>
            </>
          )}
        </GlassCard>
      )}

      <ForecastCard
        progressPct={forecastProgressPct}
        monthLabel={t.dashboard.ofMonth}
        predictedBalanceLabel={t.dashboard.predictedBalance}
        predictedBalanceText={predictedBalanceText}
        predictedBalanceColor={predictedBalanceColor}
        paceText={paceText}
        lowest={lowestAhead && lowestAhead.lowestDay > dayOfMonth ? {
          label: t.dashboard.lowestBalance.replace('{day}', `${lowestAhead.lowestDay}.`),
          text: `${lowestAhead.lowest < 0 ? '−' : ''}${formatAmount(Math.abs(lowestAhead.lowest))}`,
          negative: lowestAhead.lowest < 0,
        } : undefined}
      />

      {(user?.savings_enabled && savingsGoals.length > 0) && (
        <GlassCard radius={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 }}>{t.savings.dashboardTitle}</p>
            <button
              onClick={() => onNavigate('savings')}
              style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', cursor: 'pointer', background: 'transparent', border: 'none' }}
            >
              {t.savings.viewAll} →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {savingsGoals.slice(0, 3).map(goal => {
              const pct = goal.targetAmount > 0 ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100) : 0
              const pctFixed = pct.toFixed(1)
              const pctLabel = pct === 0 ? '0%' : pctFixed === '0.0' ? '< 0.1%' : pctFixed + '%'
              return (
                <div key={goal.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(() => { const Icon = SAVINGS_ICON_MAP[goal.icon ?? ''] ?? Target; return <Icon size={13} color={goal.color ?? 'var(--aurora-violet)'} strokeWidth={1.8} style={{ flexShrink: 0 }} /> })()}
                      {goal.name}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: "'Outfit', sans-serif", color: 'var(--aurora-faint)', flexShrink: 0, marginLeft: 8 }}>{pctLabel}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: goal.color ?? 'var(--aurora-violet)', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

    </>
  )

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
    <div style={{ padding: `20px calc(20px + var(--page-inset, 0px))` }} className="flex flex-col gap-4 lg:gap-0 pb-4 w-full">

      <FirstRunChecklist
        onNavigate={onNavigate}
        onOpenTemplate={budgetTemplateOffer?.onOpen}
        onSetTrackingStart={() => setShowTrackingModal(true)}
      />

      {/* Streak detail modal */}
      {streakModalOpen && (
        <StreakModal
          currentStreak={user?.currentStreak ?? 0}
          longestStreak={user?.longestStreak ?? 0}
          onClose={() => setStreakModalOpen(false)}
        />
      )}

      {/* Tracking date modal */}
      {showTrackingModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowTrackingModal(false) }}
        >
          <div ref={trackingModalPanelRef} {...trackingModalDialogProps} style={{ outline: 'none', background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>{t.dashboard.trackingFromTitle}</h3>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.dashboard.trackingFromNote}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-lo)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.onboarding.trackingLabel}</label>
              <input
                type="date"
                value={trackingDate}
                onChange={e => setTrackingDate(e.target.value)}
                style={{
                  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                  borderRadius: 10, padding: '12px 14px', fontSize: 14,
                  color: 'var(--aurora-hi)', width: '100%', outline: 'none',
                  fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box', colorScheme: 'var(--aurora-color-scheme)',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowTrackingModal(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                  color: 'var(--aurora-lo)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
                }}
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSaveTrackingDate}
                disabled={trackingSaving || !trackingDate}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
                  color: 'white', fontSize: 14, fontWeight: 600, border: 'none',
                  cursor: trackingSaving ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif",
                  opacity: (trackingSaving || !trackingDate) ? 0.6 : 1,
                }}
              >
                {trackingSaving ? t.common.saving : t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MOBILE LAYOUT
      ════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 lg:hidden" style={{ paddingBottom: 'var(--page-pad-bottom)' }}>
        <div>{greetingRow}</div>
        {heroSection}
        {subscriptionHints}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pieChartCard}
          {heatmapCard}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rightPanelCards}
        </div>
      </div>

      {/* ════════════════════════════════════════
          DESKTOP LAYOUT
      ════════════════════════════════════════ */}
      <div className="hidden lg:grid gap-6 items-start w-full" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px', marginTop: 8 }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, overflowX: 'hidden' }}>
          {greetingDesktop}
          {heroSection}
          {subscriptionHints}
          <div className="grid grid-cols-2 items-stretch" style={{ gap: 16 }}>
            {heatmapCard}
            {pieChartCard}
          </div>
        </div>

        {/* RIGHT panel */}
        <div
          style={{
            background: 'var(--aurora-glass)',
            border: '1px solid var(--aurora-gline)',
            borderRadius: 20,
            padding: '16px 12px',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignSelf: 'flex-start',
          }}
        >
          {rightPanelCards}
        </div>

      </div>

    </div>
    </div>
  )
}

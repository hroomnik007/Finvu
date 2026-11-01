import { useState, useMemo, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { EmptyStateAction } from '../components/EmptyStateAction'
import {
  Pencil, Trash2, Plus, Lock, Calendar, List as ListIcon, CheckCircle2, Tag, Repeat,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useSaveFeedback } from '../hooks/useSaveFeedback'
import { CompactModal } from '../components/CompactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CsvImportModal } from '../components/CsvImportModal'
import { GlassCard } from '../components/GlassCard'
import { ListSkeleton, QueryError } from '../components/QueryState'
import { HeroCard } from '../components/HeroCard'
import { useFixedExpenses, isEndedInMonth } from '../hooks/useFixedExpenses'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useCategories } from '../hooks/useCategories'
import { useFormatters } from '../hooks/useFormatters'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation } from '../i18n'
import type { FixedExpense, Category } from '../types'
import { DenseCard, DenseRow } from '../components/DenseList'
import { useOffline } from '../hooks/useOfflineQueue'
import { PendingBadge } from '../components/OfflineStatus'
import { rowActions } from '../utils/queuedRows'
import { showToast as notify } from '../lib/toastStore'
import { SwipeableRow } from '../components/SwipeableRow'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import React from 'react'
import AmountInput from '../components/AmountInput'
import { decimalSeparator, formatAmountInput, parseAmountInput } from '../utils/amountInput'
import { ValidFromHint } from '../components/ValidFromHint'
import { todayISO } from '../utils/format'
import { useCategorySuggestion } from '../hooks/useCategorySuggestion'
import { SuggestedCategoryHint } from '../components/SuggestedCategoryHint'

const FALLBACK_COLOR = '#6b7280'

function catBg(color: string) {
  return color + '26'
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 14, fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
  border: active ? '1px solid transparent' : '1px solid var(--aurora-gline)',
  background: active ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'var(--aurora-glass)',
  color: active ? '#fff' : 'var(--aurora-lo)',
  fontFamily: "'Manrope', sans-serif", transition: 'all 0.15s', whiteSpace: 'nowrap',
  flexShrink: 0,
})

function CategoryCircle({ icon: Icon, label, selected, accent, onClick }: {
  icon: LucideIcon; label: string; selected: boolean; accent: string; onClick: () => void
}) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 60 }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? accent : 'var(--aurora-glass)',
        border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
      }}>
        <Icon size={18} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
      </div>
      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: selected ? 'var(--aurora-hi)' : 'var(--aurora-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60 }}>{label}</span>
    </button>
  )
}

interface FixedExpensesPageProps {
  month: number
  year: number
}

export function FixedExpensesPage({ month, year }: FixedExpensesPageProps) {
  const { fixedExpenses: allFixed, isLoading: listLoading, isError: listError, refetch: listRetry, addFixedExpense, updateFixedExpense, deleteFixedExpense, endFixedExpense } = useFixedExpenses(undefined, undefined, 'personal', true)
  const listFailed = listError && allFixed.length === 0
  const nowYM = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }, [])
  // Running items drive the totals and lists; ended ones sit in their own section
  const fixedExpenses = useMemo(() => allFixed.filter(e => !isEndedInMonth(e.endedOn, nowYM)), [allFixed, nowYM])
  const endedExpenses = useMemo(() => allFixed.filter(e => isEndedInMonth(e.endedOn, nowYM)), [allFixed, nowYM])
  const { variableExpenses } = useVariableExpenses(month, year)
  const { categories } = useCategories()
  const { formatAmount, formatAmountParts } = useFormatters()
  const { t, locale } = useTranslation()
  const offline = useOffline()
  const feedback = useSaveFeedback()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const expenseCategories = useMemo(
    () => categories.filter(c => c.type === 'expense'),
    [categories]
  )

  const getCat = (id?: string | null): Category | null =>
    expenseCategories.find(c => c.id === id) ?? null

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FixedExpense | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'calendar'>('list')
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null)

  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [categoryId, setCategoryId] = useState<string>('')
  const suggestion = useCategorySuggestion({
    text: label,
    active: sheetOpen && !editing,
    currentId: categoryId,
    validIds: expenseCategories.map(c => c.id ?? ''),
    select: setCategoryId,
    defaultId: expenseCategories[0]?.id,
  })
  const [note, setNote] = useState('')
  // Editing an existing item: a changed amount is a price change from `priceFrom`
  // (YYYY-MM) unless it is ticked as a correction of a typo
  const [priceFrom, setPriceFrom] = useState(nowYM)
  const [isCorrection, setIsCorrection] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [endMonth, setEndMonth] = useState(nowYM)

  const total = useMemo(() => fixedExpenses.reduce((s, e) => s + e.amount, 0), [fixedExpenses])
  const filteredTotal = useMemo(() =>
    activeCat === null ? total : fixedExpenses.filter(e => (e.categoryId ?? '') === activeCat).reduce((s, e) => s + e.amount, 0)
  , [fixedExpenses, activeCat, total])
  const variableTotal = useMemo(() => variableExpenses.reduce((s, e) => s + e.amount, 0), [variableExpenses])
  const animatedFilteredTotal = useCountUp(filteredTotal, 800)

  const filtered = useMemo(
    () => activeCat === null
      ? fixedExpenses
      : fixedExpenses.filter(e => (e.categoryId ?? '') === activeCat),
    [fixedExpenses, activeCat]
  )

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of fixedExpenses) {
      const key = e.categoryId ?? ''
      map.set(key, (map.get(key) ?? 0) + e.amount)
    }
    return Array.from(map.entries())
      .filter(([, amt]) => amt > 0)
      .map(([id, amount]) => ({ id, amount }))
  }, [fixedExpenses])

  const usedCategoryIds = useMemo(
    () => [...new Set(fixedExpenses.map(e => e.categoryId ?? ''))],
    [fixedExpenses]
  )

  const daysInCurrentMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month])
  const calendarToday = (() => {
    const n = new Date()
    return (n.getFullYear() === year && n.getMonth() + 1 === month) ? n.getDate() : -1
  })()

  // Monday-first weekday offset for the compact mobile month grid
  const monthStartWeekday = useMemo(() => (new Date(year, month - 1, 1).getDay() + 6) % 7, [year, month])
  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = Array(monthStartWeekday).fill(null)
    for (let d = 1; d <= daysInCurrentMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [monthStartWeekday, daysInCurrentMonth])

  function countdownBadge(daysUntil: number) {
    if (daysUntil === 0) return { text: t.expenses.fixed.countdown.today, color: 'var(--aurora-violet-text)', bg: 'rgba(139,92,246,0.15)' }
    const text = t.expenses.fixed.countdown.days.replace('{n}', String(daysUntil))
    if (daysUntil <= 3) return { text, color: 'var(--aurora-rose)', bg: 'rgba(251,113,133,0.15)' }
    if (daysUntil <= 7) return { text, color: 'var(--aurora-amber)', bg: 'rgba(251,191,36,0.15)' }
    return { text, color: 'var(--aurora-emerald)', bg: 'rgba(52,211,153,0.15)' }
  }

  function openAdd() {
    setEditing(null)
    setLabel(''); setAmount(''); setDayOfMonth('1')
    setCategoryId(expenseCategories[0]?.id ?? '')
    setNote('')
    setSheetOpen(true)
  }

  function openEdit(e: FixedExpense) {
    if (!rowActions(e, offline).canEdit) { if (offline) notify(t.offline.editOffline); return }
    setEditing(e); setLabel(e.label); setAmount(formatAmountInput(e.amount, decimalSeparator(locale)))
    setDayOfMonth(String(e.dayOfMonth)); setCategoryId(e.categoryId ?? ''); setNote(e.note)
    setPriceFrom(nowYM); setIsCorrection(false); setEndOpen(false); setEndMonth(nowYM)
    setSheetOpen(true)
  }

  function closeSheet() { setSheetOpen(false); setEditing(null) }

  // Clear selected day when the visible month changes — adjust state during render
  const [prevMonthKey, setPrevMonthKey] = useState(`${month}-${year}`)
  if (prevMonthKey !== `${month}-${year}`) {
    setPrevMonthKey(`${month}-${year}`)
    setSelectedCalendarDay(null)
  }

  async function handleSave() {
    const amt = (parseAmountInput(amount) ?? NaN)
    const day = parseInt(dayOfMonth)
    if (!label.trim() || isNaN(amt) || amt <= 0 || isNaN(day) || day < 1 || day > 28) return
    const catId = categoryId || null
    try {
      if (editing?.id != null) {
        await updateFixedExpense(editing.id, { label: label.trim(), amount: amt, dayOfMonth: day, categoryId: catId, note }, isCorrection ? undefined : priceFrom)
      } else {
        // No undo: deleting a fixed expense removes its whole series by name.
        await addFixedExpense({ label: label.trim(), amount: amt, dayOfMonth: day, categoryId: catId, note })
      }
      closeSheet()
      feedback.saved()
    } catch {
      feedback.failed()
    }
  }

  async function handleDelete(id: string) {
    await deleteFixedExpense(id)
    setDeleteId(null)
  }


  const MONTHS_SK = t.monthsShort

  const yearlyContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--aurora-hi)', letterSpacing: '-0.5px' }}>{formatAmount(total * 12)}</div>
      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginBottom: 8 }}>{formatAmount(total)} × 12 {t.expenses.fixed.monthly.toLowerCase()}</div>
      {categoryTotals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {categoryTotals.map(({ id, amount: catAmt }) => {
            const cat = getCat(id)
            const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
            const name = cat?.name ?? '—'
            return (
              <div key={id || '__none__'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                  <Icon size={13} color={cat?.color ?? FALLBACK_COLOR} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'var(--aurora-lo)' }}>{formatAmount(catAmt)}<span style={{ fontSize: 12, color: 'var(--aurora-faint)' }}>{t.common.perMonthShort}</span></span>
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{formatAmount(catAmt * 12)}{t.common.perYearShort}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const vsContent = (total > 0 || variableTotal > 0) ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 100, height: 100, flexShrink: 0, minHeight: 100 }}>
        {mounted && (
          <ResponsiveContainer width={100} height={100}>
            <PieChart>
              <Pie
                data={[
                  { name: t.nav.fixed, value: total > 0 ? total : 0.001 },
                  { name: t.nav.variable, value: variableTotal > 0 ? variableTotal : 0.001 },
                ]}
                cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}
              >
                <Cell fill="var(--aurora-amber)" />
                <Cell fill="var(--aurora-violet)" />
              </Pie>
              <Tooltip
                formatter={(v: number) => [formatAmount(v)]}
                contentStyle={{ background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 8, fontSize: 12, fontFamily: "'Manrope', sans-serif", color: 'var(--aurora-hi)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--aurora-amber)', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{t.nav.fixed}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(total)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--aurora-violet)', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{t.nav.variable}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(variableTotal)}</div>
          </div>
        </div>
        {(total + variableTotal) > 0 && (
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-amber)', fontWeight: 700, marginTop: 8 }}>
            {t.nav.fixed} {Math.round((total / (total + variableTotal)) * 100)}%
          </div>
        )}
      </div>
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} filterType="expense" />

      {/* FAB — mobile only */}
      {!sheetOpen && (
        <button
          onClick={openAdd}
          className="lg:hidden flex items-center justify-center"
          aria-label={t.common.addNew}
          title={t.common.addNew}
          style={{ position: 'fixed', right: 'var(--fab-right)', bottom: 'var(--fab-bottom)', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', color: 'white', boxShadow: '0 10px 30px rgba(139,92,246,.5)', zIndex: 40 }}
        >
          <Plus size={26} />
        </button>
      )}

      {/* Content row */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Main scroll area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 20, paddingLeft: 20, paddingRight: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hero wallet card */}
          <HeroCard variant="fixed">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
              {t.expenses.fixed.title} · {t.expenses.fixed.recurringMonthly}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <span style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-amber))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                {formatAmountParts(animatedFilteredTotal).main}
              </span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {formatAmountParts(animatedFilteredTotal).rest}{t.expenses.perMonthSuffix}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.expenses.fixed.yearlyLabel}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(filteredTotal * 12)}</div>
              </div>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.expenses.fixed.installmentsLabel}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{filtered.length}</div>
              </div>
            </div>
          </HeroCard>

          {/* View toggle — mobile only (desktop always shows calendar + list stacked) */}
          <div className="lg:hidden">
            <div style={{ display: 'flex', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: 4, gap: 2 }}>
              {(['list', 'calendar'] as const).map(v => {
                const isActive = mobileView === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMobileView(v)}
                    style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0',
                      borderRadius: 12, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: isActive ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                      color: isActive ? '#fff' : 'var(--aurora-lo)',
                      fontFamily: "'Manrope', sans-serif",
                    }}
                  >
                    {v === 'list' ? <ListIcon size={14} /> : <Calendar size={14} />}
                    {v === 'list' ? t.expenses.fixed.viewList : t.expenses.fixed.viewCalendar}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Compact month-grid calendar — mobile only */}
          <div className={mobileView === 'calendar' ? 'lg:hidden' : 'hidden'}>
            <GlassCard radius={18}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--aurora-hi)', marginBottom: 14 }}>{t.expenses.fixed.monthCalendar}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                {t.daysShort.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-faint)' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {calendarCells.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} />
                  const dayFixed = fixedExpenses.filter(f => f.dayOfMonth === day)
                  const hasPayment = dayFixed.length > 0
                  const isToday = day === calendarToday
                  const isPast = calendarToday > 0 && day < calendarToday
                  const isSelected = selectedCalendarDay === day
                  const daysUntil = ((day - (calendarToday > 0 ? calendarToday : new Date().getDate()) + 31) % 31)
                  const dotColor = hasPayment ? countdownBadge(daysUntil).color : 'transparent'
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => hasPayment && setSelectedCalendarDay(isSelected ? null : day)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 10,
                        background: isSelected ? 'rgba(139,92,246,0.15)' : 'var(--aurora-glass)',
                        border: isToday ? '1.5px solid var(--aurora-violet)' : isSelected ? '1px solid rgba(139,92,246,0.4)' : '1px solid var(--aurora-gline)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                        fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                        color: isPast ? 'var(--aurora-faint)' : isToday ? 'var(--aurora-violet-text)' : 'var(--aurora-lo)',
                        opacity: isPast ? 0.6 : 1,
                        cursor: hasPayment ? 'pointer' : 'default',
                        padding: 0,
                      }}
                    >
                      {day}
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />
                    </button>
                  )
                })}
              </div>
            </GlassCard>

            {/* Inline expansion — payments due on the selected day */}
            {selectedCalendarDay !== null && (() => {
              const dayPayments = fixedExpenses.filter(f => f.dayOfMonth === selectedCalendarDay)
              return (
                <GlassCard radius={16} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dayPayments.length === 0 ? (
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.fixed.noPaymentsThisDay}</p>
                  ) : dayPayments.map(e => {
                    const cat = getCat(e.categoryId)
                    const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
                    const color = cat?.color ?? FALLBACK_COLOR
                    return (
                      <div key={e.id ?? e.label} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => openEdit(e)}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: catBg(color), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={15} color={color} strokeWidth={1.8} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</div>
                          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{cat?.name ?? '—'}</div>
                        </div>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--aurora-amber)', flexShrink: 0 }}>{formatAmount(e.amount)}</span>
                      </div>
                    )
                  })}
                </GlassCard>
              )
            })()}
          </div>

          {/* Calendar strip — desktop only */}
          <div className="hidden lg:block">
          <GlassCard radius={18}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--aurora-lo)', marginBottom: 14 }}>{t.expenses.fixed.monthCalendar}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(31, 1fr)', gap: 2, marginBottom: 8 }}>
              {Array.from({ length: daysInCurrentMonth }, (_, i) => {
                const day = i + 1
                const dayFixed = fixedExpenses.filter(f => f.dayOfMonth === day)
                const sum = dayFixed.reduce((s, f) => s + f.amount, 0)
                const isToday = day === calendarToday
                const isPast = calendarToday > 0 && day < calendarToday
                const hasPayment = dayFixed.length > 0
                return (
                  <div
                    key={day}
                    title={hasPayment ? dayFixed.map(f => `${f.label} ${formatAmount(f.amount)}`).join(', ') : t.expenses.fixed.noExpenses}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 6,
                      background: hasPayment
                        ? (sum >= 100 ? 'rgba(251,113,133,0.6)' : sum >= 20 ? 'rgba(251,191,36,0.75)' : 'rgba(139,92,246,0.5)')
                        : 'var(--aurora-glass)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                      color: hasPayment ? (sum >= 20 && sum < 100 ? '#1A1535' : 'var(--heat-ink)') : isToday ? 'var(--aurora-violet-text)' : 'var(--aurora-faint)',
                      border: isToday ? '1.5px solid var(--aurora-violet)' : '1px solid var(--aurora-gline)',
                      filter: isPast ? 'saturate(0.5)' : undefined,
                      cursor: hasPayment ? 'pointer' : 'default',
                      transition: 'transform 0.12s',
                    }}
                    onMouseEnter={e => { if (hasPayment) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.18)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 6, flexWrap: 'wrap' as const }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(139,92,246,0.5)', display: 'inline-block' }} />{t.dashboard.heatmapSmall}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(251,191,36,0.75)', display: 'inline-block' }} />{t.dashboard.heatmapMedium}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(251,113,133,0.6)', display: 'inline-block' }} />{t.dashboard.heatmapLarge.replace('{amount}', formatAmount(100))}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: 'transparent', border: '1.5px solid var(--aurora-violet)', display: 'inline-block' }} />{t.dashboard.heatmapToday}</span>
            </div>
          </GlassCard>
          </div>

          {/* Category filter pills */}
          {usedCategoryIds.filter(id => id !== '').length >= 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}>
                  <button type="button" onClick={() => setActiveCat(null)} style={pillStyle(activeCat === null)}>
                    {t.expenses.fixed.allCategories}
                  </button>
                  {usedCategoryIds.filter(id => id !== '').map(catId => {
                    const cat = getCat(catId)
                    const isActive = activeCat === catId
                    const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
                    return (
                      <button key={catId} type="button" onClick={() => setActiveCat(isActive ? null : catId)} style={pillStyle(isActive)}>
                        <Icon size={14} color="currentColor" strokeWidth={1.8} />
                        <span>{cat?.name ?? '—'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Mobile: vs variable card */}
          <div className="lg:hidden">
            {vsContent && (
              <div>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{t.expenses.fixed.vsVariable}</h3>
                <GlassCard radius={18}>
                  {vsContent}
                </GlassCard>
              </div>
            )}
          </div>

          {/* Expense list — upcoming/past split (mobile: hidden while calendar view is active) */}
          <div className={mobileView === 'list' ? undefined : 'hidden lg:block'}>
          {listLoading ? <ListSkeleton /> : listFailed ? <QueryError onRetry={listRetry} /> : fixedExpenses.length === 0 ? (
            <GlassCard radius={18}>
              <div className="empty-state">
                <Lock size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.fixed.emptyTitle}</p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.fixed.emptySubtitle}</p>
                <EmptyStateAction label={t.firstRun.emptyFixed} onClick={openAdd} />
              </div>
            </GlassCard>
          ) : filtered.length === 0 ? (
            <GlassCard radius={18} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.fixed.filteredEmpty}</p>
            </GlassCard>
          ) : (() => {
            const upcomingList = filtered.filter(e => calendarToday === -1 || e.dayOfMonth >= calendarToday).sort((a, b) => a.dayOfMonth - b.dayOfMonth)
            const pastList = calendarToday === -1 ? [] : filtered.filter(e => e.dayOfMonth < calendarToday).sort((a, b) => b.dayOfMonth - a.dayOfMonth)

            const renderCard = (expense: typeof filtered[0], isPast = false) => {
              const cat = getCat(expense.categoryId)
              const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag
              const color = cat?.color ?? FALLBACK_COLOR
              const daysUntil = ((expense.dayOfMonth - (calendarToday > 0 ? calendarToday : new Date().getDate()) + 31) % 31)
              const badge = countdownBadge(daysUntil)
              const monthAbbr = MONTHS_SK[month - 1] ?? ''
              return (
                <SwipeableRow key={expense.id} radius={0} disabled={!rowActions(expense, offline).canDelete} onDelete={() => setDeleteId(expense.id!)} isOpen={openSwipeId === expense.id} onOpen={() => setOpenSwipeId(expense.id!)}>
                  <DenseRow onClick={() => openEdit(expense)} className="expense-row" style={{ opacity: isPast ? 0.65 : 1 }}>
                    {/* Date tile */}
                    <div style={{
                      width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                      background: isPast ? 'var(--aurora-glass)' : daysUntil === 0 ? 'rgba(139,92,246,0.14)' : daysUntil <= 3 ? 'rgba(251,113,133,0.12)' : 'var(--aurora-glass)',
                      border: `1px solid ${isPast ? 'var(--aurora-gline)' : daysUntil === 0 ? 'rgba(139,92,246,0.28)' : daysUntil <= 3 ? 'rgba(251,113,133,0.25)' : 'var(--aurora-gline)'}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                    }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: isPast ? 'var(--aurora-faint)' : daysUntil <= 3 ? badge.color : 'var(--aurora-hi)', lineHeight: 1 }}>{expense.dayOfMonth}</span>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{monthAbbr}</span>
                    </div>
                    {/* Category icon */}
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: catBg(color), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={15} color={color} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500, color: isPast ? 'var(--aurora-lo)' : 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.label}</div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>{cat?.name ?? '—'}</div>
                      <PendingBadge state={expense.pending} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color: isPast ? 'var(--aurora-faint)' : 'var(--aurora-rose)' }}>{formatAmount(expense.amount)}</span>
                      {!isPast && <span style={{ fontSize: 12, fontWeight: 600, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 20 }}>{badge.text}</span>}
                      {isPast && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--aurora-emerald)', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', padding: '2px 8px', borderRadius: 20 }}>
                          <CheckCircle2 size={11} /> {t.expenses.paid}
                        </span>
                      )}
                    </div>
                    <div className="expense-actions hidden lg:flex" style={{ alignItems: 'center', gap: 2, flexShrink: 0 }} onClick={ev => ev.stopPropagation()}>
                      <button type="button" className="hit-44" onClick={() => openEdit(expense)} disabled={!rowActions(expense, offline).canEdit} aria-label={t.common.edit} title={t.common.edit} style={{ width: 30, height: 30, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={13} /></button>
                      <button type="button" className="hit-44" onClick={() => setDeleteId(expense.id!)} disabled={!rowActions(expense, offline).canDelete} aria-label={t.common.delete} title={t.common.delete} style={{ width: 30, height: 30, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                    </div>
                  </DenseRow>
                </SwipeableRow>
              )
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 'var(--page-pad-bottom)' }} onClick={() => setOpenSwipeId(null)}>
                {upcomingList.length > 0 && (
                  <>
                    {calendarToday > 0 && (
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', marginBottom: 2, marginTop: 4 }}>
                        {t.expenses.fixed.upcoming}
                      </div>
                    )}
                    <DenseCard>{upcomingList.map(e => renderCard(e, false))}</DenseCard>
                  </>
                )}
                {pastList.length > 0 && (
                  <>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', marginBottom: 2, marginTop: 8 }}>
                      {t.expenses.paidThisMonth}
                    </div>
                    <DenseCard>{pastList.map(e => renderCard(e, true))}</DenseCard>
                  </>
                )}
              </div>
            )
          })()}
          </div>

          {endedExpenses.length > 0 && (
            <details style={{ paddingBottom: 'var(--page-pad-bottom)' }}>
              <summary style={{ cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, color: 'var(--aurora-faint)' }}>
                {t.expenses.fixed.endedSection.replace('{n}', String(endedExpenses.length))}
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {endedExpenses.map(e => (
                  <GlassCard key={e.id} radius={14} onClick={() => openEdit(e)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: 0.75 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13.5, fontWeight: 500, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>
                        {t.expenses.fixed.endedBadge.replace('{month}', e.endedOn ? `${e.endedOn.slice(5, 7)}/${e.endedOn.slice(0, 4)}` : '')}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--aurora-faint)', flexShrink: 0 }}>{formatAmount(e.amount)}</span>
                  </GlassCard>
                ))}
              </div>
            </details>
          )}

        </div>

        {/* Right panel — desktop only */}
        <div className="hidden lg:flex" style={{ width: 280, borderLeft: '1px solid var(--aurora-gline)', overflowY: 'auto', padding: 16, flexDirection: 'column', gap: 16, background: 'var(--aurora-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <GlassCard radius={16}>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{t.expenses.fixed.yearly}</p>
            {yearlyContent}
          </GlassCard>
          {vsContent && (
            <GlassCard radius={16}>
              <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: '0 0 12px' }}>{t.expenses.fixed.vsVariable}</p>
              {vsContent}
            </GlassCard>
          )}
        </div>

      </div>

      {/* Edit/Add sheet */}
      <CompactModal
        open={sheetOpen}
        onClose={closeSheet}
        icon={Lock} iconColor="#FBBF24" iconBg="rgba(251,191,36,.16)"
        title={editing ? t.expenses.fixed.editTitle : t.expenses.fixed.newTitle}
        accent="#FBBF24" accent2="#f59e0b"
        onSubmit={handleSave}
        autoFocusAmount={!editing}
        onDelete={editing?.id ? () => { const id = editing.id!; closeSheet(); setDeleteId(id) } : undefined}
        submitDisabled={!label.trim() || !amount}
        onImportCsv={editing ? undefined : () => { closeSheet(); setTimeout(() => setCsvOpen(true), 150) }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }}>
          <AmountInput
            placeholder="0"
            value={amount}
            onValueChange={setAmount}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 26, width: '100%', minWidth: 0 }}
          />
          <span style={{ fontSize: 15, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", flexShrink: 0 }}>€</span>
        </div>

        <input
          type="text"
          placeholder={t.expenses.fixed.namePlaceholder}
          value={label}
          onChange={e => setLabel(e.target.value)}
          style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
        />

        {expenseCategories.length > 0 && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 4px' }}>
            {expenseCategories.map(c => (
              <CategoryCircle
                key={c.id}
                icon={CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag}
                label={c.name}
                selected={categoryId === c.id}
                accent={c.color}
                onClick={() => { suggestion.pickedManually(); setCategoryId(prev => prev === c.id ? '' : (c.id ?? '')) }}
              />
            ))}
          </div>
        )}
        <SuggestedCategoryHint name={expenseCategories.find(c => c.id === suggestion.suggestedId)?.name} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: '6px 10px' }}>
            <button
              type="button"
              className="hit-44"
              aria-label={t.common.dayDecrease}
              onClick={() => setDayOfMonth(d => String(Math.max(1, parseInt(d || '1') - 1)))}
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--aurora-gline)', border: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.dueDay}</span>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)', minWidth: 14, textAlign: 'center' }}>{dayOfMonth}</span>
            <button
              type="button"
              className="hit-44"
              aria-label={t.common.dayIncrease}
              onClick={() => setDayOfMonth(d => String(Math.min(28, parseInt(d || '1') + 1)))}
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--aurora-gline)', border: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >+</button>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#FBBF24,#f59e0b)', border: '1px solid transparent', borderRadius: 12, padding: '8px 11px', fontSize: 12, color: '#fff', fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>
            <Repeat size={12} /> {t.expenses.fixed.recurringMonthly}
          </div>
        </div>
        {/* A new fixed expense is dated today and counts from this month on. */}
        {!editing && <ValidFromHint date={todayISO()} />}

        <input
          type="text"
          placeholder={`${t.expenses.fixed.noteLabel} · ${t.common.optional}`}
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
        />

        {editing && (() => {
          const newAmount = (parseAmountInput(amount) ?? NaN)
          const priceChanged = Number.isFinite(newAmount) && newAmount > 0 && newAmount !== editing.amount
          const box: React.CSSProperties = { background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }
          const small: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0, lineHeight: 1.5 }
          const monthInput: React.CSSProperties = { background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 10, padding: '6px 10px', color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif", fontSize: 13 }
          const ended = isEndedInMonth(editing.endedOn, nowYM)
          return (
            <>
              {priceChanged && (
                <div style={box}>
                  {isCorrection ? (
                    <p style={small}>{t.expenses.fixed.correctionHint}</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ ...small, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.priceFrom}</span>
                        <input type="month" value={priceFrom} min={editing.history?.[editing.history.length - 1]?.from} onChange={e => e.target.value && setPriceFrom(e.target.value)} style={monthInput} />
                      </div>
                      <p style={{ ...small, marginTop: 6 }}>{t.expenses.fixed.priceFromHint.replace('{amount}', formatAmount(editing.amount))}</p>
                    </>
                  )}
                  <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isCorrection} onChange={e => setIsCorrection(e.target.checked)} />
                    {t.expenses.fixed.correctionLabel}
                  </label>
                </div>
              )}

              {(editing.history?.length ?? 0) > 1 && (
                <div style={box}>
                  <p style={{ ...small, color: 'var(--aurora-lo)', fontWeight: 600, marginBottom: 4 }}>{t.expenses.fixed.history}</p>
                  {editing.history!.map(h => (
                    <p key={h.from} style={small}>{h.from.slice(5)}/{h.from.slice(0, 4)}: <b style={{ color: 'var(--aurora-hi)' }}>{formatAmount(h.amount)}</b></p>
                  ))}
                </div>
              )}

              {ended ? (
                <div style={box}>
                  <p style={small}>{t.expenses.fixed.endedBadge.replace('{month}', editing.endedOn ? `${editing.endedOn.slice(5, 7)}/${editing.endedOn.slice(0, 4)}` : '')}</p>
                  <button type="button" onClick={async () => { await endFixedExpense(editing.id!, null); closeSheet() }} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--aurora-violet)', background: 'transparent', color: 'var(--aurora-violet-text)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 600 }}>
                    {t.expenses.fixed.restore}
                  </button>
                </div>
              ) : endOpen ? (
                <div style={box}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ ...small, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.endLastMonth}</span>
                    <input type="month" value={endMonth} onChange={e => e.target.value && setEndMonth(e.target.value)} style={monthInput} />
                  </div>
                  <p style={{ ...small, marginTop: 6 }}>{t.expenses.fixed.endHint}</p>
                  <button type="button" onClick={async () => { await endFixedExpense(editing.id!, endMonth); closeSheet() }} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FBBF24,#f59e0b)', color: '#fff', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 700 }}>
                    {t.expenses.fixed.endConfirm}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setEndOpen(true)} style={{ alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 12, background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', border: '1px solid var(--aurora-gline)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600 }}>
                  {t.expenses.fixed.endTitle}
                </button>
              )}
            </>
          )
        })()}

        {editing && (
          <button
            type="button"
            onClick={() => { closeSheet(); setDeleteId(editing.id!) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 12, background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)', border: '1px solid rgba(251,113,133,0.25)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600 }}
          >
            <Trash2 size={12} /> {t.common.delete}
          </button>
        )}
      </CompactModal>

      <ConfirmDialog
        open={deleteId !== null}
        message={t.expenses.fixed.removeSeriesMessage}
        onConfirm={async () => { if (deleteId !== null) await handleDelete(deleteId) }}
        onCancel={() => { setDeleteId(null); setOpenSwipeId(null) }}
      />

    </div>
  )
}

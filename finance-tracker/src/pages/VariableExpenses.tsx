import { useState, useMemo, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Edit2, Trash2, Plus, Receipt, X, ArrowDown, Tag } from 'lucide-react'

import { CompactModal } from '../components/CompactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { BulkBar } from '../components/BulkBar'
import { bulkSetTransactionCategory, bulkDeleteTransactions } from '../api/transactions'
import { useQueryClient } from '@tanstack/react-query'
import { DateInput } from '../components/DateInput'
import { CsvImportModal } from '../components/CsvImportModal'
import { GlassCard } from '../components/GlassCard'
import { HeroCard } from '../components/HeroCard'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useFixedExpenses } from '../hooks/useFixedExpenses'
import { useCategories } from '../hooks/useCategories'
import { useBudgetStatus } from '../hooks/useBudgetStatus'
import { useFormatters } from '../hooks/useFormatters'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation, getLocalizedDayNames, getLocalizedMonthNames } from '../i18n'
import { todayISO } from '../utils/format'
import type { VariableExpense, BudgetStatus } from '../types'
import { SwipeableRow } from '../components/SwipeableRow'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import React from 'react'

interface VariableExpensesPageProps {
  month: number
  year: number
  showToast: (msg: string) => void
}

interface VarForm {
  amount: string
  categoryId: string
  note: string
  date: string
}

const emptyForm = (): VarForm => ({ amount: '', categoryId: '', note: '', date: todayISO() })

const getBudgetBarColor = (pct: number, autoLimit = false) => {
  if (autoLimit) return '#22c55e'
  if (pct >= 100) return '#ef4444'
  if (pct >= 80) return '#FBBF24'
  return 'var(--green)'
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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 52 }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? accent : 'var(--aurora-glass)',
        border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
      }}>
        <Icon size={18} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
      </div>
      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9, fontWeight: 600, color: selected ? 'var(--aurora-hi)' : 'var(--aurora-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 52 }}>{label}</span>
    </button>
  )
}


export function VariableExpensesPage({ month, year, showToast }: VariableExpensesPageProps) {
  const { variableExpenses, addVariableExpense, updateVariableExpense, deleteVariableExpense } =
    useVariableExpenses(month, year)
  const { fixedExpenses } = useFixedExpenses(month, year)
  const { categories, addCategory } = useCategories()
  const budgetStatuses = useBudgetStatus({ categories, variableExpenses, fixedExpenses, month, year })
  const { formatAmount, formatDate } = useFormatters()
  const { t, locale } = useTranslation()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<VariableExpense | null>(null)
  const [form, setForm] = useState<VarForm>(emptyForm())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [newCatMode, setNewCatMode] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [csvOpen, setCsvOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)

  // Bulk edit: in selection mode a tap on a row toggles it instead of opening the editor
  const qc = useQueryClient()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setOpenSwipeId(null) }
  const rowClick = (e: VariableExpense) => {
    if (!selectMode) { openEdit(e); return }
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(e.id!)) next.delete(e.id!); else next.add(e.id!)
      return next
    })
  }
  const refreshAfterBulk = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['variableExpenses'] }),
    qc.invalidateQueries({ queryKey: ['summaryCards'] }),
    qc.invalidateQueries({ queryKey: ['dashboardChart'] }),
  ])
  const applyBulkCategory = async (categoryId: string) => {
    setBulkBusy(true)
    try {
      const { updated } = await bulkSetTransactionCategory([...selectedIds], categoryId)
      await refreshAfterBulk()
      setBulkCatOpen(false)
      exitSelectMode()
      showToast(t.expenses.variable.bulkCategoryDone.replace('{n}', String(updated)))
    } catch {
      showToast?.(t.expenses.variable.bulkError)
    } finally {
      setBulkBusy(false)
    }
  }
  const deleteSelected = async () => {
    setBulkBusy(true)
    try {
      const { deleted } = await bulkDeleteTransactions([...selectedIds])
      await refreshAfterBulk()
      setBulkDeleteOpen(false)
      exitSelectMode()
      showToast(t.expenses.variable.bulkDeleteDone.replace('{n}', String(deleted)))
    } catch {
      showToast?.(t.expenses.variable.bulkError)
    } finally {
      setBulkBusy(false)
    }
  }

  const categoriesMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const getCategoryById = useCallback((id: string) => categoriesMap.get(id) ?? null, [categoriesMap])
  const getBudgetForCat = (catId: string) => budgetStatuses.find(b => b.categoryId === catId)

  const selectedCatId = form.categoryId || null
  const liveBudget = selectedCatId ? getBudgetForCat(selectedCatId) : null
  const liveAmount = parseFloat(form.amount) || 0
  const liveSpent = (liveBudget?.spent ?? 0) + (editing ? 0 : liveAmount)
  const liveLimit = liveBudget?.limit
  const livePct = liveLimit ? Math.min((liveSpent / liveLimit) * 100, 100) : null
  const liveBudgetBarColor = livePct !== null ? getBudgetBarColor(livePct) : 'var(--green)'

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setNewCatMode(false)
    setNewCatName('')
    setSheetOpen(true)
  }

  const openEdit = (e: VariableExpense) => {
    setEditing(e)
    setForm({ amount: String(e.amount), categoryId: String(e.categoryId), note: e.note, date: e.date })
    setNewCatMode(false)
    setSheetOpen(true)
  }

  const handleSave = async () => {
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) return

    let catId: string

    if (newCatMode) {
      if (!newCatName.trim()) return
      catId = await addCategory({ name: newCatName, color: '#9D84D4', icon: '📦', type: 'expense' })
    } else {
      if (!form.categoryId) return
      catId = form.categoryId
      const bs = getBudgetForCat(catId)
      if (bs) {
        const newSpent = bs.spent + amount
        const newPct = (newSpent / bs.limit) * 100
        if (newPct >= 100 && bs.percentage < 100) showToast(t.expenses.variable.toastLimitExceeded.replace('{name}', bs.categoryName))
        else if (newPct >= 90 && bs.percentage < 90) showToast(t.expenses.variable.toastLimitWarning.replace('{name}', bs.categoryName))
      }
    }

    if (editing?.id) {
      await updateVariableExpense(editing.id, { amount, categoryId: catId, note: form.note, date: form.date })
    } else {
      await addVariableExpense({ amount, categoryId: catId, note: form.note, date: form.date })
    }
    setSheetOpen(false)
  }

  const monthNameRaw = getLocalizedMonthNames(locale)[month - 1] ?? ''
  const MONTH_NAME_VAR = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1)

  const filteredTotal = useMemo(() =>
    (activeCategory
      ? variableExpenses.filter(e => e.categoryId === activeCategory)
      : variableExpenses
    ).reduce((sum, e) => sum + e.amount, 0)
  , [variableExpenses, activeCategory])
  const animatedFilteredTotal = useCountUp(filteredTotal, 800)

  const categoriesWithExpenses = useMemo(
    () => categories.filter(c => variableExpenses.some(e => e.categoryId === c.id)),
    [categories, variableExpenses]
  )

  const filteredSorted = useMemo(() =>
    [...(activeCategory
      ? variableExpenses.filter(e => e.categoryId === activeCategory)
      : variableExpenses
    )]
      .sort((a, b) => b.date.localeCompare(a.date))
  , [variableExpenses, activeCategory])

  const dayGroups = useMemo(() => {
    const dayNames = getLocalizedDayNames(locale)
    const monthNames = getLocalizedMonthNames(locale)
    return filteredSorted.reduce<Array<{ date: string; dayNum: number; dayName: string; monthName: string; items: VariableExpense[]; dayTotal: number }>>((acc, e) => {
      const last = acc[acc.length - 1]
      if (last?.date === e.date) {
        last.items.push(e)
        last.dayTotal += e.amount
      } else {
        const d = new Date(e.date + 'T00:00:00')
        acc.push({ date: e.date, dayNum: d.getDate(), dayName: dayNames[d.getDay()], monthName: monthNames[d.getMonth()], items: [e], dayTotal: e.amount })
      }
      return acc
    }, [])
  }, [filteredSorted, locale])

  const rpSection = (title: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} filterType="expense" />

      {/* Content row */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Main scroll area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hero wallet card */}
          <HeroCard variant="expense">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
              {t.expenses.variable.title} · {MONTH_NAME_VAR} {year}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <span style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-rose))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                −{Math.floor(animatedFilteredTotal).toLocaleString('sk-SK')}
              </span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                ,{String(Math.round((animatedFilteredTotal % 1) * 100)).padStart(2, '0')}&nbsp;€
              </span>
            </div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', marginTop: 12 }}>
              {t.expenses.transactionsThisMonth.replace('{n}', String(filteredSorted.length))}
            </div>
          </HeroCard>

          {!selectMode && filteredSorted.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setSelectMode(true)} style={{ padding: '7px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', border: '1px solid var(--aurora-gline)' }}>
                {t.expenses.variable.selectMode}
              </button>
            </div>
          )}

          {/* Category filter pills */}
          {categoriesWithExpenses.length > 0 && (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap' }}>
                <button type="button" onClick={() => setActiveCategory(null)} style={pillStyle(activeCategory === null)}>
                  {t.expenses.variable.allCategories}
                </button>
                {categoriesWithExpenses.map(c => {
                  const Icon = CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag
                  return (
                    <button key={c.id} type="button" onClick={() => setActiveCategory(activeCategory === c.id ? null : (c.id ?? null))} style={pillStyle(activeCategory === c.id)}>
                      <Icon size={14} color="currentColor" strokeWidth={1.8} />
                      <span>{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mobile: day-grouped GlassCard rows */}
          <div className="lg:hidden" style={{ paddingBottom: 196 }} onClick={() => setOpenSwipeId(null)}>
            {filteredSorted.length === 0 ? (
              <GlassCard radius={18}>
                <div className="empty-state">
                  <Receipt size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                  <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.variable.noExpenses}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.variable.noExpensesSubtitle}</p>
                </div>
              </GlassCard>
            ) : (
              dayGroups.map(({ date, dayNum, dayName, monthName, items, dayTotal }) => {
                return (
                  <div key={date} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)' }}>{dayNum}</span>
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{dayName}, {monthName}</span>
                      </div>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{items.length} tx · -{formatAmount(dayTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {items.map(e => {
                        const cat = getCategoryById(e.categoryId)
                        const name = e.note || cat?.name || t.expenses.variable.defaultExpense
                        const subtitle = e.note ? `${cat?.name ?? '—'} · ${formatDate(e.date)}` : formatDate(e.date)
                        return (
                          <SwipeableRow key={e.id} onDelete={() => setConfirmId(e.id!)} isOpen={openSwipeId === e.id} onOpen={() => setOpenSwipeId(e.id!)}>
                            <GlassCard radius={18} onClick={() => rowClick(e)} style={{ cursor: 'pointer', outline: selectedIds.has(e.id!) ? '2px solid var(--aurora-violet)' : 'none', outlineOffset: -1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 13, background: (cat?.color ?? '#9D84D4') + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {(() => { const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag; return <Icon size={17} color={cat?.color ?? '#9D84D4'} strokeWidth={1.8} /> })()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</span>
                                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
                                </div>
                                <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-rose)', flexShrink: 0 }}>-{formatAmount(e.amount)}</span>
                              </div>
                            </GlassCard>
                          </SwipeableRow>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Desktop: day-grouped GlassCard rows */}
          <div className="hidden lg:block">
            {filteredSorted.length === 0 ? (
              <GlassCard radius={20}>
                <div className="empty-state">
                  <Receipt size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                  <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.variable.noExpenses}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.variable.noExpensesSubtitle}</p>
                </div>
              </GlassCard>
            ) : (
              dayGroups.map(({ date, dayNum, dayName, monthName, items, dayTotal }) => (
                <div key={date} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)' }}>{dayNum}</span>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{dayName}, {monthName}</span>
                    </div>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{items.length} tx · -{formatAmount(dayTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map(e => {
                      const cat = getCategoryById(e.categoryId)
                      const name = e.note || cat?.name || t.expenses.variable.defaultExpense
                      const subtitle = e.note ? `${cat?.name ?? '—'} · ${formatDate(e.date)}` : formatDate(e.date)
                      return (
                        <GlassCard key={e.id} radius={18} onClick={() => rowClick(e)} style={{ cursor: 'pointer', outline: selectedIds.has(e.id!) ? '2px solid var(--aurora-violet)' : 'none', outlineOffset: -1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 13, background: (cat?.color ?? '#9D84D4') + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {(() => { const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag; return <Icon size={17} color={cat?.color ?? '#9D84D4'} strokeWidth={1.8} /> })()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</span>
                              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={ev => { if (!selectMode) ev.stopPropagation() }}>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-rose)', marginRight: 8 }}>-{formatAmount(e.amount)}</span>
                              {!selectMode && <button onClick={() => openEdit(e)} className="btn-icon" style={{ color: 'var(--aurora-faint)' }}><Edit2 size={13} /></button>}
                              {!selectMode && <button onClick={() => setConfirmId(e.id!)} className="btn-icon" style={{ color: 'var(--aurora-faint)' }}><Trash2 size={13} /></button>}
                            </div>
                          </div>
                        </GlassCard>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right panel — desktop only */}
        <div className="hidden lg:flex" style={{ width: 280, borderLeft: '1px solid var(--aurora-gline)', overflowY: 'auto', padding: 16, flexDirection: 'column', gap: 20, background: 'var(--aurora-glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          {rpSection(t.expenses.variable.categoriesAndBudget,
            budgetStatuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--aurora-faint)', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
                <div>{t.dashboard.noLimits}</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>{t.dashboard.setInCategories}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {budgetStatuses.map((bs: BudgetStatus) => {
                  const bsCat = getCategoryById(bs.categoryId)
                  const barColor = getBudgetBarColor(bs.percentage, (bsCat?.autoLimit ?? false) && !bsCat?.limitReserve)
                  const pct = Math.min(bs.percentage, 100)
                  return (
                    <GlassCard key={bs.categoryId} radius={12} style={{ padding: '12px 14px', border: bs.isOver ? '1px solid rgba(251,113,133,0.35)' : '1px solid var(--aurora-gline)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 8, background: bs.categoryColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(() => { const Icon = CATEGORY_ICON_MAP[bs.categoryIcon ?? ''] ?? Tag; return <Icon size={13} color={bs.categoryColor} strokeWidth={1.8} /> })()}
                          </span>
                          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bs.categoryName}</span>
                        </div>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 700, color: barColor, background: barColor + '20', padding: '2px 6px', borderRadius: 20, flexShrink: 0, marginLeft: 6 }}>{Math.round(bs.percentage)}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--aurora-gline)', overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`, background: barColor }} />
                      </div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' }}>{formatAmount(bs.spent)} / {formatAmount(bs.limit)}</div>
                      {bs.isOver && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-rose)', marginTop: 2, fontWeight: 500 }}>{t.dashboard.limitExceeded}</div>}
                    </GlassCard>
                  )
                })}
              </div>
            )
          )}
        </div>

      </div>

      {/* FAB — mobile only */}
      {!sheetOpen && confirmId === null && !selectMode && (
        <button
          onClick={openAdd}
          className="lg:hidden flex items-center justify-center"
          style={{ position: 'fixed', right: 16, bottom: 'calc(104px + env(safe-area-inset-bottom, 0px))', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', color: 'white', boxShadow: '0 10px 30px rgba(139,92,246,.5)', zIndex: 40 }}
        >
          <Plus size={26} />
        </button>
      )}

      <CompactModal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        icon={ArrowDown} iconColor="#FB7185" iconBg="rgba(251,113,133,.16)"
        title={editing ? t.expenses.variable.editTitle : t.expenses.variable.addTitle}
        accent="#FB7185" accent2="#f43f5e"
        onSubmit={handleSave}
        submitDisabled={newCatMode ? !newCatName.trim() || !form.amount : !form.categoryId || !form.amount}
        onImportCsv={editing ? undefined : () => { setSheetOpen(false); setTimeout(() => setCsvOpen(true), 150) }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={form.amount}
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9,]/g, '')
              if ((raw.match(/,/g) || []).length > 1) return
              setForm(f => ({ ...f, amount: raw }))
            }}
            onKeyDown={e => {
              const allowed = ['0','1','2','3','4','5','6','7','8','9',',','Backspace','Delete','Tab','ArrowLeft','ArrowRight','Enter']
              if (!allowed.includes(e.key)) e.preventDefault()
            }}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 26, width: '100%', minWidth: 0 }}
          />
          <span style={{ fontSize: 15, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", flexShrink: 0 }}>€</span>
        </div>

        {livePct !== null && liveLimit && (
          <div style={{ borderRadius: 12, padding: '10px 12px', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif" }}>
              <span>{liveBudget?.categoryName}</span>
              <span>{formatAmount(liveSpent)} / {formatAmount(liveLimit)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${livePct}%`, background: liveBudgetBarColor }} />
            </div>
          </div>
        )}

        {!newCatMode ? (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 4px' }}>
            {categories.map(c => (
              <CategoryCircle
                key={c.id}
                icon={CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag}
                label={c.name}
                selected={form.categoryId === c.id}
                accent={c.color}
                onClick={() => setForm(f => ({ ...f, categoryId: c.id ?? '' }))}
              />
            ))}
            <CategoryCircle
              icon={Plus} label={t.expenses.variable.newCategory}
              selected={false} accent="#FB7185"
              onClick={() => setNewCatMode(true)}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={t.expenses.variable.newCategoryName}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              style={{ flex: 1, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => { setNewCatMode(false); setNewCatName('') }}
              style={{ width: 38, borderRadius: 12, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateInput compact value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
          <input
            type="text"
            placeholder={t.expenses.variable.notePlaceholder}
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ flex: 1, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: '8px 12px', color: 'var(--aurora-hi)', fontSize: 11.5, fontFamily: "'Manrope', sans-serif", outline: 'none', minWidth: 100 }}
          />
        </div>
      </CompactModal>

      {selectMode && (
        <BulkBar
          count={selectedIds.size}
          total={filteredSorted.length}
          hint={t.expenses.variable.selectHint}
          countLabel={t.expenses.categories.selectedCount}
          selectAllLabel={t.common.selectAll}
          cancelLabel={t.common.cancel}
          onCancel={exitSelectMode}
          onSelectAll={() => setSelectedIds(new Set(filteredSorted.map(e => e.id!)))}
        >
          <button onClick={() => setBulkCatOpen(true)} disabled={selectedIds.size === 0} style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.size === 0 ? 0.5 : 1, fontWeight: 700, fontSize: 13, color: 'white', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', fontFamily: "'Outfit', sans-serif" }}>
            {t.expenses.variable.bulkChangeCategory}
          </button>
          <button onClick={() => setBulkDeleteOpen(true)} disabled={selectedIds.size === 0} aria-label={t.expenses.categories.bulkDelete} style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.1)', color: 'var(--aurora-rose)', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', opacity: selectedIds.size === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={15} />
          </button>
        </BulkBar>
      )}

      <CompactModal
        open={bulkCatOpen}
        onClose={() => setBulkCatOpen(false)}
        icon={Tag} iconColor="#8B5CF6" iconBg="rgba(139,92,246,.16)"
        title={t.expenses.variable.bulkCategoryTitle.replace('{n}', String(selectedIds.size))}
        accent="#8B5CF6" accent2="#EC4899"
        onSubmit={() => setBulkCatOpen(false)}
        submitDisabled
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {categories.filter(c => c.type === 'expense' && c.id).map(c => {
            const Icon = CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag
            return (
              <button key={c.id} type="button" disabled={bulkBusy} onClick={() => void applyBulkCategory(c.id!)} style={pillStyle(false)}>
                <Icon size={14} color="currentColor" strokeWidth={1.8} />
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      </CompactModal>

      <ConfirmDialog
        open={bulkDeleteOpen}
        message={t.expenses.variable.bulkDeleteConfirm.replace('{n}', String(selectedIds.size))}
        onConfirm={() => void deleteSelected()}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <ConfirmDialog
        open={confirmId !== null}
        message={t.expenses.variable.deleteConfirm}
        onConfirm={async () => { if (confirmId !== null) { await deleteVariableExpense(confirmId); setConfirmId(null) } }}
        onCancel={() => { setConfirmId(null); setOpenSwipeId(null) }}
      />
    </div>
  )
}

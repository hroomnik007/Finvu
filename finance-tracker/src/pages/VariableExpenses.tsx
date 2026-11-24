import { useState, useMemo, useCallback } from 'react'
import { EmptyStateAction } from '../components/EmptyStateAction'
import { Edit2, Trash2, Plus, Receipt, X, ArrowDown, Tag } from 'lucide-react'

import { useSaveFeedback } from '../hooks/useSaveFeedback'
import { CompactModal } from '../components/CompactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { BulkBar } from '../components/BulkBar'
import { bulkSetTransactionCategory, bulkDeleteTransactions } from '../api/transactions'
import { useQueryClient } from '@tanstack/react-query'
import { DateInput } from '../components/DateInput'
import { CsvImportModal } from '../components/CsvImportModal'
import { GlassCard } from '../components/GlassCard'
import { HeroAmountPlaceholder, ListSkeleton, QueryError } from '../components/QueryState'
import { HeroCard } from '../components/HeroCard'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useFixedExpenses } from '../hooks/useFixedExpenses'
import { useCategories } from '../hooks/useCategories'
import { BudgetOverviewCard } from '../components/BudgetOverviewCard'
import { budgetLevel, compareBudget, limitIsFixedOnly } from '../utils/budgetLevel'
import { BudgetPreview } from '../components/BudgetPreview'
import { useBudgetStatus } from '../hooks/useBudgetStatus'
import { useFormatters } from '../hooks/useFormatters'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation, getLocalizedMonthNames } from '../i18n'
import { dayHeaderParts } from '../utils/format'
import { pluralCount, pluralText } from '../utils/plural'
import { DayHeader, DenseCard, DenseRow } from '../components/DenseList'
import { defaultEntryDate } from '../utils/entryDefaults'
import { useCategoriesByUsage } from '../hooks/useCategoryUsage'
import { useCategorySuggestion } from '../hooks/useCategorySuggestion'
import { SuggestedCategoryHint } from '../components/SuggestedCategoryHint'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import type { VariableExpense, BudgetStatus } from '../types'
import { useOffline } from '../hooks/useOfflineQueue'
import { PendingBadge } from '../components/OfflineStatus'
import { rowActions } from '../utils/queuedRows'
import { showToast as notify } from '../lib/toastStore'
import { SwipeableRow } from '../components/SwipeableRow'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { CategoryCircle, CategoryPicker } from '../components/CategoryPicker'
import React from 'react'
import { AmountEntry } from '../components/AmountEntry'
import { decimalSeparator, formatAmountInput, parseAmountInput } from '../utils/amountInput'
import { useRowOwner } from '../hooks/useRowOwner'
import { MemberAvatar } from '../components/MemberAvatar'

interface VariableExpensesPageProps {
  month: number
  year: number
  showToast: (msg: string) => void
  /** Moje / Rodinné from the top bar: the family view lists every member's rows (others read-only). */
  scope?: 'personal' | 'family'
}

interface VarForm {
  amount: string
  categoryId: string
  note: string
  date: string
}

const emptyForm = (month: number, year: number): VarForm => ({ amount: '', categoryId: '', note: '', date: defaultEntryDate(month, year) })


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


// Opens the Kategórie page and highlights that category there
function openCategory(id: string) {
  try { sessionStorage.setItem('finvu_focus_category', id) } catch { /* private mode */ }
  window.location.hash = 'categories'
}
export function VariableExpensesPage({ month, year, showToast, scope = 'personal' }: VariableExpensesPageProps) {
  const { variableExpenses, isLoading: listLoading, isError: listError, refetch: listRetry, addVariableExpense, updateVariableExpense, deleteVariableExpense } =
    useVariableExpenses(month, year, scope)
  const listFailed = listError && variableExpenses.length === 0
  const { fixedExpenses } = useFixedExpenses(month, year, scope)
  const { categories, addCategory } = useCategories()
  const budgetStatuses = useBudgetStatus({ categories, variableExpenses, fixedExpenses, month, year, family: scope === 'family' })
  const { isMine, ownerOf } = useRowOwner(scope)
  const { formatAmount, formatAmountParts } = useFormatters()
  const { t, locale } = useTranslation()
  const offline = useOffline()
  const feedback = useSaveFeedback()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<VariableExpense | null>(null)
  const quickCategories = useCategoriesByUsage(categories, editing?.categoryId)
  const [form, setForm] = useState<VarForm>(() => emptyForm(month, year))
  const [newCatMode, setNewCatMode] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [csvOpen, setCsvOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const suggestion = useCategorySuggestion({
    text: form.note,
    active: sheetOpen && !editing && !newCatMode,
    currentId: form.categoryId,
    validIds: quickCategories.map(c => c.id ?? ''),
    select: id => setForm(f => ({ ...f, categoryId: id })),
  })

  // Bulk edit: in selection mode a tap on a row toggles it instead of opening the editor
  const qc = useQueryClient()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setOpenSwipeId(null) }
  const rowClick = (e: VariableExpense) => {
    // Another member's row (family view) is read-only
    if (!isMine(e.created_by)) return
    if (!selectMode) { openEdit(e); return }
    if (e.pending) return
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
    qc.invalidateQueries({ queryKey: ['monthlySeries'] }),
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
  // Another member's row carries the id of their own category: fall back to its name / icon / colour
  const catOf = (e: VariableExpense) => getCategoryById(e.categoryId)
    ?? (e.categoryName ? { name: e.categoryName, icon: e.categoryIcon ?? '', color: e.categoryColor ?? '#9D84D4' } : null)
  const getBudgetForCat = (catId: string) => budgetStatuses.find(b => b.categoryId === catId)

  const selectedCatId = form.categoryId || null
  const liveBudget = selectedCatId ? getBudgetForCat(selectedCatId) : null
  const liveAmount = parseAmountInput(form.amount) ?? 0
  const liveSpent = (liveBudget?.spent ?? 0) + (editing ? 0 : liveAmount)
  const liveLimit = liveBudget?.limit

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm(month, year))
    setNewCatMode(false)
    setNewCatName('')
    setSheetOpen(true)
  }

  const openEdit = (e: VariableExpense) => {
    if (!rowActions(e, offline, isMine(e.created_by)).canEdit) { if (offline) notify(t.offline.editOffline); return }
    setEditing(e)
    setForm({ amount: formatAmountInput(e.amount, decimalSeparator(locale)), categoryId: String(e.categoryId), note: e.note, date: e.date })
    setNewCatMode(false)
    setSheetOpen(true)
  }

  // Single delete = delayed delete with a 5 s "Späť" (lib/pendingDelete), no confirm.
  const undoableDelete = useUndoableDelete()
  const removeWithUndo = (id: string) => {
    setOpenSwipeId(null)
    undoableDelete(id, () => deleteVariableExpense(id))
  }

  const handleSave = async () => {
    const amount = (parseAmountInput(form.amount) ?? NaN)
    if (isNaN(amount) || amount <= 0) return
    if (newCatMode ? !newCatName.trim() : !form.categoryId) return

    try {
      let catId: string
      if (newCatMode) {
        catId = await addCategory({ name: newCatName, color: '#9D84D4', icon: '📦', type: 'expense' })
        // If the expense itself fails, a retry must not create the category again.
        setForm(f => ({ ...f, categoryId: catId })); setNewCatMode(false); setNewCatName('')
      } else {
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
        setSheetOpen(false)
        feedback.saved()
      } else {
        const id = await addVariableExpense({ amount, categoryId: catId, note: form.note, date: form.date })
        setSheetOpen(false)
        feedback.saved(() => deleteVariableExpense(id))
      }
    } catch {
      feedback.failed()
    }
  }

  const monthNameRaw = getLocalizedMonthNames(locale)[month - 1] ?? ''
  const MONTH_NAME_VAR = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1)

  // Category chips match by name too: in the family view another member's row
  // carries the id of their own copy of the category
  const nameKey = (n?: string | null) => (n ?? '').trim().toLowerCase()
  const inCategory = useCallback((e: VariableExpense, catId: string) =>
    e.categoryId === catId || (!!e.categoryName && nameKey(e.categoryName) === nameKey(categoriesMap.get(catId)?.name)),
  [categoriesMap])
  const filteredTotal = useMemo(() =>
    (activeCategory
      ? variableExpenses.filter(e => inCategory(e, activeCategory))
      : variableExpenses
    ).reduce((sum, e) => sum + e.amount, 0)
  , [variableExpenses, activeCategory, inCategory])
  const animatedFilteredTotal = useCountUp(filteredTotal, 800)

  const categoriesWithExpenses = useMemo(
    () => categories.filter(c => c.id && variableExpenses.some(e => inCategory(e, c.id!))),
    [categories, variableExpenses, inCategory]
  )

  const filteredSorted = useMemo(() =>
    [...(activeCategory
      ? variableExpenses.filter(e => inCategory(e, activeCategory))
      : variableExpenses
    )]
      .sort((a, b) => b.date.localeCompare(a.date))
  , [variableExpenses, activeCategory, inCategory])

  const dayGroups = useMemo(() => {
    return filteredSorted.reduce<Array<{ date: string; dayNum: number; weekday: string; full: string; items: VariableExpense[]; dayTotal: number }>>((acc, e) => {
      const last = acc[acc.length - 1]
      if (last?.date === e.date) {
        last.items.push(e)
        last.dayTotal += e.amount
      } else {
        acc.push({ date: e.date, ...dayHeaderParts(e.date, locale), items: [e], dayTotal: e.amount })
      }
      return acc
    }, [])
  }, [filteredSorted, locale])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} filterType="expense" />

      {/* Content row */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', minHeight: 0, overflowY: 'auto', paddingLeft: 'var(--page-inset, 0px)', paddingRight: 'var(--page-inset, 0px)' }}>

        {/* Main area — the row above is the single scroller, so the scrollbar sits at the screen edge */}
        <div style={{ flex: 1, minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hero wallet card */}
          <HeroCard variant="expense" compact>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', fontWeight: 600, marginBottom: 6 }}>
              {t.expenses.variable.title} · {MONTH_NAME_VAR} {year}
            </div>
            {listLoading || listFailed ? <HeroAmountPlaceholder error={listFailed} /> : (
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <span style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                // The title already says these are expenses: no minus, no alarm red
                background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-lo))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                {formatAmountParts(animatedFilteredTotal).main}
              </span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {formatAmountParts(animatedFilteredTotal).rest}
              </span>
            </div>
            )}
            {/* Number of entries: one tile sized to its content */}
            {!listLoading && !listFailed && (
              <div style={{ display: 'flex', marginTop: 14 }}>
                <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 14px' }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap' }}>{t.expenses.statTransactions}</div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', fontVariantNumeric: 'tabular-nums' }}>{filteredSorted.length}</div>
                </div>
              </div>
            )}
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
          <div className="lg:hidden" style={{ paddingBottom: 'var(--page-pad-bottom)' }} onClick={() => setOpenSwipeId(null)}>
            {listLoading ? <ListSkeleton /> : listFailed ? <QueryError onRetry={listRetry} /> : filteredSorted.length === 0 ? (
              <GlassCard radius={18}>
                <div className="empty-state">
                  <Receipt size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                  <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.variable.noExpenses}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.variable.noExpensesSubtitle}</p>
                <EmptyStateAction label={t.firstRun.emptyExpense} onClick={openAdd} />
                </div>
              </GlassCard>
            ) : (
              dayGroups.map(({ date, dayNum, weekday, full, items, dayTotal }) => (
                <div key={date} style={{ marginBottom: 16 }}>
                  <DayHeader dayNum={dayNum} weekday={weekday} full={full} summary={`${pluralCount(items.length, t.common.txCount, locale)} · −${formatAmount(dayTotal)}`} />
                  <DenseCard>
                    {items.map(e => {
                      const cat = catOf(e)
                      const owner = ownerOf(e.created_by)
                      const name = e.note || cat?.name || t.expenses.variable.defaultExpense
                      // The day header carries the date; the row keeps just the category.
                      const subtitle = e.note ? (cat?.name ?? '—') : ''
                      return (
                        <SwipeableRow key={e.id} radius={0} disabled={!rowActions(e, offline, isMine(e.created_by)).canDelete} onDelete={() => removeWithUndo(e.id!)} isOpen={openSwipeId === e.id} onOpen={() => setOpenSwipeId(e.id!)}>
                          <DenseRow onClick={() => rowClick(e)} selected={selectedIds.has(e.id!)}>
                            <div style={{ width: 38, height: 38, borderRadius: 12, background: (cat?.color ?? '#9D84D4') + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {(() => { const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag; return <Icon size={17} color={cat?.color ?? '#9D84D4'} strokeWidth={1.8} /> })()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</span>
                              {subtitle && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
                              <PendingBadge state={e.pending} />
                            </div>
                            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-expense)', flexShrink: 0 }}>−{formatAmount(e.amount)}</span>
                            {owner && <span title={owner.name} style={{ display: 'flex', flexShrink: 0 }}><MemberAvatar userId={owner.id} userName={owner.name} size={22} avatarUrl={owner.avatar_url} /></span>}
                          </DenseRow>
                        </SwipeableRow>
                      )
                    })}
                  </DenseCard>
                </div>
              ))
            )}
          </div>

          {/* Desktop: day-grouped GlassCard rows */}
          <div className="hidden lg:block">
            {listLoading ? <ListSkeleton /> : listFailed ? <QueryError onRetry={listRetry} /> : filteredSorted.length === 0 ? (
              <GlassCard radius={20}>
                <div className="empty-state">
                  <Receipt size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                  <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.variable.noExpenses}</p>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.variable.noExpensesSubtitle}</p>
                <EmptyStateAction label={t.firstRun.emptyExpense} onClick={openAdd} />
                </div>
              </GlassCard>
            ) : (
              dayGroups.map(({ date, dayNum, weekday, full, items, dayTotal }) => (
                <div key={date} style={{ marginBottom: 20 }}>
                  <DayHeader dayNum={dayNum} weekday={weekday} full={full} summary={`${pluralCount(items.length, t.common.txCount, locale)} · −${formatAmount(dayTotal)}`} />
                  <DenseCard>
                    {items.map(e => {
                      const cat = catOf(e)
                      const owner = ownerOf(e.created_by)
                      const name = e.note || cat?.name || t.expenses.variable.defaultExpense
                      const subtitle = e.note ? (cat?.name ?? '—') : ''
                      return (
                        <DenseRow className="expense-row" key={e.id} onClick={() => rowClick(e)} selected={selectedIds.has(e.id!)}>
                          <div style={{ width: 38, height: 38, borderRadius: 12, background: (cat?.color ?? '#9D84D4') + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(() => { const Icon = CATEGORY_ICON_MAP[cat?.icon ?? ''] ?? Tag; return <Icon size={17} color={cat?.color ?? '#9D84D4'} strokeWidth={1.8} /> })()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</span>
                            {subtitle && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
                              <PendingBadge state={e.pending} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={ev => { if (!selectMode) ev.stopPropagation() }}>
                            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-expense)', marginRight: 8 }}>−{formatAmount(e.amount)}</span>
                            {owner && <span title={owner.name} style={{ display: 'flex', marginRight: 6 }}><MemberAvatar userId={owner.id} userName={owner.name} size={22} avatarUrl={owner.avatar_url} /></span>}
                            <span className="expense-actions" style={{ display: 'inline-flex', gap: 4 }}>
                            {!selectMode && isMine(e.created_by) && <button onClick={() => openEdit(e)} disabled={!rowActions(e, offline, isMine(e.created_by)).canEdit} className="btn-icon" aria-label={t.common.edit} title={t.common.edit} style={{ color: 'var(--aurora-faint)' }}><Edit2 size={13} /></button>}
                            {!selectMode && isMine(e.created_by) && <button onClick={() => removeWithUndo(e.id!)} disabled={!rowActions(e, offline, isMine(e.created_by)).canDelete} className="btn-icon" aria-label={t.common.delete} title={t.common.delete} style={{ color: 'var(--aurora-faint)' }}><Trash2 size={13} /></button>}
                            </span>
                          </div>
                        </DenseRow>
                      )
                    })}
                  </DenseCard>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right panel — desktop only: the Dashboard budget card, every row opens that category */}
        {/* Natural height: the whole category list shows, the page scrolls (an inner scroller cut it off) */}
        <div className="hidden lg:block" style={{ width: 280, flexShrink: 0, margin: '20px 20px 20px 0', borderRadius: 20 }}>
          <BudgetOverviewCard
            title={t.expenses.variable.categoriesAndBudget}
            items={[...budgetStatuses].sort(compareBudget((x: BudgetStatus) => budgetLevel(x.spent, x.limit, limitIsFixedOnly(categories.find(c => c.id === x.categoryId)))))}
            categories={categories}
            onRowClick={openCategory}
            empty={(
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--aurora-faint)', fontSize: 13, fontFamily: "'Manrope', sans-serif" }}>
                <div>{t.dashboard.noLimits}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{t.dashboard.setInCategories}</div>
              </div>
            )}
          />
        </div>

      </div>

      {/* FAB — mobile only */}
      {!sheetOpen && !selectMode && (
        <button
          onClick={openAdd}
          className="lg:hidden fab-auto-hide flex items-center justify-center"
          aria-label={t.expenses.variable.addTitle}
          title={t.expenses.variable.addTitle}
          style={{ position: 'fixed', right: 'var(--fab-right)', bottom: 'var(--fab-bottom)', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', color: 'white', boxShadow: '0 10px 30px rgba(139,92,246,.5)', zIndex: 40 }}
        >
          <Plus size={26} />
        </button>
      )}

      <CompactModal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        icon={ArrowDown} iconColor="#FB7185" iconBg="rgba(251,113,133,.16)"
        title={editing ? t.expenses.variable.editTitle : t.expenses.variable.addTitle}
        submitLabel={editing ? t.common.saveChanges : t.fab.saveExpense}
        onSubmit={handleSave}
        autoFocusAmount={!editing}
        onDelete={editing?.id ? () => { const id = editing.id!; setSheetOpen(false); removeWithUndo(id) } : undefined}
        submitDisabled={newCatMode ? !newCatName.trim() || !form.amount : !form.categoryId || !form.amount}
        submitHint={!form.amount ? t.common.needAmount : newCatMode ? t.common.needName : t.common.needCategory}
        onImportCsv={editing ? undefined : () => { setSheetOpen(false); setTimeout(() => setCsvOpen(true), 150) }}
      >
        <AmountEntry value={form.amount} onValueChange={v => setForm(f => ({ ...f, amount: v }))} />

        {liveLimit != null && liveLimit > 0 && (
          <BudgetPreview name={liveBudget?.categoryName ?? ''} spent={liveSpent} limit={liveLimit} showAfter={!editing && liveAmount > 0} />
        )}

        {!newCatMode ? (
          <CategoryPicker
            categories={quickCategories} selectedId={form.categoryId}
            onPick={id => { suggestion.pickedManually(); setForm(f => ({ ...f, categoryId: id })) }}
            extra={<CategoryCircle icon={Plus} label={t.expenses.variable.newCategory} selected={false} accent="#FB7185" onClick={() => setNewCatMode(true)} />}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={t.expenses.variable.newCategoryName}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              style={{ flex: 1, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none' }}
            />
            <button className="hit-44" aria-label={t.common.cancel} title={t.common.cancel}
              type="button"
              onClick={() => { setNewCatMode(false); setNewCatName('') }}
              style={{ width: 38, borderRadius: 12, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateInput compact quick value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
          <input
            type="text"
            placeholder={t.expenses.variable.notePlaceholder}
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ flex: '1 1 140px', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: '8px 12px', color: 'var(--aurora-hi)', fontSize: 12, fontFamily: "'Manrope', sans-serif", outline: 'none', minWidth: 0 }}
          />
        </div>
        <SuggestedCategoryHint name={quickCategories.find(c => c.id === suggestion.suggestedId)?.name} />
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
        icon={Tag} iconColor="var(--aurora-violet)" iconBg="color-mix(in srgb, var(--aurora-violet) 16%, transparent)"
        title={t.expenses.variable.bulkCategoryTitle.replace('{n}', String(selectedIds.size))}
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
        message={pluralText(selectedIds.size, t.expenses.variable.bulkDeleteConfirm, locale)}
        onConfirm={() => void deleteSelected()}
        onCancel={() => setBulkDeleteOpen(false)}
      />

    </div>
  )
}

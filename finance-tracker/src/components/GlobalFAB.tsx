import { useEffect, useState } from 'react'
import { subscribeAddForm } from '../utils/addFormEvents'
import type { LucideIcon } from 'lucide-react'
import { Plus, X, ArrowUp, ArrowDown, Lock, Tag, Repeat, PiggyBank } from 'lucide-react'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { SAVINGS_ICON_MAP } from '../utils/savingsIcons'
import { CompactModal } from './CompactModal'
import { DateInput } from './DateInput'
import { useIncomes } from '../hooks/useIncomes'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useFixedExpenses } from '../hooks/useFixedExpenses'
import { useCategories } from '../hooks/useCategories'
import { useBudgetStatus } from '../hooks/useBudgetStatus'
import { useSavings } from '../hooks/useSavings'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useSaveFeedback } from '../hooks/useSaveFeedback'
import { dateForRecurringToggle, defaultEntryDate } from '../utils/entryDefaults'
import { ValidFromHint } from './ValidFromHint'
import { todayISO } from '../utils/format'
import { useCategoriesByUsage } from '../hooks/useCategoryUsage'
import { useCategorySuggestion } from '../hooks/useCategorySuggestion'
import { useModalA11y } from '../hooks/useModalA11y'
import { SuggestedCategoryHint } from './SuggestedCategoryHint'
import AmountInput from './AmountInput'
import { parseAmountInput } from '../utils/amountInput'

type ModalType = 'income' | 'variable' | 'fixed' | 'category' | 'savings' | null

const FAB_VISIBLE_PAGES = ['income', 'variable-expenses', 'fixed-expenses', 'categories']
const ALL_ACTIVE_PAGES = [...FAB_VISIBLE_PAGES, 'dashboard']

const PAGE_MODAL_MAP: Record<string, ModalType> = {
  'income': 'income',
  'variable-expenses': 'variable',
  'fixed-expenses': 'fixed',
  'categories': 'category',
}

const SAVINGS_PRESET_ICONS = Object.keys(SAVINGS_ICON_MAP).filter(icon => icon !== '🎯')

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#64748b',
]

const PRESET_ICONS = [
  '🍔', '🛒', '🚗', '🏠', '💊', '🎉', '👕', '📚',
  '✈️', '🎮', '🐾', '💇', '🏋️', '📱', '💡', '🍕',
  '☕', '🎬', '🛻', '🏥', '🎓', '🌿', '🧴', '💰',
]

const amountFieldStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 5,
  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
  borderRadius: 14, padding: '10px 14px',
}

const finputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
  borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13,
  fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box',
}

function AmountField({ value, onChange, accent }: { value: string; onChange: (v: string) => void; accent: string }) {
  return (
    <div style={amountFieldStyle}>
      <AmountInput placeholder="0"
        value={value}
        onValueChange={onChange}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 26, width: '100%', minWidth: 0 }}
      />
      <span style={{ fontSize: 15, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", flexShrink: 0 }}>€</span>
      <div style={{ width: 2, height: 20, borderRadius: 1, background: accent, flexShrink: 0 }} />
    </div>
  )
}

function pillChipStyle(active: boolean, accent: string, accent2: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: active ? `linear-gradient(135deg,${accent},${accent2})` : 'var(--aurora-glass)',
    border: active ? '1px solid transparent' : '1px solid var(--aurora-gline)',
    borderRadius: 12, padding: '8px 11px',
    fontSize: 12, color: active ? '#fff' : 'var(--aurora-hi)', fontWeight: 600,
    fontFamily: "'Manrope', sans-serif", cursor: 'pointer', flexShrink: 0,
  }
}

function CategoryCircle({ icon: Icon, label, selected, accent, accent2, onClick }: {
  icon: LucideIcon; label: string; selected: boolean; accent: string; accent2: string; onClick: () => void
}) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 52 }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? `linear-gradient(135deg,${accent},${accent2})` : 'var(--aurora-glass)',
        border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
      }}>
        <Icon size={18} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
      </div>
      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: selected ? 'var(--aurora-hi)' : 'var(--aurora-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 52 }}>{label}</span>
    </button>
  )
}

interface GlobalFABProps {
  month: number
  year: number
  showToast: (msg: string) => void
  currentPage: string
  openTrigger?: number
}

export function GlobalFAB({ month, year, showToast, currentPage, openTrigger }: GlobalFABProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const { panelRef: typeSelectorRef, titleId: typeSelectorTitleId, dialogProps: typeSelectorProps } = useModalA11y({ open: showTypeSelector, onClose: () => setShowTypeSelector(false) })
  const [isMobile] = useState(() => window.innerWidth < 1024)

  // openTrigger is an incrementing counter prop — react to it during render
  const [prevTrigger, setPrevTrigger] = useState(openTrigger)
  if (openTrigger !== prevTrigger) {
    setPrevTrigger(openTrigger)
    if (openTrigger) {
      if (currentPage === 'dashboard') {
        setShowTypeSelector(true)
      } else {
        setActiveModal(PAGE_MODAL_MAP[currentPage] ?? 'variable')
      }
    }
  }

  // Checklist / empty-state buttons ask for a specific form.
  useEffect(() => subscribeAddForm(type => { setShowTypeSelector(false); setActiveModal(type) }), [])

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { addIncome, deleteIncome } = useIncomes(month, year)
  const { addVariableExpense, deleteVariableExpense, variableExpenses } = useVariableExpenses(month, year)
  const { addFixedExpense } = useFixedExpenses()
  const { categories, addCategory } = useCategories()
  const quickCategories = useCategoriesByUsage(categories)
  const budgetStatuses = useBudgetStatus({ categories, variableExpenses })
  const { addGoal } = useSavings()
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()
  const { user } = useAuth()
  const feedback = useSaveFeedback()
  const savingsEnabled = user?.savings_enabled ?? false

  // ── Income form state ─────────────────────────────────────────────────────
  const [incAmt, setIncAmt] = useState('')
  const [incLabel, setIncLabel] = useState('')
  const [incDate, setIncDate] = useState(() => defaultEntryDate(month, year))
  const [incRecurring, setIncRecurring] = useState(false)

  // ── Variable expense form state ───────────────────────────────────────────
  const [varAmt, setVarAmt] = useState('')
  const [varCatId, setVarCatId] = useState('')
  const [varNote, setVarNote] = useState('')
  const [varDate, setVarDate] = useState(() => defaultEntryDate(month, year))
  const [varNewCatMode, setVarNewCatMode] = useState(false)
  const [varNewCatName, setVarNewCatName] = useState('')

  // ── Fixed expense form state ──────────────────────────────────────────────
  const [fixLabel, setFixLabel] = useState('')
  const [fixAmt, setFixAmt] = useState('')
  const [fixDay, setFixDay] = useState('1')
  const [fixCatId, setFixCatId] = useState('')

  // ── Category suggestions from the typed note / label ──────────────────────
  const quickIds = quickCategories.map(c => c.id ?? '')
  const varSuggestion = useCategorySuggestion({
    text: varNote, active: activeModal === 'variable' && !varNewCatMode,
    currentId: varCatId, validIds: quickIds, select: setVarCatId,
  })
  const fixSuggestion = useCategorySuggestion({
    text: fixLabel, active: activeModal === 'fixed',
    currentId: fixCatId, validIds: quickIds, select: setFixCatId,
  })
  const categoryName = (id: string | null) => (id ? quickCategories.find(c => c.id === id)?.name : undefined)

  // ── Category form state ───────────────────────────────────────────────────
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState(PRESET_COLORS[6])
  const [catIcon, setCatIcon] = useState('🛒')
  const [catBudgetLimit, setCatBudgetLimit] = useState('')

  // ── Savings goal form state ───────────────────────────────────────────────
  const [savName, setSavName] = useState('')
  const [savTarget, setSavTarget] = useState('')
  const [savIcon, setSavIcon] = useState('🎯')
  const [savDeadline, setSavDeadline] = useState('')

  // ── Open / close helpers ──────────────────────────────────────────────────
  function openModal(type: ModalType) {
    setTimeout(() => {
      if (type === 'income') {
        setIncAmt(''); setIncLabel(''); setIncDate(defaultEntryDate(month, year)); setIncRecurring(false)
      } else if (type === 'variable') {
        setVarAmt(''); setVarCatId(''); setVarNote(''); setVarDate(defaultEntryDate(month, year))
        setVarNewCatMode(false); setVarNewCatName('')
      } else if (type === 'fixed') {
        setFixLabel(''); setFixAmt(''); setFixDay('1'); setFixCatId('')
      } else if (type === 'category') {
        setCatName(''); setCatColor(PRESET_COLORS[6]); setCatIcon('🛒'); setCatBudgetLimit('')
      } else if (type === 'savings') {
        setSavName(''); setSavTarget(''); setSavIcon('🎯'); setSavDeadline('')
      }
      setActiveModal(type)
    }, 50)
  }

  function closeModal() { setActiveModal(null) }

  // ── Save handlers ─────────────────────────────────────────────────────────
  // CompactModal awaits these: while one is pending its button shows a spinner
  // and further taps are ignored. On error the modal stays open with the values.
  async function saveIncome() {
    const amt = (parseAmountInput(incAmt) ?? NaN)
    if (!incLabel.trim() || isNaN(amt) || amt <= 0) return
    try {
      const id = await addIncome({ amount: amt, label: incLabel.trim(), date: incDate, recurring: incRecurring })
      closeModal()
      // Deleting a recurring income removes its whole series (matched by name),
      // so undo is offered only for one-off incomes.
      feedback.saved(incRecurring ? undefined : () => deleteIncome(id))
    } catch {
      feedback.failed()
    }
  }

  async function saveVariable() {
    const amt = (parseAmountInput(varAmt) ?? NaN)
    if (isNaN(amt) || amt <= 0) return
    if (varNewCatMode ? !varNewCatName.trim() : !varCatId) return
    try {
      let catId: string
      if (varNewCatMode) {
        catId = await addCategory({ name: varNewCatName.trim(), color: '#64748b', icon: '📦', type: 'expense' })
        // If the expense itself fails, a retry must not create the category again.
        setVarCatId(catId); setVarNewCatMode(false); setVarNewCatName('')
      } else {
        catId = varCatId
        const bs = budgetStatuses.find(b => b.categoryId === catId)
        if (bs) {
          const newSpent = bs.spent + amt
          const newPct = (newSpent / bs.limit) * 100
          if (newPct >= 100 && bs.percentage < 100) showToast(t.expenses.categories.limitExceededToast.replace('{name}', bs.categoryName))
          else if (newPct >= 90 && bs.percentage < 90) showToast(t.expenses.categories.nearLimitToast.replace('{name}', bs.categoryName))
        }
      }
      const id = await addVariableExpense({ amount: amt, categoryId: catId, note: varNote, date: varDate })
      closeModal()
      feedback.saved(() => deleteVariableExpense(id))
    } catch {
      feedback.failed()
    }
  }

  async function saveFixed() {
    const amt = (parseAmountInput(fixAmt) ?? NaN)
    const day = parseInt(fixDay)
    if (!fixLabel.trim() || isNaN(amt) || amt <= 0 || isNaN(day) || day < 1 || day > 31) return
    try {
      await addFixedExpense({ label: fixLabel.trim(), amount: amt, dayOfMonth: day, categoryId: fixCatId || null, note: '' })
      closeModal()
      feedback.saved()
    } catch {
      feedback.failed()
    }
  }

  async function saveCategory() {
    if (!catName.trim()) return
    const limit = parseAmountInput(catBudgetLimit) ?? undefined
    try {
      await addCategory({
        name: catName.trim(),
        color: catColor,
        icon: catIcon,
        type: 'expense',
        budgetLimit: limit && limit > 0 ? limit : undefined,
      })
      closeModal()
      feedback.saved()
    } catch {
      feedback.failed()
    }
  }

  async function saveSavingsGoal() {
    const amt = (parseAmountInput(savTarget) ?? NaN)
    if (!savName.trim() || isNaN(amt) || amt <= 0) return
    try {
      await addGoal({
        name: savName.trim(),
        targetAmount: amt,
        savedAmount: 0,
        deadline: savDeadline || null,
        icon: savIcon,
        color: '#7C3AED',
      })
      closeModal()
      feedback.saved()
    } catch {
      feedback.failed()
    }
  }

  // ── Live budget preview (variable expense) ────────────────────────────────
  const liveBudget = varCatId ? budgetStatuses.find(b => b.categoryId === varCatId) : null
  const liveVarAmt = parseAmountInput(varAmt) ?? 0
  const liveSpent = liveBudget ? liveBudget.spent + liveVarAmt : 0
  const liveLimit = liveBudget?.limit
  const livePct = liveLimit ? Math.min((liveSpent / liveLimit) * 100, 100) : null
  const livePctColor = livePct !== null
    ? (livePct >= 100 ? '#f87171' : livePct >= 70 ? '#fbbf24' : '#34d399')
    : '#34d399'

  // ── Only render on allowed pages ──────────────────────────────────────────
  if (!ALL_ACTIVE_PAGES.includes(currentPage)) return null

  const handleFABClick = () => {
    if (currentPage === 'dashboard') {
      setShowTypeSelector(true)
      return
    }
    const modalType = PAGE_MODAL_MAP[currentPage]
    if (modalType) openModal(modalType)
  }

  const LAUNCH_TILES: { type: ModalType; label: string; icon: LucideIcon; color: string; bg: string }[] = [
    { type: 'income', label: t.fab.incomeLabel, icon: ArrowUp, color: '#34D399', bg: 'rgba(52,211,153,.16)' },
    { type: 'variable', label: t.fab.expenseLabel, icon: ArrowDown, color: '#FB7185', bg: 'rgba(251,113,133,.16)' },
    { type: 'fixed', label: t.fab.fixedLabel, icon: Lock, color: '#FBBF24', bg: 'rgba(251,191,36,.16)' },
    { type: 'category', label: t.fab.categoryLabel, icon: Tag, color: '#8B5CF6', bg: 'rgba(139,92,246,.16)' },
    ...(savingsEnabled ? [{ type: 'savings' as ModalType, label: t.fab.savingsLabel, icon: PiggyBank, color: '#A855F7', bg: 'rgba(168,85,247,.16)' }] : []),
  ]

  return (
    <>
      {/* ── Floating Action Button — mobile only, dashboard only ────────── */}
      {isMobile && currentPage === 'dashboard' && (
        <button
          onClick={handleFABClick}
          aria-label={t.fab.title}
          className="fab-pos w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl cursor-pointer"
          style={{
            zIndex: 40,
            background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
            boxShadow: '0 10px 30px rgba(139,92,246,.5)',
          }}
        >
          <Plus size={26} />
        </button>
      )}

      {/* ── TYPE SELECTOR launcher (dashboard) — compact centered modal, 2x2 grid ── */}
      {showTypeSelector && (
        <div
          className="fade-in"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowTypeSelector(false) }}
        >
          <div
            ref={typeSelectorRef} {...typeSelectorProps}
            className="modal-in"
            style={{ outline: 'none', width: '100%', maxWidth: 380, background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 26, padding: 20, boxShadow: '0 30px 70px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h2 id={typeSelectorTitleId} tabIndex={-1} style={{ outline: 'none', margin: 0, flex: 1, fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)' }}>{t.fab.title}</h2>
              <button
                type="button" onClick={() => setShowTypeSelector(false)} aria-label={t.common.close}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {LAUNCH_TILES.map((tile, i) => {
                const Icon = tile.icon
                const isLastOdd = i === LAUNCH_TILES.length - 1 && LAUNCH_TILES.length % 2 === 1
                return (
                  <button
                    key={tile.type}
                    type="button"
                    onClick={() => { setShowTypeSelector(false); openModal(tile.type) }}
                    style={{
                      position: 'relative', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
                      background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                      borderRadius: 18, padding: '18px 14px', cursor: 'pointer', textAlign: 'left',
                      gridColumn: isLastOdd ? '1 / -1' : undefined,
                      width: isLastOdd ? 'calc(50% - 6px)' : undefined,
                      justifySelf: isLastOdd ? 'center' : undefined,
                    }}
                  >
                    <div style={{ position: 'absolute', top: -22, right: -22, width: 70, height: 70, borderRadius: '50%', background: tile.color, filter: 'blur(24px)', opacity: 0.45, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 12, background: tile.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} color={tile.color} strokeWidth={2.2} />
                    </div>
                    <span style={{ position: 'relative', fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{tile.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD INCOME modal ─────────────────────────────────────────────── */}
      <CompactModal
        open={activeModal === 'income'} onClose={closeModal}
        icon={ArrowUp} iconColor="#34D399" iconBg="rgba(52,211,153,.16)"
        title={t.income.addTitle}
        accent="#34D399" accent2="#22D3EE"
        onSubmit={saveIncome}
        submitDisabled={!incLabel.trim() || !incAmt}
        autoFocusAmount
      >
        <AmountField value={incAmt} onChange={setIncAmt} accent="#34D399" />
        <input
          type="text" placeholder={t.income.descriptionPlaceholder}
          value={incLabel}
          onChange={e => setIncLabel(e.target.value)}
          style={finputStyle}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateInput compact value={incDate} onChange={setIncDate} />
          <button
            type="button"
            aria-pressed={incRecurring}
            onClick={() => {
              const next = !incRecurring
              setIncRecurring(next)
              setIncDate(d => dateForRecurringToggle(d, next, month, year))
            }}
            style={pillChipStyle(incRecurring, '#34D399', '#22D3EE')}
          >
            <Repeat size={12} /> {t.income.recurringToggle}
          </button>
        </div>
        {incRecurring && <ValidFromHint date={incDate} />}
      </CompactModal>

      {/* ── ADD VARIABLE EXPENSE modal ────────────────────────────────────── */}
      <CompactModal
        open={activeModal === 'variable'} onClose={closeModal}
        icon={ArrowDown} iconColor="#FB7185" iconBg="rgba(251,113,133,.16)"
        title={t.expenses.variable.addTitle}
        accent="#FB7185" accent2="#f43f5e"
        onSubmit={saveVariable}
        submitDisabled={varNewCatMode ? !varNewCatName.trim() || !varAmt : !varCatId || !varAmt}
        autoFocusAmount
      >
        <AmountField value={varAmt} onChange={setVarAmt} accent="#FB7185" />

        {livePct !== null && liveLimit != null && (
          <div style={{ borderRadius: 12, padding: '10px 12px', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif" }}>
              <span>{liveBudget?.categoryName}</span>
              <span>{formatAmount(liveSpent)} / {formatAmount(liveLimit)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${livePct}%`, background: livePctColor }} />
            </div>
          </div>
        )}

        {!varNewCatMode ? (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 4px' }}>
            {quickCategories.map(c => (
              <CategoryCircle
                key={c.id}
                icon={CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag}
                label={c.name}
                selected={varCatId === c.id}
                accent={c.color} accent2={c.color}
                onClick={() => { varSuggestion.pickedManually(); setVarCatId(c.id ?? '') }}
              />
            ))}
            <CategoryCircle
              icon={Plus} label={t.expenses.variable.newCategory}
              selected={false} accent="#FB7185" accent2="#f43f5e"
              onClick={() => setVarNewCatMode(true)}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" placeholder={t.expenses.variable.newCategoryName}
              value={varNewCatName}
              onChange={e => setVarNewCatName(e.target.value)}
              style={{ ...finputStyle, flex: 1 }}
            />
            <button className="hit-44" aria-label={t.common.cancel} title={t.common.cancel}
              type="button"
              onClick={() => { setVarNewCatMode(false); setVarNewCatName('') }}
              style={{ width: 38, borderRadius: 12, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateInput compact value={varDate} onChange={setVarDate} />
          <input
            type="text" placeholder={t.expenses.variable.notePlaceholder}
            value={varNote}
            onChange={e => setVarNote(e.target.value)}
            style={{ ...finputStyle, flex: 1, width: 'auto', padding: '8px 12px', borderRadius: 12, fontSize: 12 }}
          />
        </div>
        <SuggestedCategoryHint name={categoryName(varSuggestion.suggestedId)} />
      </CompactModal>

      {/* ── ADD FIXED EXPENSE modal ───────────────────────────────────────── */}
      <CompactModal
        open={activeModal === 'fixed'} onClose={closeModal}
        icon={Lock} iconColor="#FBBF24" iconBg="rgba(251,191,36,.16)"
        title={t.expenses.fixed.newTitle}
        accent="#FBBF24" accent2="#f59e0b"
        onSubmit={saveFixed}
        submitDisabled={!fixLabel.trim() || !fixAmt}
        autoFocusAmount
      >
        <AmountField value={fixAmt} onChange={setFixAmt} accent="#FBBF24" />
        <input
          type="text" placeholder={t.expenses.fixed.namePlaceholder}
          value={fixLabel}
          onChange={e => setFixLabel(e.target.value)}
          style={finputStyle}
        />
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 4px' }}>
            {quickCategories.map(c => (
              <CategoryCircle
                key={c.id}
                icon={CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag}
                label={c.name}
                selected={fixCatId === c.id}
                accent={c.color} accent2={c.color}
                onClick={() => { fixSuggestion.pickedManually(); setFixCatId(prev => prev === c.id ? '' : (c.id ?? '')) }}
              />
            ))}
          </div>
        )}
        <SuggestedCategoryHint name={categoryName(fixSuggestion.suggestedId)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: '6px 10px' }}>
            <button
              type="button"
              className="hit-44"
              aria-label={t.common.dayDecrease}
              onClick={() => setFixDay(d => String(Math.max(1, parseInt(d || '1') - 1)))}
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--aurora-gline)', border: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.dayLabel}</span>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)', minWidth: 14, textAlign: 'center' }}>{fixDay}</span>
            <button
              type="button"
              className="hit-44"
              aria-label={t.common.dayIncrease}
              onClick={() => setFixDay(d => String(Math.min(31, parseInt(d || '1') + 1)))}
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--aurora-gline)', border: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >+</button>
          </div>
          <div style={pillChipStyle(true, '#FBBF24', '#f59e0b')}>
            <Repeat size={12} /> {t.expenses.fixed.recurringMonthly}
          </div>
        </div>
        {/* A new fixed expense is dated today and counts from this month on. */}
        <ValidFromHint date={todayISO()} />
      </CompactModal>

      {/* ── ADD CATEGORY modal ────────────────────────────────────────────── */}
      <CompactModal
        open={activeModal === 'category'} onClose={closeModal}
        icon={Tag} iconColor="#8B5CF6" iconBg="rgba(139,92,246,.16)"
        title={t.expenses.categories.newTitle}
        accent="#8B5CF6" accent2="#EC4899"
        onSubmit={saveCategory}
        submitDisabled={!catName.trim()}
      >
        <input
          type="text" placeholder={t.expenses.categories.namePlaceholder}
          value={catName}
          onChange={e => setCatName(e.target.value)}
          style={finputStyle}
        />

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 2px 4px' }}>
          {PRESET_ICONS.map((em, i) => {
            const Icon = CATEGORY_ICON_MAP[em] ?? Tag
            const selected = catIcon === em
            return (
              <button
                key={em}
                type="button"
                aria-label={t.common.iconOption.replace('{n}', String(i + 1))}
                aria-pressed={selected}
                onClick={() => setCatIcon(em)}
                style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? catColor : 'var(--aurora-glass)',
                  border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <Icon size={17} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--aurora-faint)', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Manrope', sans-serif", marginRight: 2 }}>{t.expenses.categories.colorLabel}</span>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCatColor(c)}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: c,
                border: 'none', cursor: 'pointer', flexShrink: 0,
                boxShadow: catColor === c ? `0 0 0 2px var(--aurora-panel), 0 0 0 4px ${c}` : 'none',
                transition: 'box-shadow 0.15s',
              }}
            />
          ))}
        </div>

        <AmountInput
          placeholder={`${t.expenses.categories.limitLabel} · ${t.expenses.categories.limitOptional}`}
          value={catBudgetLimit}
          onValueChange={setCatBudgetLimit}
          style={finputStyle}
        />
      </CompactModal>

      {/* ── ADD SAVINGS GOAL modal ────────────────────────────────────────── */}
      <CompactModal
        open={activeModal === 'savings'} onClose={closeModal}
        icon={PiggyBank} iconColor="#A855F7" iconBg="rgba(168,85,247,.16)"
        title={t.savings.addTitle}
        accent="#A855F7" accent2="#8B5CF6"
        onSubmit={saveSavingsGoal}
        submitDisabled={!savName.trim() || !savTarget}
        autoFocusAmount
      >
        <input
          type="text" placeholder={t.savings.namePlaceholder}
          value={savName}
          onChange={e => setSavName(e.target.value)}
          style={finputStyle}
        />

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 2px 4px' }}>
          {SAVINGS_PRESET_ICONS.map((em, i) => {
            const Icon = SAVINGS_ICON_MAP[em] ?? PiggyBank
            const selected = savIcon === em
            return (
              <button
                key={em}
                type="button"
                aria-label={t.common.iconOption.replace('{n}', String(i + 1))}
                aria-pressed={selected}
                onClick={() => setSavIcon(em)}
                style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? '#A855F7' : 'var(--aurora-glass)',
                  border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <Icon size={17} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
              </button>
            )
          })}
        </div>

        <AmountField value={savTarget} onChange={setSavTarget} accent="#A855F7" />

        <DateInput compact value={savDeadline} onChange={setSavDeadline} />
      </CompactModal>
    </>
  )
}

import { useState, useCallback, useEffect } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Plus, PiggyBank, Target } from 'lucide-react'
import { useSaveFeedback } from '../hooks/useSaveFeedback'
import { CompactModal } from '../components/CompactModal'
import { SavingsDetailModal } from '../components/SavingsDetailModal'
import { SwipeableRow } from '../components/SwipeableRow'
import { GlassCard } from '../components/GlassCard'
import { ListSkeleton, QueryError } from '../components/QueryState'
import { HeroCard } from '../components/HeroCard'
import { useSavings } from '../hooks/useSavings'
import { useFormatters } from '../hooks/useFormatters'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation } from '../i18n'
import { SAVINGS_ICON_MAP } from '../utils/savingsIcons'
import { listDeposits, addDeposit, deleteDeposit } from '../api/savings'
import { getSummaryCards } from '../api/transactions'
import type { SavingsGoal, Deposit } from '../types'
import AmountInput from '../components/AmountInput'
import { decimalSeparator, formatAmountInput, parseAmountInput } from '../utils/amountInput'

const PRESET_COLORS = [
  '#7C3AED', '#A78BFA', '#10B981', '#34D399', '#EF4444', '#F59E0B', '#3B82F6', '#EC4899',
]

const PRESET_ICONS = [
  '🏖️', '🚗', '🏠', '💻', '✈️', '🎓',
  '💍', '🎮', '👶', '💰', '🎁', '🏋️',
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 4,
  display: 'block',
}

function daysUntil(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(deadline)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function goalMonthly(goal: SavingsGoal): number {
  if (!goal.deadline) return 0
  const today = new Date()
  const deadline = new Date(goal.deadline)
  const ml = Math.max(1, (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()))
  return Math.max(0, goal.targetAmount - goal.savedAmount) / ml
}

export function SavingsPage({ openAddTrigger }: { openAddTrigger?: number }) {
  const { goals, isLoading: listLoading, isError: listError, refetch: listRetry, addGoal, updateGoal, deleteGoal, pauseGoal, resumeGoal, reload: reloadGoals } = useSavings()
  const listFailed = listError && goals.length === 0
  const { formatAmount, formatAmountParts } = useFormatters()
  const { t, locale } = useTranslation()
  const feedback = useSaveFeedback()

  const [view, setView] = useState<'list' | 'detail' | 'edit'>('list')
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null)
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null)

  useEffect(() => {
    const now = new Date()
    getSummaryCards(now.getFullYear(), now.getMonth() + 1)
      .then(({ income }) => setMonthlyIncome(income))
      .catch(() => {})
  }, [])

  const [formName, setFormName] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [formSaved, setFormSaved] = useState('')
  const [formDeadline, setFormDeadline] = useState('')
  const [formIcon, setFormIcon] = useState('🎯')
  const [formColor, setFormColor] = useState('#7C3AED')
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (openAddTrigger) openAdd()
  }, [openAddTrigger])

  const [initialGoalId] = useState(() => {
    const params = window.location.hash.split('?')[1] ?? ''
    return new URLSearchParams(params).get('id')
  })

  useEffect(() => {
    if (!initialGoalId || goals.length === 0) return
    const goal = goals.find(g => g.id === initialGoalId)
    if (goal && view === 'list') openDetail(goal)
  }, [goals]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0)
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0)
  const goalCount = goals.length
  const overallPct = totalTarget > 0 ? Math.round(totalSaved / totalTarget * 100) : 0
  const monthlyAmount = goals.filter(g => !g.paused).reduce((s, g) => s + goalMonthly(g), 0)
  const incomePercent = monthlyIncome && monthlyIncome > 0
    ? Math.round(monthlyAmount / monthlyIncome * 100)
    : null
  const animatedTotalSaved = useCountUp(totalSaved, 800)

  function openAdd() {
    setSelectedGoal(null)
    setFormName('')
    setFormTarget('')
    setFormSaved('0')
    setFormDeadline('')
    setFormIcon('🎯')
    setFormColor('#7C3AED')
    setFormNote('')
    setView('edit')
  }

  async function openDetail(goal: SavingsGoal) {
    setSelectedGoal(goal)
    setView('detail')
    if (goal.id) window.location.hash = `savings?id=${goal.id}`
    if (goal.id) {
      try { setDeposits(await listDeposits(goal.id)) } catch { setDeposits([]) }
    }
  }

  async function handleDeposit(amount: number) {
    if (!selectedGoal?.id) return
    const goalId = selectedGoal.id
    const { goal: updated, deposit } = await addDeposit(goalId, amount)
    setDeposits(prev => [deposit, ...prev])
    setSelectedGoal(prev => prev ? { ...prev, savedAmount: updated.savedAmount } : null)
    void reloadGoals()
    // A deposit is its own row, so undo simply deletes that row.
    feedback.saved(async () => {
      const after = await deleteDeposit(goalId, deposit.id)
      setDeposits(prev => prev.filter(d => d.id !== deposit.id))
      setSelectedGoal(prev => prev?.id === goalId ? { ...prev, savedAmount: after.savedAmount } : prev)
      void reloadGoals()
    })
  }

  async function handleDeleteDeposit(depositId: string) {
    if (!selectedGoal?.id) return
    const updated = await deleteDeposit(selectedGoal.id, depositId)
    setDeposits(prev => prev.filter(d => d.id !== depositId))
    setSelectedGoal(prev => prev ? { ...prev, savedAmount: updated.savedAmount } : null)
  }

  function openEdit(goal: SavingsGoal) {
    setSelectedGoal(goal)
    setFormName(goal.name)
    setFormTarget(formatAmountInput(goal.targetAmount, decimalSeparator(locale)))
    setFormSaved(formatAmountInput(goal.savedAmount, decimalSeparator(locale)))
    setFormDeadline(goal.deadline ?? '')
    setFormIcon(goal.icon ?? '🎯')
    setFormColor(goal.color ?? '#7C3AED')
    setFormNote(goal.note ?? '')
    setView('edit')
  }

  function closeEdit() {
    if (selectedGoal) {
      setView('detail')
    } else {
      setView('list')
    }
  }

  function closeDetail() {
    setSelectedGoal(null)
    setView('list')
    window.location.hash = 'savings'
  }

  const handleSave = useCallback(async () => {
    const targetNum = (parseAmountInput(formTarget) ?? NaN)
    if (!formName.trim() || isNaN(targetNum) || targetNum <= 0) return
    const savedNum = parseAmountInput(formSaved) ?? 0
    setSaving(true)
    try {
      const payload: Omit<SavingsGoal, 'id'> = {
        name: formName.trim(),
        targetAmount: targetNum,
        savedAmount: Math.max(0, savedNum),
        deadline: formDeadline || null,
        icon: formIcon,
        color: formColor,
        note: formNote.trim() || undefined,
      }
      if (selectedGoal?.id) {
        await updateGoal(selectedGoal.id, payload)
        setSelectedGoal({ ...selectedGoal, ...payload })
        setView('detail')
      } else {
        await addGoal(payload)
        setView('list')
      }
      feedback.saved()
    } catch {
      feedback.failed()
    } finally {
      setSaving(false)
    }
  }, [formName, formTarget, formSaved, formDeadline, formIcon, formColor, formNote, selectedGoal, addGoal, updateGoal, feedback])

  // Deleting a goal removes its deposits too, so it asks first (Finvu dialog,
  // not window.confirm). No undo: the server can't restore the deposits.
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null)
  const confirmDeleteGoal = useCallback(async () => {
    const goal = goalToDelete
    if (!goal?.id) return
    await deleteGoal(goal.id)
    setGoalToDelete(null)
    if (selectedGoal?.id === goal.id) { setSelectedGoal(null); setView('list'); window.location.hash = 'savings' }
  }, [goalToDelete, deleteGoal, selectedGoal])

  const handlePause = useCallback(async () => {
    if (!selectedGoal?.id) return
    await pauseGoal(selectedGoal.id)
    setSelectedGoal(prev => prev ? { ...prev, paused: true } : null)
  }, [selectedGoal, pauseGoal])

  const handleResume = useCallback(async () => {
    if (!selectedGoal?.id) return
    await resumeGoal(selectedGoal.id)
    setSelectedGoal(prev => prev ? { ...prev, paused: false } : null)
  }, [selectedGoal, resumeGoal])

  const form = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 0 8px' }}>
      {/* Icon row */}
      <div>
        <label style={labelStyle}>{t.savings.iconLabel}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {PRESET_ICONS.map((icon, i) => {
            const Icon = SAVINGS_ICON_MAP[icon] ?? Target
            const selected = formIcon === icon
            return (
              <button
                key={icon}
                type="button"
                aria-label={t.common.iconOption.replace('{n}', String(i + 1))}
                aria-pressed={selected}
                onClick={() => setFormIcon(icon)}
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  border: selected ? '2px solid var(--violet)' : '1px solid var(--border)',
                  background: selected ? 'rgba(124,58,237,0.12)' : 'var(--bg3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon size={17} color={selected ? 'var(--violet)' : 'var(--text2)'} strokeWidth={1.8} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Name */}
      <div>
        <label style={labelStyle}>{t.savings.nameLabel}</label>
        <input
          style={inputStyle}
          value={formName}
          onChange={e => setFormName(e.target.value)}
          placeholder={t.savings.namePlaceholder}
          maxLength={100}
        />
      </div>

      {/* Target + Saved amounts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>{t.savings.targetAmount} (€)</label>
          <AmountInput
            style={inputStyle}

            value={formTarget}
            onValueChange={setFormTarget}
            placeholder="1000"
          />
        </div>
        <div>
          <label style={labelStyle}>{t.savings.savedAmount} (€)</label>
          <AmountInput
            style={inputStyle}
            value={formSaved}
            onValueChange={setFormSaved}
            placeholder="0"
          />
        </div>
      </div>

      {/* Deadline */}
      <div>
        <label style={labelStyle}>{t.savings.deadline} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{t.savings.deadlineOptional}</span></label>
        <input
          style={inputStyle}
          type="date"
          value={formDeadline}
          onChange={e => setFormDeadline(e.target.value)}
        />
      </div>

      {/* Color */}
      <div>
        <label style={labelStyle}>{t.savings.colorLabel}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setFormColor(c)}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                outline: formColor === c ? `2px solid var(--text)` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Note */}
      <div>
        <label style={labelStyle}>{t.savings.noteLabel} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{t.savings.noteOptional}</span></label>
        <textarea
          style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }}
          value={formNote}
          onChange={e => setFormNote(e.target.value)}
          placeholder=""
          maxLength={500}
        />
      </div>
    </div>
  )

  const saveDisabled = !formName.trim() || !((parseAmountInput(formTarget) ?? 0) > 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'var(--page-pad-bottom)' }}>
      <div style={{ padding: 20, minHeight: '100%' }}>

        {/* Hero wallet card */}
        <HeroCard variant="income" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
            {t.savings.totalSavingsLabel} · {t.savings.activeGoals.replace('{n}', String(goalCount))}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-emerald))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                {formatAmountParts(animatedTotalSaved).main}
              </span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {formatAmountParts(animatedTotalSaved).rest}
              </span>
            </div>
            {totalTarget > 0 && (
              <span style={{ marginLeft: 'auto', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(52,211,153,0.15)', color: 'var(--aurora-emerald)', border: '1px solid rgba(52,211,153,0.3)' }}>
                {overallPct}% z {Math.round(totalTarget)} €
              </span>
            )}
          </div>
          {totalTarget > 0 && (
            <div style={{ height: 8, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden', marginTop: 12 }}>
              <div style={{ height: '100%', width: `${Math.min(overallPct, 100)}%`, background: 'linear-gradient(90deg,var(--aurora-emerald),var(--aurora-cyan))', borderRadius: 99, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.savings.monthlyLabel}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-emerald)' }}>+{formatAmount(monthlyAmount)}</div>
            </div>
            <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.savings.remainingTotal}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(Math.max(0, totalTarget - totalSaved))}</div>
            </div>
            <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.savings.percentOfIncome}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {incomePercent !== null ? `${incomePercent}%` : '—'}
              </div>
            </div>
          </div>
        </HeroCard>

        {/* Goals grid */}
        {listLoading ? <ListSkeleton /> : listFailed ? <QueryError onRetry={listRetry} /> : goals.length === 0 ? (
          <GlassCard radius={20} style={{ textAlign: 'center', padding: '48px 24px' }}>
            <PiggyBank size={40} color="var(--aurora-faint)" style={{ marginBottom: 12 }} />
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 6px' }}>{t.savings.noGoals}</p>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.savings.noGoalsSubtitle}</p>
          </GlassCard>
        ) : (
          <>
            {/* Mobile: vertical list with swipe-to-delete */}
            <div className="flex flex-col gap-4 lg:hidden">
              {goals.map(goal => (
                <SwipeableRow key={goal.id} onDelete={() => setGoalToDelete(goal)}>
                  <GoalCard
                    goal={goal}
                    formatAmount={formatAmount}
                    t={t.savings}
                    onClick={() => openDetail(goal)}
                  />
                </SwipeableRow>
              ))}
            </div>
            {/* Desktop: horizontal scroll row */}
            <div className="hidden lg:flex overflow-x-auto gap-4 pb-2" style={{ scrollbarWidth: 'none' }}>
              {goals.map(goal => (
                <div key={goal.id} style={{ width: 300, flexShrink: 0 }}>
                  <GoalCard
                    goal={goal}
                    formatAmount={formatAmount}
                    t={t.savings}
                    onClick={() => openDetail(goal)}
                    desktop
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </div>

      {/* FAB — mobile only */}
      {view !== 'edit' && (
        <button
          onClick={openAdd}
          aria-label={t.savings.addTitle}
          className="lg:hidden fab-pos w-14 h-14 rounded-full flex items-center justify-center text-white cursor-pointer"
          style={{
            zIndex: 40,
            background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))',
            border: 'none',
            boxShadow: '0 10px 30px rgba(139,92,246,.5)',
          }}
        >
          <Plus size={26} />
        </button>
      )}

      <ConfirmDialog
        open={goalToDelete !== null}
        message={t.savings.deleteConfirm}
        detail={goalToDelete?.name}
        onConfirm={confirmDeleteGoal}
        onCancel={() => setGoalToDelete(null)}
      />

      <SavingsDetailModal
        goal={view === 'detail' ? selectedGoal : null}
        deposits={deposits}
        onClose={closeDetail}
        onEdit={() => { if (selectedGoal) openEdit(selectedGoal) }}
        onDelete={selectedGoal ? () => setGoalToDelete(selectedGoal) : undefined}
        onDeposit={handleDeposit}
        onDeleteDeposit={handleDeleteDeposit}
        onPause={handlePause}
        onResume={handleResume}
        formatAmount={formatAmount}
      />

      <CompactModal
        open={view === 'edit'}
        onClose={closeEdit}
        icon={PiggyBank}
        iconColor="#8B5CF6"
        iconBg="rgba(139,92,246,.16)"
        title={selectedGoal ? t.savings.editTitle : t.savings.addTitle}
        accent="#8B5CF6" accent2="#EC4899"
        onSubmit={handleSave}
        submitDisabled={saveDisabled}
        submitting={saving}
      >
        {form}
      </CompactModal>
    </div>
  )
}


function MiniRing({ pct, size, label, gradientId }: {
  pct: number; size: number; label: string; gradientId: string
}) {
  const sw = 3
  const r = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  const c = size / 2
  const trackColor = pct === 0 ? 'rgba(139,92,246,0.2)' : 'var(--aurora-gline)'
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--aurora-violet)" />
          <stop offset="100%" stopColor="var(--aurora-fuchsia)" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={`url(#${gradientId})`} strokeWidth={sw}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
      <text x={c} y={c} textAnchor="middle" dominantBaseline="central"
        fill="var(--aurora-hi)" fontSize={11} fontWeight={700} fontFamily="'Outfit', sans-serif">
        {label}
      </text>
    </svg>
  )
}

function GoalCard({
  goal, formatAmount, t, onClick, desktop = false,
}: {
  goal: SavingsGoal
  formatAmount: (n: number) => string
  t: { of: string; completed: string; daysLeft: string; overdue: string; remaining: string; pausedBadge: string }
  onClick: () => void
  desktop?: boolean
}) {
  const [active, setActive] = useState(false)
  const common = useTranslation().t.common
  const { formatLongDate } = useFormatters()
  const rawPct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0
  const pct = Math.min(100, rawPct)
  const isCompleted = pct >= 100
  const accent = goal.color ?? '#7C3AED'
  const monthly = goalMonthly(goal)

  const pctFixed = pct.toFixed(1)
  const pctLabel = pct === 0 ? '0%' : pctFixed === '0.0' ? '< 0.1%' : pctFixed + '%'
  const ringSize = desktop ? 56 : 52

  let deadlineEl: React.ReactNode = null
  if (goal.deadline && !isCompleted) {
    const days = daysUntil(goal.deadline)
    if (days < 0) {
      deadlineEl = (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-rose)', background: 'rgba(251,113,133,0.12)', padding: '2px 6px', borderRadius: 20 }}>
          {t.overdue}
        </span>
      )
    } else {
      deadlineEl = <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{common.dueBy.replace('{date}', formatLongDate(goal.deadline))}</span>
    }
  }

  return (
    <GlassCard
      radius={18}
      onClick={onClick}
      style={{
        border: active ? '1px solid var(--aurora-violet)' : '1px solid var(--aurora-gline)',
        padding: '12px 16px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 0.12s',
        ...(desktop ? { height: '100%' } : {}),
      }}
    >
      <div
        onPointerDown={() => setActive(true)}
        onPointerUp={() => setActive(false)}
        onPointerLeave={() => setActive(false)}
        style={{ display: 'contents' }}
      >
      {/* Top row: icon + name/deadline + ring */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, flexShrink: 0,
            background: `${accent}26`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {(() => { const Icon = SAVINGS_ICON_MAP[goal.icon ?? ''] ?? Target; return <Icon size={20} color={accent} strokeWidth={1.8} /> })()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</p>
              {goal.paused && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c', letterSpacing: '0.05em', flexShrink: 0 }}>{t.pausedBadge}</span>
              )}
            </div>
            {isCompleted ? (
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-emerald)' }}>{t.completed}</span>
            ) : deadlineEl}
          </div>
        </div>
        <MiniRing pct={pct} size={ringSize} label={pctLabel} gradientId={`ring-grad-${goal.id ?? 'new'}`} />
      </div>

      {/* Amounts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)', letterSpacing: '-0.5px' }}>
            {formatAmount(goal.savedAmount)}
          </span>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>/ {formatAmount(goal.targetAmount)}</span>
        </div>
        {!isCompleted && (
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '2px 0 0' }}>
            {t.remaining} {formatAmount(Math.max(0, goal.targetAmount - goal.savedAmount))}
            {monthly > 0 && ` · ${common.autoMonthly.replace('{amount}', formatAmount(monthly))}`}
          </p>
        )}
      </div>
      </div>
    </GlassCard>
  )
}

import { useState, useEffect } from 'react'
import { X, Pencil, Pause, Play, Plus, Trash2, Calendar, Target, Bell, PiggyBank } from 'lucide-react'
import type { SavingsGoal, Deposit } from '../types'
import { useTranslation } from '../i18n'
import { formatDateLocale } from '../utils/format'
import { SAVINGS_ICON_MAP } from '../utils/savingsIcons'

interface SavingsDetailModalProps {
  goal: SavingsGoal | null
  deposits?: Deposit[]
  onClose: () => void
  onEdit: () => void
  onDelete?: () => void
  onDeposit: (amount: number) => Promise<void>
  onDeleteDeposit?: (depositId: string) => Promise<void>
  onPause?: () => Promise<void>
  onResume?: () => Promise<void>
  formatAmount: (n: number) => string
}

function calcMonthly(goal: SavingsGoal): number {
  if (!goal.deadline) return 0
  const today = new Date()
  const deadline = new Date(goal.deadline)
  const ml = Math.max(1, (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()))
  return Math.max(0, goal.targetAmount - goal.savedAmount) / ml
}

function calcMonthsLeft(deadline: string | null | undefined): number {
  if (!deadline) return 0
  const today = new Date()
  const d = new Date(deadline)
  return Math.max(0, (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth()))
}

// Ring: 104px rendered, stroke 10px — matches the mockup's single unified card
const R_SIZE = 104, R_SW = 10, R_R = (R_SIZE - R_SW * 2) / 2, R_CIRC = 2 * Math.PI * R_R

export function SavingsDetailModal({ goal, deposits = [], onClose, onEdit, onDelete, onDeposit, onDeleteDeposit, onPause, onResume, formatAmount }: SavingsDetailModalProps) {
  const { t, locale } = useTranslation()
  const [depositMode, setDepositMode] = useState(false)
  const [depositInput, setDepositInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [animated, setAnimated] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!goal) { setAnimated(false); return }
    setAnimated(false)
    const timer = setTimeout(() => setAnimated(true), 60)
    return () => clearTimeout(timer)
  }, [goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!goal) return null

  const rawPct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0
  const pct = Math.min(100, rawPct)
  const isCompleted = pct >= 100
  const color = isCompleted ? 'var(--aurora-emerald)' : (goal.color ?? 'var(--aurora-violet)')
  const color2 = isCompleted ? 'var(--aurora-cyan)' : 'var(--aurora-fuchsia)'

  const pctFixed = pct.toFixed(1)
  const pctStr = pct === 0 ? '0%' : pctFixed === '0.0' ? '< 0.1%' : pctFixed + '%'

  const displayPct = animated ? pct : 0
  const ringOffset = R_CIRC * (1 - displayPct / 100)

  const monthly = calcMonthly(goal)
  const monthsLeft = calcMonthsLeft(goal.deadline)
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount)
  const glowId = goal.id ?? 'g'

  const stats = [
    { label: t.savings.monthlyLabel.toUpperCase(), value: monthly > 0 ? `+${formatAmount(monthly)}` : '—', green: true },
    { label: t.savings.monthsLabel.toUpperCase(), value: monthsLeft > 0 ? String(monthsLeft) : '—', green: false },
  ]

  async function handleDeposit() {
    const amount = parseFloat(depositInput.replace(',', '.'))
    if (!amount || amount <= 0) return
    setSaving(true)
    try {
      await onDeposit(amount)
      setDepositInput('')
      setDepositMode(false)
    } finally {
      setSaving(false)
    }
  }

  async function handlePause() {
    if (!onPause) return
    setPauseLoading(true)
    try { await onPause() } finally { setPauseLoading(false) }
  }

  async function handleResume() {
    if (!onResume) return
    setPauseLoading(true)
    try { await onResume() } finally { setPauseLoading(false) }
  }

  const pausedBadge = { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c', letterSpacing: '0.05em', flexShrink: 0 } as const

  const glassInputStyle = { flex: 1, padding: '11px 14px', borderRadius: 14, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-hi)', fontSize: 14, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' as const }

  const depositInputEl = (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="number" min="0.01" step="0.01" placeholder={t.savings.depositPlaceholder}
        value={depositInput} onChange={e => setDepositInput(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') handleDeposit() }}
        style={glassInputStyle}
      />
      <button onClick={handleDeposit} disabled={saving || !depositInput || parseFloat(depositInput) <= 0}
        style={{ padding: '0 18px', borderRadius: 14, background: 'linear-gradient(135deg,var(--aurora-emerald),var(--aurora-cyan))', color: '#052e21', fontSize: 14, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif", opacity: saving ? 0.7 : 1 }}>
        {saving ? '...' : t.common.save}
      </button>
      <button onClick={() => { setDepositMode(false); setDepositInput('') }}
        aria-label={t.common.close}
        style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  )

  const autoRulesRows = [
    { icon: Calendar, label: t.savings.monthlyTransfer, sub: t.savings.firstOfMonth, val: monthly > 0 ? formatAmount(monthly) : '—' },
    { icon: Target, label: t.savings.goalAmount, sub: `${t.savings.remainingLabel} ${formatAmount(remaining)}`, val: formatAmount(goal.targetAmount) },
    { icon: Bell, label: t.savings.reminder, sub: t.savings.reminderSub, val: '—' },
  ]

  const sectionLabelStyle = { fontFamily: "'Outfit', sans-serif", fontSize: 10, color: 'var(--aurora-faint)', textTransform: 'uppercase' as const, fontWeight: 700, letterSpacing: '0.06em', margin: '0 0 10px 2px' }

  const depositsEl = deposits.length === 0 ? (
    <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '24px 0', textAlign: 'center' }}>
      <PiggyBank size={26} color="var(--aurora-faint)" style={{ marginBottom: 8 }} />
      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{t.savings.noDeposits}</p>
    </div>
  ) : (
    <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '0 14px' }}>
      {deposits.slice(0, 10).map((d, i) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--aurora-gline)' : 'none' }}>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', flex: 1 }}>
            {formatDateLocale(d.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {confirmDeleteId === d.id ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' }}>{t.savings.deleteDepositConfirm.replace('{amount}', formatAmount(d.amount))}</span>
              <button onClick={async () => { if (!onDeleteDeposit) return; setDeleting(true); try { await onDeleteDeposit(d.id) } finally { setDeleting(false); setConfirmDeleteId(null) } }} disabled={deleting}
                style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-rose)', background: 'rgba(251,113,133,0.12)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 8, padding: '3px 8px', cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {t.common.yes}
              </button>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-lo)', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 8, padding: '3px 8px', cursor: 'pointer' }}>
                {t.common.no}
              </button>
            </div>
          ) : (
            <>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-emerald)' }}>+{formatAmount(d.amount)}</span>
              {onDeleteDeposit && (
                <button onClick={() => setConfirmDeleteId(d.id)}
                  style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--aurora-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  title={t.savings.deleteDeposit} aria-label={t.savings.deleteDeposit}>
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 fade-in"
      style={{ background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="modal-in"
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)',
          borderRadius: 26, padding: 22,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, flexShrink: 0, background: `${goal.color ?? '#8B5CF6'}29`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(() => { const Icon = SAVINGS_ICON_MAP[goal.icon ?? ''] ?? Target; return <Icon size={22} color={goal.color ?? '#8B5CF6'} strokeWidth={1.8} /> })()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</span>
              {goal.paused && <span style={pausedBadge}>{t.savings.pausedBadge}</span>}
            </div>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {goal.note ? goal.note : goal.deadline ? `${t.savings.goalUntil} ${formatDateLocale(goal.deadline, locale, { day: 'numeric', month: 'long', year: 'numeric' })}` : `${pctStr} ${t.savings.filled}`}
            </p>
          </div>
          <button onClick={onClose} aria-label={t.common.close}
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* Ring + amount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
          <div style={{ position: 'relative', width: R_SIZE, height: R_SIZE, flexShrink: 0 }}>
            <svg width={R_SIZE} height={R_SIZE} style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id={`ring-${glowId}`}>
                  <stop offset="0%" stopColor={color} />
                  <stop offset="100%" stopColor={color2} />
                </linearGradient>
                <filter id={`glow-${glowId}`} x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={color} floodOpacity="0.4" />
                </filter>
              </defs>
              <circle cx={R_SIZE / 2} cy={R_SIZE / 2} r={R_R} fill="none" stroke="var(--aurora-gline)" strokeWidth={R_SW} />
              <circle cx={R_SIZE / 2} cy={R_SIZE / 2} r={R_R} fill="none" stroke={`url(#ring-${glowId})`} strokeWidth={R_SW}
                strokeLinecap="round" strokeDasharray={`${R_CIRC}`} strokeDashoffset={`${ringOffset}`}
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)', filter: `url(#glow-${glowId})` }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, color: 'var(--aurora-hi)' }}>{pctStr}</span>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9, color: 'var(--aurora-faint)', textTransform: 'uppercase', fontWeight: 700 }}>{t.savings.filled}</span>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--aurora-hi)' }}>{formatAmount(goal.savedAmount)}</span>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-faint)' }}> / {formatAmount(goal.targetAmount)}</span>
            </div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 6 }}>
              {isCompleted ? `🎉 ${t.savings.completed}` : `${t.savings.remainingLabel} ${formatAmount(remaining)}`}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9, color: 'var(--aurora-faint)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: s.green ? 'var(--aurora-emerald)' : 'var(--aurora-hi)' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ marginBottom: 20 }}>
          {depositMode ? depositInputEl : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDepositMode(true)}
                style={{ flex: 1, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,var(--aurora-emerald),var(--aurora-cyan))', color: '#052e21', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={15} strokeWidth={2.4} /> {t.savings.depositBtn}
              </button>
              <button onClick={onEdit} aria-label={t.common.edit} title={t.common.edit}
                style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Pencil size={16} strokeWidth={1.8} />
              </button>
              {goal.paused ? (
                <button onClick={handleResume} disabled={pauseLoading || !onResume} aria-label={t.savings.resumeBtn} title={t.savings.resumeBtn}
                  style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: 'var(--aurora-emerald)', cursor: pauseLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: pauseLoading ? 0.7 : 1 }}>
                  <Play size={16} strokeWidth={1.8} />
                </button>
              ) : (
                <button onClick={handlePause} disabled={pauseLoading || !onPause} aria-label={t.savings.pauseBtn} title={t.savings.pauseBtn}
                  style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', cursor: pauseLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: pauseLoading ? 0.7 : 1 }}>
                  <Pause size={16} strokeWidth={1.8} />
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} aria-label={t.common.delete} title={t.common.delete}
                  style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-rose)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Automatické pravidlá */}
        <p style={sectionLabelStyle}>{t.savings.autoRules}</p>
        <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '0 14px', marginBottom: 18 }}>
          {autoRulesRows.map((r, i) => {
            const Icon = r.icon
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid var(--aurora-gline)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--aurora-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={15} color="var(--aurora-lo)" strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10.5, color: 'var(--aurora-faint)', marginTop: 1 }}>{r.sub}</div>
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 700, color: r.val === '—' ? 'var(--aurora-faint)' : 'var(--aurora-hi)', flexShrink: 0 }}>{r.val}</div>
              </div>
            )
          })}
        </div>

        {/* Posledné vklady */}
        <p style={sectionLabelStyle}>{t.savings.latestDeposits}</p>
        {depositsEl}
      </div>
    </div>
  )
}

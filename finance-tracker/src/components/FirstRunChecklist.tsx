import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, X, TrendingUp, Receipt, Target, Users, LayoutTemplate, CalendarClock, KeyRound } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useHousehold } from '../hooks/useHousehold'
import { useTranslation } from '../i18n'
import { getMonthlySeries } from '../api/transactions'
import { trackingStartOf } from '../utils/trackingStart'
import { requestAddForm } from '../utils/addFormEvents'
import { dismissFirstRun, firstRunSteps, isFirstRunDismissed, shouldShowFirstRun, type FirstRunStepId } from '../utils/firstRun'
import type { Page } from '../App'

const ICONS = { template: LayoutTemplate, income: TrendingUp, expense: Receipt, budget: Target, tracking: CalendarClock, pin: KeyRound, household: Users } as const

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/**
 * "Prvé kroky": the whole onboarding of a new account. Steps tick themselves
 * off from the user's data. Optional steps open the budget-template picker
 * (onOpenTemplate, only while that offer is open), the tracking-start dialog
 * and the PIN setup in Settings.
 */
export function FirstRunChecklist({ onNavigate, onOpenTemplate, onSetTrackingStart }: {
  onNavigate: (p: Page) => void
  onOpenTemplate?: () => void
  onSetTrackingStart: () => void
}) {
  const { user, completeOnboarding } = useAuth()
  const { t } = useTranslation()
  const tr = t.firstRun
  const { categories, isLoading: catsLoading } = useCategories()
  const { members } = useHousehold()
  const [dismissed, setDismissed] = useState(() => isFirstRunDismissed(user?.id))

  // Any income / expense since tracking started (series covers at most 24 months).
  const now = new Date()
  const earliest = new Date(now.getFullYear(), now.getMonth() - 23, 1)
  const start = trackingStartOf(user)
  const from = start && start.slice(0, 7) > ym(earliest) ? start.slice(0, 7) : ym(earliest)
  const to = ym(now)
  const { data: series, isLoading } = useQuery({
    // Prefix 'monthlySeries' so every create/delete invalidates it.
    queryKey: ['monthlySeries', 'firstRun', from, to],
    queryFn: () => getMonthlySeries(from, to, 'personal'),
    enabled: !!user && !dismissed,
  })

  const steps = user && series ? firstRunSteps({
    hasIncome: series.months.some(m => m.income > 0),
    hasExpense: series.months.some(m => m.expense > 0),
    hasBudget: categories.some(c => (c.budgetLimit ?? 0) > 0),
    householdEnabled: !!user.household_enabled,
    hasHouseholdMember: members.length > 1,
    offerTemplate: !!onOpenTemplate,
    trackingSet: !!user.tracking_start_date,
    trackingDismissed: !!user.onboarding_banner_dismissed,
    hasPin: !!user.has_pin,
  }) : null
  const finished = !!steps && !catsLoading && !shouldShowFirstRun(steps, false)

  // Onboarding is over once the checklist is done or dismissed: record it so
  // the budget-template offer (and anything else keyed on it) stops.
  useEffect(() => {
    if (user && !user.onboardingComplete && (dismissed || finished)) void completeOnboarding().catch(() => {})
  }, [user, dismissed, finished, completeOnboarding])

  if (!user || dismissed || isLoading || catsLoading || !steps || finished) return null
  const required = steps.filter(s => !s.optional)
  const doneCount = required.filter(s => s.done).length

  const act = (id: FirstRunStepId) => {
    if (id === 'template') onOpenTemplate?.()
    else if (id === 'tracking') onSetTrackingStart()
    else if (id === 'pin') {
      // Settings opens its Security section from this hand-off (as from Profile)
      try { localStorage.setItem('settings_open_section', 'security') } catch { /* ignore */ }
      onNavigate('settings')
    }
    else if (id === 'income') requestAddForm('income')
    else if (id === 'expense') requestAddForm('variable')
    else if (id === 'budget') requestAddForm('category')
    else onNavigate('household')
  }
  const label: Record<FirstRunStepId, [string, string, string]> = {
    template: [tr.template, tr.templateDesc, tr.action_template],
    tracking: [tr.tracking, tr.trackingDesc, tr.action_tracking],
    pin: [tr.pin, tr.pinDesc, tr.action_pin],
    income: [tr.income, tr.incomeDesc, tr.action_income],
    expense: [tr.expense, tr.expenseDesc, tr.action_expense],
    budget: [tr.budget, tr.budgetDesc, tr.action_budget],
    household: [tr.household, tr.householdDesc, tr.action_household],
  }

  return (
    <GlassCard radius={18} style={{ padding: 16 }}>
      <section aria-labelledby="first-run-title" data-testid="first-run">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="first-run-title" style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>
              {tr.title} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-faint)', marginLeft: 6 }}>{tr.progress.replace('{done}', String(doneCount)).replace('{total}', String(required.length))}</span>
            </h2>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '2px 0 0' }}>{tr.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => { dismissFirstRun(user.id); setDismissed(true) }}
            aria-label={tr.dismiss} title={tr.dismiss}
            style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={doneCount} aria-label={tr.title}
          style={{ height: 4, borderRadius: 4, background: 'var(--aurora-gline)', overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${(doneCount / required.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--aurora-violet),var(--aurora-cyan))', transition: 'width .3s' }} />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {steps.map(s => {
            const Icon = ICONS[s.id]
            const [title, desc, cta] = label[s.id]
            return (
              <li key={s.id} data-step={s.id} data-done={s.done} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--aurora-gline)' }}>
                <div aria-hidden style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? 'rgba(52,211,153,0.16)' : 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)' }}>
                  {s.done ? <Check size={16} color="var(--aurora-emerald)" strokeWidth={2.5} /> : <Icon size={15} color="var(--aurora-lo)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: s.done ? 'var(--aurora-faint)' : 'var(--aurora-hi)', textDecoration: s.done ? 'line-through' : 'none' }}>
                    {title}{s.optional && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--aurora-faint)' }}> · {tr.optional}</span>}
                  </div>
                  {!s.done && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{desc}</div>}
                </div>
                {s.done ? (
                  <span className="sr-only">{tr.done}</span>
                ) : (
                  <button type="button" onClick={() => act(s.id)} aria-label={title}
                    style={{ minHeight: 36, padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600 }}>
                    {cta}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </GlassCard>
  )
}

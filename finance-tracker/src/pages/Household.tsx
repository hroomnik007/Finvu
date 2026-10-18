import { useState, useEffect, useCallback, useMemo } from 'react'
import { Copy, Check, Crown, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { MemberAvatar } from '../components/MemberAvatar'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { GlassCard } from '../components/GlassCard'
import { HeroCard } from '../components/HeroCard'
import { SharedCategoriesCard } from '../components/SharedCategoriesCard'
import type { SharedCategoryTile } from '../components/SharedCategoriesCard'
import { useAuth } from '../context/AuthContext'
import { useFormatters } from '../hooks/useFormatters'
import { useCategories } from '../hooks/useCategories'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation } from '../i18n'
import { getMyHousehold, getMonthlyStats, getActivity, leaveHousehold, regenerateInviteCode, removeHouseholdMember } from '../api/households'
import { getSummaryCards } from '../api/transactions'
import { shareCategories } from '../api/categories'
import type { HouseholdData, MonthlyStats, ActivityItem } from '../api/households'
import { parseDescription } from '../hooks/useFixedExpenses'

const CAT_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#A78BFA', '#F97316']

function timeAgo(iso: string, ht: { timeJustNow: string; timeMinutes: string; timeHours: string; timeYesterday: string; timeDays: string }): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 2) return ht.timeJustNow
  if (mins < 60) return ht.timeMinutes.replace('{n}', String(mins))
  if (hours < 24) return ht.timeHours.replace('{n}', String(hours))
  if (days === 1) return ht.timeYesterday
  return ht.timeDays.replace('{n}', String(days))
}

const ACTIVITY_INITIAL_LIMIT = 8

function dayLabel(iso: string, ht: { today: string; timeYesterday: string; timeDays: string }): string {
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(new Date(iso).getTime())) / 86400000)
  if (diffDays <= 0) return ht.today
  if (diffDays === 1) return ht.timeYesterday
  return ht.timeDays.replace('{n}', String(diffDays))
}

interface HouseholdPageProps {
  month: number
  year: number
  showToast?: (msg: string) => void
}

export function HouseholdPage({ month, year, showToast }: HouseholdPageProps) {
  const { user, refreshUser } = useAuth()
  const { formatAmount } = useFormatters()
  const { categories, reload: reloadCategories } = useCategories()
  const { t } = useTranslation()
  const { household: ht } = t

  const [householdData, setHouseholdData] = useState<HouseholdData | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [summaryCards, setSummaryCards] = useState<{ balance: number; income: number; expenses: number; savingsRate: number } | null>(null)
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [shareConfirmId, setShareConfirmId] = useState<string | null>(null)
  const toggleShare = async (id: string, shared: boolean) => {
    try {
      await shareCategories([id], shared)
      const name = categories.find(c => c.id === id)?.name ?? ''
      showToast?.((shared ? ht.sharedOnToast : ht.sharedOffToast).replace('{name}', name))
    } catch { /* the list below reflects the real state */ }
    await reloadCategories()
  }
  const [leavePending, setLeavePending] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [activityExpanded, setActivityExpanded] = useState(false)
  const [removePendingId, setRemovePendingId] = useState<string | null>(null)
  const [regeneratePending, setRegeneratePending] = useState(false)

  const householdEnabled = user?.household_enabled ?? false
  const householdId = user?.household_id ?? null

  const handleLeaveHousehold = async () => {
    setLeaveLoading(true)
    try {
      await leaveHousehold()
      localStorage.removeItem('finvu_dashboard_view')
      await refreshUser()
      setLeavePending(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg ?? ht.leaveError)
    } finally {
      setLeaveLoading(false)
    }
  }

  // Owner-only management: removing a member and retiring the invite code
  const isOwner = householdData?.members.find(m => m.id === user?.id)?.is_owner ?? false

  const handleRemoveMember = async (memberId: string) => {
    if (!householdId) return
    try {
      await removeHouseholdMember(householdId, memberId)
      setRemovePendingId(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg ?? ht.removeMemberError)
    }
  }

  const handleRegenerateCode = async () => {
    if (!householdId) return
    try {
      const { invite_code } = await regenerateInviteCode(householdId)
      setHouseholdData(prev => prev ? { ...prev, invite_code } : prev)
      setRegeneratePending(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg ?? ht.regenerateCodeError)
    }
  }

  const load = useCallback(async () => {
    if (!householdEnabled || !householdId) { setLoading(false); return }
    setLoading(true)
    try {
      const [hd, ms, activity, sc] = await Promise.all([
        getMyHousehold(),
        getMonthlyStats(householdId, month, year),
        getActivity(householdId, month, year, 20),
        // Same cumulative balance source as the Dashboard "Rodinné" Hero — the
        // balance carries across months instead of resetting each month.
        getSummaryCards(year, month, 'family').catch(() => null),
      ])
      setHouseholdData(hd)
      setStats(ms)
      setActivityFeed(activity)
      setSummaryCards(sc)
    } catch { /* not authenticated or no household */ }
    setLoading(false)
  }, [householdEnabled, householdId, month, year])

  useEffect(() => { load() }, [load])

  const handleCopy = () => {
    if (!householdData?.invite_code) return
    navigator.clipboard.writeText(householdData.invite_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const visibleActivity = activityExpanded ? activityFeed : activityFeed.slice(0, ACTIVITY_INITIAL_LIMIT)
  const activityGroups = useMemo(() => {
    const groups: { label: string; items: ActivityItem[] }[] = []
    for (const a of visibleActivity) {
      const label = dayLabel(a.created_at, ht)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(a)
      else groups.push({ label, items: [a] })
    }
    return groups
  }, [visibleActivity, ht])

  const totalIncome = stats?.total_income ?? 0
  const totalExpenses = stats?.total_expenses ?? 0
  // Zostatok sa kumuluje naprieč mesiacmi (rovnaká logika ako Dashboard Rodinné) —
  // fallback na mesačný rozdiel kým sa summary-cards nenačíta / pri chybe.
  const balance = summaryCards?.balance ?? (totalIncome - totalExpenses)
  // Miera úspory ostáva mesačná (príjmy − výdavky za daný mesiac), nezávisle od
  // kumulatívneho zostatku.
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0
  const memberCount = householdData?.members.length ?? 0
  const animatedBalance = useCountUp(balance, 800)

  // Every own expense category with the family's spend (paired by name, like the
  // household stats) split per member; shared ones first, most used first
  const categoryTiles = useMemo<SharedCategoryTile[]>(() => {
    const key = (n: string) => n.trim().toLowerCase()
    const tiles = categories
      .filter(c => c.type === 'expense' && c.id)
      .map(c => {
        const perMember = (stats?.per_member ?? [])
          .map(m => ({
            name: m.name,
            amount: m.category_breakdown.filter(b => key(b.name ?? '') === key(c.name)).reduce((sum, b) => sum + b.amount, 0),
          }))
          .filter(pm => pm.amount > 0)
        return {
          id: c.id!, name: c.name, icon: c.icon, color: c.color, shared: !!c.shared,
          limit: c.budgetLimit ?? 0, spent: perMember.reduce((sum, pm) => sum + pm.amount, 0), perMember,
        }
      })
    const used = (x: SharedCategoryTile) => (x.limit > 0 ? x.spent / x.limit : 0)
    return tiles.sort((x, y) => Number(y.shared) - Number(x.shared) || (x.shared ? used(y) - used(x) : x.name.localeCompare(y.name)))
  }, [stats, categories])

  if (!householdEnabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '64px 20px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={28} color="var(--aurora-faint)" />
        </div>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-faint)', maxWidth: 280 }}>{ht.notEnabled}</p>
        <button
          onClick={() => { window.location.hash = 'settings' }}
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-violet)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', padding: '8px 20px', borderRadius: 12, cursor: 'pointer' }}
        >
          {ht.enableInSettings}
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--aurora-gline)', borderTopColor: 'var(--aurora-violet)', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 'calc(116px + env(safe-area-inset-bottom, 0px))' }}>

      {/* ── Hero card ── */}
      <HeroCard variant="neutral">
        {/* Avatar stack top-right */}
        <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex' }}>
          {(householdData?.members ?? []).slice(0, 4).map((m, i) => (
            <div key={m.id} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i, borderRadius: '50%', border: '2px solid var(--aurora-bg)' }}>
              <MemberAvatar userId={m.id} userName={m.name} size={34} avatarUrl={m.avatar_url} />
            </div>
          ))}
          {memberCount > 4 && (
            <div style={{ marginLeft: -10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(139,92,246,0.25)', border: '2px solid var(--aurora-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif", fontSize: 10, fontWeight: 700, color: 'white', zIndex: 5 }}>
              +{memberCount - 4}
            </div>
          )}
        </div>

        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
          {ht.title} · Rodina {householdData?.name ?? ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{
              fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
              background: `linear-gradient(120deg, var(--aurora-hi), ${balance < 0 ? 'var(--aurora-rose)' : 'var(--aurora-cyan)'})`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              {balance >= 0 ? '+' : '−'}{Math.floor(Math.abs(animatedBalance)).toLocaleString('sk-SK')}
            </span>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
              ,{String(Math.round((Math.abs(animatedBalance) % 1) * 100)).padStart(2, '0')}&nbsp;€
            </span>
          </div>
          <span style={{
            marginLeft: 'auto', fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
            background: savingsRate >= 0 ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.15)',
            color: savingsRate >= 0 ? 'var(--aurora-emerald)' : 'var(--aurora-rose)',
            border: `1px solid ${savingsRate >= 0 ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.3)'}`,
          }}>
            {savingsRate >= 0 ? `+${savingsRate}% ${ht.savings}` : ht.inMinus}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{ht.totalIncomeStat}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-emerald)', wordBreak: 'break-word' }}>+{formatAmount(totalIncome)}</div>
          </div>
          <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{ht.totalExpensesStat}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-rose)', wordBreak: 'break-word' }}>−{formatAmount(totalExpenses)}</div>
          </div>
          <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{ht.membersCount}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{memberCount}</div>
          </div>
        </div>
      </HeroCard>

      {/* ── ČLENOVIA section header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--aurora-hi)', flexShrink: 0, margin: 0 }}>{ht.membersSection} ({memberCount})</p>
        {householdData && (
          leavePending ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{ht.confirmLeave}</span>
              <button
                onClick={() => setLeavePending(false)}
                style={{ padding: '5px 12px', borderRadius: 10, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-lo)', fontSize: 12, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >{t.common.cancel}</button>
              <button
                onClick={handleLeaveHousehold}
                disabled={leaveLoading}
                style={{ padding: '5px 12px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.1)', color: 'var(--aurora-rose)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", opacity: leaveLoading ? 0.6 : 1 }}
              >{leaveLoading ? '...' : ht.confirmBtn}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {householdData.invite_code && (
                <button
                  onClick={() => setInviteOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {ht.inviteMember}
                </button>
              )}
              <button
                onClick={() => setLeavePending(true)}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.3)', background: 'transparent', color: 'var(--aurora-rose)', fontSize: 13, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >{ht.leaveHousehold}</button>
            </div>
          )
        )}
      </div>

      {/* ── Member cards grid ── */}
      {householdData && (
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 14 }}>
          {householdData.members.map((m, mi) => {
            const memberStats = stats?.per_member.find(p => p.user_id === m.id)
            const inc = memberStats?.income ?? 0
            const exp = memberStats?.expenses ?? 0
            const bal = inc - exp
            const memberColor = CAT_COLORS[mi % CAT_COLORS.length]
            const catBreakdown = (memberStats?.category_breakdown ?? [])
              .filter(c => c.amount > 0)
              .sort((a, b) => b.amount - a.amount)
              .map((c, ci) => ({ name: c.name, val: c.amount, color: c.color ?? CAT_COLORS[ci % CAT_COLORS.length] }))
            return (
              <GlassCard key={m.id} radius={20}>
                {/* Avatar + name + role */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <MemberAvatar userId={m.id} userName={m.name} size={52} avatarUrl={m.avatar_url} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {m.is_owner ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: 'rgba(139,92,246,0.13)', color: 'var(--aurora-violet)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <Crown size={9} /> {ht.owner}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 99, background: 'var(--aurora-glass)', color: 'var(--aurora-faint)', border: '1px solid var(--aurora-gline)' }}>
                          {ht.member}
                        </span>
                      )}
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: memberColor, display: 'inline-block' }} />
                    </div>
                  </div>
                  {isOwner && m.id !== user?.id && (
                    removePendingId === m.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' }}>{ht.confirmRemoveMember}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleRemoveMember(m.id)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(251,113,133,0.4)', background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>{ht.confirmBtn}</button>
                          <button onClick={() => setRemovePendingId(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRemovePendingId(m.id)}
                        title={ht.removeMember}
                        aria-label={ht.removeMember}
                        style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-faint)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                      >{ht.removeMember}</button>
                    )
                  )}
                </div>

                {/* 3-col mini stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <div style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(52,211,153,0.08)', borderRadius: 10 }}>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9.5, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 2 }}>{ht.incomeStat}</p>
                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--aurora-emerald)' }}>+{formatAmount(inc)}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(251,113,133,0.08)', borderRadius: 10 }}>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9.5, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 2 }}>{ht.expensesStat}</p>
                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--aurora-rose)' }}>−{formatAmount(exp)}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 6px', background: 'rgba(139,92,246,0.08)', borderRadius: 10 }}>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 9.5, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 2 }}>{ht.balanceStat}</p>
                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 13, color: bal >= 0 ? 'var(--aurora-violet)' : 'var(--aurora-rose)' }}>
                      {bal >= 0 ? '+' : '−'}{formatAmount(Math.abs(bal))}
                    </p>
                  </div>
                </div>

                {/* Rozdelenie výdavkov */}
                {exp > 0 && (
                  <>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10.5, fontWeight: 600, color: 'var(--aurora-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>{ht.expenseBreakdown}</p>
                    <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                      {catBreakdown.map((c, j) => (
                        <div key={j} style={{ flex: c.val, background: c.color, transition: 'flex 0.7s' }} title={`${c.name}: ${formatAmount(c.val)}`} />
                      ))}
                    </div>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10.5, color: 'var(--aurora-faint)', margin: 0, lineHeight: 1.6 }}>
                      {catBreakdown.map((c, j) => {
                        const catTotal = catBreakdown.reduce((s, x) => s + x.val, 0)
                        return (
                          <span key={j}>
                            {j > 0 && ' · '}
                            {c.name} <span style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--aurora-lo)' }}>{catTotal > 0 ? Math.round((c.val / catTotal) * 100) : 0}%</span>
                          </span>
                        )
                      })}
                    </p>
                  </>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* ── Shared categories: family spend vs. the common limit, tiles to mark/unmark them ── */}
      {householdData && householdData.members.length > 1 && (
        <SharedCategoriesCard
          tiles={categoryTiles}
          onShare={id => setShareConfirmId(id)}
          onUnshare={id => void toggleShare(id, false)}
        />
      )}

      {/* ── Activity feed ── */}
      {activityFeed.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 }}>{ht.activityLabel}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'Manrope', sans-serif", fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(52,211,153,0.13)', color: 'var(--aurora-emerald)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--aurora-emerald)', animation: 'pulse-glow 1.5s ease-in-out infinite', display: 'inline-block' }} />
              Live
            </span>
          </div>
          {activityGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--aurora-faint)', margin: '0 0 8px' }}>{group.label}</p>
              <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 8 }}>
                {group.items.map((a, i) => {
                  const member = householdData?.members.find(m => m.id === a.created_by)
                  const name = a.created_by_name ?? member?.name ?? '?'
                  const isIncome = a.type === 'income'
                  const actionText = isIncome ? ht.addedIncome : ht.addedExpense
                  const description = parseDescription(a.description, 1).label || '—'
                  return (
                    <GlassCard key={`${gi}-${i}`} radius={16}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <MemberAvatar
                          userId={a.created_by ?? 'unknown'}
                          userName={name}
                          size={28}
                          avatarUrl={member?.avatar_url ?? null}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-hi)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600 }}>{name}</span>
                            <span style={{ color: 'var(--aurora-faint)' }}> {actionText} </span>
                            <span style={{ fontWeight: 500 }}>{description}</span>
                          </p>
                          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: 0 }}>{timeAgo(a.created_at, ht)}</p>
                        </div>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: isIncome ? 'var(--aurora-emerald)' : 'var(--aurora-rose)', flexShrink: 0 }}>
                          {isIncome ? '+' : '−'}{formatAmount(a.amount)}
                        </span>
                      </div>
                    </GlassCard>
                  )
                })}
              </div>
            </div>
          ))}
          {activityFeed.length > ACTIVITY_INITIAL_LIMIT && (
            <button
              onClick={() => setActivityExpanded(prev => !prev)}
              style={{ marginTop: 4, fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--aurora-violet)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
            >
              {activityExpanded ? ht.showLess : ht.showMore}
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={shareConfirmId !== null}
        message={t.expenses.categories.shareConfirm}
        neutral
        onConfirm={() => { const id = shareConfirmId; setShareConfirmId(null); if (id) void toggleShare(id, true) }}
        onCancel={() => setShareConfirmId(null)}
      />

      {/* ── Invite BottomSheet ── */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={ht.inviteMember}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', padding: '8px 0' }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-faint)', textAlign: 'center', lineHeight: 1.6 }}>
            {ht.inviteCodeDesc}
          </div>
          {householdData?.invite_code && (
            <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 8px 24px -8px rgba(139,92,246,0.35)' }}>
              <QRCodeSVG value={householdData.invite_code} size={200} level="M" />
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '2px', color: 'var(--aurora-faint)', marginBottom: 6 }}>
              {ht.inviteCode}
            </div>
            <code style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: 'var(--aurora-violet)', letterSpacing: '3px', fontSize: 18 }}>
              {householdData?.invite_code}
            </code>
          </div>
          <button
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 32px', borderRadius: 14, background: copied ? 'rgba(52,211,153,0.15)' : 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: copied ? 'var(--aurora-emerald)' : 'white', fontSize: 15, fontWeight: 600, border: copied ? '1px solid rgba(52,211,153,0.3)' : 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", transition: 'all 0.2s', width: '100%', justifyContent: 'center' }}
          >
            {copied ? <><Check size={16} /> {ht.copied}</> : <><Copy size={16} /> {ht.copyCodeBtn}</>}
          </button>
          {isOwner && (
            regeneratePending ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', textAlign: 'center' }}>{ht.confirmRegenerateCode}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleRegenerateCode} style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(251,113,133,0.4)', background: 'rgba(251,113,133,0.12)', color: 'var(--aurora-rose)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>{ht.confirmBtn}</button>
                  <button onClick={() => setRegeneratePending(false)} style={{ fontSize: 13, padding: '8px 18px', borderRadius: 10, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}>✕</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRegeneratePending(true)}
                style={{ background: 'transparent', border: 'none', color: 'var(--aurora-faint)', textDecoration: 'underline', fontSize: 13, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >{ht.regenerateCode}</button>
            )
          )}
        </div>
      </BottomSheet>
    </div>
  )
}

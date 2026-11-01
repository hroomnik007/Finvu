import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  X, Check, Pencil, ChevronRight, LogOut, Crown, KeyRound,
  Target, Flame, PiggyBank, BarChart3, Trophy, Zap, Users, Gem,
} from 'lucide-react'
import { useTranslation } from '../i18n'
import { formatDateLocale } from '../utils/format'
import { useFormatters } from '../hooks/useFormatters'
import { useModalA11y } from '../hooks/useModalA11y'
import { updateAvatar, updateUserSettings, updateProfile } from '../api/auth'
import { getTransactions } from '../api/transactions'
import { getSavingsGoals } from '../api/savings'
import { getAchievements, type AchievementState } from '../api/achievements'
import { ACHIEVEMENTS } from '../data/achievements'
import { AchievementDetailModal } from '../components/AchievementDetailModal'
import { GlassCard } from '../components/GlassCard'
import { useSettingsContext } from '../context/SettingsContext'
import { isPhotoUrl, avatarSrc, MONOGRAM_PREFIX, MONOGRAM_GRADIENTS, monogramGradientFor } from '../utils/avatar'
import { useAuth } from '../context/AuthContext'

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  first_transaction: Target,
  week_streak: Flame,
  first_savings_goal: PiggyBank,
  first_report: BarChart3,
  budget_met: Trophy,
  speedster: Zap,
  team_player: Users,
  veteran: Gem,
}

function AchievementsTab() {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)
  const [remoteState, setRemoteState] = useState<Map<string, AchievementState>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    getAchievements()
      .then(({ data }) => setRemoteState(new Map(data.map(a => [a.key, a]))))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const items = ACHIEVEMENTS.map(a => ({
    ...a,
    name: t.achievements.items[a.i18nKey].name,
    desc: t.achievements.items[a.i18nKey].desc,
    hint: t.achievements.items[a.i18nKey].hint,
    unlocked: remoteState.get(a.key)?.unlocked ?? false,
    unlockedAt: remoteState.get(a.key)?.unlockedAt ?? null,
  }))
  const unlockedCount = items.filter(a => a.unlocked).length
  const countLabel = t.achievements.countLabel.replace('{unlocked}', String(unlockedCount)).replace('{total}', String(ACHIEVEMENTS.length))

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t.profile.achievementsUnlocked} ({countLabel})</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: loaded ? 1 : 0.5, transition: 'opacity 0.2s' }}>
        {items.map((a, i) => {
          const Icon = ACHIEVEMENT_ICONS[a.key] ?? Target
          return (
          <GlassCard
            key={i}
            radius={16}
            onClick={() => setSelected(i)}
            style={{
              border: a.unlocked ? `1px solid ${a.color}40` : '1px solid var(--aurora-gline)',
              opacity: a.unlocked ? 1 : 0.45,
              cursor: 'pointer',
              position: 'relative',
              transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s',
              transform: hovered === i ? 'scale(1.02)' : 'scale(1)',
              boxShadow: hovered === i && a.unlocked ? '0 0 0 1px rgba(139,92,246,0.4), 0 4px 16px rgba(139,92,246,0.15)' : 'none',
            }}
          >
            <div onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ display: 'contents' }}>
            {hovered === i && a.unlocked && (
              <span style={{ position: 'absolute', top: 7, right: 9, fontSize: 12, userSelect: 'none', lineHeight: 1, animation: 'sparkle 0.3s ease' }}>✨</span>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: a.unlocked ? `${a.color}20` : 'var(--aurora-glass)', border: a.unlocked ? `1px solid ${a.color}30` : '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} color={a.unlocked ? a.color : 'var(--aurora-faint)'} strokeWidth={2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 1 }}>{a.desc}</div>
              </div>
            </div>
            </div>
          </GlassCard>
          )
        })}
      </div>

      {selected !== null && (
        <AchievementDetailModal
          emoji={items[selected].emoji}
          color={items[selected].color}
          name={items[selected].name}
          desc={items[selected].desc}
          hint={items[selected].hint}
          unlocked={items[selected].unlocked}
          unlockedAt={items[selected].unlockedAt}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}


type Tab = 'profile' | 'account' | 'achievements'

const COUNTRY_OPTIONS = [
  { code: 'SK', flag: '🇸🇰' },
  { code: 'CZ', flag: '🇨🇿' },
  { code: 'HU', flag: '🇭🇺' },
  { code: 'PL', flag: '🇵🇱' },
  { code: 'GB', flag: '🇬🇧' },
]

export function ProfileModal({ onClose, onLogout }: { onClose: () => void; onLogout?: () => void }) {
  const { profileName: ctxName, profileAvatar: ctxAvatar, setProfile } = useSettingsContext()
  const { user, refreshUser } = useAuth()
  const { t, locale } = useTranslation()
  const { formatNumber, currency } = useFormatters()
  const formatMoneyRounded = (n: number) => formatNumber(n, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const regionName = (code: string) => {
    try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code } catch { return code }
  }

  const [tab, setTab] = useState<Tab>('profile')
  const [editMode, setEditMode] = useState(false)
  const [profileNameDraft, setProfileNameDraft] = useState(user?.name || ctxName)
  const [profileAvatarDraft, setProfileAvatarDraft] = useState(() => {
    if (user?.avatarUrl && !isPhotoUrl(user.avatarUrl)) return user.avatarUrl
    return ctxAvatar
  })
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    isPhotoUrl(user?.avatarUrl) ? user!.avatarUrl! : null
  )
  const [photoUploading, setPhotoUploading] = useState(false)

  const [txnCount, setTxnCount] = useState<number | null>(null)
  const [savingsTotal, setSavingsTotal] = useState<number | null>(null)

  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [defaultPageDraft, setDefaultPageDraft] = useState<string>(user?.defaultPage ?? 'dashboard')
  const [defaultPageSaveOk, setDefaultPageSaveOk] = useState(false)
  const [country, setCountry] = useState(user?.country ?? 'SK')

  useEffect(() => {
    getTransactions({ limit: 1 }).then(({ total }) => setTxnCount(total)).catch(() => {})
  }, [])

  useEffect(() => {
    getSavingsGoals().then(({ data }) => {
      setSavingsTotal(data.length === 0 ? null : data.reduce((s, g) => s + g.savedAmount, 0))
    }).catch(() => {})
  }, [])

  const profileModal = useModalA11y({ open: true, onClose })
  const logoutModal = useModalA11y({ open: logoutConfirm, onClose: () => setLogoutConfirm(false), role: 'alertdialog' })

  async function handleSaveProfile() {
    setProfile(profileNameDraft, profileAvatarDraft)
    if (!photoUrl && profileAvatarDraft && !isPhotoUrl(profileAvatarDraft)) {
      try {
        await updateAvatar(profileAvatarDraft)
        await refreshUser()
      } catch { /* non-critical */ }
    }
  }

  function handlePhotoUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        alert(t.profile.photoTooBig)
        return
      }
      setPhotoUploading(true)
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string
        try {
          await updateAvatar(base64)
          setPhotoUrl(base64)
          setProfileAvatarDraft('')
          await refreshUser()
        } catch {
          alert(t.profile.photoUploadFailed)
        } finally {
          setPhotoUploading(false)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const trackingDays = user?.tracking_start_date
    ? Math.floor((Date.now() - new Date(user.tracking_start_date).getTime()) / 86400000)
    : null

  const initial = (user?.name || ctxName)?.[0]?.toUpperCase() ?? '?'
  const avatarMonogram = !photoUrl
    ? monogramGradientFor(user?.avatarUrl && !isPhotoUrl(user.avatarUrl) ? user.avatarUrl : profileAvatarDraft)
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        ref={profileModal.panelRef} {...profileModal.dialogProps}
        style={{
          outline: 'none',
          borderRadius: 22,
          overflow: 'hidden',
          background: 'var(--aurora-bg-image)',
          border: '1px solid var(--aurora-gline)',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero header ── */}
        <div style={{
          background: 'var(--aurora-glass)',
          padding: '28px 24px 0',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '22px 22px 0 0',
          flexShrink: 0,
        }}>
          {/* Atmosphere blobs */}
          <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: 'var(--aurora-blob-opacity)', zIndex: 0, width: 180, height: 180, background: 'var(--aurora-violet)', top: -70, left: -50 }} />
          <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(40px)', opacity: 'var(--aurora-blob-opacity)', zIndex: 0, width: 150, height: 150, background: 'var(--aurora-fuchsia)', top: -40, right: -40 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg,transparent 30%,var(--aurora-glass) 50%,transparent 70%)', pointerEvents: 'none' }} />

          {/* Close button */}
          <button type="button" className="hit-44" aria-label={t.common.close} title={t.common.close}
            onClick={onClose}
            style={{ position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
          >
            <X size={16} />
          </button>

          {/* Avatar + name block — horizontal */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar — LEFT */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: photoUrl ? 'transparent' : avatarMonogram ? `linear-gradient(135deg,${avatarMonogram[0]},${avatarMonogram[1]})` : 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px var(--aurora-bg), 0 6px 20px rgba(58,42,130,0.5)', cursor: 'pointer', opacity: photoUploading ? 0.6 : 1 }}
                onClick={handlePhotoUpload}
              >
                {photoUrl ? (
                  <img src={avatarSrc(photoUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                ) : avatarMonogram ? (
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 26, fontFamily: "'Outfit', sans-serif" }}>{initial}</span>
                ) : user?.avatarUrl && !isPhotoUrl(user.avatarUrl) ? (
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{user.avatarUrl}</span>
                ) : profileAvatarDraft && !isPhotoUrl(profileAvatarDraft) ? (
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{profileAvatarDraft}</span>
                ) : (
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 26, fontFamily: "'Outfit', sans-serif" }}>{initial}</span>
                )}
              </div>
              <div
                style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: 'var(--aurora-panel)', border: '2px solid var(--aurora-fuchsia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', cursor: 'pointer' }}
                onClick={handlePhotoUpload}
              >
                <Pencil size={10} style={{ color: 'var(--aurora-hi)' }} />
              </div>
            </div>

            {/* Name + email + badges — RIGHT */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {editMode ? (
                  <input
                    value={profileNameDraft}
                    data-keep-font
                    aria-label={t.auth.nameLabel}
                    autoComplete="name"
                    autoFocus
                    onChange={e => setProfileNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleSaveProfile(); setEditMode(false) } }}
                    style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 8, padding: '4px 10px', color: 'var(--aurora-hi)', fontSize: 18, fontWeight: 700, outline: 'none', width: '100%', fontFamily: "'Outfit', sans-serif" }}
                  />
                ) : (
                  <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0, letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || ctxName || t.profile.defaultUser}
                  </h2>
                )}
                <button
                  onClick={() => { if (editMode) { handleSaveProfile(); setEditMode(false) } else setEditMode(true) }}
                  style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--aurora-lo)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  {editMode ? <Check size={13} style={{ color: 'var(--aurora-emerald)' }} /> : <Pencil size={13} />}
                </button>
              </div>
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12.5, color: 'var(--aurora-lo)', margin: 0 }}>{user?.email}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(251,191,36,0.18)', color: '#fde68a', border: '1px solid rgba(251,191,36,0.3)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 3 }}><Crown size={10} /> Pro</span>
                {user?.createdAt && (
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{t.profile.memberSince.replace('{date}', formatDateLocale(user.createdAt, locale, { month: 'long', year: 'numeric' }))}</span>
                )}
              </div>
            </div>
          </div>

          {/* Horizontal monogram avatar picker strip */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
            {MONOGRAM_GRADIENTS.map(([key, [c1, c2]]) => {
              const value = MONOGRAM_PREFIX + key
              const active = !photoUrl && (profileAvatarDraft ? profileAvatarDraft === value : user?.avatarUrl === value)
              return (
                <button
                  key={key}
                  onClick={async () => {
                    setProfileAvatarDraft(value)
                    setPhotoUrl(null)
                    try { await updateAvatar(value); await refreshUser() } catch { /* non-critical */ }
                  }}
                  style={{
                    position: 'relative', flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
                    overflow: 'hidden',
                    background: `color-mix(in srgb, ${c1} 18%, var(--aurora-bg))`,
                    border: active ? '2px solid var(--aurora-hi)' : '1px solid var(--aurora-gline)',
                    boxShadow: active ? '0 0 0 3px rgba(139,92,246,.25)' : 'none',
                    cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{ position: 'absolute', width: 26, height: 26, borderRadius: '50%', background: c1, filter: 'blur(8px)', top: -5, left: -5 }} />
                  <div style={{ position: 'absolute', width: 20, height: 20, borderRadius: '50%', background: c2, filter: 'blur(8px)', bottom: -6, right: -4 }} />
                  <span style={{ position: 'relative', zIndex: 2, color: 'white', fontWeight: 700, fontSize: 13, fontFamily: "'Outfit', sans-serif", textShadow: '0 1px 3px rgba(0,0,0,.25)' }}>{initial}</span>
                </button>
              )
            })}
          </div>

          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderTop: '1px solid var(--aurora-gline)', background: 'rgba(0,0,0,0.15)' }}>
            {[
              { label: t.profile.transactionsStat, value: txnCount !== null ? String(txnCount) : '—', color: 'var(--aurora-hi)', icon: null },
              { label: t.profile.savingsStat, value: savingsTotal !== null ? formatMoneyRounded(savingsTotal) : '—', color: 'var(--aurora-emerald)', icon: null },
              { label: t.profile.streakStat, value: String(user?.currentStreak ?? 0), color: '#FB923C', icon: Flame },
              { label: t.profile.trackingStat, value: trackingDays !== null ? `${trackingDays} ${t.profile.days}` : '—', color: 'var(--aurora-violet-text)', icon: null },
            ].map((stat, i) => (
              <div key={i} style={{ padding: '12px 8px', textAlign: 'center', borderLeft: i > 0 ? '1px solid var(--aurora-gline)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: stat.color, marginBottom: 2 }}>
                  {stat.value}{stat.icon && <stat.icon size={11} color={stat.color} fill={stat.color} />}
                </div>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 0 12px' }}>
            {(['profile', 'account', 'achievements'] as const).map((tabKey) => {
              const labels: Record<Tab, string> = { profile: t.profile.tabProfile, account: t.profile.tabAccount, achievements: t.profile.tabAchievements }
              const isActive = tab === tabKey
              return (
                <button
                  key={tabKey}
                  onClick={() => { setTab(tabKey); setEditMode(false) }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 12,
                    background: isActive ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'var(--aurora-glass)',
                    border: isActive ? '1px solid transparent' : '1px solid var(--aurora-gline)',
                    color: isActive ? '#fff' : 'var(--aurora-lo)',
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {labels[tabKey]}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── Tab: Profil ── */}
          {tab === 'profile' && (
            <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* OSOBNÉ ÚDAJE section */}
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-faint)', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>{t.profile.personalData}</div>
                <GlassCard radius={14} style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Meno row */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid var(--aurora-gline)' }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', width: 80, flexShrink: 0 }}>{t.settings.name}</span>
                    {editMode ? (
                      <input
                        type="text"
                        value={profileNameDraft}
                        onChange={e => setProfileNameDraft(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { handleSaveProfile(); setEditMode(false) } }}
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', fontFamily: 'inherit', padding: 0 }}
                      />
                    ) : (
                      <span style={{ flex: 1, fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)' }}>{user?.name || ctxName || '—'}</span>
                    )}
                    <button
                      onClick={() => { if (editMode) { handleSaveProfile(); setEditMode(false) } else setEditMode(true) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: editMode ? 'var(--aurora-emerald)' : 'var(--aurora-faint)', padding: 4, display: 'flex', alignItems: 'center' }}
                    >
                      {editMode ? <Check size={14} /> : <Pencil size={13} />}
                    </button>
                  </div>
                  {/* Email row */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid var(--aurora-gline)' }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', width: 80, flexShrink: 0 }}>{t.auth.email}</span>
                    <span style={{ flex: 1, fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? '—'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', color: 'var(--aurora-emerald)', border: '1px solid rgba(52,211,153,0.25)', letterSpacing: '0.06em', flexShrink: 0, marginLeft: 6 }}>VERIF.</span>
                  </div>
                  {/* Krajina row */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px' }}>
                    <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', width: 80, flexShrink: 0 }}>{t.profile.country}</span>
                    <select
                      value={country}
                      onChange={async e => {
                        const val = e.target.value
                        setCountry(val)
                        try { await updateProfile({ country: val }); await refreshUser() } catch { /* non-critical */ }
                      }}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', fontFamily: 'inherit', padding: 0, cursor: 'pointer', appearance: 'none' as const }}
                    >
                      {COUNTRY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {regionName(c.code)}</option>
                      ))}
                    </select>
                  </div>
                </GlassCard>
              </div>

              {/* PREDVOLENÁ STRÁNKA */}
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-faint)', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>{t.profile.defaultPage}</div>
                <select
                  value={defaultPageDraft}
                  onChange={e => setDefaultPageDraft(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope',sans-serif", outline: 'none', cursor: 'pointer' }}
                >
                  <option value="dashboard">{t.nav.overview}</option>
                  <option value="income">{t.nav.income}</option>
                  <option value="variable-expenses">{t.expenses.variable.title}</option>
                  <option value="fixed-expenses">{t.expenses.fixed.title}</option>
                  <option value="categories">{t.nav.categories}</option>
                  <option value="savings">{t.nav.savings}</option>
                </select>
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {defaultPageSaveOk ? (
                  <div style={{ flex: 2, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'var(--aurora-emerald)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                    <Check size={15} /> {t.profile.saved}
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await updateUserSettings({ defaultPage: defaultPageDraft })
                        setDefaultPageSaveOk(true)
                        setTimeout(() => setDefaultPageSaveOk(false), 2000)
                      } catch { /* non-critical */ }
                    }}
                    style={{ flex: 2, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'white', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {t.profile.saveChanges}
                  </button>
                )}
                {onLogout && (
                  <button
                    onClick={() => setLogoutConfirm(true)}
                    style={{ flex: 1, height: 44, justifyContent: 'center', display: 'flex', alignItems: 'center', borderRadius: 10, fontSize: 13, fontWeight: 500, gap: 6, background: 'transparent', border: '1px solid rgba(251,113,133,0.3)', color: 'var(--aurora-rose)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                  >
                    <LogOut size={14} strokeWidth={2} />
                    {t.auth.logout}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Účet ── */}
          {tab === 'account' && (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Plan card */}
              <GlassCard radius={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,215,100,0.15)', border: '1px solid rgba(255,215,100,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Crown size={19} color="#fde68a" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>Finvu Pro</div>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>
                    {user?.createdAt ? t.profile.memberSince.replace('{date}', formatDateLocale(user.createdAt, locale, { month: 'long', year: 'numeric' })) : t.profile.allFeaturesUnlocked}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,215,100,0.15)', color: '#fde68a', border: '1px solid rgba(255,215,100,0.3)', letterSpacing: '0.06em', flexShrink: 0 }}>{t.profile.active.toUpperCase()}</span>
              </GlassCard>

              {/* BEZPEČNOSŤ */}
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-faint)', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>{t.profile.security}</div>
                <GlassCard radius={14} style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Single entry point — password & PIN live in Nastavenia → Bezpečnosť */}
                  <button
                    onClick={() => { localStorage.setItem('settings_open_section', 'security'); window.location.hash = 'settings'; onClose() }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--aurora-hover)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><KeyRound size={17} color="var(--aurora-violet)" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)' }}>{t.profile.security}</div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 1 }}>{t.profile.passwordProtection}</div>
                    </div>
                    <ChevronRight size={15} style={{ color: 'var(--aurora-faint)', flexShrink: 0 }} />
                  </button>
                </GlassCard>
              </div>

              {/* Export data */}
              <button
                onClick={() => { localStorage.setItem('settings_open_section', 'data'); window.location.hash = 'settings'; onClose() }}
                style={{ width: '100%', height: 44, borderRadius: 12, fontSize: 13, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              >
                {t.profile.exportData}
              </button>
            </div>
          )}

          {/* ── Tab: Úspechy ── */}
          {tab === 'achievements' && (
            <AchievementsTab />
          )}

        </div>
      </div>

      {/* ── Logout confirm ── */}
      {logoutConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={() => setLogoutConfirm(false)}
        >
          <div
            ref={logoutModal.panelRef} {...logoutModal.dialogProps}
            style={{ outline: 'none', background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 340 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <LogOut size={22} color="var(--aurora-violet)" />
            </div>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)', textAlign: 'center', margin: '0 0 8px' }}>
              {t.profile.logoutTitle}
            </h3>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, color: 'var(--aurora-faint)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.5 }}>
              {t.profile.logoutRedirect}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setLogoutConfirm(false)}
                style={{ flex: 1, height: 48, borderRadius: 14, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => { setLogoutConfirm(false); onLogout?.() }}
                style={{ flex: 1, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
              >
                {t.auth.logout}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

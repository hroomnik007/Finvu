import { useState, useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  X, Palette, Bell, Shield, Database, User, Monitor, Laptop, Smartphone, Tablet,
  CalendarClock, Users, PiggyBank, KeyRound, Hash, ChevronRight, Check, Sun, Moon, SunMoon,
  AlertTriangle, Trash2, RotateCcw, UserX, Ban, ArrowLeft,
} from 'lucide-react'
import { CsvImportModal } from '../components/CsvImportModal'
import { GlassCard } from '../components/GlassCard'
import { getNotificationsEnabled, setNotificationsEnabled } from '../hooks/useFixedExpenseNotifications'
import { updateWeeklyEmail, updateUserSettings, changePassword, getSessions, deleteSessionById, deactivateAccount as apiDeactivateAccount, getPinDevices, deletePinDevice } from '../api/auth'
import type { PinDevice } from '../api/auth'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PasskeySection } from '../components/PasskeySection'
import { parseUserAgent } from '../utils/parseUserAgent'
import { getTransactions, deleteTransaction } from '../api/transactions'
import type { TransactionParams } from '../api/transactions'
import { getCategories } from '../api/categories'
import { createHousehold, joinHousehold, toggleHousehold } from '../api/households'
import {
  resolveTheme, applyAccentColor, applyBackgroundColor, bgColorStorageKey, defaultBgColor,
  DEFAULT_ACCENT_COLOR, type ResolvedTheme,
} from '../utils/theme'
import { useSettingsContext } from '../context/SettingsContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { SettingsDropdown } from '../components/SettingsDropdown'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { usePinLockContext } from '../context/PinLockContext'
import { PinSetupModal } from '../components/PinSetupModal'
import { PinKeypad } from '../components/PinKeypad'
import { ExportDataModal } from '../components/ExportDataModal'
import type { ExportFormat, ExportPeriod } from '../components/ExportDataModal'
import type { ApiTransaction, UserSession } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: 'EUR', label: '€ Euro' },
  { value: 'USD', label: '$ US Dollar' },
  { value: 'GBP', label: '£ Libra' },
  { value: 'CZK', label: 'Kč Česká koruna' },
  { value: 'HUF', label: 'Ft Forint' },
  { value: 'PLN', label: 'zł Złoty' },
]

const DATE_FORMATS = [
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
]

const ACCENT_COLORS = [
  { name: 'Violet', value: '#7C3AED' },
  { name: 'Modrá', value: '#3B82F6' },
  { name: 'Zelená', value: '#10B981' },
  { name: 'Oranžová', value: '#F59E0B' },
  { name: 'Ružová', value: '#EC4899' },
  { name: 'Červená', value: '#EF4444' },
]

// Revolut-style page background tints — separate palette per theme since a
// color tuned for a dark page reads muddy/washed-out on a light one. Each
// dark-mode value is the corner "glow" color of a radial gradient (see
// utils/theme.ts backgroundImage()); hex values measured from the Revolut
// reference screenshots.
const BACKGROUND_COLORS_DARK = [
  { name: 'Navy', value: '#002041' },
  { name: 'Rust', value: '#411800' },
  { name: 'Forest', value: '#0B342E' },
  { name: 'Teal', value: '#003541' },
  { name: 'Violet', value: '#24132D' },
  { name: 'Black', value: '#000000' },
]

const BACKGROUND_COLORS_LIGHT = [
  { name: 'Sky', value: '#DAEAFA' },
  { name: 'Peach', value: '#FAE7DC' },
  { name: 'Mint', value: '#C3DCD7' },
  { name: 'Teal', value: '#D7EFF4' },
  { name: 'Lavender', value: '#F6F1FB' },
  { name: 'Cream', value: '#F7F7F7' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <GlassCard radius={18} style={{ padding: 0, overflow: 'hidden' }}>
      {children}
    </GlassCard>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div style={{ borderBottom: '1px solid var(--aurora-gline)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={13} color="var(--aurora-hi)" />
      <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--aurora-hi)', fontWeight: 700, margin: 0 }}>
        {label}
      </p>
    </div>
  )
}

function SettingRow({ label, sublabel, children }: { label: string; sublabel?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="settings-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8, gap: 16, padding: '13px 20px' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--aurora-hi)', margin: 0 }}>{label}</p>
        {sublabel && <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>{sublabel}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

// Desktop-only cell for the 2-column settings grids — uppercase label above,
// control sits inside a darker sunken box so cells read as compact, aligned units.
function CompactSettingCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--aurora-faint)', margin: 0 }}>{label}</p>
      <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid var(--aurora-gline)', borderRadius: 8, padding: '10px 12px' }}>{children}</div>
    </div>
  )
}

function ChevronRow({ icon: Icon, iconColor, iconBg, label, sublabel, onClick }: {
  icon: LucideIcon; iconColor: string; iconBg: string; label: string; sublabel?: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--aurora-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--aurora-hi)' }}>{label}</div>
        {sublabel && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>{sublabel}</div>}
      </div>
      <ChevronRight size={16} style={{ color: 'var(--aurora-faint)', flexShrink: 0 }} />
    </button>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-12 h-[26px] rounded-full transition-all duration-200 relative flex-shrink-0 ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{
        background: checked ? 'var(--accent-color)' : 'var(--toggle-inactive)',
      }}
    >
      <div
        className={`absolute top-[3px] left-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function fetchAllTransactions(params: Omit<TransactionParams, 'limit' | 'offset'>): Promise<ApiTransaction[]> {
  const all: ApiTransaction[] = []
  let offset = 0
  while (true) {
    const { data } = await getTransactions({ ...params, limit: 200, offset })
    all.push(...data)
    if (data.length < 200) break
    offset += 200
  }
  return all
}

// Shared by CSV/PDF/XLSX export so all three formats agree on what "the
// selected period" means.
async function fetchTransactionsInRange(fromISO: string, toISO: string): Promise<ApiTransaction[]> {
  const all = await fetchAllTransactions({})
  return all.filter(t => t.date >= fromISO && t.date <= toISO)
}

function loadLocalPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveLocalPref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

type DangerAction = 'transactions' | 'reset'

type SettingsSection = 'appearance' | 'finance' | 'notifications' | 'security' | 'data'

const SECTIONS = [
  { id: 'appearance' as SettingsSection, label: 'Vzhľad', icon: Palette },
  { id: 'finance' as SettingsSection, label: 'Financie', icon: User },
  { id: 'notifications' as SettingsSection, label: 'Notifikácie', icon: Bell },
  { id: 'security' as SettingsSection, label: 'Bezpečnosť', icon: Shield },
  { id: 'data' as SettingsSection, label: 'Dáta', icon: Database },
] as const

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { settings, updateSettings } = useSettingsContext()
  const { t } = useTranslation()
  const { deleteAccount, user, updateMonthlyEmail, refreshUser, logout } = useAuth()
  const { setupPin, hasPin, removePin } = usePinLockContext()

  const compactStorageKey = window.innerWidth < 768 ? 'finvu_compact_mobile' : 'finvu_compact_desktop'
  const compactDefault = window.innerWidth < 768

  const securityRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLDivElement>(null)

  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  // Mobile-only drill-down level: 'list' shows the category rows, 'detail'
  // shows the selected category's content. Desktop ignores this entirely
  // and always shows the sidebar + content layout.
  const [mobileLevel, setMobileLevel] = useState<'list' | 'detail'>('list')

  // Mobile drill-down participates in the browser history stack so a hardware
  // / swipe "back" from a sub-page returns to the section list instead of
  // skipping a whole level out of Settings. Drilling in pushes one same-hash
  // history entry (App.tsx routes on `hashchange`, which a same-hash push does
  // not fire, so the page itself stays put); back / popstate consumes it.
  const detailPushedRef = useRef(false)

  function openMobileSection(id: SettingsSection) {
    setActiveSection(id)
    setMobileLevel('detail')
    if (!detailPushedRef.current) {
      window.history.pushState({ finvuSettingsDetail: true }, '')
      detailPushedRef.current = true
    }
  }

  function backToSectionList() {
    if (detailPushedRef.current) {
      // Pop the entry we pushed; the popstate handler resets mobileLevel.
      window.history.back()
    } else {
      setMobileLevel('list')
    }
  }

  useEffect(() => {
    function onPopState() {
      if (detailPushedRef.current) {
        detailPushedRef.current = false
        setMobileLevel('list')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Apply saved appearance preferences on mount + navigate to section
  useEffect(() => {
    const savedAccent = loadLocalPref<string>('accent_color', DEFAULT_ACCENT_COLOR)
    const savedCompact = loadLocalPref<boolean>(compactStorageKey, compactDefault)
    const html = document.documentElement
    applyAccentColor(savedAccent)
    html.classList.toggle('compact', savedCompact)

    const section = localStorage.getItem('settings_open_section')
    if (section) {
      localStorage.removeItem('settings_open_section')
      if (section === 'security') { openMobileSection('security') }
      else if (section === 'data') { openMobileSection('data') }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Section 2: Appearance ─────────────────────────────────────────────────
  // theme_preference is stored as a raw string (not JSON-encoded) since
  // App.tsx's pre-render init script and Topbar both read/write it that way.
  const [theme, setThemeState] = useState<'dark' | 'light' | 'system'>(() =>
    (localStorage.getItem('theme_preference') as 'dark' | 'light' | 'system' | null) ?? 'dark'
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const pref = (localStorage.getItem('theme_preference') as 'dark' | 'light' | 'system' | null) ?? 'dark'
      setThemeState(pref)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const [accentColor, setAccentColorState] = useState<string>(() =>
    loadLocalPref<string>('accent_color', DEFAULT_ACCENT_COLOR)
  )
  const [compactMode, setCompactModeState] = useState<boolean>(() =>
    loadLocalPref<boolean>(compactStorageKey, compactDefault)
  )

  // Resolved (dark/light) appearance the background picker should show —
  // 'system' has no swatches of its own, it just mirrors whichever the OS
  // currently resolves to.
  const resolvedTheme: ResolvedTheme = resolveTheme(theme)
  const [backgroundColor, setBackgroundColorState] = useState<string>(() =>
    loadLocalPref<string>(bgColorStorageKey(resolvedTheme), defaultBgColor(resolvedTheme))
  )

  // Keep the displayed swatch selection in sync when the resolved theme
  // changes (e.g. user flips Dark/Light, or OS theme changes under 'system').
  useEffect(() => {
    setBackgroundColorState(loadLocalPref<string>(bgColorStorageKey(resolvedTheme), defaultBgColor(resolvedTheme)))
  }, [resolvedTheme])

  function handleThemeChange(next: 'dark' | 'light' | 'system') {
    setThemeState(next)
    localStorage.setItem('theme_preference', next)
    const html = document.documentElement
    html.setAttribute('data-theme', resolveTheme(next))
    updateUserSettings({ theme: next }).catch(() => { /* non-critical */ })
  }

  function handleAccentChange(color: string) {
    setAccentColorState(color)
    saveLocalPref('accent_color', color)
    applyAccentColor(color)
  }

  function handleBackgroundChange(color: string) {
    setBackgroundColorState(color)
    saveLocalPref(bgColorStorageKey(resolvedTheme), color)
    applyBackgroundColor(color, resolvedTheme)
  }

  function handleCompactToggle() {
    const next = !compactMode
    setCompactModeState(next)
    saveLocalPref(compactStorageKey, next)
    document.documentElement.classList.toggle('compact', next)
  }

  // ── Security section ─────────────────────────────────────────────────────
  const [pinSetupOpen, setPinSetupOpen] = useState(false)
  const [pinRemoveOpen, setPinRemoveOpen] = useState(false)
  const [pinRemoveInput, setPinRemoveInput] = useState('')
  const [pinRemoveError, setPinRemoveError] = useState<string | null>(null)
  const [pinRemoveLoading, setPinRemoveLoading] = useState(false)
  const [pinRemoveShake, setPinRemoveShake] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [changePwLoading, setChangePwLoading] = useState(false)
  const [changePwError, setChangePwError] = useState<string | null>(null)
  const [changePwOk, setChangePwOk] = useState(false)

  // Auto lock
  const [autoLockMinutes, setAutoLockMinutes] = useState<number | null>(() => user?.auto_lock_minutes ?? null)
  const [autoLockSaving, setAutoLockSaving] = useState(false)

  async function handleAutoLockChange(val: number | null) {
    setAutoLockMinutes(val)
    setAutoLockSaving(true)
    try {
      await updateUserSettings({ autoLockMinutes: val })
      await refreshUser()
    } finally {
      setAutoLockSaving(false)
    }
  }

  // Sessions
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionDeletingId, setSessionDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (activeSection !== 'security') return
    setSessionsLoading(true)
    getSessions().then(setSessions).catch(() => {}).finally(() => setSessionsLoading(false))
  }, [activeSection])

  async function handleDeleteSession(id: string) {
    setSessionDeletingId(id)
    try {
      await deleteSessionById(id)
      setSessions(prev => prev.filter(s => s.id !== id))
    } catch { /* ignore */ }
    finally { setSessionDeletingId(null) }
  }

  // PIN devices ("PIN rýchly prístup")
  const [pinDevices, setPinDevices] = useState<PinDevice[]>([])
  const [pinDevicesLoading, setPinDevicesLoading] = useState(false)
  const [pinDeviceDeletingId, setPinDeviceDeletingId] = useState<string | null>(null)
  const [pinDeviceConfirmId, setPinDeviceConfirmId] = useState<string | null>(null)

  useEffect(() => {
    if (activeSection !== 'security' || !hasPin) return
    setPinDevicesLoading(true)
    getPinDevices().then(setPinDevices).catch(() => {}).finally(() => setPinDevicesLoading(false))
  }, [activeSection, hasPin])

  async function handleRevokePinDevice(id: string) {
    setPinDeviceDeletingId(id)
    try {
      await deletePinDevice(id)
      setPinDevices(prev => prev.filter(d => d.id !== id))
    } catch { /* ignore */ }
    finally { setPinDeviceDeletingId(null); setPinDeviceConfirmId(null) }
  }

  // Revoking the device you're currently signed in on needs an extra warning
  // — it silently kills PIN login for this exact browser.
  function requestRevokePinDevice(device: PinDevice) {
    if (device.isCurrentDevice) { setPinDeviceConfirmId(device.id); return }
    void handleRevokePinDevice(device.id)
  }

  // Deactivate account
  const [deactivateConfirm, setDeactivateConfirm] = useState('')
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  async function handleChangePassword() {
    setChangePwError(null)
    if (!currentPw || !newPw || !confirmPw) { setChangePwError(t.profile.fillAllFields); return }
    if (newPw.length < 8) { setChangePwError(t.profile.passwordMin8); return }
    if (newPw !== confirmPw) { setChangePwError(t.settings.passwordMismatch); return }
    setChangePwLoading(true)
    try {
      await changePassword(currentPw, newPw)
      setChangePwOk(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setChangePwOk(false); setChangePwOpen(false) }, 2000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setChangePwError(msg ?? t.profile.changePwFailed)
    } finally {
      setChangePwLoading(false)
    }
  }

  async function handlePinRemoveKey(k: string) {
    if (pinRemoveLoading) return
    if (k === 'backspace') { setPinRemoveInput(p => p.slice(0, -1)); return }
    if (pinRemoveInput.length >= 4) return
    const next = pinRemoveInput + k
    setPinRemoveInput(next)
    if (next.length === 4) {
      setPinRemoveLoading(true)
      // removePin() itself verifies currentPin server-side (direct bcrypt
      // compare, independent of the pinDevice cookie) — pre-checking via
      // verifyLockPin (pinLogin) here was wrong: pinLogin also requires a
      // valid device-binding cookie, so it spuriously rejected a correct PIN
      // on any browser that never completed PIN setup.
      try {
        await removePin(undefined, next)
        setPinRemoveOpen(false)
        setPinRemoveInput('')
        setPinRemoveError(null)
        setPinRemoveLoading(false)
      } catch {
        setPinRemoveShake(true)
        setPinRemoveError(t.profile.incorrectPin)
        setTimeout(() => { setPinRemoveShake(false); setPinRemoveInput(''); setPinRemoveLoading(false) }, 600)
      }
    }
  }

  // ── Section 3: Notifications ──────────────────────────────────────────────
  const [notificationsEnabled, setNotificationsEnabledState] = useState(getNotificationsEnabled)
  const [weeklyEmail, setWeeklyEmail] = useState(user?.weeklyEmailEnabled ?? false)
  const [weeklyEmailSaving, setWeeklyEmailSaving] = useState(false)
  const [monthlyEmail, setMonthlyEmail] = useState(user?.monthlyEmailEnabled ?? false)
  const [monthlyEmailSaving, setMonthlyEmailSaving] = useState(false)
  const [budgetWarnings, setBudgetWarningsState] = useState(() => loadLocalPref<boolean>('budget_warnings_enabled', true))
  const [savingsGoalReminder, setSavingsGoalReminderState] = useState(() => loadLocalPref<boolean>('savings_goal_reminder_enabled', false))

  // Data section
  const [csvImportOpen, setCsvImportOpen] = useState(false)

  // Deactivation modals
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleNotificationsToggle() {
    const next = !notificationsEnabled
    setNotificationsEnabledState(next)
    setNotificationsEnabled(next)
    if (next && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  async function handleWeeklyEmailToggle() {
    setWeeklyEmailSaving(true)
    const next = !weeklyEmail
    try {
      await updateWeeklyEmail(next)
      setWeeklyEmail(next)
    } finally {
      setWeeklyEmailSaving(false)
    }
  }

  async function handleMonthlyEmailToggle() {
    setMonthlyEmailSaving(true)
    const next = !monthlyEmail
    try {
      await updateMonthlyEmail(next)
      setMonthlyEmail(next)
    } finally {
      setMonthlyEmailSaving(false)
    }
  }

  // ── Section 4: Export ─────────────────────────────────────────────────────
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportGenerating, setExportGenerating] = useState(false)

  // Prevents CSV/formula injection: a field starting with =, +, -, @, tab or
  // CR would be interpreted as a live formula by Excel/Sheets when the user
  // opens the exported file (e.g. a transaction description of
  // `=HYPERLINK("http://evil.example","x")`).
  function sanitizeSpreadsheetField(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  }

  function periodToIsoRange(period: ExportPeriod): { fromISO: string; toISO: string } {
    const fromISO = `${period.fromYear}-${String(period.fromMonth).padStart(2, '0')}-01`
    const lastDay = new Date(period.toYear, period.toMonth, 0).getDate()
    const toISO = `${period.toYear}-${String(period.toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { fromISO, toISO }
  }

  async function handleExportCSV(fromISO: string, toISO: string) {
    const transactions = await fetchTransactionsInRange(fromISO, toISO)
    const rows = transactions.map(t =>
      `${t.date},${t.type},"${sanitizeSpreadsheetField((t.categoryName ?? '').replace(/"/g, "'"))}","${sanitizeSpreadsheetField((t.description ?? '').replace(/"/g, "'"))}",${t.amount}`
    )
    downloadBlob(
      new Blob([['Dátum,Typ,Kategória,Poznámka,Suma', ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }),
      `finvu-export-${fromISO}_${toISO}.csv`
    )
  }

  async function handleExportPDF(fromISO: string, toISO: string, period: ExportPeriod) {
    const transactions = await fetchTransactionsInRange(fromISO, toISO)
    const fromLabel = `${t.months[period.fromMonth - 1]} ${period.fromYear}`
    const toLabel = `${t.months[period.toMonth - 1]} ${period.toYear}`
    const rangeLabel = fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`

    // pdfExport (jsPDF + embedded Unicode font) is heavy — load it on demand.
    const { generateTransactionsPdf } = await import('../lib/pdfExport')
    await generateTransactionsPdf({
      transactions: transactions.map(tx => ({
        date: tx.date,
        type: tx.type,
        categoryName: tx.categoryName,
        description: tx.description,
        amount: tx.amount,
      })),
      title: t.settings.exportPdfTitle,
      rangeLabel,
      incomeLabel: t.expenses.categories.typeIncome,
      expenseLabel: t.expenses.categories.typeExpense,
      fileName: `finvu-export-${fromISO}_${toISO}.pdf`,
    })
  }

  async function handleExportXLSX(fromISO: string, toISO: string) {
    // xlsx is heavy — load it only when the user actually exports
    const [XLSX, transactions, { data: categories }] = await Promise.all([
      import('@e965/xlsx'),
      fetchTransactionsInRange(fromISO, toISO),
      getCategories(),
    ])

    const transactionRows = transactions.map(t => ({
      Dátum: t.date,
      Typ: t.type,
      Kategória: sanitizeSpreadsheetField(t.categoryName ?? ''),
      Poznámka: sanitizeSpreadsheetField(t.description ?? ''),
      Suma: t.amount,
    }))
    const categoryRows = categories.map(c => ({
      Názov: sanitizeSpreadsheetField(c.name),
      Typ: c.type,
      Limit: c.budgetLimit ?? '',
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactionRows), 'Transakcie')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoryRows), 'Kategórie')

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    downloadBlob(
      new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `finvu-export-${fromISO}_${toISO}.xlsx`
    )
  }

  async function handleGenerateExport(format: ExportFormat, period: ExportPeriod) {
    const { fromISO, toISO } = periodToIsoRange(period)
    setExportGenerating(true)
    setExportError(null)
    try {
      if (format === 'CSV') await handleExportCSV(fromISO, toISO)
      else if (format === 'XLSX') await handleExportXLSX(fromISO, toISO)
      else await handleExportPDF(fromISO, toISO, period)
      setExportModalOpen(false)
    } catch {
      setExportError('Export zlyhal. Skúste znova.')
    } finally {
      setExportGenerating(false)
    }
  }


  // ── Section 5: Danger Zone ────────────────────────────────────────────────
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null)
  const [dangerConfirmText, setDangerConfirmText] = useState('')
  const [dangerLoading, setDangerLoading] = useState(false)

  async function executeDangerAction() {
    if (!dangerAction) return
    setDangerLoading(true)
    try {
      if (dangerAction === 'transactions') {
        while (true) {
          const { data } = await getTransactions({ limit: 200 })
          if (data.length === 0) break
          await Promise.all(data.map(t => deleteTransaction(t.id)))
        }
      } else if (dangerAction === 'reset') {
        while (true) {
          const { data } = await getTransactions({ limit: 200 })
          if (data.length === 0) break
          await Promise.all(data.map(t => deleteTransaction(t.id)))
        }
        try { localStorage.removeItem('app_settings') } catch { /* ignore */ }
      }
      setDangerAction(null)
      setDangerConfirmText('')
    } catch { /* fail silently */ }
    finally { setDangerLoading(false) }
  }

  // ── Delete account ────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ── Savings toggle ────────────────────────────────────────────────────────
  const savingsEnabled = user?.savings_enabled ?? false
  const [savingsToggling, setSavingsToggling] = useState(false)

  async function handleSavingsToggle() {
    setSavingsToggling(true)
    try {
      await updateUserSettings({ savingsEnabled: !savingsEnabled })
      await refreshUser()
    } finally {
      setSavingsToggling(false)
    }
  }

  // ── Household ─────────────────────────────────────────────────────────────
  const householdEnabled = user?.household_enabled ?? false
  const householdId = user?.household_id ?? null
  const [householdToggling, setHouseholdToggling] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function handleHouseholdToggle() {
    setHouseholdToggling(true)
    try {
      await toggleHousehold(!householdEnabled)
      await refreshUser()
      if (householdEnabled) {
        localStorage.removeItem('finvu_dashboard_view')
      }
    } finally {
      setHouseholdToggling(false)
    }
  }

  async function handleCreateHousehold() {
    if (!createName.trim()) return
    setCreateLoading(true)
    try {
      await createHousehold(createName.trim())
      await refreshUser()
      setCreateName('')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleJoinHousehold() {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError(null)
    try {
      await joinHousehold(joinCode.trim().toUpperCase())
      await refreshUser()
      setJoinCode('')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) setJoinError(t.settings.householdJoinErrorNotFound)
      else if (status === 409) setJoinError(t.settings.householdJoinErrorMember)
      else setJoinError(t.settings.householdJoinErrorFailed)
    } finally {
      setJoinLoading(false)
    }
  }


  // ── Tracking start date ───────────────────────────────────────────────────
  const [trackingDate, setTrackingDate] = useState(() => user?.tracking_start_date ?? '')
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [trackingOk, setTrackingOk] = useState(false)
  const [trackingModalOpen, setTrackingModalOpen] = useState(false)
  const [devicesModalOpen, setDevicesModalOpen] = useState(false)
  const [deactivationModalOpen, setDeactivationModalOpen] = useState(false)

  // Same Escape-to-close pattern every other modal in the app implements
  // locally (BottomSheet, StreakModal, AchievementDetailModal, SavingsDetailModal,
  // PinSetupModal, ...) — this modal previously only closed via the X button
  // or a backdrop click, with no keydown listener at all.
  useEffect(() => {
    if (!devicesModalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDevicesModalOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [devicesModalOpen])

  async function handleSaveTrackingDate() {
    setTrackingSaving(true)
    setTrackingOk(false)
    try {
      await updateUserSettings({ trackingStartDate: trackingDate || null })
      await refreshUser()
      setTrackingOk(true)
      setTimeout(() => setTrackingOk(false), 2500)
    } catch { /* non-critical */ }
    finally { setTrackingSaving(false) }
  }

  async function handleClearTrackingDate() {
    setTrackingSaving(true)
    try {
      await updateUserSettings({ trackingStartDate: null })
      await refreshUser()
      setTrackingDate('')
    } catch { /* non-critical */ }
    finally { setTrackingSaving(false) }
  }

  const sectionLabels: Record<SettingsSection, string> = {
    appearance: t.settings.sectionAppearance,
    finance: t.settings.sectionFinance,
    notifications: t.settings.sectionNotifications,
    security: t.settings.sectionSecurity,
    data: t.settings.sectionData,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 20px))' }}>

      {/* Settings page header — desktop: always the plain title.
          Mobile: plain title on the level-1 list, back-arrow + category
          name once drilled into a level-2 sub-page. */}
      <h1 className="hidden lg:block" style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)', letterSpacing: '-0.3px', margin: '0 0 16px' }}>{t.settings.title}</h1>

      <div className="lg:hidden">
        {mobileLevel === 'list' ? (
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)', letterSpacing: '-0.3px', margin: '0 0 16px' }}>{t.settings.title}</h1>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px' }}>
            <button
              onClick={backToSectionList}
              aria-label={t.common.back}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-hi)', cursor: 'pointer', flexShrink: 0 }}
            >
              <ArrowLeft size={16} />
            </button>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)', letterSpacing: '-0.3px', margin: 0 }}>{sectionLabels[activeSection]}</h1>
          </div>
        )}
      </div>

      <div className="settings-grid">

        {/* Desktop-only: vertical tab list, left rail */}
        <div className="hidden lg:block" style={{ position: 'sticky', top: 0 }}>
          <GlassCard radius={18} style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SECTIONS.map(s => {
              const Icon = s.icon
              const isActive = activeSection === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', borderRadius: 12,
                    background: isActive ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                    border: '1px solid transparent',
                    color: isActive ? '#fff' : 'var(--aurora-lo)',
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: 13, fontWeight: 600, textAlign: 'left',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Icon size={14} strokeWidth={2} />
                  {sectionLabels[s.id]}
                </button>
              )
            })}
          </GlassCard>
        </div>

        <div style={{ minWidth: 0 }}>

          {/* Mobile-only: level-1 grouped category list — hidden once drilled into a sub-page */}
          {mobileLevel === 'list' && (
            <div className="flex lg:hidden" style={{ flexDirection: 'column', gap: 16, marginBottom: 16 }}>
              <SectionCard>
                <div className="divide-y divide-white/[0.04]">
                  {SECTIONS.map(s => (
                    <ChevronRow
                      key={s.id}
                      icon={s.icon}
                      iconColor="var(--aurora-violet)"
                      iconBg="rgba(139,92,246,0.12)"
                      label={sectionLabels[s.id]}
                      onClick={() => openMobileSection(s.id)}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* Content — desktop: always visible. Mobile: only once drilled into a level-2 sub-page. */}
          <div className={`settings-content ${mobileLevel === 'list' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`} style={{ gap: 16 }}>

          {/* ── APPEARANCE SECTION ── */}
          {activeSection === 'appearance' && (
            <>
              {/* Card 1: Téma */}
              <SectionCard>
                <SectionHeader icon={Palette} label={t.settings.theme} />
                <div className="divide-y divide-white/[0.04] lg:grid lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0">
                  <SettingRow label={t.settings.theme} sublabel={t.settings.themeSubtitle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([
                        { id: 'dark', icon: Moon, label: 'Dark' },
                        { id: 'light', icon: Sun, label: 'Light' },
                        { id: 'system', icon: SunMoon, label: 'System' },
                      ] as const).map(({ id, icon: Icon, label }) => (
                        <button
                          key={id}
                          onClick={() => handleThemeChange(id)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
                            border: theme === id ? '2px solid var(--aurora-violet)' : '1px solid var(--aurora-gline)',
                            background: theme === id ? 'rgba(139,92,246,0.12)' : 'var(--aurora-glass)',
                            color: theme === id ? 'var(--aurora-violet)' : 'var(--aurora-lo)',
                            minWidth: 56, transition: 'all 0.15s', fontFamily: "'Manrope', sans-serif",
                          }}
                        >
                          <Icon size={16} />
                          <span style={{ fontSize: 11, fontWeight: theme === id ? 600 : 400 }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                  <SettingRow label={t.settings.compactMode} sublabel={t.settings.compactModeSubtitle}>
                    <Toggle checked={compactMode} onChange={handleCompactToggle} />
                  </SettingRow>
                </div>
              </SectionCard>

              {/* Card 2: Farba tlačidiel */}
              <SectionCard>
                <SectionHeader icon={Palette} label={t.settings.accentColor} />
                <div style={{ padding: '12px 20px 16px' }}>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginBottom: 14, marginTop: 0 }}>{t.settings.accentColorDescription}</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => handleAccentChange(c.value)}
                        title={c.name}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                          border: 'none', backgroundColor: c.value, flexShrink: 0,
                          outline: accentColor === c.value ? `3px solid ${c.value}` : 'none',
                          outlineOffset: 3, transition: 'transform 0.15s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        className="hover:scale-110"
                      >
                        {accentColor === c.value && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              {/* Card 3: Pozadie */}
              <SectionCard>
                <SectionHeader icon={Palette} label={t.settings.backgroundColor} />
                <div style={{ padding: '12px 20px 16px' }}>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginBottom: 14, marginTop: 0 }}>{t.settings.backgroundColorDescription}</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(resolvedTheme === 'light' ? BACKGROUND_COLORS_LIGHT : BACKGROUND_COLORS_DARK).map(c => (
                      <button
                        key={c.value}
                        onClick={() => handleBackgroundChange(c.value)}
                        title={c.name}
                        style={{
                          width: 36, height: 36, borderRadius: 9, cursor: 'pointer',
                          border: '1px solid var(--aurora-gline)', backgroundColor: c.value, flexShrink: 0,
                          boxShadow: backgroundColor === c.value ? '0 0 0 2px var(--aurora-panel), 0 0 0 4px var(--aurora-violet)' : 'none',
                          transition: 'transform 0.15s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        className="hover:scale-110"
                      >
                        {backgroundColor === c.value && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2.5 7L5.5 10L11.5 4" stroke="var(--aurora-hi)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {/* ── FINANCE SECTION ── */}
          {activeSection === 'finance' && (
            <>
              {/* Section 1: Všeobecné */}
              <div className="settings-general-compact">
              <SectionCard>
                <SectionHeader icon={User} label={t.settings.generalSection} />
                {/* Mobile: single column, unchanged */}
                <div className="lg:hidden divide-y divide-white/[0.04]">
                  <SettingRow label={t.settings.currency}>
                    <SettingsDropdown
                      value={settings.currency}
                      options={CURRENCIES}
                      onChange={v => updateSettings({ currency: v })}
                    />
                  </SettingRow>

                  <SettingRow label={t.settings.language} sublabel={t.settings.languageNote}>
                    <LanguageSwitcher
                      variant="full"
                      onLanguageChange={lang => {
                        updateUserSettings({ language: lang }).catch(() => { /* non-critical */ })
                      }}
                    />
                  </SettingRow>

                  <SettingRow label={t.settings.dateFormat}>
                    <SettingsDropdown
                      value={settings.dateFormat}
                      options={DATE_FORMATS}
                      onChange={v => updateSettings({ dateFormat: v })}
                    />
                  </SettingRow>

                  <SettingRow label={t.settings.firstDayOfWeek}>
                    <div style={{ display: 'flex', background: 'var(--aurora-glass)', borderRadius: 10, padding: 3, border: '1px solid var(--aurora-gline)' }}>
                      {(['monday', 'sunday'] as const).map((day, i) => (
                        <button
                          key={day}
                          onClick={() => updateSettings({ firstDayOfWeek: day })}
                          style={{
                            padding: '5px 16px', borderRadius: 7, fontSize: 13,
                            fontWeight: settings.firstDayOfWeek === day ? 600 : 400,
                            background: settings.firstDayOfWeek === day ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                            color: settings.firstDayOfWeek === day ? 'white' : 'var(--aurora-lo)',
                            border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.15s',
                          }}
                        >
                          {i === 0 ? t.daysShort[0] : t.daysShort[6]}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                </div>

                {/* Desktop: compact 2x2 grid, label above a sunken control box */}
                <div className="hidden lg:grid lg:grid-cols-2" style={{ gap: 20, padding: 20 }}>
                  <CompactSettingCell label={t.settings.currency}>
                    <SettingsDropdown
                      value={settings.currency}
                      options={CURRENCIES}
                      onChange={v => updateSettings({ currency: v })}
                    />
                  </CompactSettingCell>

                  <CompactSettingCell label={t.settings.language}>
                    <LanguageSwitcher
                      variant="full"
                      onLanguageChange={lang => {
                        updateUserSettings({ language: lang }).catch(() => { /* non-critical */ })
                      }}
                    />
                  </CompactSettingCell>

                  <CompactSettingCell label={t.settings.dateFormat}>
                    <SettingsDropdown
                      value={settings.dateFormat}
                      options={DATE_FORMATS}
                      onChange={v => updateSettings({ dateFormat: v })}
                    />
                  </CompactSettingCell>

                  <CompactSettingCell label={t.settings.firstDayOfWeek}>
                    <div style={{ display: 'flex', background: 'var(--aurora-glass)', borderRadius: 10, padding: 3, border: '1px solid var(--aurora-gline)', width: 'fit-content' }}>
                      {(['monday', 'sunday'] as const).map((day, i) => (
                        <button
                          key={day}
                          onClick={() => updateSettings({ firstDayOfWeek: day })}
                          style={{
                            padding: '5px 16px', borderRadius: 7, fontSize: 13,
                            fontWeight: settings.firstDayOfWeek === day ? 600 : 400,
                            background: settings.firstDayOfWeek === day ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                            color: settings.firstDayOfWeek === day ? 'white' : 'var(--aurora-lo)',
                            border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.15s',
                          }}
                        >
                          {i === 0 ? t.daysShort[0] : t.daysShort[6]}
                        </button>
                      ))}
                    </div>
                  </CompactSettingCell>
                </div>
                <p className="hidden lg:block" style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0, padding: '0 20px 16px' }}>{t.settings.languageNote}</p>
              </SectionCard>
              </div>

              {/* Section: Sledovanie od dátumu */}
              <SectionCard>
                <ChevronRow
                  icon={CalendarClock}
                  iconColor="var(--aurora-violet)"
                  iconBg="rgba(139,92,246,0.12)"
                  label="Sledovanie od dátumu"
                  sublabel={user?.tracking_start_date ? new Date(user.tracking_start_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Nenastavené'}
                  onClick={() => setTrackingModalOpen(true)}
                />
              </SectionCard>

              {/* Section: Rodinné financie + Sporenie — side by side on desktop */}
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
              <SectionCard>
                <SectionHeader icon={Users} label={t.settings.householdTitle} />
                <div className="divide-y divide-white/[0.04]">
                  <SettingRow label={t.settings.householdTitle} sublabel={householdId ? t.settings.householdSubtitleJoined : t.settings.householdSubtitleNew}>
                    <Toggle checked={householdEnabled} onChange={householdId ? () => {} : handleHouseholdToggle} disabled={householdToggling || !!householdId} />
                  </SettingRow>
                </div>

                {householdEnabled && !householdId && (
                  <div className="p-5 flex flex-col gap-4 border-t border-white/[0.06]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Vytvor domácnosť */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: 16 }}>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif" }}>{t.settings.householdCreate}</p>
                        <input
                          type="text"
                          placeholder={t.settings.householdCreatePlaceholder}
                          value={createName}
                          onChange={e => setCreateName(e.target.value)}
                          style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', padding: '12px 14px', fontSize: 14, outline: 'none', width: '100%', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
                        />
                        <button
                          onClick={handleCreateHousehold}
                          disabled={createLoading || !createName.trim()}
                          style={{ background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', fontFamily: "'Outfit', sans-serif", opacity: (createLoading || !createName.trim()) ? 0.4 : 1 }}
                        >
                          {createLoading ? t.settings.householdCreating : t.settings.householdCreateBtn}
                        </button>
                      </div>

                      {/* Pripoj sa */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12, padding: 16 }}>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif" }}>{t.settings.householdJoin}</p>
                        <input
                          type="text"
                          placeholder={t.settings.householdJoinPlaceholder}
                          value={joinCode}
                          onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null) }}
                          style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', padding: '12px 14px', fontSize: 14, outline: 'none', width: '100%', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
                        />
                        {joinError && <p className="text-xs text-red-400">{joinError}</p>}
                        <button
                          onClick={handleJoinHousehold}
                          disabled={joinLoading || !joinCode.trim()}
                          style={{ background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%', fontFamily: "'Outfit', sans-serif", opacity: (joinLoading || !joinCode.trim()) ? 0.4 : 1 }}
                        >
                          {joinLoading ? t.settings.householdJoining : t.settings.householdJoinBtn}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Section: Sporenie */}
              <SectionCard>
                <SectionHeader icon={PiggyBank} label={t.settings.savingsTitle} />
                <div className="divide-y divide-white/[0.04]">
                  <SettingRow label={t.settings.savingsTitle} sublabel={t.settings.savingsSubtitle}>
                    <Toggle checked={savingsEnabled} onChange={handleSavingsToggle} disabled={savingsToggling} />
                  </SettingRow>
                </div>
              </SectionCard>
              </div>
            </>
          )}

          {/* ── NOTIFICATIONS SECTION ── */}
          {activeSection === 'notifications' && (
            <>
              <SectionCard>
                <SectionHeader icon={Bell} label={t.settings.notificationsSection} />
                <div className="divide-y divide-white/[0.04] lg:grid lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0">
                  <SettingRow label={t.settings.fixedReminders} sublabel={t.settings.fixedRemindersSubtitle}>
                    <Toggle checked={notificationsEnabled} onChange={handleNotificationsToggle} />
                  </SettingRow>

                  <SettingRow label={t.settings.budgetWarnings} sublabel={t.settings.budgetWarningsSubtitle}>
                    <Toggle
                      checked={budgetWarnings}
                      onChange={() => {
                        const next = !budgetWarnings
                        setBudgetWarningsState(next)
                        saveLocalPref('budget_warnings_enabled', next)
                      }}
                    />
                  </SettingRow>

                  <SettingRow label={t.settings.savingsGoalReminder} sublabel={t.settings.savingsGoalReminderSubtitle}>
                    <Toggle
                      checked={savingsGoalReminder}
                      onChange={() => {
                        const next = !savingsGoalReminder
                        setSavingsGoalReminderState(next)
                        saveLocalPref('savings_goal_reminder_enabled', next)
                      }}
                    />
                  </SettingRow>

                  <SettingRow label={t.settings.weeklyEmailLabel} sublabel={t.settings.weeklyEmailSubtitle}>
                    <Toggle checked={weeklyEmail} onChange={handleWeeklyEmailToggle} disabled={weeklyEmailSaving} />
                  </SettingRow>

                  <SettingRow label={t.settings.monthlyEmailLabel} sublabel={t.settings.monthlyEmailSubtitle}>
                    <Toggle checked={monthlyEmail} onChange={handleMonthlyEmailToggle} disabled={monthlyEmailSaving} />
                  </SettingRow>
                </div>
                <div className="border-t border-white/[0.04]" style={{ padding: '10px var(--card-padding, 20px)' }}>
                  <p className="text-xs" style={{ color: 'var(--aurora-faint)', fontFamily: "'Manrope', sans-serif" }}>{t.settings.notificationsNote}</p>
                </div>
              </SectionCard>
            </>
          )}

          {/* ── SECURITY SECTION ── */}
          {activeSection === 'security' && (
            <>
              <div ref={securityRef} id="bezpecnost-section">
              <SectionCard>
                <SectionHeader icon={Shield} label={t.settings.sectionSecurity} />
                <div className="divide-y divide-white/[0.04]">

                  {/* Zmeniť heslo */}
                  <ChevronRow
                    icon={KeyRound}
                    iconColor="var(--aurora-violet)"
                    iconBg="rgba(139,92,246,0.12)"
                    label="Zmeniť heslo"
                    sublabel="Aktualizovať prihlasovacie heslo"
                    onClick={() => { setChangePwOpen(true); setChangePwError(null); setChangePwOk(false) }}
                  />

                  {/* PIN */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ChevronRow
                        icon={Hash}
                        iconColor={hasPin ? 'var(--aurora-emerald)' : 'var(--aurora-faint)'}
                        iconBg={hasPin ? 'rgba(52,211,153,0.12)' : 'var(--aurora-glass)'}
                        label={t.settings.pinCodeLabel}
                        sublabel={hasPin ? <span style={{ color: 'var(--aurora-emerald)', fontWeight: 600 }}>{t.settings.pinIsActive}</span> : t.settings.pinAppLock}
                        onClick={() => setPinSetupOpen(true)}
                      />
                    </div>
                    {hasPin && (
                      <button
                        onClick={() => { setPinRemoveOpen(true); setPinRemoveInput(''); setPinRemoveError(null) }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--aurora-faint)', cursor: 'pointer', padding: 8, marginRight: 8, flexShrink: 0 }}
                        title={t.common.remove}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* Automatické uzamknutie */}
                  <SettingRow label={t.settings.autoLock} sublabel={t.settings.autoLockSubtitle}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', opacity: !hasPin ? 0.4 : 1 }}>
                      <select
                        value={autoLockMinutes ?? 'never'}
                        onChange={e => handleAutoLockChange(e.target.value === 'never' ? null : Number(e.target.value))}
                        disabled={autoLockSaving || !hasPin}
                        style={{ appearance: 'none' as const, background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer', paddingRight: 18, colorScheme: 'var(--aurora-color-scheme)', accentColor: 'var(--accent-color)' }}
                      >
                        <option value="never" style={{ background: 'var(--aurora-panel)', color: 'var(--aurora-hi)' }}>{t.settings.autoLockNever}</option>
                        <option value="0" style={{ background: 'var(--aurora-panel)', color: 'var(--aurora-hi)' }}>Ihneď</option>
                        <option value="1" style={{ background: 'var(--aurora-panel)', color: 'var(--aurora-hi)' }}>{t.settings.autoLock1min}</option>
                        <option value="5" style={{ background: 'var(--aurora-panel)', color: 'var(--aurora-hi)' }}>{t.settings.autoLock5min}</option>
                        <option value="15" style={{ background: 'var(--aurora-panel)', color: 'var(--aurora-hi)' }}>{t.settings.autoLock15min}</option>
                      </select>
                      <ChevronRight size={14} style={{ position: 'absolute', right: 0, color: 'var(--aurora-faint)', pointerEvents: 'none' }} />
                    </div>
                  </SettingRow>

                </div>
              </SectionCard>
              </div>

              {/* Zariadenia a relácie — merges Aktívne relácie + PIN rýchly prístup into one modal */}
              <SectionCard>
                <ChevronRow
                  icon={Monitor}
                  iconColor="var(--aurora-lo)"
                  iconBg="var(--aurora-glass)"
                  label={t.settings.devicesAndSessionsTitle}
                  sublabel={
                    sessionsLoading || (hasPin && pinDevicesLoading)
                      ? 'Načítavam...'
                      : hasPin
                        ? `${sessions.length} ${sessions.length === 1 ? 'relácia' : sessions.length < 5 ? 'relácie' : 'relácií'} · ${pinDevices.length} ${pinDevices.length === 1 ? 'zariadenie' : pinDevices.length < 5 ? 'zariadenia' : 'zariadení'}`
                        : `${sessions.length} ${sessions.length === 1 ? 'relácia' : sessions.length < 5 ? 'relácie' : 'relácií'}`
                  }
                  onClick={() => setDevicesModalOpen(true)}
                />
              </SectionCard>

              {/* DEAKTIVÁCIA — collapsed summary row */}
              <SectionCard>
                <ChevronRow
                  icon={AlertTriangle}
                  iconColor="var(--aurora-rose)"
                  iconBg="rgba(251,113,133,0.12)"
                  label={t.settings.deactivationSection.charAt(0) + t.settings.deactivationSection.slice(1).toLowerCase()}
                  sublabel="Vymazanie dát, deaktivácia alebo zmazanie účtu"
                  onClick={() => setDeactivationModalOpen(true)}
                />
              </SectionCard>
            </>
          )}

          {/* ── DATA SECTION ── */}
          {activeSection === 'data' && (
            <>
              <div ref={dataRef} id="data-section">
              <SectionCard>
                <SectionHeader icon={Database} label="Export a import" />
                <div className="divide-y divide-white/[0.04] lg:grid lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0">
                  <SettingRow label="Exportovať dáta" sublabel="Stiahnuť transakcie a kategórie za zvolené obdobie">
                    <button
                      onClick={() => setExportModalOpen(true)}
                      style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
                    >
                      {t.settings.exportModalTitle}
                    </button>
                  </SettingRow>
                  <SettingRow label={t.settings.importStatement} sublabel="Z banky: Revolut, Tatra, ČSOB, SLSP">
                    <button
                      onClick={() => setCsvImportOpen(true)}
                      style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
                    >
                      {t.settings.importStatement}
                    </button>
                  </SettingRow>
                </div>
                <div style={{ borderTop: '1px solid var(--aurora-gline)', padding: '10px 20px' }}>
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{t.settings.dataNote}</p>
                </div>
                {exportError && <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-rose)', padding: '0 20px 12px', margin: 0 }}>{exportError}</p>}
              </SectionCard>
              </div>
            </>
          )}

        </div>

        </div>

      </div>

      {/* ── PIN REMOVE MODAL ── */}
      {pinRemoveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in">
          <div
            style={{ background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}
            className="modal-in"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{t.profile.removePin}</h2>
              <button onClick={() => setPinRemoveOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4, display: 'flex' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--aurora-faint)', marginBottom: 20 }}>{t.settings.removePinConfirm}</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <PinKeypad length={4} digits={pinRemoveInput.length} shake={pinRemoveShake} disabled={pinRemoveLoading} onKey={handlePinRemoveKey} />
              {pinRemoveError && (
                <p style={{ fontSize: 12, color: 'var(--aurora-rose)', margin: 0 }}>{pinRemoveError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DANGER CONFIRM MODAL ── */}
      {dangerAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in">
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 384 }} className="modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>
                {dangerAction === 'transactions' ? 'Vymazať všetky transakcie' : t.settings.dangerResetTitle}
              </h2>
              <button onClick={() => setDangerAction(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4, display: 'flex' }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-[color:var(--aurora-faint)] mb-5">
              {dangerAction === 'reset' ? t.settings.dangerResetDesc : t.settings.dangerDeleteDesc}
            </p>
            {dangerAction === 'reset' && (
              <div className="mb-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-red-400 mb-2 block">
                  {t.settings.dangerResetConfirmLabel}
                </label>
                <input
                  type="text"
                  placeholder="VYMAZAŤ"
                  value={dangerConfirmText}
                  onChange={e => setDangerConfirmText(e.target.value)}
                  style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDangerAction(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[color:var(--aurora-faint)] hover:bg-white/10 transition-colors cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={executeDangerAction}
                disabled={dangerLoading || (dangerAction === 'reset' && dangerConfirmText !== 'VYMAZAŤ')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dangerLoading ? t.settings.dangerDeleting : t.settings.dangerDeleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DEACTIVATE ACCOUNT MODAL ── */}
      {deactivateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in">
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 384 }} className="modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{t.settings.deactivateAccount}</h2>
              <button onClick={() => setDeactivateOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4, display: 'flex' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--aurora-faint)', marginBottom: 16 }}>{t.settings.deactivateAccountDesc}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--aurora-rose)' }}>
                {t.settings.deactivateAccountConfirmLabel}
              </label>
              <input
                type="text"
                placeholder="DEAKTIVOVAŤ"
                value={deactivateConfirm}
                onChange={e => { setDeactivateConfirm(e.target.value); setDeactivateError(null) }}
                style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
              />
            </div>
            {deactivateError && <p style={{ fontSize: 12, color: 'var(--aurora-rose)', marginBottom: 8 }}>{deactivateError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeactivateOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[color:var(--aurora-faint)] hover:bg-white/10 transition-colors cursor-pointer">
                {t.common.cancel}
              </button>
              <button
                disabled={deactivateConfirm !== 'DEAKTIVOVAŤ' || isDeactivating}
                onClick={async () => {
                  setIsDeactivating(true)
                  try {
                    await apiDeactivateAccount()
                    await logout()
                  } catch {
                    setDeactivateError('Nepodarilo sa deaktivovať účet. Skúste znova.')
                    setIsDeactivating(false)
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeactivating ? t.settings.deactivating : t.settings.deactivateAccountConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ACCOUNT MODAL ── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in">
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 384 }} className="modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{t.settings.deleteAccount}</h2>
              <button onClick={() => setDeleteOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4, display: 'flex' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--aurora-faint)', marginBottom: 16 }}>{t.settings.deleteAccountDesc}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--aurora-rose)' }}>
                Aktuálne heslo
              </label>
              <input
                type="password"
                placeholder="Aktuálne heslo"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError(null) }}
                style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--aurora-rose)' }}>
                {t.settings.deleteAccountConfirmLabel}
              </label>
              <input
                type="text"
                placeholder="ZMAZAŤ"
                value={deleteConfirm}
                onChange={e => { setDeleteConfirm(e.target.value); setDeleteError(null) }}
                style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }}
              />
            </div>
            {deleteError && <p style={{ fontSize: 12, color: 'var(--aurora-rose)', marginBottom: 8 }}>{deleteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[color:var(--aurora-faint)] hover:bg-white/10 transition-colors cursor-pointer">
                {t.common.cancel}
              </button>
              <button
                disabled={deleteConfirm !== 'ZMAZAŤ' || isDeleting}
                onClick={async () => {
                  setIsDeleting(true)
                  try {
                    await deleteAccount(deletePassword)
                  } catch (err: unknown) {
                    const status = (err as { response?: { status?: number } })?.response?.status
                    if (status === 502 || status === 501 || status === 404) {
                      setDeleteError(t.settings.deleteAccountUnavailable)
                    } else if (status === 401 || status === 400) {
                      setDeleteError('Nesprávne aktuálne heslo.')
                    } else {
                      setDeleteError('Nepodarilo sa zmazať účet. Skúste znova.')
                    }
                    setIsDeleting(false)
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: deleteConfirm === 'ZMAZAŤ' ? '#DC2626' : undefined }}
              >
                {isDeleting ? 'Mažem...' : t.settings.deleteAccountConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD MODAL ── */}
      {changePwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in" onClick={() => setChangePwOpen(false)}>
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }} className="modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>Zmeniť heslo</h2>
              <button onClick={() => setChangePwOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {changePwError && <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-rose)', margin: 0 }}>{changePwError}</p>}
              {changePwOk ? (
                <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'var(--aurora-emerald)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <Check size={15} /> Heslo zmenené
                </div>
              ) : (
                <>
                  <input type="password" placeholder="Aktuálne heslo" value={currentPw} onChange={e => setCurrentPw(e.target.value)} style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }} />
                  <input type="password" placeholder="Nové heslo (min. 8 znakov)" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }} />
                  <input type="password" placeholder="Potvrď nové heslo" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangePassword()} style={{ height: 44, width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 10, color: 'var(--aurora-hi)', fontSize: 14, padding: '0 14px', outline: 'none', fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box' }} />
                  <button
                    onClick={handleChangePassword}
                    disabled={changePwLoading}
                    style={{ height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white', border: 'none', cursor: changePwLoading ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif", opacity: changePwLoading ? 0.7 : 1, marginTop: 4 }}
                  >
                    {changePwLoading ? 'Ukladám...' : 'Uložiť heslo'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ZARIADENIA A RELÁCIE MODAL — 2 nezávislé sekcie: Aktívne relácie + PIN rýchly prístup ── */}
      {devicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in" onClick={() => setDevicesModalOpen(false)}>
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }} className="modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.settings.devicesAndSessionsTitle}</h2>
              <button onClick={() => setDevicesModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4 }}><X size={16} /></button>
            </div>

            {/* Sekcia 1: Aktívne relácie (userSessions / refreshTokens) */}
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--aurora-faint)', margin: '0 0 10px' }}>{t.settings.activeSessions}</h3>
            {sessionsLoading ? (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>Načítavam...</p>
            ) : sessions.length === 0 ? (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>{t.settings.activeSessionsSubtitle}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {sessions.map(session => {
                  const isCurrent = session.id === (typeof window !== 'undefined' ? localStorage.getItem('finvu_session_id') : null)
                  const DeviceIcon = /iPhone|iPad/i.test(session.deviceName ?? '') ? Smartphone
                    : /Android Phone/i.test(session.deviceName ?? '') ? Smartphone
                    : /Tablet/i.test(session.deviceName ?? '') ? Tablet
                    : /Mac|Windows|Linux/i.test(session.deviceName ?? '') ? Laptop
                    : Monitor
                  return (
                    <GlassCard key={session.id} radius={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <DeviceIcon size={18} strokeWidth={1.5} color="var(--aurora-lo)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--aurora-hi)', margin: 0 }}>{session.deviceName ?? 'Neznáme zariadenie'}</p>
                          {isCurrent && (
                            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(52,211,153,0.15)', color: 'var(--aurora-emerald)', letterSpacing: '0.05em' }}>
                              {t.settings.currentSessionBadge}
                            </span>
                          )}
                        </div>
                        <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>
                          {session.browser ?? ''}{session.location ? ` · ${session.location}` : ''}{session.ip ? ` · ${session.ip}` : ''}
                        </p>
                        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: 0 }}>
                          {new Date(session.createdAt).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={sessionDeletingId === session.id}
                          style={{ flexShrink: 0, background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', color: 'var(--aurora-rose)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                        >
                          {t.settings.logoutSession}
                        </button>
                      )}
                    </GlassCard>
                  )
                })}
              </div>
            )}

            {/* Sekcia 2: PIN rýchly prístup (pin_device_tokens) — nezávislý zoznam, nepárovaný s reláciami vyššie */}
            {hasPin && (
              <>
                <div style={{ borderTop: '1px solid var(--aurora-gline)', margin: '20px 0 16px' }} />
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--aurora-faint)', margin: '0 0 10px' }}>{t.settings.pinDevicesTitle}</h3>
                {pinDevicesLoading ? (
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>Načítavam...</p>
                ) : pinDevices.length === 0 ? (
                  <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)' }}>{t.settings.pinDeviceNoDevices}</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {pinDevices.map(device => {
                      const { deviceName, browser } = parseUserAgent(device.label ?? '')
                      const DeviceIcon = /iPhone|iPad/i.test(deviceName) ? Smartphone
                        : /Android Phone/i.test(deviceName) ? Smartphone
                        : /Tablet/i.test(deviceName) ? Tablet
                        : /Mac|Windows|Linux/i.test(deviceName) ? Laptop
                        : Monitor
                      return (
                        <GlassCard key={device.id} radius={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <DeviceIcon size={18} strokeWidth={1.5} color="var(--aurora-lo)" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--aurora-hi)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.label ? deviceName : 'Neznáme zariadenie'}</p>
                              {device.isCurrentDevice && (
                                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(52,211,153,0.15)', color: 'var(--aurora-emerald)', letterSpacing: '0.05em', flexShrink: 0 }}>
                                  {t.settings.pinDeviceCurrentBadge}
                                </span>
                              )}
                            </div>
                            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>
                              {device.label ? browser : ''}
                            </p>
                            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>
                              {t.settings.pinDeviceLastUsed}: {new Date(device.lastUsedAt).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', margin: 0 }}>
                              {t.settings.pinDeviceExpires}: {new Date(device.expiresAt).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <button
                            onClick={() => requestRevokePinDevice(device)}
                            disabled={pinDeviceDeletingId === device.id}
                            style={{ flexShrink: 0, background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', color: 'var(--aurora-rose)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                          >
                            {t.settings.pinDeviceRevoke}
                          </button>
                        </GlassCard>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            <PasskeySection />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pinDeviceConfirmId}
        message={t.settings.revokeCurrentDeviceWarning}
        onConfirm={() => pinDeviceConfirmId && handleRevokePinDevice(pinDeviceConfirmId)}
        onCancel={() => setPinDeviceConfirmId(null)}
      />

      {/* ── DEACTIVATION MODAL ── */}
      {deactivationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in" onClick={() => setDeactivationModalOpen(false)}>
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid rgba(251,113,133,0.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }} className="modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.settings.deactivationSection.charAt(0) + t.settings.deactivationSection.slice(1).toLowerCase()}</h2>
              <button onClick={() => setDeactivationModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ChevronRow
                icon={Trash2} iconColor="var(--aurora-rose)" iconBg="rgba(251,113,133,0.12)"
                label="Vymazať všetky transakcie" sublabel="Nevratná operácia — všetky tx budú odstránené"
                onClick={() => { setDangerAction('transactions'); setDangerConfirmText('') }}
              />
              <ChevronRow
                icon={RotateCcw} iconColor="var(--aurora-rose)" iconBg="rgba(251,113,133,0.12)"
                label="Resetovať aplikáciu" sublabel="Vymaže všetky dáta a nastavenia"
                onClick={() => { setDangerAction('reset'); setDangerConfirmText('') }}
              />
              <ChevronRow
                icon={Ban} iconColor="var(--aurora-rose)" iconBg="rgba(251,113,133,0.12)"
                label="Deaktivovať účet" sublabel="Účet bude skrytý, dáta zostanú 30 dní"
                onClick={() => { setDeactivateOpen(true); setDeactivateConfirm(''); setDeactivateError(null) }}
              />
              <ChevronRow
                icon={UserX} iconColor="var(--aurora-rose)" iconBg="rgba(251,113,133,0.12)"
                label="Zmazať účet" sublabel="Trvale odstráni účet a všetky dáta — nezvratné"
                onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); setDeletePassword(''); setDeleteError(null) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── TRACKING DATE MODAL ── */}
      {trackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 fade-in" onClick={() => setTrackingModalOpen(false)}>
          <div style={{ background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 }} className="modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>Sledovanie od dátumu</h2>
              <button onClick={() => setTrackingModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aurora-faint)', padding: 4 }}><X size={16} /></button>
            </div>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Nastav dátum, od ktorého chceš sledovať financie. Príjmy a výdavky pred týmto dátumom sa nebudú zobrazovať v histórii.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <label style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--aurora-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Sledovanie od
              </label>
              <input
                type="date"
                value={trackingDate}
                onChange={e => setTrackingDate(e.target.value)}
                style={{
                  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
                  borderRadius: 10, padding: '11px 14px', fontSize: 14,
                  color: 'var(--aurora-hi)', width: '100%', outline: 'none',
                  fontFamily: "'Manrope', sans-serif", boxSizing: 'border-box', colorScheme: 'var(--aurora-color-scheme)',
                }}
              />
            </div>
            {trackingOk && (
              <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-emerald)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}><Check size={13} /> Dátum bol uložený</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSaveTrackingDate}
                disabled={trackingSaving}
                style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white', border: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", opacity: trackingSaving ? 0.6 : 1 }}
              >
                {trackingSaving ? 'Ukladám...' : 'Uložiť'}
              </button>
              {user?.tracking_start_date && (
                <button
                  onClick={handleClearTrackingDate}
                  disabled={trackingSaving}
                  style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', color: 'var(--aurora-lo)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", opacity: trackingSaving ? 0.6 : 1 }}
                >
                  Vymazať
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EXPORT DATA MODAL ── */}
      <ExportDataModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onGenerate={handleGenerateExport}
        generating={exportGenerating}
      />

      {/* ── CSV IMPORT MODAL ── */}
      <CsvImportModal open={csvImportOpen} onClose={() => setCsvImportOpen(false)} />

      <PinSetupModal
        open={pinSetupOpen}
        onClose={() => setPinSetupOpen(false)}
        identityCheck={hasPin ? 'pin' : (user?.has_password ? 'password' : null)}
        onSetPin={async (pin, identity) => {
          await setupPin(pin, identity?.currentPassword, identity?.currentPin)
          if (user?.email) localStorage.setItem(`pin_enabled_${user.email}`, '1')
        }}
      />

    </div>
  )
}

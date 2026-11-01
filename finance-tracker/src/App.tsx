import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppNav } from './components/AppNav'
import { BottomNav } from './components/BottomNav'
import { Topbar } from './components/Topbar'
import { GlobalFAB, type FabLaunch } from './components/GlobalFAB'
import { CsvImportModal } from './components/CsvImportModal'
import { takePendingIntent, takeSharedFile } from './utils/shareIntent'
import { PullToRefresh } from './components/PullToRefresh'
import { ToastContainer } from './components/ToastContainer'
import { OfflineStatus } from './components/OfflineStatus'
import { LoginPage } from './pages/Login'

// Pages are lazy-loaded so the entry chunk stays small (recharts, xlsx and
// admin code load on demand); workbox precaches the chunks for offline use.
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const IncomePage = lazy(() => import('./pages/Income').then(m => ({ default: m.IncomePage })))
const VariableExpensesPage = lazy(() => import('./pages/VariableExpenses').then(m => ({ default: m.VariableExpensesPage })))
const FixedExpensesPage = lazy(() => import('./pages/FixedExpenses').then(m => ({ default: m.FixedExpensesPage })))
const CategoriesPage = lazy(() => import('./pages/Categories').then(m => ({ default: m.CategoriesPage })))
const AnnualPage = lazy(() => import('./pages/Annual').then(m => ({ default: m.AnnualPage })))
const SearchPage = lazy(() => import('./pages/Search').then(m => ({ default: m.SearchPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })))
const ProfileModal = lazy(() => import('./pages/Profile').then(m => ({ default: m.ProfileModal })))
const AdminPage = lazy(() => import('./pages/Admin').then(m => ({ default: m.AdminPage })))
const SharedReportPage = lazy(() => import('./pages/SharedReport').then(m => ({ default: m.SharedReportPage })))
const RegisterPage = lazy(() => import('./pages/Register').then(m => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPasswordPage })))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail').then(m => ({ default: m.VerifyEmailPage })))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicyPage })))
import { OnboardingTutorial } from './components/OnboardingTutorial'
import { useOnboarding } from './hooks/useOnboarding'
import { BudgetTemplateModal } from './components/BudgetTemplateModal'
import { useBudgetTemplate, isBudgetTemplateDismissed, dismissBudgetTemplate } from './hooks/useBudgetTemplate'
import { PinLock } from './components/PinLock'
import { PinLockProvider, usePinLockContext } from './context/PinLockContext'
import { useToast } from './hooks/useToast'
import { useTranslation } from './i18n'
import { subscribeAchievementUnlocks } from './utils/achievementEvents'
import { getAchievementMeta } from './data/achievements'
import { useAuth } from './context/AuthContext'
import { useSettingsContext } from './context/SettingsContext'
import { useVariableExpenses } from './hooks/useVariableExpenses'
import { useIncomes } from './hooks/useIncomes'
import { fetchIncomes, incomeQueryKey } from './hooks/useIncomes'
import { fetchVariableExpenses, variableExpenseQueryKey } from './hooks/useVariableExpenses'
import { fetchFixedExpenses, fixedExpenseQueryKey, useFixedExpenses } from './hooks/useFixedExpenses'
import { useFixedExpenseNotifications } from './hooks/useFixedExpenseNotifications'
import { fetchCategoriesData } from './hooks/useCategories'
import { fetchSavingsData } from './hooks/useSavings'
import { fetchHouseholdData, householdQueryKey } from './hooks/useHousehold'
const HouseholdPage = lazy(() => import('./pages/Household').then(m => ({ default: m.HouseholdPage })))
const SavingsPage = lazy(() => import('./pages/Savings').then(m => ({ default: m.SavingsPage })))
import { PWAUpdateBanner } from './components/PWAUpdateBanner'
import { TrackingDateOnboarding } from './components/TrackingDateOnboarding'
import { CommandPalette } from './components/CommandPalette'
import { updateUserSettings, sessionCheck } from './api/auth'
import { trackingStartOf } from './utils/trackingStart'
import {
  resolveTheme, applyAccentColor, applyBackgroundColor, bgColorStorageKey, defaultBgColor,
  DEFAULT_ACCENT_COLOR, type ThemePreference,
} from './utils/theme'

// Initialize appearance preferences from localStorage before first render
;(() => {
  try {
    const html = document.documentElement
    const accent = JSON.parse(localStorage.getItem('accent_color') ?? 'null') as string | null
    const isMobile = window.innerWidth < 768
    const compactKey = isMobile ? 'finvu_compact_mobile' : 'finvu_compact_desktop'
    const compactDefault = isMobile ? 'true' : 'false'
    const compact = JSON.parse(localStorage.getItem(compactKey) ?? compactDefault) as boolean
    const theme = (localStorage.getItem('theme_preference') ?? 'dark') as ThemePreference
    const resolvedTheme = resolveTheme(theme)
    applyAccentColor(accent ?? DEFAULT_ACCENT_COLOR)
    const bgColor = JSON.parse(localStorage.getItem(bgColorStorageKey(resolvedTheme)) ?? 'null') as string | null
    applyBackgroundColor(bgColor ?? defaultBgColor(resolvedTheme), resolvedTheme)
    html.classList.toggle('compact', compact)
    html.setAttribute('data-theme', resolvedTheme)
    html.classList.add(resolvedTheme)
  } catch { /* ignore */ }
})()

export type Page =
  | 'dashboard'
  | 'income'
  | 'variable-expenses'
  | 'fixed-expenses'
  | 'categories'
  | 'settings'
  | 'household'
  | 'savings'
  | 'search'
  | 'annual'

const VALID_PAGES: Page[] = ['dashboard', 'income', 'variable-expenses', 'fixed-expenses', 'categories', 'settings', 'household', 'savings', 'search', 'annual']

function getPageFromHash(): Page {
  const hash = window.location.hash.slice(1).split('?')[0] as Page
  return VALID_PAGES.includes(hash) ? hash : 'dashboard'
}

function App() {
  const { isAuthenticated, isLoading, logout, user } = useAuth()
  const { settings } = useSettingsContext()
  const queryClient = useQueryClient()
  const now = new Date()
  const { variableExpenses: allVariableExpenses } = useVariableExpenses(now.getMonth() + 1, now.getFullYear())
  const { incomes: allIncomes } = useIncomes(now.getMonth() + 1, now.getFullYear())
  // Native OS reminders for fixed expenses due today. Reads the Settings toggle
  // (getNotificationsEnabled → localStorage); fires at most once per expense per day.
  const { fixedExpenses: allFixedExpensesForNotif } = useFixedExpenses()
  useFixedExpenseNotifications(allFixedExpensesForNotif, isAuthenticated)
  const [page, setPage] = useState<Page>(getPageFromHash)
  type AuthPage = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email' | 'privacy-policy'

  function getAuthPageFromHash(): AuthPage {
    const hash = window.location.hash
    if (hash === '#register') return 'register'
    if (hash.startsWith('#verify-email')) return 'verify-email'
    if (hash.startsWith('#reset-password')) return 'reset-password'
    return 'login'
  }

  const [authPage, setAuthPage] = useState<AuthPage>(getAuthPageFromHash)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [dashView, setDashView] = useState<'personal' | 'family'>(() =>
    (localStorage.getItem('finvu_dashboard_view') as 'personal' | 'family') || 'family'
  )
  const { toasts, showToast } = useToast()
  const { t } = useTranslation()

  useEffect(() => {
    if (!isAuthenticated) return
    return subscribeAchievementUnlocks(keys => {
      for (const key of keys) {
        const meta = getAchievementMeta(key)
        const name = meta ? t.achievements.items[meta.i18nKey].name : key
        showToast(name, { variant: 'achievement', icon: meta?.emoji, label: t.achievements.toastLabel })
      }
    })
  }, [isAuthenticated, t, showToast])

  const { locked, lockMethod, verifyPin } = usePinLockContext()
  const { showOnboarding, completeOnboarding } = useOnboarding()
  const needsBudgetTemplate = useBudgetTemplate()
  const [showBudgetTemplate, setShowBudgetTemplate] = useState(false)
  // The template is offered as a dismissible dashboard banner (not a blocking
  // modal) for the session in which the account still needs onboarding.
  // Keyed by user id so it never carries over to another account; it stays up
  // after the tutorial flips onboardingComplete, until dismissed or applied.
  const [budgetTemplateOfferedFor, setBudgetTemplateOfferedFor] = useState<string | null>(null)
  const budgetTemplateOffered = !!user && budgetTemplateOfferedFor === user.id
  const handleDismissBudgetTemplate = () => {
    if (user) dismissBudgetTemplate(user.id)
    setBudgetTemplateOfferedFor(null)
    setShowBudgetTemplate(false)
  }
  const [showTutorial, setShowTutorial] = useState(false)
  const [showTrackingOnboarding, setShowTrackingOnboarding] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [fabTrigger, setFabTrigger] = useState(0)
  const [savingsFabTrigger, setSavingsFabTrigger] = useState(0)
  // Home-screen shortcut / share sheet launch, acted on once signed in.
  const [fabLaunch, setFabLaunch] = useState<FabLaunch | null>(null)
  const [sharedFile, setSharedFile] = useState<File | null>(null)
  const [postLoginReady, setPostLoginReady] = useState(0)

  // Re-apply the per-theme background tint whenever `data-theme` changes
  // (theme toggle can be flipped from Topbar, Login, Settings, ForgotPassword,
  // AuthContext, ...). `--aurora-bg` is set as an inline style so it survives
  // the stylesheet's dark/light block switching, which means it also needs to
  // be swapped by hand when the resolved theme itself switches.
  useEffect(() => {
    const html = document.documentElement
    const reapply = () => {
      const resolved = (html.getAttribute('data-theme') as 'dark' | 'light' | null) ?? 'dark'
      const saved = JSON.parse(localStorage.getItem(bgColorStorageKey(resolved)) ?? 'null') as string | null
      applyBackgroundColor(saved ?? defaultBgColor(resolved), resolved)
    }
    const observer = new MutationObserver(reapply)
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024)
    let resizeTimer: ReturnType<typeof setTimeout>
    const debouncedHandler = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(handler, 150)
    }
    window.addEventListener('resize', debouncedHandler)
    return () => {
      window.removeEventListener('resize', debouncedHandler)
      clearTimeout(resizeTimer)
    }
  }, [])

  // Global ripple effect for .btn-primary and .ripple-btn
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const btn = (e.target as Element).closest('.btn-primary, .ripple-btn')
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const ripple = document.createElement('span')
      ripple.className = 'ripple'
      const size = Math.max(rect.width, rect.height) * 2
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;`
      btn.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const hasNavigated = useRef(false)

  useEffect(() => {
    if (isAuthenticated && !isLoading && !hasNavigated.current) {
      if (sessionStorage.getItem('just_logged_in') === 'true') {
        sessionStorage.removeItem('just_logged_in')
        hasNavigated.current = true

        const loginDate = new Date()
        const m = loginDate.getMonth() + 1
        const y = loginDate.getFullYear()
        const trackingStart = trackingStartOf(user)
        let cancelled = false

        const doNavigate = () => {
          if (cancelled) return
          const target = (user?.defaultPage ?? settings.defaultPage ?? 'dashboard') as Page
          const dest = VALID_PAGES.includes(target) ? target : 'dashboard'
          setPage(dest)
          window.location.hash = dest
          setPostLoginReady(v => v + 1)
        }

        const runPrefetch = async () => {
          // Flush pre-auth empty cache before anything else so stale [] responses are gone
          queryClient.invalidateQueries()

          // Verify session cookie is established before prefetching
          try {
            const { valid } = await sessionCheck()
            if (!valid) { doNavigate(); return }
          } catch {
            doNavigate()
            return
          }

          const prefetches = [
            queryClient.prefetchQuery({ queryKey: incomeQueryKey(m, y, trackingStart), queryFn: () => fetchIncomes(m, y, trackingStart) }),
            queryClient.prefetchQuery({ queryKey: variableExpenseQueryKey(m, y), queryFn: () => fetchVariableExpenses(m, y) }),
            queryClient.prefetchQuery({ queryKey: fixedExpenseQueryKey(m, y, trackingStart), queryFn: () => fetchFixedExpenses(m, y, trackingStart) }),
            queryClient.prefetchQuery({ queryKey: ['categories'], queryFn: fetchCategoriesData }),
            queryClient.prefetchQuery({ queryKey: ['savings'], queryFn: fetchSavingsData }),
            ...(user?.household_enabled && user?.household_id
              ? [queryClient.prefetchQuery({ queryKey: householdQueryKey(), queryFn: fetchHouseholdData })]
              : []),
          ]

          await Promise.all(prefetches.map(p => p.catch(() => {})))
          doNavigate()
        }

        runPrefetch()
        return () => { cancelled = true }
      }
    }
  }, [isAuthenticated, isLoading, user, settings, queryClient])

  useEffect(() => {
    if (isAuthenticated) window.location.hash = page
  }, [page, isAuthenticated])

  // Shortcut or share launch: wait for the post-login navigation, then open the
  // right page or modal. A shared amount only prefills the form.
  useEffect(() => {
    if (!isAuthenticated || isLoading || sessionStorage.getItem('just_logged_in') === 'true') return
    const intent = takePendingIntent()
    if (!intent) return
    if (intent.kind === 'annual') {
      setPage('annual')
    } else if (intent.kind === 'add-income') {
      setPage('income')
      setFabLaunch({ id: Date.now(), type: 'income' })
    } else if (intent.kind === 'add-expense') {
      setPage('variable-expenses')
      setFabLaunch({ id: Date.now(), type: 'variable', amount: intent.amount, note: intent.note })
    } else if (intent.kind === 'import-file') {
      void takeSharedFile().then(file => { if (file) setSharedFile(file) })
    }
  }, [isAuthenticated, isLoading, postLoginReady])

  useEffect(() => {
    if (isAuthenticated && !isLoading && user) {
      const needsTracking = !user.tracking_start_date && !user.onboarding_banner_dismissed
      if (needsTracking && !localStorage.getItem('finvu_tracking_onboarding_shown')) {
        localStorage.setItem('finvu_tracking_onboarding_shown', 'true')
        setShowTrackingOnboarding(true)
        return
      }
      if (needsBudgetTemplate && !isBudgetTemplateDismissed(user.id)) {
        setBudgetTemplateOfferedFor(user.id)
      }
      if (showOnboarding) {
        setShowTutorial(true)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, user])

  useEffect(() => {
    const handler = () => {
      setPage(getPageFromHash())
      if (!isAuthenticated) setAuthPage(getAuthPageFromHash())
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar_collapsed', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  const collapseSidebar = () => {
    setSidebarCollapsed(true)
    try { localStorage.setItem('sidebar_collapsed', 'true') } catch { /* ignore */ }
  }

  const expandSidebar = () => {
    setSidebarCollapsed(false)
    try { localStorage.setItem('sidebar_collapsed', 'false') } catch { /* ignore */ }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') collapseSidebar()
      if (e.key === 'ArrowRight') expandSidebar()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
   
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(open => !open)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleMonthChange = (m: number, y: number) => {
    setMonth(m)
    setYear(y)
  }

  const householdEnabled = user?.household_enabled ?? false

  useEffect(() => {
    if (!isLoading && user && !householdEnabled && dashView === 'family') {
      setDashView('personal')
      localStorage.removeItem('finvu_dashboard_view')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdEnabled, isLoading, user])

  useEffect(() => {
    if (!isLoading && user && householdEnabled && !localStorage.getItem('finvu_dashboard_view')) {
      setDashView('family')
    }
  }, [householdEnabled, isLoading, user])

  const handleDashViewChange = (v: 'personal' | 'family') => {
    setDashView(v)
    localStorage.setItem('finvu_dashboard_view', v)
  }

  const handleToggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
    const next = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme_preference', next)
    document.documentElement.setAttribute('data-theme', next)
    updateUserSettings({ theme: next }).catch(() => {})
  }

  // Keep data-theme in sync with the OS preference while "system" is selected
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      const pref = (localStorage.getItem('theme_preference') ?? 'dark') as ThemePreference
      if (pref === 'system') {
        document.documentElement.setAttribute('data-theme', resolveTheme('system'))
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleLogout = async () => {
    hasNavigated.current = false
    setPage('dashboard')
    setIsProfileOpen(false)
    window.location.hash = ''
    await logout()
    setAuthPage('login')
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100svh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--violet)', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const getTokenFromHash = () => {
    const query = window.location.hash.split('?')[1] ?? ''
    return new URLSearchParams(query).get('token') ?? ''
  }

  function goAuthPage(p: AuthPage) {
    setAuthPage(p)
    if (p === 'login') window.location.hash = 'login'
    else if (p === 'register') window.location.hash = 'register'
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={null}>
        <ToastContainer toasts={toasts} />
        {authPage === 'register' && (
          <RegisterPage
            onNavigateLogin={() => goAuthPage('login')}
            onNavigatePrivacyPolicy={() => setAuthPage('privacy-policy')}
          />
        )}
        {authPage === 'forgot-password' && (
          <ForgotPasswordPage onNavigateLogin={() => goAuthPage('login')} />
        )}
        {authPage === 'reset-password' && (
          <ResetPasswordPage
            token={getTokenFromHash()}
            onNavigateLogin={() => goAuthPage('login')}
          />
        )}
        {authPage === 'verify-email' && (
          <VerifyEmailPage
            token={getTokenFromHash()}
            onNavigateLogin={() => goAuthPage('login')}
          />
        )}
        {authPage === 'privacy-policy' && <PrivacyPolicyPage />}
        {authPage === 'login' && (
          <LoginPage
            onNavigateRegister={() => goAuthPage('register')}
            onNavigateForgotPassword={() => setAuthPage('forgot-password')}
          />
        )}
      </Suspense>
    )
  }

  return (
    <div style={{
      display: 'flex',
      height: '100svh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--aurora-bg-image)',
    }}>
      <PWAUpdateBanner />
      {locked && lockMethod === 'pin' && (
        <PinLock
          onVerify={verifyPin}
          onFallbackToLogin={handleLogout}
        />
      )}
      <ToastContainer toasts={toasts} />

      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={(p) => { setPage(p); setCmdPaletteOpen(false) }}
        onAdd={(type) => { setPage(type === 'income' ? 'income' : 'variable-expenses'); setCmdPaletteOpen(false) }}
        onToggleTheme={() => { handleToggleTheme(); setCmdPaletteOpen(false) }}
        transactions={[
          ...allVariableExpenses.map(t => ({ id: t.id ?? '', label: t.note || '—', amount: -t.amount, date: t.date, type: 'expense' as const })),
          ...allIncomes.map(i => ({ id: i.id ?? '', label: i.label, amount: i.amount, date: i.date, type: 'income' as const })),
        ]}
        onTransactionNavigate={(type) => { setPage(type === 'income' ? 'income' : 'variable-expenses'); setCmdPaletteOpen(false) }}
      />

      {/* Sidebar — desktop only */}
      {isDesktop && (
        <AppNav
          current={page}
          onChange={setPage}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      )}

      {/* Physical gap between sidebar and main — transparent so the app
          shell's radial background glow (set on the wrapper above) shows
          through continuously across sidebar + gap + main, with no seams. */}
      {isDesktop && (
        <div style={{ width: '12px', flexShrink: 0, background: 'transparent' }} />
      )}

      {/* Main content column */}
      <main style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'transparent',
      }}>
        <Topbar
          page={page}
          month={month}
          year={year}
          onMonthChange={handleMonthChange}
          dashView={dashView}
          onDashViewChange={handleDashViewChange}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAdd={() => { if (page === 'savings') setSavingsFabTrigger(v => v + 1); else setFabTrigger(v => v + 1) }}
          onNavigate={setPage}
          onToggleTheme={handleToggleTheme}
        />
        <OfflineStatus />
        <PullToRefresh onRefresh={() => queryClient.refetchQueries()}>
          <Suspense fallback={null}>
          {page === 'dashboard' && (
            <Dashboard
              month={month} year={year} onNavigate={setPage} dashView={dashView}
              budgetTemplateOffer={budgetTemplateOffered ? {
                onOpen: () => setShowBudgetTemplate(true),
                onDismiss: handleDismissBudgetTemplate,
              } : undefined}
            />
          )}
          {page === 'income' && (
            <IncomePage month={month} year={year} />
          )}
          {page === 'variable-expenses' && (
            <VariableExpensesPage month={month} year={year} showToast={showToast} />
          )}
          {page === 'fixed-expenses' && (
            <FixedExpensesPage month={month} year={year} />
          )}
          {page === 'categories' && <CategoriesPage showToast={showToast} />}
          {page === 'search' && <SearchPage scope={dashView} />}
          {page === 'annual' && <AnnualPage scope={dashView} />}
          {(page === 'settings' || page === 'household') && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '20px', minHeight: '100%' }}>
                {page === 'settings' && <SettingsPage />}
                {page === 'household' && <HouseholdPage month={month} year={year} showToast={showToast} />}
              </div>
            </div>
          )}
          {page === 'savings' && <SavingsPage openAddTrigger={savingsFabTrigger} />}
          </Suspense>
        </PullToRefresh>
      </main>

      {/* Global FAB — mobile circle button + shared add modal */}
      <GlobalFAB
        month={month}
        year={year}
        showToast={showToast}
        currentPage={page}
        openTrigger={fabTrigger}
        launch={fabLaunch}
      />

      {/* camt.053 file handed over by the share sheet */}
      <CsvImportModal open={!!sharedFile} initialFile={sharedFile} onClose={() => setSharedFile(null)} />

      {/* Mobile bottom nav */}
      {!isDesktop && <BottomNav current={page} onChange={setPage} />}

      {showBudgetTemplate && (
        <BudgetTemplateModal
          onComplete={handleDismissBudgetTemplate}
          onClose={() => setShowBudgetTemplate(false)}
        />
      )}
      {showTutorial && !showBudgetTemplate && (
        <OnboardingTutorial onComplete={() => { completeOnboarding(); setShowTutorial(false) }} />
      )}

      {isProfileOpen && (
        <Suspense fallback={null}>
          <ProfileModal onClose={() => setIsProfileOpen(false)} onLogout={handleLogout} />
        </Suspense>
      )}
      {showTrackingOnboarding && (
        <TrackingDateOnboarding onDone={() => setShowTrackingOnboarding(false)} />
      )}

    </div>
  )
}

function getReportToken(): string | null {
  const hash = window.location.hash
  if (hash.startsWith('#report/')) return hash.slice('#report/'.length) || null
  return null
}

function Root() {
  const [routeKey, setRouteKey] = useState(() => window.location.hash)
  const { shownLang } = useTranslation()

  // Keep <html lang> in sync with the UI language (screen readers, hyphenation,
  // and the browser's "translate this page?" prompt rely on it). Languages load
  // lazily, so this follows the language actually on screen and flips once the
  // chunk has arrived.
  useEffect(() => {
    document.documentElement.lang = shownLang
  }, [shownLang])

  useEffect(() => {
    const handler = () => setRouteKey(window.location.hash)
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if (routeKey.startsWith('#admin')) return <Suspense fallback={null}><AdminPage /></Suspense>
  const reportToken = getReportToken()
  if (reportToken) return <Suspense fallback={null}><SharedReportPage token={reportToken} /></Suspense>
  return <PinLockProvider><App /></PinLockProvider>
}

export default Root

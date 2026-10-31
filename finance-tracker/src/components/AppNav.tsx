import { useState, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  LayoutDashboard, TrendingUp, CreditCard, Settings,
  Receipt, Lock, Tag, Search, ChevronLeft, ChevronRight, ChevronDown, PiggyBank, CalendarRange,
} from 'lucide-react'
import type { Page } from '../App'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'

interface AppNavProps {
  current: Page
  onChange: (page: Page) => void
  collapsed: boolean
  onToggle: () => void
  onOpenProfile?: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const EXPENSE_CHILDREN: Page[] = ['variable-expenses', 'fixed-expenses', 'categories', 'search']

export function AppNav({ current, onChange, collapsed, onToggle, mobileOpen, onMobileClose }: AppNavProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isExpanded = !collapsed
  const expensesActive = EXPENSE_CHILDREN.includes(current)
  const [expOpen, setExpOpen] = useState(expensesActive)

  // Adjust state during render (https://react.dev/learn/you-might-not-need-an-effect)
  const [prevCurrent, setPrevCurrent] = useState(current)
  if (current !== prevCurrent) {
    setPrevCurrent(current)
    if (expensesActive && isExpanded) setExpOpen(true)
    else if (!expensesActive) setExpOpen(false)
  }

  const [submenuVisible, setSubmenuVisible] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const expensesBtnRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openSubmenu() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    const rect = expensesBtnRef.current?.getBoundingClientRect()
    if (rect) setSubmenuY(rect.top)
    setSubmenuVisible(true)
  }

  function closeSubmenu() {
    hideTimerRef.current = setTimeout(() => setSubmenuVisible(false), 160)
  }

  function handleChange(p: Page) {
    onChange(p)
    onMobileClose?.()
  }

  const navItemStyle = (isActive: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: isExpanded ? '9px 10px' : '9px',
    justifyContent: isExpanded ? 'flex-start' : 'center',
    borderRadius: 10,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#fff' : 'var(--aurora-lo)',
    background: isActive ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginBottom: 2,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    width: '100%',
    border: 'none',
    textAlign: 'left' as const,
    fontFamily: "'Manrope', sans-serif",
  })

  function hoverOn(e: React.MouseEvent<HTMLButtonElement>, active: boolean) {
    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--aurora-glass)'
  }
  function hoverOff(e: React.MouseEvent<HTMLButtonElement>, active: boolean) {
    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }}
          onClick={onMobileClose}
        />
      )}

      <aside
        style={{
          width: isExpanded ? 'var(--sidebar-w)' : 'var(--sidebar-collapsed-w)',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          flexShrink: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          // Transparent — lets the app shell's radial background glow (set
          // on the flex wrapper in App.tsx) show through the sidebar the
          // same way it does behind the main content, matching the Revolut
          // reference where sidebar and content share one continuous glow.
          background: 'transparent',
          borderRight: '1px solid var(--aurora-gline)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '18px 14px',
          borderBottom: '1px solid var(--aurora-gline)',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <img src="/logo.svg" alt="Finvu" width={34} height={34} style={{ flexShrink: 0 }} />
          {isExpanded && (
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>Finvu</span>
              <div style={{ fontSize: 12, color: 'var(--aurora-faint)', fontFamily: "'Manrope', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>{t.nav.appTagline}</div>
            </div>
          )}
        </div>

        {/* Main nav items */}
        <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', overflowX: 'hidden' }}>

          {/* Prehľad */}
          <button
            onClick={() => handleChange('dashboard')}
            className="t-nav"
            style={navItemStyle(current === 'dashboard')}
            onMouseEnter={e => hoverOn(e, current === 'dashboard')}
            onMouseLeave={e => hoverOff(e, current === 'dashboard')}
            aria-label={t.nav.overview}
            aria-current={current === 'dashboard' ? 'page' : undefined}
          >
            <LayoutDashboard size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {isExpanded && t.nav.overview}
          </button>

          {/* Príjmy */}
          <button
            onClick={() => handleChange('income')}
            className="t-nav"
            style={navItemStyle(current === 'income')}
            onMouseEnter={e => hoverOn(e, current === 'income')}
            onMouseLeave={e => hoverOff(e, current === 'income')}
            aria-label={t.nav.income}
            aria-current={current === 'income' ? 'page' : undefined}
          >
            <TrendingUp size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {isExpanded && t.nav.income}
          </button>

          {/* Výdavky */}
          <div
            ref={expensesBtnRef}
            style={{ position: 'relative' }}
            onMouseEnter={() => { if (!isExpanded) openSubmenu() }}
            onMouseLeave={() => { if (!isExpanded) closeSubmenu() }}
          >
            <button
              onClick={() => {
                if (isExpanded) setExpOpen(v => !v)
                else handleChange('variable-expenses')
              }}
              className="t-nav"
              style={{ ...navItemStyle(expensesActive), display: 'flex', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => hoverOn(e, expensesActive)}
              onMouseLeave={e => hoverOff(e, expensesActive)}
              aria-label={t.nav.expenses}
              aria-current={expensesActive ? 'page' : undefined}
              aria-expanded={isExpanded ? expOpen : undefined}
            >
              <CreditCard size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              {isExpanded && (
                <>
                  <span style={{ flex: 1 }}>{t.nav.expenses}</span>
                  {expOpen ? <ChevronDown size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
                </>
              )}
            </button>

            {/* Expanded inline submenu */}
            {isExpanded && (
              <div style={{
                overflow: 'hidden',
                maxHeight: expOpen ? '200px' : '0px',
                transition: 'max-height 0.25s ease-in-out',
              }}>
                <div style={{ paddingLeft: 20, marginTop: 2 }}>
                  <SubNavItem
                    active={current === 'variable-expenses'}
                    onClick={() => handleChange('variable-expenses')}
                    icon={<Receipt size={15} strokeWidth={1.5} />}
                    label={t.nav.variable}
                  />
                  <SubNavItem
                    active={current === 'fixed-expenses'}
                    onClick={() => handleChange('fixed-expenses')}
                    icon={<Lock size={15} strokeWidth={1.5} />}
                    label={t.nav.fixed}
                  />
                  <SubNavItem
                    active={current === 'categories'}
                    onClick={() => handleChange('categories')}
                    icon={<Tag size={15} strokeWidth={1.5} />}
                    label={t.nav.categories}
                  />
                  <SubNavItem
                    active={current === 'search'}
                    onClick={() => handleChange('search')}
                    icon={<Search size={15} strokeWidth={1.5} />}
                    label={t.nav.search}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Collapsed hover submenu — fixed positioned, escapes aside overflow:hidden */}
          {!isExpanded && submenuVisible && (
            <div
              style={{
                position: 'fixed',
                left: 'var(--sidebar-collapsed-w)',
                top: submenuY,
                background: 'var(--aurora-panel)',
                border: '1px solid var(--aurora-gline)',
                borderRadius: '0 12px 12px 0',
                padding: '6px 0',
                minWidth: '170px',
                zIndex: 300,
                boxShadow: '4px 4px 20px rgba(0,0,0,0.5)',
              }}
              onMouseEnter={openSubmenu}
              onMouseLeave={closeSubmenu}
            >
              <div style={{ padding: '6px 16px 4px', fontSize: '12px', color: 'var(--aurora-faint)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                {t.nav.expenses}
              </div>
              {([
                { page: 'variable-expenses' as Page, icon: <Receipt size={13} strokeWidth={1.5} />, label: t.nav.variable },
                { page: 'fixed-expenses' as Page, icon: <Lock size={13} strokeWidth={1.5} />, label: t.nav.fixed },
                { page: 'categories' as Page, icon: <Tag size={13} strokeWidth={1.5} />, label: t.nav.categories },
                { page: 'search' as Page, icon: <Search size={13} strokeWidth={1.5} />, label: t.nav.search },
              ]).map(item => (
                <button
                  key={item.page}
                  onClick={() => { handleChange(item.page); setSubmenuVisible(false) }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    fontSize: 12,
                    fontWeight: current === item.page ? 600 : 500,
                    color: current === item.page ? '#fff' : 'var(--aurora-lo)',
                    background: current === item.page ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Manrope', sans-serif",
                    textAlign: 'left',
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Sporenie */}
          {user?.savings_enabled && (
            <button
              onClick={() => handleChange('savings')}
              className="t-nav"
              style={navItemStyle(current === 'savings')}
              onMouseEnter={e => hoverOn(e, current === 'savings')}
              onMouseLeave={e => hoverOff(e, current === 'savings')}
              aria-label={t.nav.savings}
              aria-current={current === 'savings' ? 'page' : undefined}
            >
              <PiggyBank size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              {isExpanded && t.nav.savings}
            </button>
          )}

          {/* Ročný prehľad */}
          <button
            onClick={() => handleChange('annual')}
            className="t-nav"
            style={navItemStyle(current === 'annual')}
            onMouseEnter={e => hoverOn(e, current === 'annual')}
            onMouseLeave={e => hoverOff(e, current === 'annual')}
            aria-label={t.nav.annual}
            aria-current={current === 'annual' ? 'page' : undefined}
          >
            <CalendarRange size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {isExpanded && t.nav.annual}
          </button>

          {/* Domácnosť */}
          {user?.household_enabled && (
            <button
              onClick={() => handleChange('household')}
              className="t-nav"
              style={navItemStyle(current === 'household')}
              onMouseEnter={e => hoverOn(e, current === 'household')}
              onMouseLeave={e => hoverOff(e, current === 'household')}
              aria-label={t.nav.household}
              aria-current={current === 'household' ? 'page' : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              {isExpanded && t.nav.household}
            </button>
          )}
        </div>

        {/* Bottom section: Nastavenia + Profile */}
        <div style={{ borderTop: '1px solid var(--aurora-gline)', padding: '8px', flexShrink: 0 }}>
          {/* Nastavenia */}
          <button
            onClick={() => handleChange('settings')}
            className="t-nav"
            style={navItemStyle(current === 'settings')}
            onMouseEnter={e => hoverOn(e, current === 'settings')}
            onMouseLeave={e => hoverOff(e, current === 'settings')}
            aria-label={t.nav.settings}
            aria-current={current === 'settings' ? 'page' : undefined}
          >
            <Settings size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            {isExpanded && t.nav.settings}
          </button>

          </div>

        {/* Expand/collapse toggle */}
        <button
          onClick={onToggle}
          aria-label={isExpanded ? t.nav.collapseSidebar : t.nav.expandSidebar}
          style={{
            position: 'absolute',
            right: -12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 24, height: 24,
            borderRadius: '50%',
            background: 'var(--aurora-panel)',
            border: '1px solid var(--aurora-gline)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--aurora-faint)',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {isExpanded ? <ChevronLeft size={11} strokeWidth={1.5} /> : <ChevronRight size={11} strokeWidth={1.5} />}
        </button>
      </aside>
    </>
  )
}

function SubNavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? '#fff' : 'var(--aurora-lo)',
        background: active ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
        cursor: 'pointer',
        width: '100%',
        border: 'none',
        fontFamily: "'Manrope', sans-serif",
        marginBottom: 2,
        transition: 'all 0.15s',
        textAlign: 'left',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

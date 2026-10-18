import { useState } from 'react'
import { Home, TrendingUp, Settings, Receipt, Lock, Tag, Search, PiggyBank, MoreHorizontal } from 'lucide-react'
import type { Page } from '../App'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useScrollCollapse } from '../hooks/useScrollCollapse'

interface BottomNavProps {
  current: Page
  onChange: (page: Page) => void
}

const EXPENSE_PAGES: Page[] = ['variable-expenses', 'fixed-expenses', 'categories', 'search']
const VIAC_PAGES: Page[] = ['savings', 'household']

export function BottomNav({ current, onChange }: BottomNavProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const expensesActive = EXPENSE_PAGES.includes(current)
  const householdEnabled = user?.household_enabled ?? false
  const savingsEnabled = user?.savings_enabled ?? false
  const showViac = savingsEnabled && householdEnabled
  const showOnlySavings = savingsEnabled && !householdEnabled
  const showOnlyHousehold = householdEnabled && !savingsEnabled
  const viacActive = VIAC_PAGES.includes(current)

  const [showExpenseMenu, setShowExpenseMenu] = useState(false)
  const [showViacSheet, setShowViacSheet] = useState(false)
  const collapsed = useScrollCollapse()
  const menuOpen = showExpenseMenu || showViacSheet

  const submenuCardStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
    left: '20px',
    right: '20px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%), var(--aurora-panel)',
    border: '1px solid rgba(139,92,246,0.22)',
    borderRadius: '16px',
    padding: '10px 8px 8px',
    zIndex: 99,
    boxShadow: '0 -8px 28px rgba(139,92,246,0.16), 0 -10px 30px rgba(0,0,0,0.4)',
  }

  const dragHandle = (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--aurora-faint)' }} />
    </div>
  )

  function handleExpenseNav(page: Page) {
    onChange(page)
    setShowExpenseMenu(false)
  }

  function handleViacNav(page: Page) {
    onChange(page)
    setShowViacSheet(false)
  }

  return (
    <>
      {/* Expense submenu popup */}
      {showExpenseMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 98 }}
            onClick={() => setShowExpenseMenu(false)}
          />
          <div style={submenuCardStyle}>
            {dragHandle}
            {([
              { icon: <Receipt size={16} />, label: t.nav.variable, page: 'variable-expenses' as Page },
              { icon: <Lock size={16} />, label: t.nav.fixed, page: 'fixed-expenses' as Page },
              { icon: <Tag size={16} />, label: t.nav.categories, page: 'categories' as Page },
              { icon: <Search size={16} />, label: t.nav.search, page: 'search' as Page },
            ] as const).map(item => (
              <button
                key={item.page}
                onClick={() => handleExpenseNav(item.page)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  background: current === item.page ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  color: current === item.page ? '#fff' : 'var(--aurora-lo)',
                  fontSize: '14px',
                  fontFamily: "'Manrope', sans-serif",
                  fontWeight: current === item.page ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Viac popup */}
      {showViacSheet && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 98 }}
            onClick={() => setShowViacSheet(false)}
          />
          <div style={submenuCardStyle}>
            {dragHandle}
            {savingsEnabled && (
              <button
                onClick={() => handleViacNav('savings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  background: current === 'savings' ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  color: current === 'savings' ? '#fff' : 'var(--aurora-lo)',
                  fontSize: '14px',
                  fontFamily: "'Manrope', sans-serif",
                  fontWeight: current === 'savings' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <PiggyBank size={16} />
                {t.nav.savings}
              </button>
            )}
            {householdEnabled && (
              <button
                onClick={() => handleViacNav('household')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  background: current === 'household' ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  color: current === 'household' ? '#fff' : 'var(--aurora-lo)',
                  fontSize: '14px',
                  fontFamily: "'Manrope', sans-serif",
                  fontWeight: current === 'household' ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                {t.nav.household}
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, display: 'flex', justifyContent: 'center' }}>
        <nav
          className="bottom-nav-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(7,6,11,.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--aurora-gline)',
            padding: collapsed ? '6px 10px' : '8px 10px',
            paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
            width: collapsed ? 'auto' : 'calc(100% - 32px)',
            maxWidth: collapsed ? 320 : 480,
            borderRadius: 999,
            marginBottom: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            gap: collapsed ? 0 : 4,
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), max-width 0.35s cubic-bezier(0.4,0,0.2,1), padding 0.35s cubic-bezier(0.4,0,0.2,1), gap 0.3s ease',
          }}
        >
          <NavTab
            active={current === 'dashboard' && !menuOpen}
            collapsed={collapsed}
            icon={<Home size={20} />}
            label={t.nav.overview}
            onClick={() => { setShowExpenseMenu(false); setShowViacSheet(false); onChange('dashboard') }}
          />
          <NavTab
            active={current === 'income' && !menuOpen}
            collapsed={collapsed}
            icon={<TrendingUp size={20} />}
            label={t.nav.income}
            onClick={() => { setShowExpenseMenu(false); setShowViacSheet(false); onChange('income') }}
          />
          <NavTab
            active={showExpenseMenu || (expensesActive && !showViacSheet)}
            collapsed={collapsed}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            }
            label={t.nav.expenses}
            onClick={() => { setShowViacSheet(false); setShowExpenseMenu(s => !s) }}
          />
          <NavTab
            active={current === 'settings' && !menuOpen}
            collapsed={collapsed}
            icon={<Settings size={20} />}
            label={t.nav.settings}
            onClick={() => { setShowExpenseMenu(false); setShowViacSheet(false); onChange('settings') }}
          />
          {showViac && (
            <NavTab
              active={showViacSheet || (viacActive && !showExpenseMenu)}
              collapsed={collapsed}
              icon={<MoreHorizontal size={20} />}
              label={t.nav.more}
              onClick={() => { setShowExpenseMenu(false); setShowViacSheet(s => !s) }}
            />
          )}
          {showOnlySavings && (
            <NavTab
              active={current === 'savings' && !menuOpen}
              collapsed={collapsed}
              icon={<PiggyBank size={20} />}
              label={t.nav.savings}
              onClick={() => { setShowExpenseMenu(false); onChange('savings') }}
            />
          )}
          {showOnlyHousehold && (
            <NavTab
              active={current === 'household' && !menuOpen}
              collapsed={collapsed}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              }
              label={t.nav.household}
              onClick={() => { setShowExpenseMenu(false); onChange('household') }}
            />
          )}
        </nav>
      </div>
    </>
  )
}

function NavTab({
  active,
  collapsed,
  icon,
  label,
  onClick,
}: {
  active: boolean
  collapsed: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  // Expanded: every tab shows icon-above-label; the active tab additionally
  // gets the gradient highlight pill behind it.
  // Collapsed: every tab (active or not) shows icon only, all at the same
  // size — the active tab still stands out via the gradient pill background.
  const showLabel = !collapsed
  return (
    <button
      onClick={onClick}
      style={{
        flex: collapsed ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: collapsed ? 0 : 4,
        padding: collapsed ? '8px' : '7px 6px 9px',
        borderRadius: collapsed ? 999 : 16,
        fontSize: 10,
        fontWeight: 500,
        color: active ? '#fff' : 'var(--aurora-faint)',
        cursor: 'pointer',
        fontFamily: "'Manrope', sans-serif",
        background: active ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
        border: 'none',
        whiteSpace: 'nowrap',
        transition: 'flex-basis 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s cubic-bezier(0.4,0,0.2,1), background 0.3s ease, color 0.2s ease, gap 0.3s ease',
      }}
    >
      <div style={{
        width: 32, height: 32,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{
        display: 'inline-block',
        maxWidth: showLabel ? 'none' : 0,
        // Collapse the label's vertical footprint too — otherwise its line box
        // still occupies height in the icon-only state and the icon is pushed
        // above the tab's vertical centre.
        maxHeight: showLabel ? 16 : 0,
        lineHeight: showLabel ? 1.2 : 0,
        opacity: showLabel ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-width 0.3s cubic-bezier(0.4,0,0.2,1), max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      }}>
        {label}
      </span>
    </button>
  )
}

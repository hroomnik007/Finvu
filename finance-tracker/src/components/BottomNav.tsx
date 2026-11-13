import { useEffect, useState } from 'react'
import { Home, TrendingUp, Settings, Search, PiggyBank, MoreHorizontal, CalendarRange } from 'lucide-react'
import type { Page } from '../App'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useScrollCollapse } from '../hooks/useScrollCollapse'
import { activeBottomTab, bottomTabs, moreMenuPages, type BottomTabId } from '../utils/bottomNav'

interface BottomNavProps {
  current: Page
  onChange: (page: Page) => void
}

const HouseIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const CardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
  </svg>
)

export function BottomNav({ current, onChange }: BottomNavProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const householdEnabled = user?.household_enabled ?? false
  const savingsEnabled = user?.savings_enabled ?? false

  // The "Viac" sheet remembers the page it was opened on, so any navigation
  // (a tab, a link in the page, the back button) closes it without an effect.
  const [menuOpenedOn, setMenuOpenedOn] = useState<Page | null>(null)
  const openMenu: 'more' | null = menuOpenedOn === current ? 'more' : null
  const setOpenMenu = (m: 'more' | null) => setMenuOpenedOn(m ? current : null)
  const collapsed = useScrollCollapse()
  const tabs = bottomTabs({ householdEnabled })
  // Household opened while the module is off has no tab of its own
  const pageTab = activeBottomTab(current)
  const active = tabs.includes(pageTab) ? pageTab : 'more'

  useEffect(() => {
    if (!openMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpenedOn(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openMenu])

  const submenuCardStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 'calc(var(--nav-clearance) + 8px)',
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

  const pageItem: Record<string, { icon: React.ReactNode; label: string }> = {
    search: { icon: <Search size={16} aria-hidden />, label: t.nav.search },
    savings: { icon: <PiggyBank size={16} aria-hidden />, label: t.nav.savings },
    annual: { icon: <CalendarRange size={16} aria-hidden />, label: t.nav.annual },
    settings: { icon: <Settings size={16} aria-hidden />, label: t.nav.settings },
  }

  function go(page: Page) {
    setOpenMenu(null)
    onChange(page)
  }

  const menu = openMenu && (
    <>
      <div className="nav-menu-backdrop" onClick={() => setOpenMenu(null)} />
      <div
        id="bottom-nav-menu-more"
        role="menu"
        aria-label={t.nav.more}
        style={submenuCardStyle}
      >
        {dragHandle}
        {moreMenuPages({ savingsEnabled }).map(page => {
          const on = current === page
          return (
            <button
              key={page}
              role="menuitem"
              aria-current={on ? 'page' : undefined}
              onClick={() => go(page)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px',
                background: on ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
                border: 'none', borderRadius: '12px',
                color: on ? '#fff' : 'var(--aurora-lo)',
                fontSize: '14px', fontFamily: "'Manrope', sans-serif", fontWeight: on ? 600 : 500,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {pageItem[page].icon}
              {pageItem[page].label}
            </button>
          )
        })}
      </div>
    </>
  )

  const tabDef: Record<BottomTabId, { icon: React.ReactNode; label: string; onClick: () => void; menu?: 'more' }> = {
    dashboard: { icon: <Home size={20} aria-hidden />, label: t.nav.overview, onClick: () => go('dashboard') },
    income: { icon: <TrendingUp size={20} aria-hidden />, label: t.nav.income, onClick: () => go('income') },
    // Straight to the one-off expenses; Fixed and Categories are a switch at the top of the page (ExpenseTabs)
    expenses: { icon: <CardIcon />, label: t.nav.expenses, onClick: () => go('variable-expenses') },
    household: { icon: <HouseIcon size={20} />, label: t.nav.household, onClick: () => go('household') },
    more: { icon: <MoreHorizontal size={20} aria-hidden />, label: t.nav.more, menu: 'more', onClick: () => setOpenMenu(openMenu ? null : 'more') },
  }

  return (
    <>
      {menu}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, display: 'flex', justifyContent: 'center' }}>
        <nav
          className="bottom-nav-bar"
          aria-label={t.nav.appName}
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(7,6,11,.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--aurora-gline)',
            // Fixed inner padding: the home indicator inset goes into the
            // margin below, so the pill keeps its shape on iPhone.
            padding: collapsed ? '6px 10px 10px' : '8px 10px 10px',
            width: collapsed ? 'auto' : 'calc(100% - 32px)',
            maxWidth: collapsed ? 320 : 480,
            borderRadius: 999,
            marginBottom: 'calc(var(--nav-gap) + var(--safe-bottom))',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            gap: collapsed ? 0 : 4,
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), max-width 0.35s cubic-bezier(0.4,0,0.2,1), padding 0.35s cubic-bezier(0.4,0,0.2,1), gap 0.3s ease',
          }}
        >
          {tabs.map(id => {
            const d = tabDef[id]
            // An open menu takes the highlight; otherwise the current page's tab.
            const isActive = openMenu ? openMenu === id : active === id
            return (
              <NavTab
                key={id}
                active={isActive}
                current={!d.menu && active === id}
                collapsed={collapsed}
                icon={d.icon}
                label={d.label}
                onClick={d.onClick}
                menuId={d.menu ? `bottom-nav-menu-${d.menu}` : undefined}
                expanded={d.menu ? openMenu === d.menu : undefined}
              />
            )
          })}
        </nav>
      </div>
    </>
  )
}

function NavTab({
  active,
  current,
  collapsed,
  icon,
  label,
  onClick,
  menuId,
  expanded,
}: {
  active: boolean
  current: boolean
  collapsed: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
  menuId?: string
  expanded?: boolean
}) {
  // Expanded: every tab shows icon-above-label; the active tab additionally
  // gets the gradient highlight pill behind it.
  // Collapsed: every tab (active or not) shows icon only, all at the same
  // size — the active tab still stands out via the gradient pill background.
  const showLabel = !collapsed
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      aria-haspopup={menuId ? 'menu' : undefined}
      aria-expanded={menuId ? !!expanded : undefined}
      aria-controls={menuId && expanded ? menuId : undefined}
      style={{
        flex: collapsed ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: collapsed ? 0 : 4,
        padding: collapsed ? '8px' : '7px 6px 9px',
        borderRadius: collapsed ? 999 : 16,
        fontSize: 12,
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

import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Page } from '../App'
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { isPhotoUrl, avatarSrc, monogramGradientFor } from '../utils/avatar'
import { NotificationCenter } from './NotificationCenter'

const MONTH_PAGES: Page[] = ['dashboard', 'income', 'variable-expenses', 'fixed-expenses', 'household']

interface TopbarProps {
  page: Page
  month: number
  year: number
  onMonthChange: (month: number, year: number) => void
  dashView: 'personal' | 'family'
  onDashViewChange: (v: 'personal' | 'family') => void
  onOpenProfile: () => void
  onOpenAdd?: () => void
  onNavigate?: (page: Page) => void
  onToggleTheme: () => void
}

export function Topbar({ page, month, year, onMonthChange, dashView, onDashViewChange, onOpenProfile, onOpenAdd, onNavigate, onToggleTheme }: TopbarProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const current = document.documentElement.getAttribute('data-theme')
      return current === 'light' ? 'light' : 'dark'
    } catch { return 'dark' }
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
      if (current === 'dark' || current === 'light') setTheme(current)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const householdEnabled = user?.household_enabled ?? false
  const showMonth = MONTH_PAGES.includes(page)
  const showToggle = householdEnabled && (page === 'dashboard' || page === 'annual')
  const showAdd = !(['household', 'settings'] as string[]).includes(page)

  const minDate = useMemo(() => {
    const src = user?.tracking_start_date ?? user?.createdAt
    if (src) {
      const d = new Date(src)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }, [user])

  const canGoPrev = year > minDate.year || (year === minDate.year && month > minDate.month)

  const prevMonth = () => {
    if (!canGoPrev) return
    if (month === 1) onMonthChange(12, year - 1)
    else onMonthChange(month - 1, year)
  }
  const nextMonth = () => {
    if (month === 12) onMonthChange(1, year + 1)
    else onMonthChange(month + 1, year)
  }

  const divider = (
    <div style={{ width: 1, height: 24, background: 'var(--aurora-gline)', flexShrink: 0 }} />
  )

  const logoMark = (size: number) => (
    <img
      src="/logo.svg"
      alt="Finvu"
      onClick={() => { window.location.hash = 'dashboard' }}
      style={{ width: size, height: size, flexShrink: 0, cursor: 'pointer' }}
    />
  )

  const monthNav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 20, padding: 3, flexShrink: 0 }}>
      <button
        type="button"
        className="hit-44"
        onClick={prevMonth}
        disabled={!canGoPrev}
        aria-label={t.common.prevMonth}
        title={t.common.prevMonth}
        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: canGoPrev ? 'pointer' : 'default', color: canGoPrev ? 'var(--aurora-lo)' : 'var(--aurora-faint)', borderRadius: 7 }}
        onMouseEnter={e => { if (canGoPrev) (e.currentTarget as HTMLElement).style.background = 'var(--aurora-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif", whiteSpace: 'nowrap', padding: '0 8px', minWidth: 96, textAlign: 'center' }}>
        {t.months[month - 1]} {year}
      </span>
      <button type="button" className="hit-44" onClick={nextMonth} aria-label={t.common.nextMonth} title={t.common.nextMonth} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--aurora-lo)', borderRadius: 7 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--aurora-hover)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )

  const familyToggle = (
    <div role="group" aria-label={t.common.viewScope} style={{ display: 'flex', borderRadius: 20, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', padding: 2, gap: 2 }}>
      {(['personal', 'family'] as const).map(v => (
        <button
          key={v}
          type="button"
          className="hit-44"
          aria-pressed={dashView === v}
          onClick={() => onDashViewChange(v)}
          style={{
            height: 26, padding: '0 10px', borderRadius: 18, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: dashView === v ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'transparent',
            color: dashView === v ? '#fff' : 'var(--aurora-lo)',
            fontFamily: "'Manrope', sans-serif",
            transition: 'all 0.15s',
          }}
        >
          {v === 'personal' ? t.dashboard.viewPersonal : t.dashboard.viewFamily}
        </button>
      ))}
    </div>
  )

  const avatarMonogram = monogramGradientFor(user?.avatarUrl)

  const avatarEl = (size: number) => (
    <button
      onClick={onOpenProfile}
      style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: isPhotoUrl(user?.avatarUrl) ? 'transparent' : avatarMonogram ? `linear-gradient(135deg,${avatarMonogram[0]},${avatarMonogram[1]})` : 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: '1px solid var(--aurora-gline)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {isPhotoUrl(user?.avatarUrl) ? (
        <img src={avatarSrc(user!.avatarUrl!)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : avatarMonogram ? (
        <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </span>
      ) : user?.avatarUrl ? (
        <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{user.avatarUrl}</span>
      ) : (
        <span style={{ color: '#fff', fontSize: size * 0.38, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </span>
      )}
    </button>
  )

  const themeToggleBtn = (
    <button
      type="button"
      className="hit-44"
      onClick={onToggleTheme}
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--aurora-glass)',
        border: '1px solid var(--aurora-gline)',
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--aurora-lo)', flexShrink: 0,
      }}
      title={theme === 'dark' ? t.auth.lightMode : t.auth.darkMode}
      aria-label={theme === 'dark' ? t.auth.switchToLight : t.auth.switchToDark}
    >
      {theme === 'dark' ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  )

  const barStyle: CSSProperties = {
    // Transparent so the app shell's radial background glow shows through
    // continuously instead of a flat seam at the top-left where the topbar
    // meets the sidebar.
    background: 'transparent',
    borderBottom: '1px solid var(--aurora-gline)',
    flexShrink: 0,
  }

  return (
    <div style={barStyle}>
      {/* ── Desktop: streak (dashboard) | spacer | right controls ── */}
      <div
        className="hidden md:flex items-center"
        style={{ height: 64, padding: '0 20px', gap: 14 }}
      >
        <div style={{ flex: 1 }} />

        {/* Right: toggle + month nav + divider + add + theme + notifications + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {showToggle && familyToggle}
          {showMonth && monthNav}
          {divider}
          {showAdd && onOpenAdd && (
            <button
              onClick={onOpenAdd}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 10,
                background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: 'white',
                border: 'none', fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
                boxShadow: '0 3px 12px rgba(139,92,246,0.35)',
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t.common.add}
            </button>
          )}
          {themeToggleBtn}
          <NotificationCenter onNavigate={onNavigate} />
          {avatarEl(46)}
        </div>
      </div>

      {/* ── Mobile: row 1 always + row 2 conditionally ── */}
      <div className="md:hidden" style={{ paddingTop: 'max(20px, var(--safe-top))' }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 14px' }}>
          {logoMark(36)}
          <div style={{ flex: 1 }} />
          <NotificationCenter onNavigate={onNavigate} />
          {avatarEl(44)}
        </div>

        {/* Row 2: month nav + toggle — only on relevant pages */}
        {(showMonth || showToggle) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: showMonth ? 'space-between' : 'flex-end', padding: '4px 14px 8px', gap: 8 }}>
            {showMonth && monthNav}
            {showToggle && familyToggle}
          </div>
        )}
      </div>
    </div>
  )
}

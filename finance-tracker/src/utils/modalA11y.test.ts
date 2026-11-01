import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inertOutside, lockBodyScroll, modalStack, touchMayScroll, trapTarget } from './modalA11y'
import type { InertNode, ScrollBox } from './modalA11y'

// ── fake DOM nodes ─────────────────────────────────────────────────────────
type Fake = InertNode & { name: string; kids: Fake[]; parent: Fake | null }
function node(name: string, kids: Fake[] = [], tagName = 'DIV'): Fake {
  const n: Fake = {
    name, kids, parent: null, tagName, inert: false,
    get children() { return n.kids },
    contains(o) { let x = o as Fake | null; while (x) { if (x === n) return true; x = x.parent } return false },
  }
  kids.forEach(k => { k.parent = n })
  return n
}
const inertNames = (...ns: Fake[]) => ns.filter(n => n.inert).map(n => n.name)

describe('trapTarget', () => {
  const items = ['a', 'b', 'c']
  it('wraps from last to first and back with Shift', () => {
    expect(trapTarget(items, 'c', false, true)).toBe('a')
    expect(trapTarget(items, 'a', true, true)).toBe('c')
  })
  it('lets the browser move focus in the middle', () => {
    expect(trapTarget(items, 'b', false, true)).toBeNull()
    expect(trapTarget(items, 'b', true, true)).toBeNull()
  })
  it('pulls focus back in when it is outside', () => {
    expect(trapTarget(items, 'x', false, false)).toBe('a')
    expect(trapTarget(items, null, true, false)).toBe('c')
  })
  it('does nothing without focusables', () => {
    expect(trapTarget([], null, false, false)).toBeNull()
  })
})

describe('modalStack', () => {
  it('only the newest modal is on top, in any close order', () => {
    const a = {}, b = {}
    modalStack.push(a); modalStack.push(b)
    expect(modalStack.isTop(b)).toBe(true)
    expect(modalStack.isTop(a)).toBe(false)
    modalStack.remove(a)
    expect(modalStack.isTop(b)).toBe(true)
    modalStack.remove(b)
    expect(modalStack.size()).toBe(0)
  })
})

describe('inertOutside', () => {
  function tree() {
    const panel = node('panel')
    const backdrop = node('backdrop')
    const overlay = node('overlay', [backdrop, panel])
    const page = node('page')
    const toast = node('toast')
    const nav = node('nav')
    const app = node('app', [nav, page, toast, overlay])
    const script = node('script', [], 'SCRIPT')
    const other = node('other')
    const body = node('body', [app, script, other])
    return { body, app, nav, page, toast, overlay, backdrop, panel, script, other }
  }

  it('makes the page inert but not the modal, its path or kept elements', () => {
    const t = tree()
    const release = inertOutside(t.body, [t.overlay, t.toast])
    expect(inertNames(t.nav, t.page, t.other)).toEqual(['nav', 'page', 'other'])
    expect(inertNames(t.app, t.overlay, t.backdrop, t.panel, t.toast, t.script)).toEqual([])
    release()
    expect(inertNames(t.nav, t.page, t.other)).toEqual([])
  })

  it('leaves elements that were already inert alone', () => {
    const t = tree()
    t.other.inert = true
    inertOutside(t.body, [t.overlay])()
    expect(t.other.inert).toBe(true)
  })

  it('counts stacked modals and releases in any order', () => {
    const t = tree()
    const r1 = inertOutside(t.body, [t.overlay])
    const r2 = inertOutside(t.body, [t.panel]) // second modal inside the first overlay
    expect(inertNames(t.page, t.backdrop)).toEqual(['page', 'backdrop'])
    r1()
    expect(t.page.inert).toBe(true) // still held by the second modal
    r1() // idempotent
    expect(t.page.inert).toBe(true)
    r2()
    expect(inertNames(t.page, t.backdrop, t.nav, t.other)).toEqual([])
  })
})

describe('touchMayScroll', () => {
  const box = (o: Partial<ScrollBox> & { parentElement?: ScrollBox | null }): ScrollBox =>
    ({ scrollHeight: 100, clientHeight: 100, scrollTop: 0, overflowY: 'visible', parentElement: null, ...o })

  it('blocks touches on content that cannot scroll', () => {
    const panel = box({})
    expect(touchMayScroll(box({ parentElement: panel }), panel, 10)).toBe(false)
  })
  it('allows a scrollable list that can move that way, blocks at the edges', () => {
    const panel = box({})
    const top = box({ overflowY: 'auto', scrollHeight: 500, clientHeight: 200, scrollTop: 0, parentElement: panel })
    expect(touchMayScroll(top, panel, -10)).toBe(true) // finger up: scroll down
    expect(touchMayScroll(top, panel, 10)).toBe(false) // already at the top
    const bottom = box({ overflowY: 'scroll', scrollHeight: 500, clientHeight: 200, scrollTop: 300, parentElement: panel })
    expect(touchMayScroll(bottom, panel, 10)).toBe(true)
    expect(touchMayScroll(bottom, panel, -10)).toBe(false)
  })
  it('does not look past the panel', () => {
    const outer = box({ overflowY: 'auto', scrollHeight: 900, clientHeight: 100, scrollTop: 50 })
    const panel = box({ parentElement: outer })
    expect(touchMayScroll(box({ parentElement: panel }), panel, 10)).toBe(false)
  })
})

describe('lockBodyScroll', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('pins the body (iOS), is counted, and restores styles and scroll', () => {
    const body = { style: { overflow: '', position: '', top: '', width: '' } }
    const html = { style: { overflow: 'auto' } }
    const scrollTo = vi.fn()
    vi.stubGlobal('document', { body, documentElement: html })
    vi.stubGlobal('window', { scrollY: 240, scrollTo })
    const a = lockBodyScroll()
    const b = lockBodyScroll()
    expect(body.style).toEqual({ overflow: 'hidden', position: 'fixed', top: '-240px', width: '100%' })
    expect(html.style.overflow).toBe('hidden')
    a(); a()
    expect(body.style.position).toBe('fixed') // b still holds it
    b()
    expect(body.style).toEqual({ overflow: '', position: '', top: '', width: '' })
    expect(html.style.overflow).toBe('auto')
    expect(scrollTo).toHaveBeenCalledWith(0, 240)
  })
})

// ── wiring (static) ─────────────────────────────────────────────────────────
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
const MODALS = [
  'components/AchievementDetailModal.tsx', 'components/BottomSheet.tsx', 'components/BudgetTemplateModal.tsx',
  'components/CommandPalette.tsx', 'components/CompactModal.tsx', 'components/ConfirmDialog.tsx',
  'components/CsvImportModal.tsx', 'components/DeleteAccountModal.tsx', 'components/ExportDataModal.tsx',
  'components/GlobalFAB.tsx', 'components/PinLock.tsx', 'components/PinSetupModal.tsx',
  'components/SavingsDetailModal.tsx', 'components/StreakModal.tsx', 'components/TrackingDateOnboarding.tsx',
  'pages/Categories.tsx', 'pages/Dashboard.tsx', 'pages/Login.tsx', 'pages/Profile.tsx', 'pages/Settings.tsx',
]

describe('modal wiring', () => {
  it.each(MODALS)('%s uses the shared hook and no own Esc / body-overflow code', f => {
    const s = src(f)
    expect(s).toContain('useModalA11y(')
    expect(s).toMatch(/ref=\{\w*[Rr]ef\}|ref=\{\w+\.panelRef\}/)
    expect(s).not.toMatch(/body\.style\.overflow/)
    expect(s).not.toMatch(/key === 'Escape'/)
  })

  it('every fixed full-screen overlay in a modal file has a dialog panel', () => {
    for (const f of MODALS) {
      const s = src(f)
      const overlays = (s.match(/fixed inset-0|position: 'fixed', inset: 0/g) ?? []).length
      const panels = (s.match(/\{\.\.\.\w*(dialogProps|Props|\.dialogProps)\}/g) ?? []).length
      expect(panels, f).toBeGreaterThanOrEqual(overlays)
    }
  })

  it('Settings wires each inline modal', () => {
    const s = src('pages/Settings.tsx')
    for (const m of ['pinRemoveModal', 'dangerModal', 'deactivateModal', 'changePwModal', 'devicesModal', 'deactivationModal', 'trackingModal']) {
      expect(s).toContain(`ref={${m}.panelRef} {...${m}.dialogProps}`)
    }
  })

  it('Esc is off while busy, and not offered where the dialog must not be dismissed', () => {
    expect(src('components/CompactModal.tsx')).toMatch(/onClose: requestClose/)
    expect(src('components/DeleteAccountModal.tsx')).toMatch(/onClose: busy \? undefined : onClose/)
    expect(src('components/CsvImportModal.tsx')).toMatch(/onClose: importing \? undefined : onClose/)
    expect(src('components/PinLock.tsx')).toMatch(/useModalA11y\(\{ open: true \}\)/)
    expect(src('components/TrackingDateOnboarding.tsx')).toMatch(/useModalA11y\(\{ open: true \}\)/)
  })

  it('the hook sets the dialog roles and restores focus to the opener', () => {
    const h = src('hooks/useModalA11y.ts')
    expect(h).toContain("'aria-modal': true")
    expect(h).toContain("'aria-labelledby': titleId")
    expect(h).toMatch(/back\?\.focus\(/)
    expect(h).toMatch(/inertOutside\(/)
    expect(h).toMatch(/lockBodyScroll\(\)/)
    expect(h).toMatch(/passive: false/)
  })

  it('toasts stay announced while a modal is open; inner Esc users claim the key', () => {
    expect(src('components/ToastContainer.tsx')).toContain('data-modal-keep')
    expect(src('components/PasskeySection.tsx')).toMatch(/'Escape'\) \{ e\.preventDefault\(\)/)
  })

  it('focus returns to an opener that unmounted and came back (page FABs)', () => {
    const hook = src('hooks/useModalA11y.ts')
    expect(hook).toMatch(/addEventListener\('focusin'/)
    expect(hook).toContain('lastFocused()')
    expect(hook).toMatch(/opener\.isConnected \? opener : twinOf\(opener\)/)
    expect(hook).toMatch(/getAttribute\('aria-label'\)/)
  })
})

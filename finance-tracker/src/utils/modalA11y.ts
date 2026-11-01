/**
 * DOM helpers behind useModalA11y. Written against tiny structural types so
 * the logic can be unit-tested without a browser.
 */

export const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]),select:not([disabled]),textarea:not([disabled])'

/** Elements that stay usable while a modal is open (toast live regions). */
export const KEEP_SELECTOR = '[data-modal-keep]'

// ── Focus trap ────────────────────────────────────────────────────────────

/**
 * Where Tab should go from `active`, or null to let the browser move focus.
 * Wraps around at both ends and pulls focus back in when it is outside.
 */
export function trapTarget<T>(items: readonly T[], active: T | null, shift: boolean, activeInside: boolean): T | null {
  if (items.length === 0) return null
  const first = items[0], last = items[items.length - 1]
  if (!activeInside) return shift ? last : first
  if (shift && active === first) return last
  if (!shift && active === last) return first
  return null
}

// ── Modal stack: only the topmost modal reacts to Esc / Tab ────────────────

const stack: object[] = []
export const modalStack = {
  push(entry: object) { stack.push(entry) },
  remove(entry: object) { const i = stack.lastIndexOf(entry); if (i >= 0) stack.splice(i, 1) },
  isTop(entry: object) { return stack[stack.length - 1] === entry },
  size() { return stack.length },
}

// ── Inert background ──────────────────────────────────────────────────────

export interface InertNode {
  readonly children: ArrayLike<InertNode>
  contains(other: InertNode | null): boolean
  inert: boolean
  readonly tagName: string
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT'])
const inertCounts = new Map<InertNode, number>()

/**
 * Makes everything outside `keep` inert: each sibling along the path from the
 * root to a kept element gets `inert`, the path itself does not. Counted, so
 * stacked modals release in any order; elements that were inert already are
 * left alone. Returns the release function.
 */
export function inertOutside(root: InertNode, keep: readonly InertNode[]): () => void {
  const touched: InertNode[] = []
  const walk = (node: InertNode) => {
    for (const child of Array.from(node.children)) {
      if (SKIP_TAGS.has(child.tagName)) continue
      if (keep.includes(child)) continue
      if (keep.some(k => child.contains(k))) { walk(child); continue }
      const n = inertCounts.get(child)
      if (n !== undefined) { inertCounts.set(child, n + 1); touched.push(child); continue }
      if (child.inert) continue
      child.inert = true
      inertCounts.set(child, 1)
      touched.push(child)
    }
  }
  walk(root)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const el of touched) {
      const n = (inertCounts.get(el) ?? 1) - 1
      if (n <= 0) { inertCounts.delete(el); el.inert = false } else inertCounts.set(el, n)
    }
  }
}

// ── iOS-safe scroll lock ──────────────────────────────────────────────────

export interface ScrollBox {
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly scrollTop: number
  readonly parentElement: ScrollBox | null
  readonly overflowY: string
}

/**
 * iOS ignores `overflow: hidden` on body for touch scrolling, so touchmove is
 * cancelled unless it scrolls something inside the modal that can still move
 * in that direction (otherwise the gesture would chain to the page behind).
 * `deltaY` > 0 means the finger moves down (content scrolls up).
 */
export function touchMayScroll(target: ScrollBox | null, panel: ScrollBox, deltaY: number): boolean {
  for (let el = target; el; el = el.parentElement) {
    const scrollable = (el.overflowY === 'auto' || el.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1
    if (scrollable) {
      if (deltaY > 0 && el.scrollTop > 0) return true
      if (deltaY < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
      if (deltaY === 0) return true
    }
    if (el === panel) return false
  }
  return false
}

let lockCount = 0
let saved: { overflow: string; htmlOverflow: string; position: string; top: string; width: string; scrollY: number } | null = null

/** Ref-counted body scroll lock (position: fixed keeps iOS from scrolling the page). */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (lockCount++ === 0) {
    const b = document.body.style
    const scrollY = window.scrollY
    saved = { overflow: b.overflow, htmlOverflow: document.documentElement.style.overflow, position: b.position, top: b.top, width: b.width, scrollY }
    document.documentElement.style.overflow = 'hidden'
    b.overflow = 'hidden'
    b.position = 'fixed'
    b.top = `-${scrollY}px`
    b.width = '100%'
  }
  let done = false
  return () => {
    if (done) return
    done = true
    if (--lockCount === 0 && saved) {
      const b = document.body.style
      document.documentElement.style.overflow = saved.htmlOverflow
      b.overflow = saved.overflow; b.position = saved.position; b.top = saved.top; b.width = saved.width
      window.scrollTo(0, saved.scrollY)
      saved = null
    }
  }
}

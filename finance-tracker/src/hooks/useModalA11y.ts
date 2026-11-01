import { useEffect, useId, useRef } from 'react'
import type { RefObject } from 'react'
import { FIELD, FOCUSABLE, KEEP_SELECTOR, inertOutside, lockBodyScroll, modalStack, touchMayScroll, trapTarget } from '../utils/modalA11y'
import type { InertNode, ScrollBox } from '../utils/modalA11y'

export interface ModalA11yOptions {
  open: boolean
  /** Esc closes when given. Leave out for dialogs that must not be dismissed. */
  onClose?: () => void
  /**
   * What gets focus on open: 'field' = first form field (add forms), falling
   * back to the heading; 'heading' = the title (default; no keyboard pop-up on
   * phones); or a ref. An element with [data-autofocus] always wins.
   */
  initialFocus?: 'field' | 'heading' | RefObject<HTMLElement | null>
  role?: 'dialog' | 'alertdialog'
  /** Re-run the setup when the panel element is swapped (multi-step dialogs). */
  resetKey?: string | number
}

/**
 * Shared modal behaviour: focus moves in on open and back to the opener on
 * close, Tab stays inside, Esc closes the topmost modal, the page behind is
 * inert and does not scroll (iOS included). Spread `dialogProps` on the panel
 * together with `ref={panelRef}`, and put `id={titleId}` on the heading.
 */
export function useModalA11y({ open, onClose, initialFocus = 'heading', role = 'dialog', resetKey }: ModalA11yOptions) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const latest = useRef({ onClose, initialFocus })
  useEffect(() => { latest.current = { onClose, initialFocus } })

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const entry = {}
    modalStack.push(entry)
    const active = document.activeElement
    // The opener may already be gone (a FAB hidden by its own sheet), which
    // drops focus to <body>; fall back to the last element that had focus.
    const opener = active instanceof HTMLElement && active !== document.body ? active : lastFocused()

    // The whole overlay stays live (its backdrop closes on click); the page behind goes inert.
    const root = overlayOf(panel)
    // Inline panels without their own titled heading: the first h2/h3 names the dialog.
    if (!document.getElementById(titleId)) {
      const h = panel.querySelector<HTMLElement>('h1, h2, h3')
      if (h && !h.id) { h.id = titleId; h.tabIndex = -1; h.style.outline = 'none' }
    }
    const keep = [root, ...Array.from(document.querySelectorAll(KEEP_SELECTOR))]
    const release = inertOutside(document.body as unknown as InertNode, keep as unknown as InertNode[])
    const unlock = lockBodyScroll()

    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.getClientRects().length > 0 || el === document.activeElement)
    const focusInitial = () => {
      if (panel.contains(document.activeElement) && document.activeElement !== panel) return
      const pref = latest.current.initialFocus
      const heading = document.getElementById(titleId)
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        (typeof pref === 'object' ? pref.current : null) ??
        (pref === 'field' ? panel.querySelector<HTMLElement>(FIELD) : null) ??
        heading ?? panel
      target.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusInitial)

    const onKey = (e: KeyboardEvent) => {
      if (!modalStack.isTop(entry)) return
      if (e.key === 'Escape') {
        const close = latest.current.onClose
        if (!close || e.defaultPrevented || e.isComposing) return
        e.preventDefault(); e.stopImmediatePropagation()
        close()
      } else if (e.key === 'Tab') {
        const active = document.activeElement as HTMLElement | null
        // A popover portaled out of the modal (opened later, so not inert) keeps its own Tab order.
        if (active && active !== document.body && !panel.contains(active)) return
        const items = focusables()
        const next = trapTarget(items, active, e.shiftKey, !!active && panel.contains(active) && active !== panel)
        if (items.length === 0) { e.preventDefault(); return }
        if (next) { e.preventDefault(); next.focus() }
      }
    }
    let startX = 0, startY = 0
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0]?.clientX ?? 0; startY = e.touches[0]?.clientY ?? 0 }
    const onTouchMove = (e: TouchEvent) => {
      if (!modalStack.isTop(entry) || e.touches.length > 1) return
      const dx = (e.touches[0]?.clientX ?? 0) - startX
      const dy = (e.touches[0]?.clientY ?? 0) - startY
      const target = e.target instanceof Element ? e.target : null
      if (!target) return
      let ok: boolean
      if (panel.contains(target)) {
        // Sideways gestures (category rows, sliders) never scroll the page.
        ok = Math.abs(dx) > Math.abs(dy) || walkReal(target, panel, dy)
      } else if (!root.contains(target) && !target.closest('[inert]')) {
        // A popover portaled out of the modal after it opened scrolls itself.
        ok = walkReal(target, document.body, dy)
      } else ok = false
      if (!ok && e.cancelable) e.preventDefault()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      modalStack.remove(entry)
      release()
      unlock()
      const back = opener && (opener.isConnected ? opener : twinOf(opener))
      back?.focus({ preventScroll: true })
    }
  }, [open, titleId, resetKey])

  return {
    panelRef,
    titleId,
    dialogProps: {
      role,
      'aria-modal': true as const,
      'aria-labelledby': titleId,
      tabIndex: -1,
    },
  }
}

let lastFocusedEl: HTMLElement | null = null
function lastFocused(): HTMLElement | null {
  return lastFocusedEl
}
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', e => {
    if (e.target instanceof HTMLElement && e.target !== document.body) lastFocusedEl = e.target
  }, true)
}

/**
 * Openers that unmount while the modal is open (page FABs hide behind their
 * sheet) come back as a new element: find it by id or tag + accessible label.
 */
function twinOf(el: HTMLElement): HTMLElement | null {
  if (el.id) return document.getElementById(el.id)
  const label = el.getAttribute('aria-label')
  if (!label) return null
  const same = Array.from(document.querySelectorAll<HTMLElement>(el.tagName))
    .filter(x => x.getAttribute('aria-label') === label && x.getClientRects().length > 0)
  return same.length === 1 ? same[0] : null
}

/** Nearest fixed-position ancestor of the panel (the overlay), or the panel. */
function overlayOf(panel: HTMLElement): HTMLElement {
  for (let el = panel.parentElement; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).position === 'fixed') return el
  }
  return panel
}

/** touchMayScroll over real elements (identity-safe). */
function walkReal(target: Element, panel: HTMLElement, dy: number): boolean {
  const boxes = new Map<Element, ScrollBox>()
  const box = (el: Element): ScrollBox => {
    let b = boxes.get(el)
    if (!b) {
      const h = el as HTMLElement
      b = {
        scrollHeight: h.scrollHeight, clientHeight: h.clientHeight, scrollTop: h.scrollTop,
        overflowY: getComputedStyle(h).overflowY,
        get parentElement() { return h.parentElement && h !== panel ? box(h.parentElement) : null },
      }
      boxes.set(el, b)
    }
    return b
  }
  return touchMayScroll(box(target), box(panel), dy)
}

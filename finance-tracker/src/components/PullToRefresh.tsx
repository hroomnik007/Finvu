import { useRef, useState, useCallback, useLayoutEffect, type ReactNode } from 'react'

const PULL_THRESHOLD = 70
const MAX_PULL = 110
const DAMPING = 0.5
/** Page content column cap, centered on wide screens. 1232 = Annual's 1200px
 * content width + its 16px side padding. Pages keep their scroll container at
 * full width (so the scrollbar stays at the screen edge) and add
 * `--page-inset` to their horizontal padding to center the content. */
const PAGE_MAX_WIDTH = 1232

/** Walks up from the touched element to find the nearest actually-scrollable
 * ancestor (overflow-y: auto/scroll with real overflow) — every page owns its
 * own scroll container, so detection has to be generic rather than hardcoded
 * to one page's DOM shape. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>
  children: ReactNode
}

/** Custom pull-to-refresh: shows a small drag indicator and refetches data in
 * place when released past the threshold. Also calls preventDefault on the
 * pulling touchmove so the browser/PWA's native pull-to-refresh (a full page
 * reload) never gets a chance to fire — that native reload was the actual
 * cause of the refresh-token race that used to log users out. */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  // Read in JSX (the transition toggle below), so it has to be state rather
  // than a ref — refs can't be read during render.
  const [pulling, setPulling] = useState(false)
  const startY = useRef(0)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Publishes the side inset that centers page content in a PAGE_MAX_WIDTH column.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => el.style.setProperty('--page-inset', `${Math.max(0, (el.clientWidth - PAGE_MAX_WIDTH) / 2)}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return
    const sp = findScrollParent(e.target as HTMLElement)
    scrollParentRef.current = sp
    if (sp && sp.scrollTop <= 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    } else {
      setPulling(false)
    }
  }, [refreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return
    const sp = scrollParentRef.current
    if (!sp || sp.scrollTop > 0) {
      setPulling(false)
      setPull(0)
      return
    }
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) {
      setPull(0)
      return
    }
    // Stops the native browser/PWA pull-to-refresh reload from also triggering.
    e.preventDefault()
    setPull(Math.min(MAX_PULL, delta * DAMPING))
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(() => {
    if (!pulling) return
    setPulling(false)
    if (pull >= PULL_THRESHOLD) {
      setRefreshing(true)
      setPull(PULL_THRESHOLD)
      onRefresh().finally(() => {
        setRefreshing(false)
        setPull(0)
      })
    } else {
      setPull(0)
    }
  }, [pulling, pull, onRefresh])

  const indicatorProgress = Math.min(1, pull / PULL_THRESHOLD)

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: pull, flexShrink: 0, overflow: 'hidden',
        transition: pulling ? 'none' : 'height 0.2s ease',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: refreshing ? 1 : indicatorProgress,
        }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-violet)"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: refreshing ? undefined : `rotate(${indicatorProgress * 180}deg)`,
              animation: refreshing ? 'spin 0.7s linear infinite' : undefined,
            }}
          >
            {refreshing
              ? <path d="M21 12a9 9 0 11-9-9" />
              : <path d="M12 5v14M5 12l7 7 7-7" />}
          </svg>
        </div>
      </div>
      <div ref={contentRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

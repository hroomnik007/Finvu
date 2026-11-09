import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronUp, LayoutGrid, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { useTranslation } from '../i18n'

const CHIP_WIDTH = 76

export function CategoryCircle({ icon: Icon, label, selected, accent, accent2 = accent, onClick }: {
  icon: LucideIcon; label: string; selected: boolean; accent: string; accent2?: string; onClick: () => void
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      data-selected={selected || undefined}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: CHIP_WIDTH, scrollSnapAlign: 'start' }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? `linear-gradient(135deg,${accent},${accent2})` : 'var(--aurora-glass)',
        border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
      }}>
        <Icon size={18} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
      </div>
      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, color: selected ? 'var(--aurora-hi)' : 'var(--aurora-lo)', textAlign: 'center', lineHeight: 1.2, maxWidth: CHIP_WIDTH, overflowWrap: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{label}</span>
    </button>
  )
}

export interface PickerCategory { id?: string; name: string; icon?: string | null; color: string }

/**
 * Category choice for the add forms. Folded, the categories sit in one row that scrolls
 * sideways (most used first, the right edge fades while more is hidden), so the form and
 * the number pad fit one phone screen. The last chip ("All") unfolds a grid of everything;
 * picking from the grid folds it back.
 */
export function CategoryPicker({ categories, selectedId, onPick, gradient = false, extra }: {
  categories: PickerCategory[]
  selectedId: string
  onPick: (id: string) => void
  /** Selected chip uses a two-tone gradient of the category colour (dashboard forms). */
  gradient?: boolean
  /** Extra chip after the categories, e.g. "+ New category". */
  extra?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [moreRight, setMoreRight] = useState(false)
  const [moreLeft, setMoreLeft] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const updateEdges = () => {
    const el = rowRef.current
    if (!el || expanded) { setMoreLeft(false); setMoreRight(false); return }
    setMoreLeft(el.scrollLeft > 4)
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useLayoutEffect(updateEdges)

  useEffect(() => {
    const el = rowRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => updateEdges())
    ro.observe(el)
    return () => ro.disconnect()
  })

  // Keep the chosen category in view in the folded row (suggestion, edit, pick from the grid).
  // Only the row scrolls sideways: scrollIntoView would also move the modal.
  useEffect(() => {
    const el = rowRef.current
    if (!el || expanded || !selectedId) return
    const chip = el.querySelector<HTMLElement>('[data-selected]')
    if (!chip) return
    const left = chip.offsetLeft - el.offsetLeft
    if (left < el.scrollLeft || left + chip.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, left - 8), behavior: 'smooth' })
    }
  }, [selectedId, expanded])

  const mask = moreLeft && moreRight
    ? 'linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 40px),transparent)'
    : moreRight ? 'linear-gradient(90deg,#000 calc(100% - 40px),transparent)'
    : moreLeft ? 'linear-gradient(90deg,transparent,#000 28px)'
    : undefined

  return (
    <div
      ref={rowRef}
      onScroll={updateEdges}
      data-testid="category-picker"
      style={expanded
        ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CHIP_WIDTH}px, 1fr))`, justifyItems: 'center', gap: '10px 4px', padding: '2px 2px 4px' }
        : { display: 'flex', flexWrap: 'nowrap', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', scrollSnapType: 'x proximity', padding: '2px 2px 4px', maskImage: mask, WebkitMaskImage: mask }}
    >
      {categories.map(c => (
        <CategoryCircle
          key={c.id}
          icon={CATEGORY_ICON_MAP[c.icon ?? ''] ?? Tag}
          label={c.name}
          selected={selectedId === c.id}
          accent={c.color} accent2={gradient ? c.color : undefined}
          onClick={() => { onPick(c.id ?? ''); setExpanded(false) }}
        />
      ))}
      {extra}
      <CategoryCircle
        icon={expanded ? ChevronUp : LayoutGrid}
        label={expanded ? t.common.fewerCategories : t.common.allCategories}
        selected={false} accent="var(--aurora-violet)"
        onClick={() => setExpanded(e => !e)}
      />
    </div>
  )
}

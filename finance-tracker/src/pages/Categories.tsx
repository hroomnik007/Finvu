import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Tag, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CompactModal } from '../components/CompactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SwipeableRow } from '../components/SwipeableRow'
import { GlassCard } from '../components/GlassCard'
import { HeroCard } from '../components/HeroCard'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { useCategories } from '../hooks/useCategories'
import { useVariableExpenses } from '../hooks/useVariableExpenses'
import { useFixedExpenses, isFixedExpenseDue } from '../hooks/useFixedExpenses'
import { useFormatters } from '../hooks/useFormatters'
import { useBudgetStatus } from '../hooks/useBudgetStatus'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation } from '../i18n'
import { reorderCategories as reorderCategoriesApi, shareCategories } from '../api/categories'
import { useAuth } from '../context/AuthContext'
import type { Category } from '../types'

const selectBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Manrope', sans-serif",
  background: active ? 'rgba(139,92,246,0.18)' : 'var(--aurora-glass)',
  color: active ? 'var(--aurora-violet)' : 'var(--aurora-lo)',
  border: active ? '1px solid rgba(139,92,246,0.45)' : '1px solid var(--aurora-gline)',
})

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#A78BFA',
  '#7C3AED', '#a855f7', '#ec4899', '#9D84D4',
]

const PRESET_ICONS = [
  '🍔', '🛒', '🚗', '🏠', '💊', '🎉', '👕', '📚',
  '✈️', '🎮', '🐾', '💇', '🏋️', '📱', '💡', '🍕',
  '☕', '🎬', '🛻', '🏥', '🎓', '🌿', '🧴', '💰',
]

type BudgetStatus = { categoryId: string; spent: number; percentage: number; limit: number }

interface CardProps {
  cat: Category
  status: BudgetStatus | undefined
  formatAmount: (n: number) => string
  t: ReturnType<typeof useTranslation>['t']
  onEdit: (cat: Category) => void
  onDelete: (id: string) => void
  isSwipeOpen?: boolean
  onSwipeOpen?: () => void
  severity?: 'red' | 'warning' | null
  selected?: boolean
}

function SortableGridCard({ cat, status, formatAmount, t, onEdit, onDelete, severity, selected }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id! })
  const pct = status ? Math.min(status.percentage, 100) : 0
  const rawPct = status?.percentage ?? 0
  const barColor = cat.autoLimit && !cat.limitReserve ? 'var(--aurora-emerald)' : rawPct >= 100 ? 'var(--aurora-rose)' : rawPct >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-emerald)'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onClick={() => onEdit(cat)}
      style={{
        background: severity ? `color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
        border: severity ? `1px solid color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
        borderRadius: 20, padding: 16,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        outline: selected ? '2px solid var(--aurora-violet)' : 'none', outlineOffset: -1,
        boxShadow: isDragging ? '0 0 0 2px rgba(139,92,246,0.3)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: cat.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {(() => { const Icon = CATEGORY_ICON_MAP[cat.icon ?? ''] ?? Tag; return <Icon size={20} color={cat.color} strokeWidth={1.8} /> })()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.shared ? '👥 ' : ''}{cat.name}</div>
          {cat.budgetLimit != null
            ? <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>Limit: {formatAmount(cat.budgetLimit)}</div>
            : cat.autoLimit
              ? <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-violet)', marginTop: 2 }}>⚡ {t.expenses.categories.autoLimit}</div>
              : <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', marginTop: 2 }}>{t.expenses.categories.noLimit}</div>
          }
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <div
            {...listeners}
            style={{ color: 'var(--aurora-faint)', cursor: isDragging ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', padding: '0 2px' }}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEdit(cat)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-faint)' }}><Pencil size={13} /></button>
            <button onClick={() => onDelete(cat.id!)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-rose)' }}><Trash2 size={13} /></button>
          </div>
        </div>
      </div>
      {cat.budgetLimit != null && (
        <>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--aurora-rose)', marginBottom: 8 }}>
            -{formatAmount(status?.spent ?? 0)}
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--aurora-gline)', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: barColor, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' }}>
            <span>{t.expenses.categories.spent}</span>
            <span style={{ fontWeight: 700, color: barColor }}>{Math.round(status?.percentage ?? 0)}%</span>
          </div>
        </>
      )}
    </div>
  )
}

function SortableListCard(props: CardProps) {
  const { cat, status, formatAmount, onEdit, onDelete, severity, selected } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id! })
  const pct = status ? Math.min(status.percentage, 100) : 0
  const rawPct = status?.percentage ?? 0
  const barColor = cat.autoLimit && !cat.limitReserve ? 'var(--aurora-emerald)' : rawPct >= 100 ? 'var(--aurora-rose)' : rawPct >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-emerald)'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onClick={() => onEdit(cat)}
      style={{
        background: severity ? `color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
        border: severity ? `1px solid color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
        borderRadius: 18, padding: '12px 16px',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: isDragging ? 0.4 : 1,
        outline: selected ? '2px solid var(--aurora-violet)' : 'none', outlineOffset: -1,
        boxShadow: isDragging ? '0 0 0 2px rgba(139,92,246,0.3)' : undefined,
      }}
    >
      <div
        {...listeners}
        style={{ color: 'var(--aurora-faint)', cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0, display: 'flex' }}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={15} />
      </div>
      <div style={{ width: 36, height: 36, borderRadius: 12, background: cat.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {(() => { const Icon = CATEGORY_ICON_MAP[cat.icon ?? ''] ?? Tag; return <Icon size={16} color={cat.color} strokeWidth={1.8} /> })()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.shared ? '👥 ' : ''}{cat.name}</div>
        {cat.budgetLimit != null && <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 1 }}>Limit: {formatAmount(cat.budgetLimit)}</div>}
      </div>
      {cat.budgetLimit != null && status && (
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: barColor, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-rose)' }}>{status.spent > 0 ? `-${formatAmount(status.spent)}` : '—'}</span>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 700, color: barColor, background: barColor + '18', padding: '1px 6px', borderRadius: 20 }}>{Math.round(status.percentage)}%</span>
          </div>
        </div>
      )}
      {cat.budgetLimit == null && status && status.spent > 0 && (
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-rose)', flexShrink: 0 }}>-{formatAmount(status.spent)}</span>
      )}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={() => onEdit(cat)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-faint)' }}><Pencil size={12} /></button>
        <button onClick={() => onDelete(cat.id!)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'var(--aurora-glass)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-rose)' }}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function SortableMobileCard({ cat, status, formatAmount, t, onEdit, onDelete, isSwipeOpen, onSwipeOpen, severity, selected }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id! })
  const pct = status ? Math.min(status.percentage, 100) : 0
  const rawPct = status?.percentage ?? 0
  const barColor = cat.autoLimit && !cat.limitReserve ? 'var(--aurora-emerald)' : rawPct >= 100 ? 'var(--aurora-rose)' : rawPct >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-emerald)'

  const outerTransform = [
    CSS.Transform.toString(transform),
    isDragging ? 'scale(1.03)' : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{
        transform: outerTransform, transition,
        opacity: isDragging ? 0.85 : 1,
        outline: selected ? '2px solid var(--aurora-violet)' : 'none', outlineOffset: -1, borderRadius: 18,
        boxShadow: isDragging ? '0 0 0 4px rgba(124,58,237,0.3), 0 8px 24px rgba(124,58,237,0.2)' : undefined,
      }}
    >
      <SwipeableRow onDelete={() => onDelete(cat.id!)} isOpen={isDragging ? false : isSwipeOpen} onOpen={onSwipeOpen}>
        <div
          onClick={() => onEdit(cat)}
          style={{
            background: severity ? `color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 10%, var(--aurora-glass))` : 'var(--aurora-glass)',
            border: isDragging ? '2px solid var(--aurora-violet)' : severity ? `1px solid color-mix(in srgb, var(--aurora-${severity === 'red' ? 'rose' : 'amber'}) 35%, var(--aurora-gline))` : '1px solid var(--aurora-gline)',
            borderRadius: 18, padding: '12px 14px',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            display: 'flex', flexDirection: 'column', gap: 8,
            userSelect: 'none',
            WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: cat.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(() => { const Icon = CATEGORY_ICON_MAP[cat.icon ?? ''] ?? Tag; return <Icon size={16} color={cat.color} strokeWidth={1.8} /> })()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.shared ? '👥 ' : ''}{cat.name}</div>
              {cat.budgetLimit != null
                ? <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 1 }}>Limit: {formatAmount(cat.budgetLimit)}</div>
                : cat.autoLimit
                  ? <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-violet)', marginTop: 1 }}>⚡ {t.expenses.categories.autoLimit}</div>
                  : null
              }
            </div>
            <div
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--aurora-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'grab', touchAction: 'none' }}
            >
              <GripVertical size={14} color="var(--aurora-faint)" />
            </div>
          </div>
          {cat.budgetLimit != null && status && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--aurora-gline)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: barColor, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-rose)' }}>{status.spent > 0 ? `-${formatAmount(status.spent)}` : '—'}</span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 700, color: barColor, background: barColor + '18', padding: '1px 6px', borderRadius: 20 }}>{Math.round(status.percentage)}%</span>
              </div>
            </div>
          )}
          {cat.budgetLimit == null && status && status.spent > 0 && (
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--aurora-rose)' }}>-{formatAmount(status.spent)}</span>
          )}
        </div>
      </SwipeableRow>
    </div>
  )
}

export function CategoriesPage() {
  const { categories, addCategory, updateCategory, deleteCategory, reload } = useCategories()
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()
  const now = new Date()
  const { variableExpenses } = useVariableExpenses(now.getMonth() + 1, now.getFullYear())
  const { fixedExpenses } = useFixedExpenses()

  const { user } = useAuth()
  const sharingOn = !!user?.household_enabled
  const { variableExpenses: familyVariable } = useVariableExpenses(now.getMonth() + 1, now.getFullYear(), 'family')
  const { fixedExpenses: familyFixed } = useFixedExpenses(undefined, undefined, 'family')

  const personalStatuses = useBudgetStatus({ categories, variableExpenses, fixedExpenses, month: now.getMonth() + 1, year: now.getFullYear() })
  // A shared category's limit is common, so it is measured against what the whole family spent in it
  const budgetStatuses = useMemo(() => {
    if (!sharingOn) return personalStatuses
    const key = (n?: string | null) => (n ?? '').trim().toLowerCase()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const sharedNames = new Map(categories.filter(c => c.shared).map(c => [c.id!, key(c.name)]))
    return personalStatuses.map(s => {
      const name = sharedNames.get(s.categoryId)
      if (!name) return s
      const spent =
        familyVariable.filter(e => key(e.categoryName) === name).reduce((sum, e) => sum + e.amount, 0) +
        familyFixed.filter(f => key(f.categoryName) === name && isFixedExpenseDue(f.dayOfMonth, month, year, new Date())).reduce((sum, f) => sum + f.amount, 0)
      const percentage = (spent / s.limit) * 100
      return { ...s, spent, percentage, isWarning: percentage >= 70 && percentage < 90, isOver: percentage > 100 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalStatuses, sharingOn, categories, familyVariable, familyFixed])

  // Single most urgent over/near-budget category gets a tinted card — everything else stays neutral
  const worstBudgetStatus = useMemo(() =>
    budgetStatuses
      .filter(b => b.limit > 0)
      .reduce<BudgetStatus | undefined>((worst, b) => (!worst || b.percentage > worst.percentage) ? b : worst, undefined),
  [budgetStatuses])
  const urgentCategoryId = worstBudgetStatus && worstBudgetStatus.percentage >= 90 ? worstBudgetStatus.categoryId : null
  const urgentSeverity: 'red' | 'warning' | null = !worstBudgetStatus
    ? null
    : worstBudgetStatus.percentage >= 100 ? 'red' : worstBudgetStatus.percentage >= 90 ? 'warning' : null

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [autoLimitWarning, setAutoLimitWarning] = useState(false)

  // Local order for optimistic drag updates — synced during render
  const [localIds, setLocalIds] = useState<string[]>([])
  const [prevCatKey, setPrevCatKey] = useState('')
  const catKey = categories.map(c => c.id).join(',')
  if (catKey !== prevCatKey) {
    setPrevCatKey(catKey)
    setLocalIds(categories.map(c => c.id!))
  }

  const sortedCategories = useMemo(() => {
    if (localIds.length === 0) return categories
    const map = new Map(categories.map(c => [c.id!, c]))
    return [
      ...localIds.flatMap(id => { const c = map.get(id); return c ? [c] : [] }),
      ...categories.filter(c => !localIds.includes(c.id!)),
    ]
  }, [categories, localIds])

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = localIds.indexOf(String(active.id))
    const newIdx = localIds.indexOf(String(over.id))
    if (oldIdx === -1 || newIdx === -1) return

    const newIds = arrayMove(localIds, oldIdx, newIdx)
    setLocalIds(newIds)

    try {
      await reorderCategoriesApi(newIds.map((id, i) => ({ id, order: i })))
      reload()
    } catch {
      reload()
    }
  }

  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[6])
  const [icon, setIcon] = useState('🛒')
  const [budgetLimit, setBudgetLimit] = useState('')
  const [catType, setCatType] = useState<'income' | 'expense'>('expense')
  const [autoLimit, setAutoLimit] = useState(true)
  const [limitReserve, setLimitReserve] = useState('')
  const [sharedFlag, setSharedFlag] = useState(false)

  // Bulk edit: selection mode turns card taps into toggling the selection
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLimit, setBulkLimit] = useState('')
  const [bulkColor, setBulkColor] = useState<string | null>(null)
  const [bulkShared, setBulkShared] = useState<'keep' | 'share' | 'unshare'>('keep')
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  function cardClick(cat: Category) {
    if (!selectMode) { openEdit(cat); return }
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(cat.id!)) next.delete(cat.id!); else next.add(cat.id!)
      return next
    })
  }

  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()) }

  function openBulk() {
    setBulkLimit(''); setBulkColor(null); setBulkShared('keep')
    setBulkOpen(true)
  }

  async function applyBulk() {
    const ids = [...selectedIds]
    const limit = bulkLimit ? parseFloat(bulkLimit.replace(',', '.')) : NaN
    setBulkBusy(true)
    let failed = 0
    for (const id of ids) {
      const changes: Partial<Category> = {}
      if (Number.isFinite(limit) && limit > 0) { changes.budgetLimit = limit; changes.autoLimit = false }
      if (bulkColor) changes.color = bulkColor
      if (Object.keys(changes).length > 0) {
        try { await updateCategory(id, changes) } catch { failed++ }
      }
    }
    if (bulkShared !== 'keep') {
      try { await shareCategories(ids.filter(id => categories.find(c => c.id === id)?.type === 'expense'), bulkShared === 'share') } catch { failed++ }
    }
    await reload()
    setBulkBusy(false)
    setBulkOpen(false)
    if (failed > 0) alert(t.expenses.categories.bulkPartialError.replace('{n}', String(failed)))
    exitSelectMode()
  }

  async function deleteSelected() {
    setBulkBusy(true)
    let blocked = 0
    for (const id of selectedIds) {
      try { await deleteCategory(id) } catch { blocked++ }
    }
    await reload()
    setBulkBusy(false)
    setBulkDeleteOpen(false)
    if (blocked > 0) alert(t.expenses.categories.bulkDeleteBlocked.replace('{n}', String(blocked)))
    exitSelectMode()
  }

  function openAdd() {
    setEditing(null); setName(''); setColor(PRESET_COLORS[6]); setIcon('🛒'); setBudgetLimit(''); setCatType('expense'); setAutoLimit(false); setLimitReserve(''); setSharedFlag(false)
    setSheetOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat); setName(cat.name); setColor(cat.color); setIcon(cat.icon)
    setBudgetLimit(cat.budgetLimit != null ? String(cat.budgetLimit) : ''); setCatType(cat.type)
    setAutoLimit(cat.hasFixedExpenses ? (cat.autoLimit ?? true) : false)
    setLimitReserve(cat.limitReserve ? String(cat.limitReserve).replace('.', ',') : '')
    setSharedFlag(cat.shared ?? false)
    setSheetOpen(true)
  }

  function closeSheet() { setSheetOpen(false); setEditing(null) }

  async function handleSave() {
    if (!name.trim()) return

    if (editing?.id != null) {
      const wasManual = editing.autoLimit === false
      const isNowAuto = autoLimit === true
      const hasExistingLimit = editing.budgetLimit != null && editing.budgetLimit > 0
      if (wasManual && isNowAuto && hasExistingLimit) {
        setAutoLimitWarning(true)
        return
      }
      await doSave()
    } else {
      await doSave()
    }
  }

  function parseReserve(raw: string): number {
    const v = parseFloat(raw.replace(',', '.'))
    return Number.isFinite(v) && v > 0 ? v : 0
  }

  async function doSave(requestedAutoLimit = autoLimit) {
    if (!name.trim()) return
    // Shared categories have one common manual limit
    const effectiveAutoLimit = sharedFlag ? false : requestedAutoLimit
    if (editing?.id != null) {
      const limit = effectiveAutoLimit ? undefined : (budgetLimit ? parseFloat(budgetLimit.replace(',', '.')) : undefined)
      await updateCategory(editing.id, {
        name: name.trim(), color, icon,
        autoLimit: effectiveAutoLimit,
        // With auto limit the reserve for variable spending is added on top of the fixed total
        ...(effectiveAutoLimit ? { limitReserve: parseReserve(limitReserve) } : { budgetLimit: limit && limit > 0 ? limit : undefined }),
      })
      if (sharedFlag !== (editing.shared ?? false)) {
        try {
          await shareCategories([editing.id], sharedFlag)
        } catch (err: unknown) {
          alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t.expenses.categories.deleteError)
        }
        await reload()
      }
    } else {
      const limit = effectiveAutoLimit ? undefined : (budgetLimit ? parseFloat(budgetLimit.replace(',', '.')) : undefined)
      await addCategory({
        name: name.trim(), color, icon, type: catType,
        autoLimit: effectiveAutoLimit,
        ...(effectiveAutoLimit ? {} : { budgetLimit: limit && limit > 0 ? limit : undefined }),
      })
    }
    closeSheet()
  }

  async function handleDelete(id: string) {
    try {
      await deleteCategory(id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg ?? t.expenses.categories.deleteError)
    }
    setDeleteId(null)
  }

  const heroTotalSpent = budgetStatuses.reduce((s, b) => s + b.spent, 0)
  const heroTotalLimit = budgetStatuses.reduce((s, b) => s + b.limit, 0)
  const heroOverallPct = heroTotalLimit > 0 ? Math.round(heroTotalSpent / heroTotalLimit * 100) : 0
  const heroNearLimitCount = budgetStatuses.filter(b => b.limit > 0 && b.spent >= b.limit * 0.9).length
  const heroCatCount = categories.length
  const heroBarColor = heroOverallPct >= 90 ? 'var(--aurora-rose)' : heroOverallPct >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-violet)'
  const animatedHeroSpent = useCountUp(heroTotalSpent, 800)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        <div style={{ flex: 1, overflowY: 'auto', touchAction: 'pan-y', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Hero wallet card */}
          <HeroCard variant="neutral">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
              {t.expenses.categories.title} · {heroCatCount} aktívnych
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{
                  fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                  background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-violet))',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                }}>
                  {Math.floor(animatedHeroSpent).toLocaleString('sk-SK')}
                </span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                  ,{String(Math.round((animatedHeroSpent % 1) * 100)).padStart(2, '0')}&nbsp;€
                </span>
              </div>
              {heroTotalLimit > 0 && (
                <span style={{ marginLeft: 'auto', fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${heroBarColor}22`, color: heroBarColor, border: `1px solid ${heroBarColor}55` }}>
                  {heroOverallPct}% z {Math.round(heroTotalLimit)} €
                </span>
              )}
            </div>
            {heroTotalLimit > 0 && (
              <div style={{ height: 8, borderRadius: 99, background: 'var(--aurora-gline)', overflow: 'hidden', marginTop: 12 }}>
                <div style={{ height: '100%', width: `${Math.min(heroOverallPct, 100)}%`, background: heroBarColor, borderRadius: 99, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.expenses.categories.totalLimit}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(heroTotalLimit)}</div>
              </div>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.expenses.categories.remaining}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(Math.max(0, heroTotalLimit - heroTotalSpent))}</div>
              </div>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.expenses.categories.nearLimit}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: heroNearLimitCount > 0 ? 'var(--aurora-rose)' : 'var(--aurora-hi)' }}>{heroNearLimitCount}</div>
              </div>
            </div>
          </HeroCard>

          {categories.length === 0 ? (
            <GlassCard radius={18}>
              <div className="empty-state">
                <Tag size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.expenses.categories.noCategories}</p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.expenses.categories.noCategoriesSubtitle}</p>
              </div>
            </GlassCard>
          ) : (
            <>
              {/* Select toggle — mobile */}
              <div className="lg:hidden" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))} style={selectBtnStyle(selectMode)}>
                  {selectMode ? t.expenses.categories.selectDone : t.expenses.categories.selectMode}
                </button>
              </div>

              {/* View toggle — desktop only */}
              <div className="hidden lg:flex" style={{alignItems:'center',gap:10, marginTop: 8}}>
                <div style={{display:'inline-flex',background:'var(--aurora-glass)',border:'1px solid var(--aurora-gline)',borderRadius:14,padding:3,gap:2}}>
                  {(['grid','list'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)} style={{
                      display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',
                      borderRadius:10,fontSize:12.5,fontWeight:600,border:'none',cursor:'pointer',
                      fontFamily: "'Manrope', sans-serif",
                      transition:'all 0.15s',background:view===v?'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))':'transparent',
                      color:view===v?'#fff':'var(--aurora-lo)',
                    }}>
                      {v === 'grid' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      )}
                      {v === 'grid' ? t.expenses.categories.viewGrid : t.expenses.categories.viewList}
                    </button>
                  ))}
                </div>
                <button onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))} style={selectBtnStyle(selectMode)}>
                  {selectMode ? t.expenses.categories.selectDone : t.expenses.categories.selectMode}
                </button>
              </div>

              {/* Desktop — dnd-kit sortable */}
              <div className="hidden lg:block">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortedCategories.map(c => c.id!)}
                    strategy={view === 'list' ? verticalListSortingStrategy : rectSortingStrategy}
                  >
                    <div style={{
                      display: view === 'grid' ? 'grid' : 'flex',
                      gridTemplateColumns: view === 'grid' ? 'repeat(4, 1fr)' : undefined,
                      flexDirection: view === 'list' ? 'column' : undefined,
                      gap: 12,
                    }}>
                      {sortedCategories.map(cat => {
                        const status = budgetStatuses.find(b => b.categoryId === cat.id)
                        const severity = cat.id === urgentCategoryId ? urgentSeverity : null
                        if (view === 'list') {
                          return <SortableListCard key={cat.id} cat={cat} status={status} formatAmount={formatAmount} t={t} onEdit={cardClick} onDelete={id => setDeleteId(id)} severity={severity} selected={selectedIds.has(cat.id!)} />
                        }
                        return <SortableGridCard key={cat.id} cat={cat} status={status} formatAmount={formatAmount} t={t} onEdit={cardClick} onDelete={id => setDeleteId(id)} severity={severity} selected={selectedIds.has(cat.id!)} />
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Mobile list with drag & drop */}
              <div className="lg:hidden">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortedCategories.map(c => c.id!)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 196 }}>
                      {sortedCategories.map(cat => {
                        const status = budgetStatuses.find(b => b.categoryId === cat.id)
                        const severity = cat.id === urgentCategoryId ? urgentSeverity : null
                        return <SortableMobileCard key={cat.id} cat={cat} status={status} formatAmount={formatAmount} t={t} onEdit={cardClick} onDelete={(id) => setDeleteId(id)} selected={selectedIds.has(cat.id!)} isSwipeOpen={openSwipeId === cat.id} onSwipeOpen={() => setOpenSwipeId(cat.id!)} severity={severity} />
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </>
          )}

          <div className="lg:hidden" style={{ height: 180 }} />
        </div>

      </div>

      {/* FAB — mobile only */}
      {!sheetOpen && deleteId === null && !selectMode && (
        <button
          onClick={openAdd}
          className="lg:hidden flex items-center justify-center"
          style={{ position: 'fixed', right: 16, bottom: 'calc(104px + env(safe-area-inset-bottom, 0px))', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', color: 'white', boxShadow: '0 10px 30px rgba(139,92,246,.5)', zIndex: 40 }}
        >
          <Plus size={26} />
        </button>
      )}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))', zIndex: 45, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 18, background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', maxWidth: 560, margin: '0 auto' }}>
          <span style={{ flex: 1, fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-hi)' }}>
            {t.expenses.categories.selectedCount.replace('{n}', String(selectedIds.size))}
          </span>
          <button onClick={openBulk} style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'white', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', fontFamily: "'Outfit', sans-serif" }}>
            {t.expenses.categories.bulkEdit}
          </button>
          <button onClick={() => setBulkDeleteOpen(true)} aria-label={t.expenses.categories.bulkDelete} style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(251,113,133,0.3)', background: 'rgba(251,113,133,0.1)', color: 'var(--aurora-rose)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={15} />
          </button>
        </div>
      )}

      <CompactModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        icon={Tag} iconColor="#8B5CF6" iconBg="rgba(139,92,246,.16)"
        title={t.expenses.categories.bulkEditTitle.replace('{n}', String(selectedIds.size))}
        accent="#8B5CF6" accent2="#EC4899"
        onSubmit={applyBulk}
        submitDisabled={bulkBusy || (!bulkLimit && !bulkColor && bulkShared === 'keep')}
      >
        <p style={{ fontSize: 12, color: 'var(--aurora-faint)', fontFamily: "'Manrope', sans-serif", margin: 0, lineHeight: 1.4 }}>{t.expenses.categories.bulkHint}</p>
        <input
          type="text"
          inputMode="decimal"
          placeholder={`${t.expenses.categories.limitLabel} · ${t.expenses.categories.bulkLimitHint}`}
          value={bulkLimit}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9,]/g, '')
            if ((raw.match(/,/g) || []).length > 1) return
            setBulkLimit(raw)
          }}
          style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--aurora-faint)', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Manrope', sans-serif", marginRight: 2 }}>{t.expenses.categories.colorLabel}</span>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setBulkColor(prev => (prev === c ? null : c))}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', flexShrink: 0,
                boxShadow: bulkColor === c ? `0 0 0 2px var(--aurora-panel), 0 0 0 4px ${c}` : 'none',
              }}
            />
          ))}
        </div>
        {sharingOn && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['keep', 'share', 'unshare'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setBulkShared(v)}
                style={{ ...selectBtnStyle(bulkShared === v), flex: 1, padding: '9px 6px' }}
              >
                {v === 'keep' ? t.expenses.categories.bulkSharedKeep : v === 'share' ? `👥 ${t.expenses.categories.bulkShare}` : t.expenses.categories.bulkUnshare}
              </button>
            ))}
          </div>
        )}
      </CompactModal>

      <ConfirmDialog
        open={bulkDeleteOpen}
        message={t.expenses.categories.bulkDeleteConfirm.replace('{n}', String(selectedIds.size))}
        onConfirm={deleteSelected}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      {/* Edit/Add sheet */}
      <CompactModal
        open={sheetOpen}
        onClose={closeSheet}
        icon={Tag} iconColor="#8B5CF6" iconBg="rgba(139,92,246,.16)"
        title={editing ? t.expenses.categories.editTitle : t.expenses.categories.newTitle}
        accent="#8B5CF6" accent2="#EC4899"
        onSubmit={handleSave}
        submitDisabled={!name.trim()}
      >
        <input
          type="text"
          placeholder={t.expenses.categories.namePlaceholder}
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={editing?.shared === true}
          style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
        />

        {!editing && (
          <div className="hidden lg:flex" style={{ gap: 8 }}>
            {(['expense', 'income'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setCatType(type)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Manrope', sans-serif", transition: 'all 0.15s',
                  background: catType === type ? (type === 'expense' ? '#EF444420' : '#10B98120') : 'var(--aurora-glass)',
                  color: catType === type ? (type === 'expense' ? '#EF4444' : '#10B981') : 'var(--aurora-lo)',
                  border: catType === type ? `1px solid ${type === 'expense' ? '#EF4444' : '#10B981'}40` : '1px solid var(--aurora-gline)',
                }}
              >
                {type === 'expense' ? t.expenses.categories.typeExpense : t.expenses.categories.typeIncome}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 2px 4px' }}>
          {PRESET_ICONS.map(em => {
            const Icon = CATEGORY_ICON_MAP[em] ?? Tag
            const selected = icon === em
            return (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? color : 'var(--aurora-glass)',
                  border: selected ? '1px solid transparent' : '1px solid var(--aurora-gline)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <Icon size={17} color={selected ? '#fff' : 'var(--aurora-lo)'} strokeWidth={1.8} />
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--aurora-faint)', fontWeight: 700, textTransform: 'uppercase', fontFamily: "'Manrope', sans-serif", marginRight: 2 }}>{t.expenses.categories.colorLabel}</span>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: c,
                border: 'none', cursor: 'pointer', flexShrink: 0,
                boxShadow: color === c ? `0 0 0 2px var(--aurora-panel), 0 0 0 4px ${c}` : 'none',
                transition: 'box-shadow 0.15s',
              }}
            />
          ))}
        </div>

        <div>
          {editing?.hasFixedExpenses && !sharedFlag && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: autoLimit ? 'var(--aurora-violet)' : 'var(--aurora-lo)', fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>
                {t.expenses.categories.autoLimit}
              </span>
              <button
                type="button"
                onClick={() => setAutoLimit(v => !v)}
                style={{
                  width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: autoLimit ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'var(--aurora-glass)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                aria-label={t.expenses.categories.autoLimit}
              >
                <span style={{
                  position: 'absolute', top: 3, left: autoLimit ? 19 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          )}
          {editing?.hasFixedExpenses && autoLimit && !sharedFlag ? (
            <>
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
              fontSize: 12, color: 'var(--aurora-violet)', fontFamily: "'Manrope', sans-serif", lineHeight: 1.4,
            }}>
              {editing?.budgetLimit != null && editing.budgetLimit > 0
                ? t.expenses.categories.autoLimitComputed.replace('{amount}', String(editing.budgetLimit))
                : t.expenses.categories.autoLimitDesc}
            </div>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t.expenses.categories.limitReserveLabel}
              value={limitReserve}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9,]/g, '')
                if ((raw.match(/,/g) || []).length > 1) return
                setLimitReserve(raw)
              }}
              onKeyDown={e => {
                const allowed = ['0','1','2','3','4','5','6','7','8','9',',','Backspace','Delete','Tab','ArrowLeft','ArrowRight','Enter']
                if (!allowed.includes(e.key)) e.preventDefault()
              }}
              style={{ width: '100%', marginTop: 8, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
            />
            </>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              placeholder={`${t.expenses.categories.limitLabel} · ${t.expenses.categories.limitOptional}`}
              value={budgetLimit}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9,]/g, '')
                if ((raw.match(/,/g) || []).length > 1) return
                setBudgetLimit(raw)
              }}
              onKeyDown={e => {
                const allowed = ['0','1','2','3','4','5','6','7','8','9',',','Backspace','Delete','Tab','ArrowLeft','ArrowRight','Enter']
                if (!allowed.includes(e.key)) e.preventDefault()
              }}
              style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
            />
          )}
        </div>

        {sharingOn && editing && catType === 'expense' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: sharedFlag ? 'var(--aurora-violet)' : 'var(--aurora-lo)', fontWeight: 600, fontFamily: "'Manrope', sans-serif" }}>
                👥 {t.expenses.categories.sharedLabel}
              </span>
              <button
                type="button"
                onClick={() => setSharedFlag(v => !v)}
                style={{
                  width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: sharedFlag ? 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))' : 'var(--aurora-glass)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
                aria-label={t.expenses.categories.sharedLabel}
              >
                <span style={{
                  position: 'absolute', top: 3, left: sharedFlag ? 19 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--aurora-faint)', fontFamily: "'Manrope', sans-serif", lineHeight: 1.4, margin: '6px 0 0' }}>
              {t.expenses.categories.sharedDesc}
            </p>
          </div>
        )}
      </CompactModal>

      {/* Auto-limit overwrite warning */}
      {autoLimitWarning && (
        <div
          className="fade-in"
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setAutoLimitWarning(false)}
        >
          <div
            className="modal-in"
            style={{ width: '100%', maxWidth: 380, background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 26, padding: 20, boxShadow: '0 30px 70px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--aurora-hi)', margin: '0 0 10px' }}>Prepísať limit?</p>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-lo)', lineHeight: 1.5, margin: '0 0 18px' }}>
              Táto kategória má manuálne nastavený limit <strong style={{ color: 'var(--aurora-hi)' }}>{editing?.budgetLimit} €</strong>.
              Prepísať automatickým výpočtom zo súčtu fixných výdavkov?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={async () => { setAutoLimitWarning(false); await doSave(false) }}
                style={{ flex: 1, height: 44, borderRadius: 14, background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', fontSize: 12.5, fontWeight: 600, border: '1px solid var(--aurora-gline)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >
                Nie — ponechať
              </button>
              <button
                type="button"
                onClick={async () => { setAutoLimitWarning(false); await doSave() }}
                style={{ flex: 1, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', fontSize: 12.5, fontWeight: 700, color: 'white', border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
              >
                Áno — prepísať
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        message={t.expenses.categories.removeMessage}
        onConfirm={() => { if (deleteId !== null) handleDelete(deleteId) }}
        onCancel={() => { setDeleteId(null); setOpenSwipeId(null) }}
      />
    </div>
  )
}

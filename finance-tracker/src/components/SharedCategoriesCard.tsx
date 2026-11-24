import { Tag, X, Users } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { pluralText } from '../utils/plural'
import { budgetLevel } from '../utils/budgetLevel'
import { CategoryBudget } from './CategoryBudget'
import type { MemberShare } from './CategoryBudget'
import type { Category } from '../types'

export interface SharedCategoryTile {
  id: string
  name: string
  icon: string
  color: string
  shared: boolean
  /** Family budget of the category (0 = none). */
  limit: number
  /** What the whole family spent in the category this month. */
  spent: number
  perMember: { name: string; amount: number }[]
  /** The common limit is exactly the household's fixed payments (no reserve). */
  limitFixedOnly?: boolean
  /** The user's copy of the category (for the budget block shared with Kategórie). */
  category: Category
  /** perMember with ids and member colours, for the split bar. */
  split: MemberShare[]
}

interface Props {
  tiles: SharedCategoryTile[]
  onShare: (id: string) => void
  onUnshare: (id: string) => void
}

const heading = { fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 } as const
const small = { fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' } as const

/**
 * Every expense category as a tile: shared ones show the family's spend against
 * the common limit (worst first), the others can be added with one click. The
 * grid grows in rows, so a long list of categories doesn't turn into a tall column.
 */
export function SharedCategoriesCard({ tiles, onShare, onUnshare }: Props) {
  const { t, locale } = useTranslation()
  const { formatAmount } = useFormatters()
  const ht = t.household

  const shared = tiles.filter(x => x.shared)
  const over = shared.filter(x => budgetLevel(x.spent, x.limit, x.limitFixedOnly) === 'over').length
  const totalSpent = shared.reduce((s, x) => s + x.spent, 0)
  const totalLimit = shared.reduce((s, x) => s + x.limit, 0)

  return (
    <GlassCard radius={20}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ ...heading, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Users size={15} color="var(--aurora-lo)" aria-hidden /> {ht.sharedCategoriesTitle}</p>
        {shared.length > 0 && (
          <span style={small}>
            {pluralText(shared.length, ht.sharedCount, locale)}
            {over > 0 && <span style={{ color: 'var(--aurora-rose)', fontWeight: 700 }}> · {ht.sharedOver.replace('{n}', String(over))}</span>}
            {totalLimit > 0 && ` · ${formatAmount(totalSpent)} / ${formatAmount(totalLimit)}`}
          </span>
        )}
      </div>
      <p style={{ ...small, fontSize: 12.5, lineHeight: 1.5, margin: '6px 0 16px' }}>{ht.sharedCategoriesDesc}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {tiles.map(x => {
          const Icon = CATEGORY_ICON_MAP[x.icon] ?? Tag
          const pct = x.limit > 0 ? (x.spent / x.limit) * 100 : 0
          const level = budgetLevel(x.spent, x.limit, x.limitFixedOnly)

          if (!x.shared) {
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onShare(x.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 16, border: '1px dashed var(--aurora-gline)', background: 'transparent', cursor: 'pointer', textAlign: 'left', opacity: 0.8 }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 10, background: x.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={15} color={x.color} strokeWidth={1.8} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "'Manrope', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--aurora-lo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                <span style={{ ...small, color: 'var(--aurora-violet-text)', fontWeight: 700, flexShrink: 0 }}>{ht.sharedAdd}</span>
              </button>
            )
          }

          // Same card as on Kategórie: icon tile, name + limit, the family's
          // spend split per member with the limit marked, status as a sum
          return (
            <div key={x.id} style={{ padding: 16, borderRadius: 20, border: `1px solid ${level === 'over' ? 'color-mix(in srgb, var(--aurora-rose) 35%, var(--aurora-gline))' : 'var(--aurora-gline)'}`, background: level === 'over' ? 'color-mix(in srgb, var(--aurora-rose) 7%, var(--aurora-glass))' : 'var(--aurora-glass)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, background: x.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} color={x.color} strokeWidth={1.8} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
                  <div style={{ ...small, marginTop: 2 }}>{x.limit > 0 ? t.expenses.categories.limitShort.replace('{amount}', formatAmount(x.limit)) : t.expenses.categories.noLimit}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onUnshare(x.id)}
                  title={ht.sharedStop}
                  aria-label={`${ht.sharedStop}: ${x.name}`}
                  style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
              {x.limit > 0 ? (
                <CategoryBudget cat={{ ...x.category, shared: true, budgetLimit: x.limit }} familyStatus={{ spent: x.spent, limit: x.limit, percentage: pct }} split={x.split} nameMembers />
              ) : (
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--aurora-expense)' }}>{formatAmount(x.spent)}</div>
              )}
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

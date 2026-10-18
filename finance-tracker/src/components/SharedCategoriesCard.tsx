import { Tag, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'

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
}

interface Props {
  tiles: SharedCategoryTile[]
  onShare: (id: string) => void
  onUnshare: (id: string) => void
}

const heading = { fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: 0 } as const
const small = { fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' } as const

/**
 * Every expense category as a tile: shared ones show the family's spend against
 * the common limit (worst first), the others can be added with one click. The
 * grid grows in rows, so a long list of categories doesn't turn into a tall column.
 */
export function SharedCategoriesCard({ tiles, onShare, onUnshare }: Props) {
  const { t } = useTranslation()
  const { formatAmount } = useFormatters()
  const ht = t.household

  const shared = tiles.filter(x => x.shared)
  const over = shared.filter(x => x.limit > 0 && x.spent > x.limit).length
  const totalSpent = shared.reduce((s, x) => s + x.spent, 0)
  const totalLimit = shared.reduce((s, x) => s + x.limit, 0)

  return (
    <GlassCard radius={20}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={heading}>👥 {ht.sharedCategoriesTitle}</p>
        {shared.length > 0 && (
          <span style={small}>
            {ht.sharedCount.replace('{n}', String(shared.length))}
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
          const bar = pct >= 100 ? 'var(--aurora-rose)' : pct >= 70 ? 'var(--aurora-amber)' : 'var(--aurora-emerald)'

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
                <span style={{ ...small, color: 'var(--aurora-violet)', fontWeight: 700, flexShrink: 0 }}>{ht.sharedAdd}</span>
              </button>
            )
          }

          return (
            <div key={x.id} style={{ padding: '12px 14px', borderRadius: 16, border: `1px solid ${pct >= 100 ? 'rgba(251,113,133,0.4)' : 'rgba(139,92,246,0.3)'}`, background: 'var(--aurora-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: x.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={15} color={x.color} strokeWidth={1.8} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                {x.limit > 0 && <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, color: bar, flexShrink: 0 }}>{pct > 999 ? '>999%' : `${Math.round(pct)}%`}</span>}
                <button
                  type="button"
                  onClick={() => onUnshare(x.id)}
                  title={ht.sharedStop}
                  aria-label={`${ht.sharedStop}: ${x.name}`}
                  style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid var(--aurora-gline)', background: 'transparent', color: 'var(--aurora-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: '10px 0 6px' }}>
                {formatAmount(x.spent)}
                {x.limit > 0 && <span style={{ ...small, fontSize: 12, fontWeight: 500 }}> / {formatAmount(x.limit)}</span>}
              </div>
              {x.limit > 0 && (
                <div style={{ height: 5, borderRadius: 3, background: 'var(--aurora-gline)', overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: bar, borderRadius: 3 }} />
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                {x.perMember.length === 0
                  ? <span style={small}>—</span>
                  : x.perMember.map(pm => <span key={pm.name} style={{ ...small, whiteSpace: 'nowrap' }}>{pm.name} <b style={{ color: 'var(--aurora-lo)', fontWeight: 600 }}>{formatAmount(pm.amount)}</b></span>)}
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}

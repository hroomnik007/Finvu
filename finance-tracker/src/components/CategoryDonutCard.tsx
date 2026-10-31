import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from 'recharts'
import { Tag } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { CATEGORY_ICON_MAP } from '../utils/categoryIcons'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'

export interface DonutDatum {
  name: string
  icon?: string | null
  value: number
  color: string
}

interface CategoryDonutCardProps {
  data: DonutDatum[]
  title: string
  /** Denominator for the percentage labels — defaults to the sum of `data` values. */
  total?: number
}

/**
 * Shared "Výdavky podľa kategórie" donut card. Used on the Dashboard and in the
 * Household module. Self-contained interaction state (clicked > legend hover >
 * pie hover), identical visual style in both places.
 */
export function CategoryDonutCard({ data, title, total }: CategoryDonutCardProps) {
  const { formatAmount } = useFormatters()
  const { t } = useTranslation()

  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [legendHoverIndex, setLegendHoverIndex] = useState<number | null>(null)
  const [clickedIndex, setClickedIndex] = useState<number | null>(null)
  const [showAllPie, setShowAllPie] = useState(false)
  // Gate the recharts <ResponsiveContainer> until after the first paint so it
  // measures a real box — same rAF pattern as FixedExpenses.tsx (setState inside
  // a plain mount effect trips react-hooks/set-state-in-effect).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // On touch devices there is no mouseleave, so tapping a segment leaves
  // activeIndex/legendHoverIndex set — always reset all three so the centre
  // reliably returns to the total on mobile as well as desktop.
  const resetPie = () => { setClickedIndex(null); setLegendHoverIndex(null); setActiveIndex(null) }
  const selectPie = (index: number | null) => { setClickedIndex(index); setLegendHoverIndex(null); setActiveIndex(null) }

  const pieData = useMemo(() => data.filter(d => d.value > 0), [data])
  const sortedPieData = useMemo(() => [...pieData].sort((a, b) => b.value - a.value), [pieData])
  const remainingPieCount = sortedPieData.length > 5 ? sortedPieData.length - 5 : 0
  const denom = total ?? pieData.reduce((s, d) => s + d.value, 0)

  // Integer percentages that always sum to exactly 100 (largest-remainder
  // method) — plain per-slice Math.round can land on 99 % or 101 %. Aligned to
  // pieData order.
  const pctByIndex = useMemo(() => {
    const sum = pieData.reduce((s, d) => s + d.value, 0)
    if (sum <= 0) return pieData.map(() => 0)
    const raw = pieData.map(d => (d.value / sum) * 100)
    const result = raw.map(Math.floor)
    let remainder = 100 - result.reduce((a, b) => a + b, 0)
    const byFraction = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac)
    for (let k = 0; k < byFraction.length && remainder > 0; k++, remainder--) {
      result[byFraction[k].i] += 1
    }
    return result
  }, [pieData])

  // Effective active index: clicked (locked) > legend hover > pie hover
  const pieDisplayIndex = clickedIndex ?? legendHoverIndex ?? activeIndex

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPieShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, index } = props as {
      cx: number; cy: number; innerRadius: number; outerRadius: number
      startAngle: number; endAngle: number; fill: string; index: number
    }
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={index === pieDisplayIndex ? outerRadius + 6 : outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        fillOpacity={pieDisplayIndex !== null && index !== pieDisplayIndex ? 0.5 : 1}
      />
    )
  }

  return (
    <>
      <GlassCard
        radius={20}
        style={{ position: 'relative', zIndex: clickedIndex !== null ? 11 : 'auto' }}
        onClick={resetPie}
      >
        <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', margin: '0 0 12px', textAlign: 'center' }} className="lg:text-left">{title}</h3>
        {pieData.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 190, height: 190, minHeight: 190 }}>
              {mounted && (
                <ResponsiveContainer width={190} height={190}>
                  <PieChart>
                    <Pie
                      data={[{ value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      <Cell fill="var(--aurora-gline)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0, textAlign: 'center' }}>{t.dashboard.noExpenses}</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Legend */}
            {/* alignContent must stay 'start': with 'center' an overflowing list
                (many categories) is centred inside the 190px box, pushing the
                first rows above the scroll origin where they can't be reached —
                on desktop too, not just the mobile "show more" case. */}
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(148px, 100%), 1fr))', rowGap: 6, columnGap: 12, alignContent: 'start', maxHeight: showAllPie ? 'none' : 190, overflowY: showAllPie ? 'visible' : 'auto' }}>
              {sortedPieData.map((item, i) => {
                const itemPieIdx = pieData.findIndex(d => d.name === item.name)
                const isSelected = clickedIndex !== null && clickedIndex === itemPieIdx
                const isHighlighted = pieDisplayIndex !== null && pieDisplayIndex === itemPieIdx
                const row = (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, cursor: 'pointer',
                      width: 'fit-content', maxWidth: '100%',
                      padding: '3px 6px', borderRadius: 6, margin: '0 -6px',
                      background: isSelected ? 'rgba(139,92,246,0.12)' : 'transparent',
                      border: isSelected ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={() => { if (itemPieIdx !== -1) setLegendHoverIndex(itemPieIdx) }}
                    onMouseLeave={() => setLegendHoverIndex(null)}
                    onClick={e => {
                      e.stopPropagation()
                      if (itemPieIdx !== -1) selectPie(clickedIndex === itemPieIdx ? null : itemPieIdx)
                    }}
                  >
                    {(() => {
                      const Icon = CATEGORY_ICON_MAP[item.icon ?? ''] ?? Tag
                      return (
                        <div style={{ width: 20, height: 20, borderRadius: 7, background: item.color + '26', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={12} color={item.color} strokeWidth={1.8} />
                        </div>
                      )
                    })()}
                    <span style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: 12,
                      color: isHighlighted ? 'var(--aurora-hi)' : 'var(--aurora-lo)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: isHighlighted ? 700 : 400,
                      transition: 'font-weight 0.1s, color 0.1s',
                    }}>{item.name}</span>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', flexShrink: 0 }}>{itemPieIdx !== -1 ? pctByIndex[itemPieIdx] : 0}%</span>
                  </div>
                )
                if (i < 5) return row
                return (
                  <div key={i} className={!showAllPie ? 'hidden md:block' : undefined}>
                    {row}
                  </div>
                )
              })}
              {remainingPieCount > 0 && (
                <button
                  className="md:hidden"
                  onClick={() => setShowAllPie(p => !p)}
                  style={{ fontSize: 12, color: 'var(--aurora-violet-text)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', fontFamily: "'Manrope', sans-serif" }}
                >
                  {showAllPie ? t.dashboard.showLess : t.dashboard.moreItems.replace('{n}', String(remainingPieCount))}
                </button>
              )}
            </div>
            {/* Donut */}
            <div
              style={{ position: 'relative', flexShrink: 0, width: 190, height: 190, minHeight: 190 }}
              onClick={e => e.stopPropagation()}
            >
              {mounted && <ResponsiveContainer width={190} height={190}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    shape={renderPieShape}
                    onMouseEnter={(_: unknown, index: number) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(_: unknown, index: number) => {
                      selectPie(clickedIndex === index ? null : index)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={pieData[i].color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>}
              {/* Center label */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {pieDisplayIndex !== null && pieData[pieDisplayIndex] ? (() => {
                  const slice = pieData[pieDisplayIndex]
                  const SliceIcon = CATEGORY_ICON_MAP[slice.icon ?? ''] ?? Tag
                  return (
                    <>
                      <SliceIcon size={18} color={slice.color} strokeWidth={1.8} style={{ marginBottom: 2 }} />
                      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', fontWeight: 500, textAlign: 'center', padding: '0 4px', margin: 0 }}>{slice.name}</p>
                      <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--aurora-hi)', lineHeight: 1.2, margin: '2px 0 0' }}>{formatAmount(slice.value)}</p>
                      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{pctByIndex[pieDisplayIndex] ?? 0}%</p>
                    </>
                  )
                })() : (
                  <>
                    <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--aurora-hi)', lineHeight: 1.2, margin: 0 }}>{formatAmount(denom)}</p>
                    <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '2px 0 0' }}>{t.dashboard.total}</p>
                  </>
                )}
              </div>
              {/* Center click target — always active, resets selection back to the overall total */}
              <div
                style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 104, height: 104, borderRadius: '50%', cursor: 'pointer', zIndex: 2 }}
                onClick={resetPie}
              />
            </div>
          </div>
        )}
      </GlassCard>
      {clickedIndex !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          onClick={resetPie}
        />
      )}
    </>
  )
}

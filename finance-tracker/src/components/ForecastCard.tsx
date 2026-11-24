import { GlassCard } from './GlassCard'

interface ForecastCardProps {
  title: string
  /** Right of the title, e.g. "ostáva 6 dní" (running month only). */
  note?: string
  predictedBalanceText: string
  predictedBalanceColor: string
  /** Under the figure: how it is worked out ("ak budeš míňať 73,74 € denne"). */
  paceText: string
  /** Comparison with the month before (or a motivational line), in its own colour. */
  insight?: { text: string; color: string }
  /** The lowest account balance still ahead this month. */
  lowest?: { label: string; text: string; negative: boolean }
}

/**
 * "Koniec mesiaca": where the month is heading, why, and how it compares.
 * Replaces the former pair "Ako sa ti darí" + forecast ring — the ring showed
 * how much of the month had passed but read like a goal being met.
 */
export function ForecastCard({ title, note, predictedBalanceText, predictedBalanceColor, paceText, insight, lowest }: ForecastCardProps) {
  const row = { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--aurora-gline)' } as const
  return (
    <GlassCard radius={16}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', margin: 0 }}>{title}</p>
        {note && <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', whiteSpace: 'nowrap' }}>{note}</span>}
      </div>
      <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 24, color: predictedBalanceColor, margin: 0, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{predictedBalanceText}</p>
      <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: '4px 0 0' }}>{paceText}</p>
      {insight && (
        <p style={{ ...row, fontFamily: "'Manrope', sans-serif", fontSize: 13, color: insight.color, margin: 0, marginTop: row.marginTop, lineHeight: 1.4 }}>{insight.text}</p>
      )}
      {lowest && (
        <div style={{ ...row, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-lo)', minWidth: 0 }}>{lowest.label}</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color: lowest.negative ? 'var(--aurora-rose)' : 'var(--aurora-hi)', whiteSpace: 'nowrap', flexShrink: 0 }}>{lowest.text}</span>
        </div>
      )}
    </GlassCard>
  )
}

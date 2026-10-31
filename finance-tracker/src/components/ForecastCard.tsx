import { GlassCard } from './GlassCard'

interface ForecastCardProps {
  progressPct: number
  monthLabel: string
  predictedBalanceLabel: string
  predictedBalanceText: string
  predictedBalanceColor: string
  paceText: string
}

const SIZE = 72
const RADIUS = 32
const STROKE = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ForecastCard({
  progressPct,
  monthLabel,
  predictedBalanceLabel,
  predictedBalanceText,
  predictedBalanceColor,
  paceText,
}: ForecastCardProps) {
  const clamped = Math.min(Math.max(progressPct, 0), 100)
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <GlassCard radius={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--aurora-gline)" strokeWidth={STROKE} />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
              stroke="var(--aurora-violet)" strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-hi)', margin: 0, lineHeight: 1.2 }}>{Math.round(clamped)}%</p>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{monthLabel}</p>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-lo)', margin: '0 0 6px' }}>{predictedBalanceLabel}</p>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: predictedBalanceColor, margin: '0 0 4px', letterSpacing: '-0.3px' }}>{predictedBalanceText}</p>
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{paceText}</p>
        </div>
      </div>
    </GlassCard>
  )
}

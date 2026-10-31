import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Repeat } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { getTransactions } from '../api/transactions'
import { parseDescription } from '../hooks/useFixedExpenses'
import { useFormatters } from '../hooks/useFormatters'
import { useTranslation } from '../i18n'
import { useAuth } from '../context/AuthContext'
import AmountInput from '../components/AmountInput'
import { parseAmountInput } from '../utils/amountInput'

const PAGE = 50

type TypeFilter = 'all' | 'income' | 'expense'

const fieldStyle: React.CSSProperties = {
  background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 12,
  padding: '9px 12px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif",
  outline: 'none', boxSizing: 'border-box', width: '100%', minWidth: 0, colorScheme: 'var(--aurora-color-scheme)',
}
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontFamily: "'Manrope', sans-serif",
  fontSize: 12, fontWeight: 700, color: 'var(--aurora-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: '1 1 140px', minWidth: 0,
}
const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
  background: active ? 'rgba(139,92,246,0.18)' : 'var(--aurora-glass)',
  color: active ? 'var(--aurora-violet-text)' : 'var(--aurora-lo)',
  border: active ? '1px solid rgba(139,92,246,0.45)' : '1px solid var(--aurora-gline)',
})

// "12,5" or "12.5" → 12.5; empty or invalid → undefined
function parseAmount(raw: string): number | undefined {
  const n = parseAmountInput(raw)
  return n != null && n >= 0 ? n : undefined
}

export function SearchPage({ scope }: { scope: 'personal' | 'family' }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { formatAmount, formatDate } = useFormatters()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [paging, setPaging] = useState({ key: '', limit: PAGE })

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text.trim()), 300)
    return () => clearTimeout(id)
  }, [text])

  const min = parseAmount(minAmount)
  const max = parseAmount(maxAmount)
  const hasFilter = !!(debounced || type !== 'all' || min !== undefined || max !== undefined || from || to)

  // A changed search starts again from the first page
  const filterKey = JSON.stringify([debounced, type, min, max, from, to, scope])
  const limit = paging.key === filterKey ? paging.limit : PAGE

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced, type, min ?? null, max ?? null, from, to, scope, limit],
    queryFn: () => getTransactions({
      q: debounced || undefined,
      type: type === 'all' ? undefined : type,
      minAmount: min, maxAmount: max,
      from: from || undefined, to: to || undefined,
      limit, scope,
    }),
    enabled: !!user && hasFilter,
    placeholderData: prev => prev,
  })

  const results = hasFilter ? data?.data ?? [] : []
  const total = hasFilter ? data?.total ?? 0 : 0

  function reset() {
    setText(''); setDebounced(''); setType('all'); setMinAmount(''); setMaxAmount(''); setFrom(''); setTo('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px var(--page-pad-bottom-nofab)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.search.title}</h1>

        <GlassCard radius={18} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="search"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t.search.text}
            maxLength={100}
            style={fieldStyle}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([['all', t.search.all], ['income', t.search.inc], ['expense', t.search.exp]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setType(v)} style={chipStyle(type === v)}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={labelStyle}>{t.search.min}
              <AmountInput value={minAmount} onValueChange={setMinAmount} style={fieldStyle} />
            </label>
            <label style={labelStyle}>{t.search.max}
              <AmountInput value={maxAmount} onValueChange={setMaxAmount} style={fieldStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={labelStyle}>{t.search.frm}
              <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>{t.search.to}
              <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={fieldStyle} />
            </label>
          </div>
          {hasFilter && (
            <button type="button" onClick={reset} style={{ ...chipStyle(false), alignSelf: 'flex-start' }}>{t.search.reset}</button>
          )}
        </GlassCard>

        {!hasFilter ? (
          <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', textAlign: 'center', margin: '12px 0' }}>{t.search.hint}</p>
        ) : (
          <>
            <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>
              {isFetching && !data ? '…' : results.length === 0 ? t.search.none : t.search.count.replace('{n}', String(total))}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map(r => {
                const label = r.isFixed ? parseDescription(r.description, 1).label : r.description ?? ''
                const income = r.type === 'income'
                return (
                  <GlassCard key={r.id} radius={14} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || '—'}</span>
                        {r.isFixed && <Repeat size={11} color="var(--aurora-faint)" aria-label={t.search.fixed} />}
                      </div>
                      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatDate(r.date)}{r.categoryName ? ` · ${r.categoryName}` : ''}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: income ? 'var(--aurora-emerald)' : 'var(--aurora-rose)', whiteSpace: 'nowrap' }}>
                      {income ? '+' : '−'}{formatAmount(r.amount)}
                    </div>
                  </GlassCard>
                )
              })}
            </div>
            {results.length < total && (
              <button type="button" onClick={() => setPaging({ key: filterKey, limit: limit + PAGE })} style={{ ...chipStyle(false), alignSelf: 'center' }}>{t.search.more}</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

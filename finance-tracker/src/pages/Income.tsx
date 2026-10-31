import { useState, useEffect } from 'react'
import { Repeat, Edit2, Trash2, Calendar, Plus, CalendarDays, PiggyBank, ArrowUp } from 'lucide-react'

import { CompactModal } from '../components/CompactModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DateInput } from '../components/DateInput'
import { CsvImportModal } from '../components/CsvImportModal'
import { GlassCard } from '../components/GlassCard'
import { HeroCard } from '../components/HeroCard'
import { useIncomes } from '../hooks/useIncomes'
import { useFormatters } from '../hooks/useFormatters'
import { useCountUp } from '../hooks/useCountUp'
import { useTranslation, getLocalizedDayNames, getLocalizedMonthNames } from '../i18n'
import type { Translations } from '../i18n'
import { todayISO } from '../utils/format'
import { getAllTransactions } from '../api/allTransactions'
import type { Income } from '../types'
import { SwipeableRow } from '../components/SwipeableRow'


interface IncomePageProps {
  month: number
  year: number
}

interface FormState {
  amount: string
  label: string
  date: string
  recurring: boolean
}

const makeEmpty = (): FormState => ({
  amount: '',
  label: '',
  date: todayISO(),
  recurring: false,
})

interface FormBodyProps {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  t: Translations
}

function FormBody({ form, setForm, t }: FormBodyProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={form.amount}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9,]/g, '')
            if ((raw.match(/,/g) || []).length > 1) return
            setForm(f => ({ ...f, amount: raw }))
          }}
          onKeyDown={e => {
            const allowed = ['0','1','2','3','4','5','6','7','8','9',',','Backspace','Delete','Tab','ArrowLeft','ArrowRight','Enter']
            if (!allowed.includes(e.key)) e.preventDefault()
          }}
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--aurora-hi)', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 26, width: '100%', minWidth: 0 }}
        />
        <span style={{ fontSize: 15, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif", flexShrink: 0 }}>€</span>
      </div>
      <input
        type="text"
        placeholder={t.income.descriptionPlaceholder}
        value={form.label}
        onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
        style={{ width: '100%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '11px 14px', color: 'var(--aurora-hi)', fontSize: 13, fontFamily: "'Manrope', sans-serif", outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <DateInput compact value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: form.recurring ? 'linear-gradient(135deg,#34D399,#22D3EE)' : 'var(--aurora-glass)',
            border: form.recurring ? '1px solid transparent' : '1px solid var(--aurora-gline)',
            borderRadius: 12, padding: '8px 11px',
            fontSize: 11, color: form.recurring ? '#fff' : 'var(--aurora-hi)', fontWeight: 600,
            fontFamily: "'Manrope', sans-serif", cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Repeat size={12} /> {t.income.recurringToggle}
        </button>
      </div>
    </>
  )
}


export function IncomePage({ month, year }: IncomePageProps) {
  const { incomes, addIncome, updateIncome, deleteIncome, changeIncomePrice, endIncome } = useIncomes(month, year)
  const { formatAmount, formatAmountParts, formatDate } = useFormatters()
  const { t, locale } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Income | null>(null)
  const [form, setForm] = useState<FormState>(makeEmpty())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [yearlyIncome, setYearlyIncome] = useState(0)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  // Editing a recurring income: a changed amount is a price change from `priceFrom`
  // (YYYY-MM) unless ticked as a correction of a typo
  const nowYM = todayISO().substring(0, 7)
  const [priceFrom, setPriceFrom] = useState(nowYM)
  const [isCorrection, setIsCorrection] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [endMonth, setEndMonth] = useState(nowYM)

  useEffect(() => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`
    )
    Promise.all(months.map(m => getAllTransactions({ type: 'income', month: m })))
      .then(results => {
        const total = results.flat().reduce((s, tx) => s + tx.amount, 0)
        setYearlyIncome(total)
      })
      .catch(() => {})
  }, [year])

  const openAdd = () => { setEditing(null); setIsCorrection(false); setEndOpen(false); setForm(makeEmpty()); setSheetOpen(true) }
  const openEdit = (income: Income) => {
    setEditing(income)
    setPriceFrom(nowYM); setIsCorrection(false); setEndOpen(false); setEndMonth(nowYM)
    setForm({ amount: String(income.amount), label: income.label, date: income.date, recurring: income.recurring })
    setSheetOpen(true)
  }

  const handleSave = async () => {
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!form.label.trim() || isNaN(amount) || amount <= 0) return
    if (editing?.id) {
      const priceChange = editing.recurring && form.recurring && !isCorrection && amount !== editing.amount
      await updateIncome(editing.id, { amount: priceChange ? undefined : amount, label: form.label, date: form.date, recurring: form.recurring })
      if (priceChange) await changeIncomePrice(editing.id, amount, priceFrom)
    } else {
      await addIncome({ amount, label: form.label, date: form.date, recurring: form.recurring })
    }
    setSheetOpen(false)
  }

  const handleDelete = async () => {
    if (confirmId !== null) { await deleteIncome(confirmId); setConfirmId(null) }
  }

  const sorted = [...incomes]
    .sort((a, b) => b.date.localeCompare(a.date))
  const totalAmount = sorted.reduce((s, i) => s + i.amount, 0)
  const recurringIncomes = sorted.filter(i => i.recurring)



  const recurringTotal = recurringIncomes.reduce((s, i) => s + i.amount, 0)
  const oneTimeTotal = totalAmount - recurringTotal
  const dayNames = getLocalizedDayNames(locale)
  const monthNames = getLocalizedMonthNames(locale)
  const rawMonthName = monthNames[month - 1] ?? ''
  const MONTH_NAME = rawMonthName.charAt(0).toLocaleUpperCase(locale) + rawMonthName.slice(1)

  const animatedTotal = useCountUp(totalAmount, 800)

  const dayGroups = sorted.reduce<Array<{ date: string; dayNum: number; dayName: string; monthName: string; items: Income[]; dayTotal: number }>>((acc, income) => {
    const last = acc[acc.length - 1]
    if (last?.date === income.date) {
      last.items.push(income)
      last.dayTotal += income.amount
    } else {
      const d = new Date(income.date + 'T00:00:00')
      acc.push({ date: income.date, dayNum: d.getDate(), dayName: dayNames[d.getDay()], monthName: monthNames[d.getMonth()], items: [income], dayTotal: income.amount })
    }
    return acc
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Content row */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hero wallet card */}
          <HeroCard variant="income">
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, letterSpacing: '0.08em', color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
              {t.income.title} · {MONTH_NAME} {year}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' as const }}>
              <span style={{
                fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 'clamp(34px, 9vw, 44px)', lineHeight: 1,
                background: 'linear-gradient(120deg, var(--aurora-hi), var(--aurora-emerald))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                +{formatAmountParts(animatedTotal).main}
              </span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--aurora-hi)' }}>
                {formatAmountParts(animatedTotal).rest}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.income.recurringLabel}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(recurringTotal)}</div>
              </div>
              <div style={{ background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 16, padding: '10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 10, color: 'var(--aurora-hi)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>{t.income.oneTimeLabel}</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--aurora-hi)' }}>{formatAmount(oneTimeTotal)}</div>
              </div>
            </div>
          </HeroCard>

          {/* Ročný príjem */}
          <GlassCard radius={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Manrope', sans-serif", fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--aurora-hi)', fontWeight: 700, marginBottom: 10 }}>
              <CalendarDays size={12} /> {t.income.yearlyIncomeTitle} {year}
            </div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 22, color: 'var(--aurora-emerald)', marginBottom: 4 }}>{formatAmount(yearlyIncome)}</div>
            <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)' }}>{t.income.yearlyIncomeDesc} {year}</div>
          </GlassCard>

          {/* List / empty state */}
          {sorted.length === 0 ? (
            <GlassCard radius={18}>
              <div className="empty-state">
                <PiggyBank size={40} color="var(--aurora-faint)" style={{ marginBottom: 4 }} />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.income.noIncome}</p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 13, color: 'var(--aurora-faint)', margin: 0 }}>{t.income.noIncomeSubtitle}</p>
              </div>
            </GlassCard>
          ) : (
            <>
              {/* Mobile: day-grouped GlassCard rows */}
              <div className="lg:hidden" style={{ paddingBottom: 'var(--page-pad-bottom)' }} onClick={() => setOpenSwipeId(null)}>
                {dayGroups.map(({ date, dayNum, dayName, monthName, items, dayTotal }) => (
                  <div key={date} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)' }}>{dayNum}</span>
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{dayName}, {monthName}</span>
                      </div>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{items.length} tx · +{formatAmount(dayTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {items.map(income => (
                        <SwipeableRow key={income.id} onDelete={() => setConfirmId(income.id!)} isOpen={openSwipeId === income.id} onOpen={() => setOpenSwipeId(income.id!)}>
                          <GlassCard radius={18} onClick={() => openEdit(income)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: 13, background: 'rgba(52,211,153,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {income.recurring ? <Repeat size={17} color="var(--aurora-emerald)" /> : <Calendar size={17} color="var(--aurora-emerald)" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{income.label}</span>
                                  {income.recurring && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: 'var(--aurora-violet)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      <Repeat size={8} /> {t.income.recurringBadge}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 2 }}>{formatDate(income.date)}</div>
                              </div>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-emerald)', flexShrink: 0 }}>+{formatAmount(income.amount)}</span>
                            </div>
                          </GlassCard>
                        </SwipeableRow>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: day-grouped GlassCard rows */}
              <div className="hidden lg:block">
                {dayGroups.map(({ date, dayNum, dayName, monthName, items, dayTotal }) => (
                  <div key={date} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 2px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--aurora-hi)' }}>{dayNum}</span>
                        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{dayName}, {monthName}</span>
                      </div>
                      <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)' }}>{items.length} tx · +{formatAmount(dayTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {items.map(income => (
                        <GlassCard key={income.id} radius={18} onClick={() => openEdit(income)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 13, background: 'rgba(52,211,153,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {income.recurring ? <Repeat size={17} color="var(--aurora-emerald)" /> : <Calendar size={17} color="var(--aurora-emerald)" />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{income.label}</span>
                                {income.recurring && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: 'var(--aurora-violet)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    <Repeat size={8} /> {t.income.recurringBadge}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, color: 'var(--aurora-faint)', marginTop: 2 }}>{formatDate(income.date)}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--aurora-emerald)', marginRight: 8 }}>+{formatAmount(income.amount)}</span>
                              <button onClick={() => openEdit(income)} className="btn-icon" style={{ color: 'var(--aurora-faint)' }}><Edit2 size={13} /></button>
                              <button onClick={() => setConfirmId(income.id!)} className="btn-icon" style={{ color: 'var(--aurora-faint)' }}><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* FAB — mobile only */}
      {!sheetOpen && (
        <button
          onClick={openAdd}
          className="lg:hidden flex items-center justify-center"
          style={{ position: 'fixed', right: 'var(--fab-right)', bottom: 'var(--fab-bottom)', width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', border: 'none', cursor: 'pointer', color: 'white', boxShadow: '0 10px 30px rgba(139,92,246,.5)', zIndex: 40 }}
        >
          <Plus size={26} />
        </button>
      )}

      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} filterType="income" />

      <CompactModal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        icon={ArrowUp} iconColor="#34D399" iconBg="rgba(52,211,153,.16)"
        title={editing ? t.income.editTitle : t.income.addTitle}
        accent="#34D399" accent2="#22D3EE"
        onSubmit={handleSave}
        submitDisabled={!form.label.trim() || !form.amount}
        onImportCsv={editing ? undefined : () => { setSheetOpen(false); setTimeout(() => setCsvOpen(true), 150) }}
      >
        <FormBody form={form} setForm={setForm} t={t} />
        {editing?.recurring && (() => {
          const newAmount = parseFloat(form.amount.replace(',', '.'))
          const priceChanged = Number.isFinite(newAmount) && newAmount > 0 && newAmount !== editing.amount
          const box: React.CSSProperties = { background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', borderRadius: 14, padding: '10px 14px' }
          const small: React.CSSProperties = { fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0, lineHeight: 1.5 }
          const monthInput: React.CSSProperties = { background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 10, padding: '6px 10px', color: 'var(--aurora-hi)', fontFamily: "'Manrope', sans-serif", fontSize: 13 }
          const endedLabel = editing.endedOn ? `${editing.endedOn.slice(5, 7)}/${editing.endedOn.slice(0, 4)}` : ''
          return (
            <>
              {priceChanged && (
                <div style={box}>
                  {isCorrection ? (
                    <p style={small}>{t.expenses.fixed.correctionHint}</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ ...small, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.priceFrom}</span>
                        <input type="month" value={priceFrom} onChange={e => e.target.value && setPriceFrom(e.target.value)} style={monthInput} />
                      </div>
                      <p style={{ ...small, marginTop: 6 }}>{t.expenses.fixed.priceFromHint.replace('{amount}', formatAmount(editing.amount))}</p>
                    </>
                  )}
                  <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isCorrection} onChange={e => setIsCorrection(e.target.checked)} />
                    {t.expenses.fixed.correctionLabel}
                  </label>
                </div>
              )}
              {editing.endedOn ? (
                <div style={box}>
                  <p style={small}>{t.expenses.fixed.endedBadge.replace('{month}', endedLabel)}</p>
                  <button type="button" onClick={async () => { await endIncome(editing.id!, null); setSheetOpen(false) }} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--aurora-violet)', background: 'transparent', color: 'var(--aurora-violet)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 600 }}>
                    {t.expenses.fixed.restore}
                  </button>
                </div>
              ) : endOpen ? (
                <div style={box}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ ...small, color: 'var(--aurora-lo)', fontWeight: 600 }}>{t.expenses.fixed.endLastMonth}</span>
                    <input type="month" value={endMonth} onChange={e => e.target.value && setEndMonth(e.target.value)} style={monthInput} />
                  </div>
                  <p style={{ ...small, marginTop: 6 }}>{t.expenses.fixed.endHint}</p>
                  <button type="button" onClick={async () => { await endIncome(editing.id!, endMonth); setSheetOpen(false) }} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FBBF24,#f59e0b)', color: '#fff', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 700 }}>
                    {t.expenses.fixed.endConfirm}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setEndOpen(true)} style={{ alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 12, background: 'var(--aurora-glass)', color: 'var(--aurora-lo)', border: '1px solid var(--aurora-gline)', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 600 }}>
                  {t.expenses.fixed.endTitle}
                </button>
              )}
            </>
          )
        })()}
      </CompactModal>

      <ConfirmDialog
        open={confirmId !== null}
        message={t.income.deleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => { setConfirmId(null); setOpenSwipeId(null) }}
      />
    </div>
  )
}

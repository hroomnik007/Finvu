import { useState, useRef } from 'react'
import { X, Upload, Check, Landmark, FileText } from 'lucide-react'
import { createTransactionsBulk } from '../api/transactions'
import { useTranslation } from '../i18n'
import { SettingsDropdown } from './SettingsDropdown'
import type { ParseResult } from 'papaparse'
// pdf.js worker: referenced as an asset URL so the worker file is emitted but its
// (large) code is NOT pulled into the main bundle. The pdf.js library itself is
// lazy-loaded on demand inside extractPdfText — PDF import (365.bank) is a rare action.
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

interface ImportRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  selected: boolean
}

interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  filterType?: 'income' | 'expense'
}

type BankFormat = 'revolut' | 'tatra' | 'csob' | 'slsp' | 'mbank' | 'bank365' | 'custom'

// No brand/finance icon library (e.g. simple-icons) is installed in this project, and
// adding one wasn't part of this fix — see task summary. Real bank logos aren't
// available, so every entry uses the same neutral lucide icon the app already uses
// elsewhere for generic bank/finance contexts (categoryIcons.ts maps 🏦 → Landmark).
function BankIconBox() {
  return (
    <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--aurora-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Landmark size={12} color="var(--aurora-lo)" />
    </span>
  )
}

function CustomIconBox() {
  return (
    <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--aurora-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <FileText size={12} color="var(--aurora-lo)" />
    </span>
  )
}

const BANK_FORMATS: { id: BankFormat; label: string }[] = [
  { id: 'revolut', label: 'Revolut' },
  { id: 'tatra',   label: 'Tatra banka' },
  { id: 'csob',    label: 'ČSOB' },
  { id: 'slsp',    label: 'Slovenská sporiteľňa' },
  { id: 'mbank',   label: 'mBank' },
  { id: 'bank365', label: '365.bank' },
  { id: 'custom',  label: 'Vlastný CSV' },
]

const BANK_FORMAT_OPTIONS = BANK_FORMATS.map(b => ({
  value: b.id,
  label: b.label,
  icon: b.id === 'custom' ? <CustomIconBox /> : <BankIconBox />,
}))

function parseDate(raw: string): string {
  if (!raw) return ''
  // DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // YYYY-MM-DD or YYYY-MM-DD HH:mm
  return raw.split(' ')[0].split('T')[0]
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  return parseFloat(raw.replace(/\s/g,'').replace(',','.').replace(/[^\d.-]/g,'')) || 0
}

type CsvRow = Record<string, string | undefined>

function parseRevolut(rows: CsvRow[]): ImportRow[] {
  return rows
    .filter(r => {
      const state = r['State'] ?? 'COMPLETED'
      return state === 'COMPLETED'
    })
    .map(r => {
      const rawDate = r['Date'] ?? r['Started Date'] ?? r['Completed Date'] ?? ''
      const rawAmount = r['Amount'] ?? r['amount'] ?? '0'
      const amount = parseAmount(rawAmount)
      return {
        date: parseDate(rawDate),
        description: r['Description'] ?? r['description'] ?? '',
        amount: Math.abs(amount),
        type: (amount >= 0 ? 'income' : 'expense') as 'income' | 'expense',
        selected: true,
      }
    })
    .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function parseTatra(rows: CsvRow[]): ImportRow[] {
  // Typical Tatra banka columns: Dátum, Popis transakcie / Informácie o príjemcovi, Suma v EUR
  return rows
    .map(r => {
      const rawDate = r['Dátum'] ?? r['Datum'] ?? r['Date'] ?? ''
      const rawAmount = r['Suma v EUR'] ?? r['Suma'] ?? r['Amount'] ?? r['Kredit'] ?? r['Debet'] ?? '0'
      const desc = r['Popis transakcie'] ?? r['Popis'] ?? r['Description'] ?? r['Informácie o príjemcovi'] ?? ''
      const amount = parseAmount(rawAmount)
      return {
        date: parseDate(rawDate),
        description: desc,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        selected: true,
      }
    })
    .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function parseCSOB(rows: CsvRow[]): ImportRow[] {
  // ČSOB export columns: datum zauctovania, suma, mena, referencia platitela, typ transakcie,
  // cislo uctu protistrany, banka protistrany, nazov protistrany, informacia pre prijemcu, doplnujuce udaje
  return rows
    .map(r => {
      const rawDate = r['datum zauctovania'] ?? ''
      const rawAmount = r['suma'] ?? '0'
      const txType = (r['typ transakcie'] ?? '').trim()
      const counterparty = (r['nazov protistrany'] ?? '').trim()
      const info = (r['informacia pre prijemcu'] ?? '').trim()
      const amount = parseAmount(rawAmount)

      // Card payments carry the merchant name after "Miesto: " inside the info field;
      // other transaction types fall back to the counterparty name, then the raw info, then the type.
      let description: string
      const miestoIdx = info.indexOf('Miesto: ')
      if (miestoIdx !== -1) {
        description = info.slice(miestoIdx + 'Miesto: '.length).trim()
      } else if (counterparty) {
        description = counterparty
      } else if (info) {
        description = info
      } else {
        description = txType
      }

      return {
        date: parseDate(rawDate),
        description,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        selected: true,
      }
    })
    .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function parseSLSP(rows: CsvRow[]): ImportRow[] {
  // Typical SLSP columns: Dátum, Opis, Suma, Typ
  return rows
    .map(r => {
      const rawDate = r['Dátum'] ?? r['Datum'] ?? r['Date'] ?? ''
      const rawAmount = r['Suma'] ?? r['Amount'] ?? r['Kredit'] ?? r['Debet'] ?? '0'
      const desc = r['Opis'] ?? r['Popis'] ?? r['Description'] ?? r['Referencia'] ?? ''
      const amount = parseAmount(rawAmount)
      return {
        date: parseDate(rawDate),
        description: desc,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        selected: true,
      }
    })
    .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

// ── 365.bank PDF statement ──
// 365.bank does not export CSV, only a multi-page PDF statement. We extract the raw
// text with pdf.js (which loses the table layout) and reconstruct transactions from
// the resulting linear text. One transaction looks like:
//   DD. MM. YYYY <Druh>
//   /VS.../SS.../KS...           (optional payment reference)
//   SK.. / DE..                  (optional counterparty IBAN)
//   <counterparty name>          (optional)
//   Zrealizovaná -XX,XX [VS...]  (amount; may also sit inline on the date line)
//   KS.. / SS..                  (optional trailing reference lines)

async function extractPdfText(file: File): Promise<string> {
  // Lazy-load the (heavy) pdf.js library; wire up the pre-emitted worker asset.
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data }).promise
  let full = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue
      line += item.str
      if (item.hasEOL) { full += line + '\n'; line = '' }
    }
    if (line) full += line + '\n'
    full += '\n'
  }
  return full
}

const CSOB365_DATE_RE = /^(\d{1,2})\.\s+(\d{1,2})\.\s+(\d{4})\s+(.+)$/
const CSOB365_IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/
const CSOB365_SKIP_TERMS = ['Prevod na sporiaci účet', 'Investičné Syslenie']

// Header / footer / boilerplate lines that repeat on every page of the statement.
function is365NoiseLine(line: string): boolean {
  return (
    line.startsWith('Dátum Opis transakcie') ||
    line.includes('Dvořákovo nábrežie') ||
    line.startsWith('Zapísaná v Obchodnom registri') ||
    line.startsWith('UT_05_365') ||
    line.startsWith('Dokument je informatívny') ||
    /^Strana \d+ \/ \d+$/.test(line)
  )
}

// Payment-reference lines (/VS.../SS.../KS..., bare numeric refs, trailing VS/SS/KS) —
// never a usable counterparty name.
function is365ReferenceLine(line: string): boolean {
  return line.startsWith('/') || /^(VS|SS|KS)\S*$/.test(line) || /^\d{6,}$/.test(line)
}

function extract365Amount(line: string): number | null {
  const m = line.match(/Zrealizovaná\s+(-?\d[\d\s]*,\d{2})/)
  return m ? parseAmount(m[1]) : null
}

function parse365BankPDF(text: string): ImportRow[] {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !is365NoiseLine(l))

  const out: ImportRow[] = []
  let i = 0
  while (i < lines.length) {
    const dm = lines[i].match(CSOB365_DATE_RE)
    if (!dm) { i++; continue }
    const [, dd, mm, yyyy, rest] = dm
    const date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`

    let druh = rest
    let amount: number | null = null
    const between: string[] = []
    const zIdxOnDate = rest.indexOf('Zrealizovaná')
    if (zIdxOnDate !== -1) {
      // Compact single-line transaction: date + Druh + amount all on one line.
      druh = rest.slice(0, zIdxOnDate).trim()
      amount = extract365Amount(rest)
      i++
    } else {
      // Collect the description lines until the "Zrealizovaná" amount line.
      i++
      while (i < lines.length && !lines[i].startsWith('Zrealizovaná') && !CSOB365_DATE_RE.test(lines[i])) {
        between.push(lines[i])
        i++
      }
      if (i < lines.length && lines[i].startsWith('Zrealizovaná')) {
        amount = extract365Amount(lines[i])
        i++
      }
    }
    if (amount === null) continue

    // Skip savings-transfer / internal entries entirely.
    const haystack = [druh, ...between].join(' ')
    if (CSOB365_SKIP_TERMS.some(term => haystack.includes(term))) continue

    // Name priority: last description line that is neither an IBAN nor a reference;
    // otherwise fall back to the Druh (e.g. "Nákup platobný terminál").
    let name = ''
    for (let k = between.length - 1; k >= 0; k--) {
      const cand = between[k]
      if (CSOB365_IBAN_RE.test(cand) || is365ReferenceLine(cand)) continue
      name = cand
      break
    }

    out.push({
      date,
      description: name || druh,
      amount: Math.abs(amount),
      type: amount >= 0 ? 'income' as const : 'expense' as const,
      selected: true,
    })
  }

  return out.filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

// ── Revolut PDF statement ──
// Revolut also offers a PDF export (in addition to the CSV parsed by parseRevolut above),
// with a different layout: "Account transactions from ... to ..." followed by a table
// whose columns (Date | Description | Money out | Money in | Balance) collapse into
// linear text once extracted. One transaction looks like:
//   MMM D, YYYY <Description> €XX.XX €YY.YY   (transaction amount, then running balance)
//   <optional continuation lines: "To: ...", "Card: ...", currency conversion, ...>
// Only one of Money out / Money in is filled per row, so the sign can't be read off
// the row directly — it's inferred from whether the running balance went up or down
// relative to the previous transaction (seeded from the "Opening balance" in the
// Balance summary table).

const REVOLUT_MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}
const REVOLUT_DATE_RE = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s+(\d{4})\s+(.+)$/
const REVOLUT_AMOUNT_RE = /€([\d,]+\.\d{2})/g

function parseRevolutAmount(raw: string): number {
  if (!raw) return 0
  return parseFloat(raw.replace(/,/g, '')) || 0
}

function parseRevolutPDF(text: string): ImportRow[] {
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0)

  const startIdx = lines.findIndex(l => l.startsWith('Account transactions from'))
  if (startIdx === -1) return []

  // Seed the running balance from the "Opening balance" figure in the Balance summary
  // table (e.g. "Account (Current Account) €71.87 €71.33 €20.58 €21.12") — the first
  // €amount on the summary data row, found by scanning the lines before the table.
  let previousBalance: number | null = null
  for (const line of lines.slice(0, startIdx)) {
    const matches = [...line.matchAll(REVOLUT_AMOUNT_RE)]
    if (matches.length >= 4) {
      previousBalance = parseRevolutAmount(matches[0][1])
      break
    }
  }

  let i = startIdx + 1
  if (i < lines.length && lines[i].startsWith('Date') && lines[i].includes('Description')) i++

  const out: ImportRow[] = []
  while (i < lines.length) {
    const dm = lines[i].match(REVOLUT_DATE_RE)
    if (!dm) { i++; continue }
    const [, mon, dd, yyyy, rest] = dm
    const month = REVOLUT_MONTHS[mon.toLowerCase()]
    i++
    if (!month) continue

    const amountMatches = [...rest.matchAll(REVOLUT_AMOUNT_RE)]
    // Skip continuation lines ("To: ...", "Card: ...", currency conversion, footer) —
    // they carry no further amounts to capture, just consume until the next transaction.
    while (i < lines.length && !REVOLUT_DATE_RE.test(lines[i])) i++

    if (amountMatches.length < 2) continue
    const amount = parseRevolutAmount(amountMatches[0][1])
    const balanceAfter = parseRevolutAmount(amountMatches[amountMatches.length - 1][1])
    const description = rest.split('€')[0].trim()

    const type: 'income' | 'expense' = previousBalance === null
      ? 'expense'
      : (balanceAfter >= previousBalance ? 'income' : 'expense')
    previousBalance = balanceAfter

    out.push({
      date: `${yyyy}-${month}-${dd.padStart(2, '0')}`,
      description,
      amount: Math.abs(amount),
      type,
      selected: true,
    })
  }

  return out.filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function parseMBank(rows: CsvRow[]): ImportRow[] {
  // mBank SK: #Data operacji, #Opis operacji, #Kwota, or Dátum, Opis, Suma
  return rows
    .map(r => {
      const rawDate = r['#Data operacji'] ?? r['Dátum'] ?? r['Date'] ?? ''
      const rawAmount = r['#Kwota'] ?? r['Suma'] ?? r['Amount'] ?? '0'
      const desc = r['#Opis operacji'] ?? r['Opis'] ?? r['Description'] ?? ''
      const amount = parseAmount(rawAmount)
      return {
        date: parseDate(rawDate),
        description: desc,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        selected: true,
      }
    })
    .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

export function CsvImportModal({ open, onClose, filterType }: CsvImportModalProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<BankFormat>('revolut')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  // Custom CSV mapping
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [rawCsvRows, setRawCsvRows] = useState<CsvRow[]>([])
  const [customMapping, setCustomMapping] = useState({ date: '', description: '', amount: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function applyFilter(parsed: ImportRow[]): ImportRow[] {
    return parsed.map(r => ({ ...r, selected: filterType ? r.type === filterType : true }))
  }

  function acceptParsed(parsed: ImportRow[]) {
    if (parsed.length === 0) {
      setError(t.csv.noValidRecords)
    } else {
      if (parsed.length > 500) {
        setWarning(t.csv.tooManyRows)
        parsed = parsed.slice(0, 500)
      } else {
        setWarning(null)
      }
      setRows(applyFilter(parsed))
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setImportedCount(null)
    setRows([])

    // 365.bank ships a PDF statement instead of CSV — extract text, then parse.
    if (format === 'bank365') {
      try {
        const text = await extractPdfText(file)
        acceptParsed(parse365BankPDF(text))
      } catch {
        setError(t.csv.readError)
      }
      return
    }

    // Revolut also offers a PDF statement alongside its CSV export — dispatch on the
    // uploaded file's extension since both are accepted for this bank.
    if (format === 'revolut' && /\.pdf$/i.test(file.name)) {
      try {
        const text = await extractPdfText(file)
        acceptParsed(parseRevolutPDF(text))
      } catch {
        setError(t.csv.readError)
      }
      return
    }

    // papaparse loads on demand — CSV import is a rare action
    const Papa = (await import('papaparse')).default

    function handleParsed(result: ParseResult<CsvRow>) {
      const headers = result.meta.fields ?? []
      if (format === 'custom') {
        setCsvHeaders(headers)
        setRawCsvRows(result.data)
        setCustomMapping({ date: headers[0] ?? '', description: headers[1] ?? '', amount: headers[2] ?? '' })
        return
      }
      let parsed: ImportRow[] = []
      switch (format) {
        case 'revolut':  parsed = parseRevolut(result.data); break
        case 'tatra':    parsed = parseTatra(result.data); break
        case 'csob':     parsed = parseCSOB(result.data); break
        case 'slsp':     parsed = parseSLSP(result.data); break
        case 'mbank':    parsed = parseMBank(result.data); break
      }
      acceptParsed(parsed)
    }

    if (format === 'csob') {
      // ČSOB export starts with an account summary line + a blank line before the real
      // column header row — strip those so header:true picks up the actual columns.
      const text = await file.text()
      const body = text.split(/\r\n|\r|\n/).slice(2).join('\n')
      Papa.parse<CsvRow>(body, {
        header: true,
        skipEmptyLines: true,
        complete: handleParsed,
        error: () => setError(t.csv.readError),
      })
      return
    }

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: format === 'mbank' ? ';' : undefined,
      complete: handleParsed,
      error: () => setError(t.csv.readError),
    })
  }

  function applyCustomMapping() {
    if (!customMapping.date || !customMapping.amount) {
      setError(t.csv.columnMappingError)
      return
    }
    const parsed: ImportRow[] = rawCsvRows
      .map(r => {
        const rawDate = r[customMapping.date] ?? ''
        const rawAmount = r[customMapping.amount] ?? '0'
        const amount = parseAmount(rawAmount)
        return {
          date: parseDate(rawDate),
          description: customMapping.description ? (r[customMapping.description] ?? '') : '',
          amount: Math.abs(amount),
          type: amount >= 0 ? 'income' as const : 'expense' as const,
          selected: true,
        }
      })
      .filter(r => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    if (parsed.length === 0) {
      setError(t.csv.noMappingRecords)
    } else {
      setError(null)
      let limited = parsed
      if (parsed.length > 500) {
        setWarning('CSV obsahuje viac ako 500 riadkov. Importuje sa prvých 500.')
        limited = parsed.slice(0, 500)
      } else {
        setWarning(null)
      }
      setRows(applyFilter(limited))
      setCsvHeaders([])
    }
  }

  async function handleImport() {
    const selected = rows.filter(r => r.selected)
    if (selected.length === 0) return
    setImporting(true)
    try {
      await createTransactionsBulk(selected.map(row => ({ type: row.type, amount: row.amount, description: row.description, date: row.date })))
      setImportedCount(selected.length)
      setRows([])
    } catch {
      setError(t.csv.importError)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setRows([]); setError(null); setWarning(null); setCsvHeaders([]); setRawCsvRows([])
  }

  const allSelected = rows.length > 0 && rows.every(r => r.selected)
  const selectedCount = rows.filter(r => r.selected).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,3,8,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '92vh', background: 'var(--aurora-panel)', border: '1px solid var(--aurora-gline)', borderRadius: 26, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--aurora-gline)' }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--aurora-hi)', margin: 0 }}>{t.csv.title}</h2>
          <button onClick={onClose} aria-label="Zavrieť" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--aurora-glass)', border: '1px solid var(--aurora-gline)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aurora-lo)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {importedCount !== null ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#34D399', marginBottom: 8 }}>{t.csv.importSuccess.replace('{n}', String(importedCount))}</p>
              <button onClick={onClose} style={{ height: 48, padding: '0 32px', background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', border: 'none', borderRadius: 14, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 }}>{t.csv.close}</button>
            </div>
          ) : rows.length === 0 && csvHeaders.length === 0 ? (
            <div>
              {/* Format picker */}
              <div style={{ marginBottom: 14 }}>
                <SettingsDropdown
                  value={format}
                  options={BANK_FORMAT_OPTIONS}
                  onChange={v => setFormat(v as BankFormat)}
                  size="sm"
                />
              </div>

              <div
                style={{ border: '2px dashed var(--aurora-gline)', borderRadius: 14, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: 'rgba(124,58,237,0.03)' }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--aurora-violet)' }}
                onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--aurora-gline)' }}
                onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--aurora-gline)'; const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              >
                <Upload size={24} style={{ color: 'var(--aurora-violet)', margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--aurora-hi)', marginBottom: 4 }}>
                  {format === 'bank365' ? t.csv.dragHerePdf : format === 'revolut' ? t.csv.dragHereCsvOrPdf : t.csv.dragHere}
                </p>
                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, color: 'var(--aurora-faint)', margin: 0 }}>{t.csv.orClick}</p>
                <input ref={fileRef} type="file" accept={format === 'bank365' ? '.pdf,application/pdf' : format === 'revolut' ? '.csv,text/csv,.pdf,application/pdf' : '.csv,text/csv'} style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
              </div>
              {error && <p style={{ color: '#F87171', fontSize: 13, marginTop: 14, textAlign: 'center' }}>{error}</p>}
            </div>
          ) : csvHeaders.length > 0 ? (
            // Custom column mapping
            <div>
              <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>{t.csv.mapColumns}</p>
              {(['date', 'description', 'amount'] as const).map(field => (
                <div key={field} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                    {field === 'date' ? t.csv.dateCol : field === 'description' ? t.csv.descCol : t.csv.amountCol}
                  </label>
                  <select
                    value={customMapping[field]}
                    onChange={e => setCustomMapping(m => ({ ...m, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value="">{t.csv.noMapping}</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              {error && <p style={{ color: '#F87171', fontSize: 13, marginTop: 8 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={reset} style={{ flex: 1, height: 44, background: 'transparent', border: '1px solid var(--border2)', borderRadius: 12, color: 'var(--text2)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{t.csv.back}</button>
                <button onClick={applyCustomMapping} style={{ flex: 2, height: 44, background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', border: 'none', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t.csv.continue}</button>
              </div>
            </div>
          ) : (
            <div>
              {warning && (
                <p style={{ fontSize: 12, color: '#FBBF24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>{warning}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>{rows.length} {t.csv.records} · <span style={{ color: 'var(--violet)' }}>{selectedCount}</span> {t.csv.selectedCount}</p>
                <button onClick={() => setRows(r => r.map(x => ({ ...x, selected: !allSelected })))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--violet)', fontSize: 13, fontFamily: 'inherit' }}>
                  {allSelected ? t.csv.deselectAll : t.csv.selectAll}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map((row, i) => (
                  <div key={i} onClick={() => setRows(r => r.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: row.selected ? 'rgba(124,58,237,0.08)' : 'var(--bg3)', border: `1px solid ${row.selected ? 'rgba(124,58,237,0.3)' : 'var(--border)'}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: row.selected ? '#7C3AED' : 'transparent', border: `2px solid ${row.selected ? '#7C3AED' : 'var(--border2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {row.selected && <Check size={12} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{row.type === 'income' ? '💰' : '💸'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || '—'}</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', margin: '1px 0 0' }}>{row.date}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: row.type === 'income' ? '#34D399' : '#F87171', flexShrink: 0 }}>
                      {row.type === 'income' ? '+' : '-'}{row.amount.toFixed(2)} €
                    </span>
                  </div>
                ))}
              </div>
              {error && <p style={{ color: '#F87171', fontSize: 13, marginTop: 12 }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {rows.length > 0 && importedCount === null && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, flexShrink: 0 }}>
            <button onClick={reset} style={{ flex: 1, height: 48, background: 'transparent', border: '1px solid var(--border2)', borderRadius: 14, color: 'var(--text2)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{t.common.cancel}</button>
            <button onClick={handleImport} disabled={selectedCount === 0 || importing}
              style={{ flex: 2, height: 48, background: 'linear-gradient(135deg, var(--aurora-violet), var(--aurora-fuchsia))', border: 'none', borderRadius: 14, color: 'white', fontSize: 15, fontWeight: 600, cursor: selectedCount > 0 && !importing ? 'pointer' : 'default', opacity: importing || selectedCount === 0 ? 0.4 : 1, fontFamily: 'inherit' }}>
              {importing ? t.csv.importing : `${t.csv.importBtn} (${selectedCount})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

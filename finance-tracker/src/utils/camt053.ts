// camt.053 (ISO 20022 BankToCustomerStatement) parser.
//
// Slovak and Czech banks (SLSP, Tatra banka, VÚB, ČSOB, Fio, mBank, …) can export a
// statement as camt.053 XML. Unlike their CSV exports, the layout is standardised, so
// one parser covers all of them. Parsing happens in the browser with the built-in
// DOMParser: the file never leaves the device, only the resulting rows are sent
// through the normal bulk-create API.
//
// Element lookup is by local name, so the parser does not care about the namespace
// prefix or the schema version (.001.02 – .001.08 are tested; later versions keep
// the same shape for the fields used here).

export interface CamtRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  currency: string
  /** Bank reference (AcctSvcrRef / EndToEndId), used to drop repeats inside a file. */
  reference?: string
}

export interface CamtResult {
  rows: CamtRow[]
  /** e.g. "camt.053.001.08"; empty when the namespace carries no version. */
  version: string
  /** Entries with a status other than BOOK (pending, info). */
  skippedPending: number
  /** Reversed entries (RvslInd = true). */
  skippedReversal: number
  /** Rows dropped because their bank reference already appeared in the file. */
  skippedRepeat: number
  /** Rows whose currency is not EUR. */
  foreign: number
}

export class CamtError extends Error {
  readonly code: 'invalid-xml' | 'not-camt053'
  constructor(code: 'invalid-xml' | 'not-camt053') {
    super(code)
    this.code = code
  }
}

// Only the parts of the DOM the parser touches, so tests can pass @xmldom/xmldom.
interface XNode { nodeType: number; localName?: string | null; textContent: string | null; childNodes: ArrayLike<XNode> }
interface XElement extends XNode { getAttribute(name: string): string | null; namespaceURI?: string | null }
interface XDocument { documentElement: XElement | null; getElementsByTagName(name: string): ArrayLike<unknown> }
export interface XmlParserCtor { new (): { parseFromString(xml: string, type: 'application/xml'): unknown } }

const ELEMENT = 1

function kids(el: XElement | undefined, name: string): XElement[] {
  if (!el) return []
  const out: XElement[] = []
  const list = el.childNodes
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    if (n.nodeType === ELEMENT && n.localName === name) out.push(n as XElement)
  }
  return out
}

/** First element along a path of local names, e.g. path(ntry, 'BookgDt', 'Dt'). */
function path(el: XElement | undefined, ...names: string[]): XElement | undefined {
  let cur = el
  for (const n of names) {
    cur = kids(cur, n)[0]
    if (!cur) return undefined
  }
  return cur
}

function text(el: XElement | undefined, ...names: string[]): string {
  return (path(el, ...names)?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function amountOf(el: XElement | undefined): { amount: number; currency: string } | undefined {
  if (!el) return undefined
  const amount = Number((el.textContent ?? '').trim())
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  return { amount: Math.round(amount * 100) / 100, currency: (el.getAttribute('Ccy') ?? '').toUpperCase() }
}

// BookgDt / ValDt hold either <Dt>YYYY-MM-DD</Dt> or <DtTm>YYYY-MM-DDThh:mm:ss…</DtTm>.
function dateOf(el: XElement | undefined): string {
  const raw = text(el, 'Dt') || text(el, 'DtTm')
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

// .001.02 – .001.07: <Sts>BOOK</Sts>; .001.08+: <Sts><Cd>BOOK</Cd></Sts>.
function statusOf(ntry: XElement): string {
  const sts = path(ntry, 'Sts')
  if (!sts) return 'BOOK'
  const code = text(sts, 'Cd') || text(sts, 'Prtry') || text(sts)
  return code.toUpperCase()
}

// .001.02 – .001.07: RltdPties/Dbtr/Nm; .001.08+: RltdPties/Dbtr/Pty/Nm.
function partyName(tx: XElement | undefined, role: string): string {
  const parties = path(tx, 'RltdPties')
  for (const r of [role, `Ultmt${role}`]) {
    const p = path(parties, r)
    const name = text(p, 'Nm') || text(p, 'Pty', 'Nm')
    if (name) return name
  }
  return ''
}

function remittance(tx: XElement | undefined): string {
  const rmt = path(tx, 'RmtInf')
  if (!rmt) return ''
  const parts = kids(rmt, 'Ustrd').map(u => text(u)).filter(Boolean)
  for (const strd of kids(rmt, 'Strd')) {
    const addtl = kids(strd, 'AddtlRmtInf').map(a => text(a)).filter(Boolean)
    if (addtl.length) parts.push(...addtl)
    else {
      const ref = text(strd, 'CdtrRefInf', 'Ref')
      if (ref) parts.push(ref)
    }
  }
  return parts.join(' ').trim()
}

function cleanRef(ref: string): string {
  return ref && ref.toUpperCase() !== 'NOTPROVIDED' ? ref : ''
}

// Counterparty first (best for category rules), then the payment message; card
// payments usually only carry the merchant in the additional info.
function describe(name: string, message: string, extra: string): string {
  const parts: string[] = []
  if (name) parts.push(name)
  // A bare reference number (variable symbol etc.) says nothing to the user.
  if (message && !/^[\d/\s-]+$/.test(message) && !parts.some(p => p.toLowerCase().includes(message.toLowerCase()))) parts.push(message)
  if (parts.length === 0 && extra) parts.push(extra)
  return parts.join(' · ').slice(0, 200)
}

function parseDocument(xml: string, Parser: XmlParserCtor): XElement {
  let doc: XDocument
  try {
    doc = new Parser().parseFromString(xml, 'application/xml') as XDocument
  } catch {
    throw new CamtError('invalid-xml')
  }
  const root = doc?.documentElement
  // Browsers report errors as a <parsererror> document instead of throwing.
  if (!root || root.localName === 'parsererror' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new CamtError('invalid-xml')
  }
  return root
}

export function looksLikeXml(name: string, head: string): boolean {
  return /\.xml$/i.test(name) || /^\uFEFF?\s*<(\?xml|Document|[\w-]+:Document)/.test(head)
}

export function parseCamt053(
  xml: string,
  Parser: XmlParserCtor = globalThis.DOMParser as unknown as XmlParserCtor,
): CamtResult {
  const root = parseDocument(xml, Parser)
  const stmtRoot = root.localName === 'BkToCstmrStmt' ? root : path(root, 'BkToCstmrStmt')
  if (!stmtRoot) throw new CamtError('not-camt053')

  const version = (root.namespaceURI ?? '').match(/camt\.053\.\d{3}\.\d{2}/)?.[0] ?? ''
  const result: CamtResult = { rows: [], version, skippedPending: 0, skippedReversal: 0, skippedRepeat: 0, foreign: 0 }
  const seen = new Set<string>()

  for (const stmt of kids(stmtRoot, 'Stmt')) {
    const accountCcy = text(stmt, 'Acct', 'Ccy').toUpperCase()

    for (const ntry of kids(stmt, 'Ntry')) {
      if (statusOf(ntry) !== 'BOOK') { result.skippedPending++; continue }
      if (text(ntry, 'RvslInd').toLowerCase() === 'true') { result.skippedReversal++; continue }

      const entryAmt = amountOf(path(ntry, 'Amt'))
      const entryDir = text(ntry, 'CdtDbtInd').toUpperCase()
      const date = dateOf(path(ntry, 'BookgDt')) || dateOf(path(ntry, 'ValDt'))
      if (!entryAmt || !date || (entryDir !== 'CRDT' && entryDir !== 'DBIT')) continue

      const entryRef = cleanRef(text(ntry, 'AcctSvcrRef'))
      const entryInfo = text(ntry, 'AddtlNtryInf')
      const txs = kids(ntry, 'NtryDtls').flatMap(d => kids(d, 'TxDtls'))

      // A batch is split into its transactions only when each one has its own amount;
      // otherwise the entry is imported as one row so the total stays right.
      const txAmounts = txs.map(tx => amountOf(path(tx, 'Amt')) ?? amountOf(path(tx, 'AmtDtls', 'TxAmt', 'Amt')))
      const split = txs.length > 1 && txAmounts.every(Boolean)

      const pieces = split
        ? txs.map((tx, i) => ({ tx, amt: txAmounts[i]!, dir: text(tx, 'CdtDbtInd').toUpperCase() || entryDir, idx: i }))
        : [{ tx: txs[0], amt: entryAmt, dir: entryDir, idx: -1 }]

      for (const { tx, amt, dir, idx } of pieces) {
        if (dir !== 'CRDT' && dir !== 'DBIT') continue
        const type = dir === 'CRDT' ? 'income' as const : 'expense' as const
        // Who paid us on a credit, whom we paid on a debit.
        const name = partyName(tx, type === 'income' ? 'Dbtr' : 'Cdtr')
        const message = remittance(tx)
        const extra = text(tx, 'AddtlTxInf') || entryInfo

        const txRef = cleanRef(text(tx, 'Refs', 'AcctSvcrRef')) || cleanRef(text(tx, 'Refs', 'EndToEndId'))
        const reference = split
          ? (txRef || (entryRef ? `${entryRef}#${idx + 1}` : ''))
          : (entryRef || txRef)
        if (reference) {
          if (seen.has(reference)) { result.skippedRepeat++; continue }
          seen.add(reference)
        }

        const currency = amt.currency || entryAmt.currency || accountCcy || 'EUR'
        if (currency !== 'EUR') result.foreign++
        result.rows.push({
          date,
          description: describe(name, message, extra),
          amount: amt.amount,
          type,
          currency,
          ...(reference ? { reference } : {}),
        })
      }
    }
  }
  return result
}

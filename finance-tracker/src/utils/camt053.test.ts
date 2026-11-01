import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { CamtError, looksLikeXml, parseCamt053, type XmlParserCtor } from './camt053'

const Parser = DOMParser as unknown as XmlParserCtor
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('camt.053 parser', () => {
  it('reads a .001.02 statement', () => {
    const r = parseCamt053(fixture('camt053-v02.xml'), Parser)
    expect(r.version).toBe('camt.053.001.02')
    expect(r.rows).toEqual([
      { date: '2026-10-10', description: 'ACME Slovakia s.r.o. · Mzda 09/2026', amount: 2150, type: 'income', currency: 'EUR', reference: 'TB2026101000001' },
      { date: '2026-10-12', description: 'Platba kartou LIDL BRATISLAVA', amount: 23.45, type: 'expense', currency: 'EUR', reference: 'TB2026101200007' },
      { date: '2026-10-15', description: 'Ján Prenajímateľ · Nájom október', amount: 650, type: 'expense', currency: 'EUR', reference: 'TB2026101500003' },
      // no booking date -> value date; no reference at all; structured ref is kept
      { date: '2026-10-20', description: 'ZSE Energia, a.s. · VS1234567890', amount: 45.2, type: 'expense', currency: 'EUR' },
    ])
    expect(r.skippedPending).toBe(1)
    expect(r.skippedReversal).toBe(1)
    expect(r.foreign).toBe(0)
  })

  it('reads a prefixed .001.08 statement with batches, Pty names and non-EUR entries', () => {
    const r = parseCamt053(fixture('camt053-v08.xml'), Parser)
    expect(r.version).toBe('camt.053.001.08')
    expect(r.rows.map(x => [x.date, x.description, x.amount, x.type, x.currency, x.reference])).toEqual([
      ['2026-10-05', 'Orange Slovensko · Faktúra 10/2026', 80, 'expense', 'EUR', 'SLSP-B-778-1'],
      ['2026-10-05', 'Bratislavská vodárenská', 30.5, 'expense', 'EUR', 'E2E-2'],
      ['2026-10-05', 'Poplatok za vedenie účtu', 10, 'expense', 'EUR', 'SLSP-B-778#3'],
      ['2026-10-08', 'Mária Nováková · Pre vnúča', 50, 'income', 'EUR', 'SLSP-77001'],
      ['2026-10-09', 'Platba kartou ALZA.CZ PRAHA', 499, 'expense', 'CZK', 'SLSP-CZ-1'],
      // batch without per-transaction amounts stays one row with the entry total
      ['2026-10-21', 'Škôlka Slniečko', 42, 'expense', 'EUR', 'SLSP-B-900'],
    ])
    expect(r.skippedPending).toBe(1)
    expect(r.skippedRepeat).toBe(1)
    expect(r.foreign).toBe(1)
  })

  it('splits batch amounts that add up to the entry', () => {
    const r = parseCamt053(fixture('camt053-v08.xml'), Parser)
    const batch = r.rows.filter(x => x.reference?.startsWith('SLSP-B-778') || x.reference === 'E2E-2')
    expect(batch.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(120.5)
  })

  it('handles missing optional fields', () => {
    const xml = `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04"><BkToCstmrStmt><Stmt>
      <Ntry><Amt Ccy="EUR">5</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-01</Dt></BookgDt></Ntry>
      <Ntry><Amt Ccy="EUR">0</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-01</Dt></BookgDt></Ntry>
      <Ntry><Amt Ccy="EUR">7</Amt><CdtDbtInd>DBIT</CdtDbtInd></Ntry>
      <Ntry><Amt>3.10</Amt><CdtDbtInd>CRDT</CdtDbtInd><ValDt><Dt>2026-09-02</Dt></ValDt><NtryDtls><TxDtls/></NtryDtls></Ntry>
    </Stmt></BkToCstmrStmt></Document>`
    const r = parseCamt053(xml, Parser)
    expect(r.rows).toEqual([
      { date: '2026-09-01', description: '', amount: 5, type: 'expense', currency: 'EUR' },
      { date: '2026-09-02', description: '', amount: 3.1, type: 'income', currency: 'EUR' },
    ])
  })

  it('uses the account currency when Amt has no Ccy', () => {
    const xml = `<Document><BkToCstmrStmt><Stmt><Acct><Ccy>CZK</Ccy></Acct>
      <Ntry><Amt>100</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-01</Dt></BookgDt></Ntry>
    </Stmt></BkToCstmrStmt></Document>`
    const r = parseCamt053(xml, Parser)
    expect(r.rows[0].currency).toBe('CZK')
    expect(r.foreign).toBe(1)
    expect(r.version).toBe('')
  })

  it('rejects broken XML and other documents', () => {
    const quiet = { onError: () => {} }
    class QuietParser extends (DOMParser as unknown as new (o?: unknown) => object) { constructor() { super(quiet) } }
    expect(() => parseCamt053('<Document><Bk', QuietParser as unknown as XmlParserCtor)).toThrow(CamtError)
    try { parseCamt053('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.052.001.02"><BkToCstmrAcctRpt/></Document>', Parser) }
    catch (e) { expect((e as CamtError).code).toBe('not-camt053') }
    expect.assertions(2)
  })

  it('recognises XML files by name or content', () => {
    expect(looksLikeXml('vypis.XML', '')).toBe(true)
    expect(looksLikeXml('export', '<?xml version="1.0"?>')).toBe(true)
    expect(looksLikeXml('export', '\uFEFF<Document xmlns="x">')).toBe(true)
    expect(looksLikeXml('export.csv', 'Date,Amount')).toBe(false)
  })
})

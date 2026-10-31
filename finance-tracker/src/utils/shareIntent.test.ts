import { describe, expect, it } from 'vitest'
import { amountForInput, intentFromSearch, normalizeNumber, parseSharedText } from './shareIntent'

describe('normalizeNumber', () => {
  it.each([
    ['12,50', 12.5],
    ['12.50', 12.5],
    ['1 234,56', 1234.56],
    ['1\u00a0234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234', 1234],
    ['12,5', 12.5],
    ['7', 7],
  ])('%s → %d', (raw, value) => {
    expect(normalizeNumber(raw)).toBe(value)
  })
})

describe('parseSharedText', () => {
  it('takes an amount with the euro sign and keeps the rest as description', () => {
    expect(parseSharedText({ text: 'Obed v bufete 12,50 €' })).toEqual({ amount: 12.5, description: 'Obed v bufete' })
  })

  it('drops the minus sign and the EUR code', () => {
    expect(parseSharedText({ text: 'Platba kartou -12.50 EUR Lidl Bratislava' }))
      .toEqual({ amount: 12.5, description: 'Platba kartou Lidl Bratislava' })
  })

  it('reads a space-grouped amount without a currency', () => {
    expect(parseSharedText({ text: 'Nová práčka 1 234,56' })).toEqual({ amount: 1234.56, description: 'Nová práčka' })
  })

  it('reads a non-breaking space group and a currency in front', () => {
    expect(parseSharedText({ text: 'Spolu: EUR 1\u00a0099,00 za letenky' }))
      .toEqual({ amount: 1099, description: 'Spolu: za letenky' })
    expect(parseSharedText({ text: '€9.99 Spotify' })).toEqual({ amount: 9.99, description: 'Spotify' })
  })

  it('prefers the number next to a currency over other decimals', () => {
    expect(parseSharedText({ text: 'Tankovanie 45,20 l za 72,31 €' }))
      .toEqual({ amount: 72.31, description: 'Tankovanie 45,20 l za' })
  })

  it('does not take whole numbers, dates or numbers in links as amounts', () => {
    expect(parseSharedText({ text: 'Objednávka 123456 z 12.10.2026', url: 'https://shop.sk/p/19,99' }))
      .toEqual({ amount: null, description: 'Objednávka 123456 z 12.10.2026 https://shop.sk/p/19,99' })
  })

  it('joins title, text and url and does not repeat a url already in the text', () => {
    expect(parseSharedText({ title: 'Kino', text: 'Lístky 2× 8,90 € https://kino.sk/x', url: 'https://kino.sk/x' }))
      .toEqual({ amount: 8.9, description: 'Kino Lístky 2× https://kino.sk/x' })
  })

  it('returns an empty description when the text is only an amount', () => {
    expect(parseSharedText({ text: '  -3,20 €  ' })).toEqual({ amount: 3.2, description: '' })
  })

  it('handles empty input', () => {
    expect(parseSharedText({})).toEqual({ amount: null, description: '' })
  })

  it('caps the description length', () => {
    expect(parseSharedText({ text: `${'a'.repeat(300)} 5,00 €` }).description).toHaveLength(200)
  })
})

describe('amountForInput', () => {
  it('formats for the comma-decimal amount field', () => {
    expect(amountForInput(12.5)).toBe('12,50')
    expect(amountForInput(1099)).toBe('1099')
    expect(amountForInput(null)).toBe('')
  })
})

describe('intentFromSearch', () => {
  it('maps the manifest shortcuts', () => {
    expect(intentFromSearch('?action=add-expense')).toEqual({ kind: 'add-expense' })
    expect(intentFromSearch('?action=add-income')).toEqual({ kind: 'add-income' })
    expect(intentFromSearch('?action=annual')).toEqual({ kind: 'annual' })
  })

  it('parses a GET share', () => {
    expect(intentFromSearch('?share=text&title=&text=Pizza%2012%2C90%20%E2%82%AC'))
      .toEqual({ kind: 'add-expense', amount: '12,90', note: 'Pizza' })
  })

  it('points to the service worker stash for a POST share', () => {
    expect(intentFromSearch('?share=text')).toBe('stashed-text')
    expect(intentFromSearch('?share=file')).toEqual({ kind: 'import-file' })
  })

  it('ignores anything else', () => {
    expect(intentFromSearch('')).toBeNull()
    expect(intentFromSearch('?action=delete-everything')).toBeNull()
    expect(intentFromSearch('?share=../../x')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { matchRule, normalizeKeyword, suggestKeyword } from './importRules'

const rules = [
  { id: '1', keyword: 'lidl', categoryId: 'food' },
  { id: '2', keyword: 'lidl bratislava', categoryId: 'special' },
]

describe('import rules', () => {
  it('normalises case, diacritics and whitespace', () => {
    expect(normalizeKeyword('  LÍDL   Bratislava ')).toBe('lidl bratislava')
  })

  it('matches by keyword contained in the description', () => {
    expect(matchRule('Platba kartou KAUFLAND', rules)).toBeUndefined()
    expect(matchRule('Platba kartou LIDL Košice', rules)?.categoryId).toBe('food')
  })

  it('prefers the longest matching keyword', () => {
    expect(matchRule('LIDL BRATISLAVA 12', rules)?.categoryId).toBe('special')
  })

  it('does not match an empty description', () => {
    expect(matchRule('', rules)).toBeUndefined()
  })

  it('suggests the first meaningful word', () => {
    expect(suggestKeyword('Platba kartou LIDL BRATISLAVA 123')).toBe('lidl')
    expect(suggestKeyword('Prevod 123 456')).toBe('')
  })
})

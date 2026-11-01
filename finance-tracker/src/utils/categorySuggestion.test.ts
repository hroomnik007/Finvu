import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSuggestionScheduler, mayAutoSelect, suggestionQuery, SUGGEST_DEBOUNCE_MS } from './categorySuggestion'

describe('mayAutoSelect', () => {
  it('fills an empty choice or replaces an earlier suggestion', () => {
    expect(mayAutoSelect({ manual: false, currentId: '', suggestedId: null })).toBe(true)
    expect(mayAutoSelect({ manual: false, currentId: 'a', suggestedId: 'a' })).toBe(true)
  })
  it('never overrides a manual pick or a preselected category', () => {
    expect(mayAutoSelect({ manual: true, currentId: '', suggestedId: null })).toBe(false)
    expect(mayAutoSelect({ manual: true, currentId: 'a', suggestedId: 'a' })).toBe(false)
    expect(mayAutoSelect({ manual: false, currentId: 'b', suggestedId: null })).toBe(false)
    expect(mayAutoSelect({ manual: false, currentId: 'b', suggestedId: 'a' })).toBe(false)
  })
  it('may replace the form default until the user taps', () => {
    expect(mayAutoSelect({ manual: false, currentId: 'first', suggestedId: null, defaultId: 'first' })).toBe(true)
    expect(mayAutoSelect({ manual: true, currentId: 'first', suggestedId: null, defaultId: 'first' })).toBe(false)
    expect(mayAutoSelect({ manual: false, currentId: 'other', suggestedId: null, defaultId: 'first' })).toBe(false)
  })
})

describe('suggestionQuery', () => {
  it('trims and needs two meaningful characters', () => {
    expect(suggestionQuery('  obed ')).toBe('obed')
    expect(suggestionQuery(' a ')).toBeNull()
    expect(suggestionQuery('')).toBeNull()
  })
})

describe('createSuggestionScheduler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('debounces typing into one lookup for the final text', async () => {
    const fetch = vi.fn(async (q: string) => ({ categoryId: `cat-${q}` }))
    const onSuggest = vi.fn()
    const s = createSuggestionScheduler({ fetch, onSuggest, canApply: () => true })
    for (const text of ['o', 'ob', 'obe', 'obed']) { s.update(text); await vi.advanceTimersByTimeAsync(100) }
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe('obed')
    expect(onSuggest).toHaveBeenCalledWith('cat-obed')
  })

  it('drops an answer that arrives after newer typing', async () => {
    let resolve!: (v: { categoryId: string }) => void
    const fetch = vi.fn((q: string, signal?: AbortSignal) => { void q; void signal; return new Promise<{ categoryId: string }>(r => { resolve = r }) })
    const onSuggest = vi.fn()
    const s = createSuggestionScheduler({ fetch, onSuggest, canApply: () => true })
    s.update('obed')
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS)
    s.update('obed v praci')
    resolve({ categoryId: 'stale' })
    await vi.runAllTimersAsync()
    expect(onSuggest).not.toHaveBeenCalledWith('stale')
    expect(fetch.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    expect((fetch.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
  })

  it('does not apply when the user picked meanwhile, and ignores errors', async () => {
    let allowed = true
    const onSuggest = vi.fn()
    const s = createSuggestionScheduler({ fetch: async () => ({ categoryId: 'x' }), onSuggest, canApply: () => allowed })
    s.update('taxi'); allowed = false
    await vi.runAllTimersAsync()
    expect(onSuggest).not.toHaveBeenCalled()

    const failing = createSuggestionScheduler({ fetch: async () => { throw new Error('offline') }, onSuggest, canApply: () => true })
    failing.update('taxi')
    await vi.runAllTimersAsync()
    expect(onSuggest).not.toHaveBeenCalled()
  })

  it('cancel stops a pending lookup; short text never asks', async () => {
    const fetch = vi.fn(async () => null)
    const s = createSuggestionScheduler({ fetch, onSuggest: vi.fn(), canApply: () => true })
    s.update('obed'); s.cancel()
    s.update('a')
    await vi.runAllTimersAsync()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('wiring', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
  it('add forms suggest, category taps count as manual picks, editing never suggests', () => {
    const page = src('pages/VariableExpenses.tsx')
    expect(page).toMatch(/useCategorySuggestion\(\{\s*text: form\.note,\s*active: sheetOpen && !editing/)
    expect(page).toContain('suggestion.pickedManually(); setForm')
    const fab = src('components/GlobalFAB.tsx')
    expect(fab).toContain("text: varNote, active: activeModal === 'variable'")
    expect(fab).toContain("text: fixLabel, active: activeModal === 'fixed'")
    expect(fab).toContain('varSuggestion.pickedManually(); setVarCatId')
    expect(fab).toContain('fixSuggestion.pickedManually(); setFixCatId')
    const fixed = src('pages/FixedExpenses.tsx')
    expect(fixed).toMatch(/useCategorySuggestion\(\{\s*text: label,\s*active: sheetOpen && !editing/)
    expect(fixed).toContain('suggestion.pickedManually(); setCategoryId')
  })
  it('only talks to our own API', () => {
    expect(src('api/transactions.ts')).toContain("apiClient.get('/api/transactions/suggest-category'")
    for (const f of ['utils/categorySuggestion.ts', 'hooks/useCategorySuggestion.ts']) expect(src(f)).not.toMatch(/https?:\/\//)
  })
})

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCategorySuggestion } from '../api/transactions'
import { createSuggestionScheduler, mayAutoSelect } from '../utils/categorySuggestion'

interface Options {
  /** The description/label being typed. */
  text: string
  /** Form is open and in "add" mode (never suggest while editing). */
  active: boolean
  currentId: string
  /** Categories that may be selected (the user's categories of this type). */
  validIds: string[]
  select: (categoryId: string) => void
  type?: 'expense' | 'income'
  /** Category preselected by the form on open (may be replaced by a suggestion). */
  defaultId?: string
}

/**
 * Picks a category from the typed description until the user picks one by
 * hand. Call `pickedManually()` from the category buttons. `suggestedId` is
 * the selected category while it is still the suggested one (for the hint).
 */
export function useCategorySuggestion({ text, active, currentId, validIds, select, type = 'expense', defaultId }: Options) {
  const [suggestedId, setSuggestedId] = useState<string | null>(null)
  const manual = useRef(false)
  const latest = useRef({ currentId, suggestedId, validIds, select, defaultId })
  useEffect(() => { latest.current = { currentId, suggestedId, validIds, select, defaultId } })

  // A newly opened form starts fresh.
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setSuggestedId(null)
  }
  useEffect(() => { if (active) manual.current = false }, [active])

  const scheduler = useRef<ReturnType<typeof createSuggestionScheduler> | null>(null)
  useEffect(() => {
    const sch = createSuggestionScheduler({
      fetch: (q, signal) => fetchCategorySuggestion(q, type, signal),
      canApply: (id) => {
        const l = latest.current
        return l.validIds.includes(id) && mayAutoSelect({ manual: manual.current, currentId: l.currentId, suggestedId: l.suggestedId, defaultId: l.defaultId })
      },
      onSuggest: (id) => { setSuggestedId(id); latest.current.select(id) },
    })
    scheduler.current = sch
    return () => { sch.cancel(); scheduler.current = null }
  }, [type])

  useEffect(() => {
    const sch = scheduler.current
    if (!sch) return
    if (!active) { sch.cancel(); return }
    const l = latest.current
    if (mayAutoSelect({ manual: manual.current, currentId: l.currentId, suggestedId: l.suggestedId, defaultId: l.defaultId })) sch.update(text)
    return sch.cancel
  }, [text, active, type])

  const pickedManually = useCallback(() => { manual.current = true; scheduler.current?.cancel() }, [])

  return { suggestedId: suggestedId && suggestedId === currentId ? suggestedId : null, pickedManually }
}

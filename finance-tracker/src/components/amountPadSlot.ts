import { createContext } from 'react'

/**
 * Where a form's number pad goes: CompactModal provides the spot between its
 * fields and its save button, so the pad sits below the category, date and
 * note, right above save. Without a provider the pad renders inline.
 */
export const AmountPadSlot = createContext<HTMLElement | null>(null)

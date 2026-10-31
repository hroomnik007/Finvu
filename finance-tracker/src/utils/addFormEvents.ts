// Lets any screen (first-run checklist, empty states) open one of the global
// add forms owned by GlobalFAB without prop drilling.
export type AddFormType = 'income' | 'variable' | 'fixed' | 'category'
const EVENT = 'finvu:open-add-form'

export function requestAddForm(type: AddFormType): void {
  window.dispatchEvent(new CustomEvent<AddFormType>(EVENT, { detail: type }))
}

export function subscribeAddForm(fn: (type: AddFormType) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<AddFormType>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

// A tiny global toast store. Any component can show a toast without the
// showToast prop being threaded through the tree; useToast() subscribes React.

export type ToastVariant = 'default' | 'achievement' | 'success' | 'error'

export interface ToastAction {
  label: string
  onAction: () => void | Promise<void>
}

export interface Toast {
  id: number
  message: string
  variant?: ToastVariant
  icon?: string
  label?: string
  action?: ToastAction
}

export interface ShowToastOptions {
  variant?: ToastVariant
  icon?: string
  label?: string
  action?: ToastAction
  /** ms before the toast disappears; defaults to 4 s, 6 s with an action. */
  duration?: number
}

let nextId = 0
let toasts: Toast[] = []
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const l of listeners) l()
}

export function getToasts(): Toast[] {
  return toasts
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
  if (!toasts.some(t => t.id === id)) return
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

export function showToast(message: string, options: ShowToastOptions = {}): number {
  const id = ++nextId
  const { duration, ...rest } = options
  toasts = [...toasts, { id, message, ...rest }]
  emit()
  timers.set(id, setTimeout(() => dismissToast(id), duration ?? (rest.action ? 6000 : 4000)))
  return id
}

/** Runs a toast's action once: the toast is removed first, so a second tap
 * on the same button can't run the action twice. */
export async function runToastAction(id: number): Promise<void> {
  const toast = toasts.find(t => t.id === id)
  if (!toast?.action) return
  dismissToast(id)
  await toast.action.onAction()
}

/** Test helper. */
export function resetToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  toasts = []
  emit()
}

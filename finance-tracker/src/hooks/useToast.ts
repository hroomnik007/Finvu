import { useSyncExternalStore } from 'react'
import { getToasts, showToast, subscribeToasts } from '../lib/toastStore'

export type { Toast, ShowToastOptions, ToastAction } from '../lib/toastStore'

export function useToast() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  return { toasts, showToast }
}

import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from '../i18n'
import { showToast } from '../lib/toastStore'
import { getPendingDeletes, scheduleDelete, subscribePendingDeletes, UNDO_WINDOW_MS } from '../lib/pendingDelete'

/** Ids hidden while their delete waits for the undo window (see lib/pendingDelete). */
export function usePendingDeleteIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribePendingDeletes, getPendingDeletes, getPendingDeletes)
}

/** Hides a row now, shows "Zmazané · Späť" for ~5 s and deletes on the server afterwards. */
export function useUndoableDelete() {
  const { t } = useTranslation()
  return useCallback((id: string, commit: () => Promise<void>) => {
    const undo = scheduleDelete(id, commit, {
      onError: () => showToast(t.common.deleteItemFailed, { variant: 'error', duration: 6000 }),
    })
    showToast(t.common.deletedItem, {
      variant: 'success',
      duration: UNDO_WINDOW_MS,
      action: {
        label: t.common.undo,
        onAction: () => { if (undo()) showToast(t.common.undone, { variant: 'success' }) },
      },
    })
  }, [t])
}

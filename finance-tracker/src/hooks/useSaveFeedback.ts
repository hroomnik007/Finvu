import { useCallback } from 'react'
import { useTranslation } from '../i18n'
import { saveFeedback } from '../lib/saveFeedback'
import { apiErrorMessage } from '../utils/apiError'

/** "Uložené" / error toasts for create and edit forms (see lib/saveFeedback). */
export function useSaveFeedback() {
  const { t } = useTranslation()
  const saved = useCallback((undo?: () => Promise<void>) => saveFeedback.saved(t.common, undo), [t])
  // With the caught error, a failure the server explains (e.g. a recurring item
  // with the same name) shows that explanation instead of the generic text.
  const failed = useCallback((err?: unknown) => saveFeedback.failed(
    err === undefined ? t.common : { ...t.common, saveFailed: apiErrorMessage(err, t.common.saveFailed, t) },
  ), [t])
  return { saved, failed }
}

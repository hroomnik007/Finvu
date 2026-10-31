import { useCallback } from 'react'
import { useTranslation } from '../i18n'
import { saveFeedback } from '../lib/saveFeedback'

/** "Uložené" / error toasts for create and edit forms (see lib/saveFeedback). */
export function useSaveFeedback() {
  const { t } = useTranslation()
  const saved = useCallback((undo?: () => Promise<void>) => saveFeedback.saved(t.common, undo), [t])
  const failed = useCallback(() => saveFeedback.failed(t.common), [t])
  return { saved, failed }
}

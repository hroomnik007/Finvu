import { showToast } from './toastStore'

export interface SaveFeedbackTexts {
  saved: string
  saveFailed: string
  undo: string
  undone: string
  undoFailed: string
}

export const saveFeedback = {
  /** Success toast; with `undo` it gets a "Späť" button that runs it once. */
  saved(texts: SaveFeedbackTexts, undo?: () => Promise<void>): number {
    return showToast(texts.saved, {
      variant: 'success',
      action: undo
        ? {
            label: texts.undo,
            onAction: async () => {
              try {
                await undo()
                showToast(texts.undone, { variant: 'success' })
              } catch {
                showToast(texts.undoFailed, { variant: 'error' })
              }
            },
          }
        : undefined,
    })
  },
  failed(texts: SaveFeedbackTexts): number {
    return showToast(texts.saveFailed, { variant: 'error', duration: 6000 })
  },
}

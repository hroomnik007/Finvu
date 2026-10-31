import { Sparkles } from 'lucide-react'
import { useTranslation } from '../i18n'

/** Small note under a form when the selected category came from a suggestion. */
export function SuggestedCategoryHint({ name }: { name: string | null | undefined }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" style={{ minHeight: name ? undefined : 0 }}>
      {name && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--aurora-lo)', fontFamily: "'Manrope', sans-serif" }}>
          <Sparkles size={12} aria-hidden="true" />
          {t.expenses.variable.suggestedCategory.replace('{name}', name)}
        </span>
      )}
    </div>
  )
}

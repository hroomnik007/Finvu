import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useCategories } from '../hooks/useCategories'
import { deleteAllCategories } from '../api/categories'
import { useTranslation } from '../i18n'
import { useFormatters } from '../hooks/useFormatters'

type TemplateId = 'family' | 'couple' | 'single'
type CategoryKey = 'food' | 'transport' | 'housing' | 'kids' | 'health' | 'fun' | 'together' | 'personal'

interface Template {
  id: TemplateId
  emoji: string
  categories: { key: CategoryKey; icon: string; color: string; budgetLimit: number }[]
}

const TEMPLATES: Template[] = [
  {
    id: 'family',
    emoji: '👨‍👩‍👧',
    categories: [
      { key: 'food', icon: '🍔', color: '#10B981', budgetLimit: 400 },
      { key: 'transport', icon: '🚗', color: '#F59E0B', budgetLimit: 200 },
      { key: 'housing', icon: '🏠', color: '#3B82F6', budgetLimit: 800 },
      { key: 'kids', icon: '🧒', color: '#EC4899', budgetLimit: 300 },
      { key: 'health', icon: '💊', color: '#EF4444', budgetLimit: 150 },
      { key: 'fun', icon: '🎉', color: '#8B5CF6', budgetLimit: 100 },
    ],
  },
  {
    id: 'couple',
    emoji: '👫',
    categories: [
      { key: 'food', icon: '🍔', color: '#10B981', budgetLimit: 300 },
      { key: 'transport', icon: '🚗', color: '#F59E0B', budgetLimit: 150 },
      { key: 'housing', icon: '🏠', color: '#3B82F6', budgetLimit: 600 },
      { key: 'health', icon: '💊', color: '#EF4444', budgetLimit: 100 },
      { key: 'fun', icon: '🎉', color: '#8B5CF6', budgetLimit: 150 },
      { key: 'together', icon: '💑', color: '#EC4899', budgetLimit: 200 },
    ],
  },
  {
    id: 'single',
    emoji: '🧑',
    categories: [
      { key: 'food', icon: '🍔', color: '#10B981', budgetLimit: 200 },
      { key: 'transport', icon: '🚗', color: '#F59E0B', budgetLimit: 100 },
      { key: 'housing', icon: '🏠', color: '#3B82F6', budgetLimit: 500 },
      { key: 'health', icon: '💊', color: '#EF4444', budgetLimit: 80 },
      { key: 'fun', icon: '🎉', color: '#8B5CF6', budgetLimit: 100 },
      { key: 'personal', icon: '🧴', color: '#A78BFA', budgetLimit: 150 },
    ],
  },
]

interface BudgetTemplateModalProps {
  /** A template was applied or the offer was skipped: don't offer it again. */
  onComplete: () => void
  /** Closed via ×, Esc or a backdrop click: keep the dashboard banner. */
  onClose: () => void
}

export function BudgetTemplateModal({ onComplete, onClose }: BudgetTemplateModalProps) {
  const { t } = useTranslation()
  const bt = t.budgetTemplate
  const { formatAmount } = useFormatters()
  const [selected, setSelected] = useState<TemplateId | null>(null)
  const [loading, setLoading] = useState(false)
  const { addCategory } = useCategories()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  async function handleApply() {
    if (!selected) return
    const template = TEMPLATES.find(tpl => tpl.id === selected)
    if (!template) return
    setLoading(true)
    try {
      await deleteAllCategories()
      for (const cat of template.categories) {
        await addCategory({ name: bt.categories[cat.key], icon: cat.icon, color: cat.color, type: 'expense', budgetLimit: cat.budgetLimit })
      }
    } finally {
      setLoading(false)
      onComplete()
    }
  }

  function handleSkip() {
    onComplete()
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(13,10,26,0.88)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-template-title"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '90vh',
          background: 'linear-gradient(135deg, #1E1535, #2D1F5E)',
          border: '1px solid #4C3A8A',
          borderRadius: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label={bt.close}
          title={bt.close}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1,
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid #4C3A8A',
            color: '#E2D9F3', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🏦</div>
            <h2 id="budget-template-title" style={{ fontSize: '19px', fontWeight: 700, color: '#E2D9F3', marginBottom: '8px' }}>
              {bt.title}
            </h2>
            <p style={{ fontSize: '13px', color: '#9D84D4', lineHeight: 1.5 }}>
              {bt.subtitle}
            </p>
            <p style={{ fontSize: '12px', color: '#FBBF24', lineHeight: 1.5, marginTop: '6px' }}>
              {bt.replaceWarning}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '8px' }}>
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => setSelected(tpl.id)}
                aria-pressed={selected === tpl.id}
                style={{
                  padding: '14px',
                  borderRadius: '16px',
                  border: selected === tpl.id ? '2px solid #7C3AED' : '1px solid #4C3A8A',
                  background: selected === tpl.id ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  transition: 'all 0.15s ease',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0 }}>{tpl.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#E2D9F3', marginBottom: '2px' }}>
                    {bt.templates[tpl.id].label}
                  </p>
                  <p style={{ fontSize: '12px', color: '#9D84D4', marginBottom: '6px' }}>{bt.templates[tpl.id].description}</p>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {tpl.categories.map(c => (
                      <span key={c.key} style={{
                        fontSize: '12px',
                        padding: '2px 7px',
                        borderRadius: '20px',
                        backgroundColor: c.color + '22',
                        color: c.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {c.icon} {bt.categories[c.key]} {formatAmount(c.budgetLimit)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pinned buttons */}
        <div style={{
          padding: '16px 24px',
          display: 'flex',
          gap: '12px',
          borderTop: '1px solid rgba(76,58,138,0.4)',
          background: 'rgba(13,10,26,0.3)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleSkip}
            style={{
              flex: 1,
              height: '48px',
              background: 'transparent',
              border: '1px solid #4C3A8A',
              borderRadius: '14px',
              color: '#9D84D4',
              fontSize: '14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {bt.skip}
          </button>
          <button
            onClick={handleApply}
            disabled={!selected || loading}
            style={{
              flex: 2,
              height: '48px',
              background: selected ? 'linear-gradient(135deg, #7C3AED, #6D28D9)' : '#32265A',
              border: 'none',
              borderRadius: '14px',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: selected && !loading ? 'pointer' : 'default',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? bt.applying : bt.apply}
          </button>
        </div>
      </div>
    </div>
  )
}

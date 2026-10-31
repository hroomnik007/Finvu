import { Plus } from 'lucide-react'

/** Primary action under an empty-state message ("Pridať príjem" …). */
export function EmptyStateAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 10, minHeight: 44, padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'linear-gradient(135deg,var(--aurora-violet),var(--aurora-fuchsia))', color: '#fff',
        fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600,
      }}
    >
      <Plus size={16} strokeWidth={2.2} /> {label}
    </button>
  )
}

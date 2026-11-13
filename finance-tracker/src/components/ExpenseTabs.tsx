import { Receipt, Repeat, Tag } from 'lucide-react'
import type { Page } from '../App'
import { useTranslation } from '../i18n'
import { EXPENSE_MENU_PAGES } from '../utils/bottomNav'

interface Props {
  current: Page
  onChange: (page: Page) => void
}

// Phone-only switch between the three expense pages (Variable · Fixed ·
// Categories). The bottom "Výdavky" tab opens the first one directly.
export function ExpenseTabs({ current, onChange }: Props) {
  const { t } = useTranslation()
  const item: Record<string, { icon: React.ReactNode; label: string }> = {
    'variable-expenses': { icon: <Receipt size={15} aria-hidden />, label: t.nav.variable },
    'fixed-expenses': { icon: <Repeat size={15} aria-hidden />, label: t.nav.fixed },
    categories: { icon: <Tag size={15} aria-hidden />, label: t.nav.categories },
  }
  return (
    <nav className="expense-tabs" aria-label={t.nav.expenses}>
      {EXPENSE_MENU_PAGES.map(page => {
        const on = current === page
        return (
          <button
            key={page}
            type="button"
            aria-current={on ? 'page' : undefined}
            className={on ? 'expense-tab is-active' : 'expense-tab'}
            onClick={() => { if (!on) onChange(page) }}
          >
            {item[page].icon}
            <span>{item[page].label}</span>
          </button>
        )
      })}
    </nav>
  )
}

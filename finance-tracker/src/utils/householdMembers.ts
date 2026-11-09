import type { HouseholdMember } from '../api/households'

/** Search "Člen" filter: 'all' or the id of one household member. */
export type MemberFilter = 'all' | string

/**
 * The member choices for the search filter: the caller first ("Ja"), then the
 * other members by name. Empty when there is nobody else to tell apart, so the
 * filter (and the avatars) stay hidden outside a shared household.
 */
export function memberFilterOptions(members: HouseholdMember[], myId: string | null | undefined): Array<{ id: string; me: boolean; name: string }> {
  if (!myId || members.length < 2) return []
  const me = members.find(m => m.id === myId)
  if (!me) return []
  const others = members.filter(m => m.id !== myId).sort((a, b) => a.name.localeCompare(b.name))
  return [{ id: me.id, me: true, name: me.name }, ...others.map(m => ({ id: m.id, me: false, name: m.name }))]
}

/** A selected member that is no longer an option (left the household, scope changed) falls back to everyone. */
export function effectiveMemberFilter(selected: MemberFilter, options: Array<{ id: string }>): MemberFilter {
  return selected !== 'all' && options.some(o => o.id === selected) ? selected : 'all'
}

/**
 * Second line of a household activity item: "Nákupy · pred 1 h". Expenses
 * without a category say so; an income without one just shows the time.
 */
export function activityMeta(item: { type: 'income' | 'expense'; category_name?: string | null }, timeText: string, noCategory: string): string {
  const category = item.category_name?.trim() || (item.type === 'expense' ? noCategory : '')
  return category ? `${category} · ${timeText}` : timeText
}

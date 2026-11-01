// Shared presentation metadata for the achievements — used by Profile.tsx
// (grid + detail modal), NotificationCenter.tsx (persistent unlock entry) and
// the achievement-unlock toast. `key` matches the backend achievement keys
// returned by GET /api/achievements; `i18nKey` maps to t.achievements.items.*.
export type AchievementI18nKey =
  | 'firstTransaction'
  | 'weekStreak'
  | 'firstSavingsGoal'
  | 'firstReport'
  | 'budgetMet'
  | 'speedster'
  | 'teamPlayer'
  | 'veteran'

export interface AchievementMeta {
  key: string
  i18nKey: AchievementI18nKey
  emoji: string
  color: string
  /** No longer earnable: shown (and counted) only for a user who already has it unlocked. */
  retired?: boolean
}

export const ACHIEVEMENTS: AchievementMeta[] = [
  { key: 'first_transaction', i18nKey: 'firstTransaction', emoji: '🎯', color: '#7C3AED' },
  { key: 'week_streak', i18nKey: 'weekStreak', emoji: '🔥', color: '#FB923C' },
  { key: 'first_savings_goal', i18nKey: 'firstSavingsGoal', emoji: '💰', color: '#34D399' },
  { key: 'first_report', i18nKey: 'firstReport', emoji: '📊', color: '#60a5fa', retired: true },
  { key: 'budget_met', i18nKey: 'budgetMet', emoji: '🏆', color: '#FBBF24' },
  { key: 'speedster', i18nKey: 'speedster', emoji: '⚡', color: '#F59E0B' },
  { key: 'team_player', i18nKey: 'teamPlayer', emoji: '👥', color: '#A78BFA' },
  { key: 'veteran', i18nKey: 'veteran', emoji: '💎', color: '#67E8F9' },
]

export function getAchievementMeta(key: string): AchievementMeta | undefined {
  return ACHIEVEMENTS.find(a => a.key === key)
}

/**
 * The achievements to list for a user: every active one, plus a retired one only
 * if this user has it unlocked. The list length is the total for "X of Y".
 */
export function visibleAchievements(unlockedKeys: ReadonlySet<string>): AchievementMeta[] {
  return ACHIEVEMENTS.filter(a => !a.retired || unlockedKeys.has(a.key))
}

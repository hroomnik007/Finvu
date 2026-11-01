import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, getAchievementMeta, visibleAchievements } from './achievements'

const active = ACHIEVEMENTS.filter(a => !a.retired)

describe('retired achievement first_report', () => {
  it('is marked retired and keeps its metadata for the name and icon', () => {
    expect(getAchievementMeta('first_report')?.retired).toBe(true)
  })

  it('is not listed, nor counted in the total, for a user who does not have it', () => {
    const list = visibleAchievements(new Set(['first_transaction']))
    expect(list.map(a => a.key)).not.toContain('first_report')
    expect(list).toHaveLength(active.length)
  })

  it('is listed and counted for a user who has it unlocked', () => {
    const list = visibleAchievements(new Set(['first_report']))
    expect(list.map(a => a.key)).toContain('first_report')
    expect(list).toHaveLength(active.length + 1)
  })
})

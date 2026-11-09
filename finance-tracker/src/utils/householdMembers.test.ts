import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { HouseholdMember } from '../api/households'
import { activityMeta, effectiveMemberFilter, memberFilterOptions } from './householdMembers'
import { MemberAvatar } from '../components/MemberAvatar'

const m = (id: string, name: string, avatar_url: string | null = null): HouseholdMember => ({ id, name, avatar_url, joined_at: null, is_owner: false })

describe('memberFilterOptions', () => {
  it('puts the caller first, then the others by name', () => {
    const opts = memberFilterOptions([m('z', 'Zuzka'), m('me', 'Peter'), m('d', 'Danka')], 'me')
    expect(opts).toEqual([
      { id: 'me', me: true, name: 'Peter' },
      { id: 'd', me: false, name: 'Danka' },
      { id: 'z', me: false, name: 'Zuzka' },
    ])
  })

  it('is empty without a household to tell apart', () => {
    expect(memberFilterOptions([], 'me')).toEqual([])
    expect(memberFilterOptions([m('me', 'Peter')], 'me')).toEqual([])
    expect(memberFilterOptions([m('a', 'A'), m('b', 'B')], 'me')).toEqual([])
    expect(memberFilterOptions([m('me', 'Peter'), m('d', 'Danka')], null)).toEqual([])
  })
})

describe('effectiveMemberFilter', () => {
  const opts = [{ id: 'me' }, { id: 'd' }]
  it('keeps a valid choice and falls back to everyone otherwise', () => {
    expect(effectiveMemberFilter('d', opts)).toBe('d')
    expect(effectiveMemberFilter('all', opts)).toBe('all')
    expect(effectiveMemberFilter('gone', opts)).toBe('all')
    expect(effectiveMemberFilter('d', [])).toBe('all')
  })
})

describe('activityMeta', () => {
  it('shows the category before the time', () => {
    expect(activityMeta({ type: 'expense', category_name: 'Nákupy' }, 'pred 1 h', 'Bez kategórie')).toBe('Nákupy · pred 1 h')
    expect(activityMeta({ type: 'income', category_name: 'Výplata' }, 'včera', 'Bez kategórie')).toBe('Výplata · včera')
  })

  it('labels uncategorized expenses and leaves uncategorized income alone', () => {
    expect(activityMeta({ type: 'expense', category_name: null }, 'pred 1 h', 'Bez kategórie')).toBe('Bez kategórie · pred 1 h')
    expect(activityMeta({ type: 'expense' }, 'pred 1 h', 'Bez kategórie')).toBe('Bez kategórie · pred 1 h')
    expect(activityMeta({ type: 'income', category_name: '  ' }, 'pred 1 h', 'Bez kategórie')).toBe('pred 1 h')
  })
})

describe('MemberAvatar (search rows)', () => {
  it('falls back to the initial without a photo', () => {
    const html = renderToStaticMarkup(createElement(MemberAvatar, { userId: 'd', userName: 'danka', size: 22, avatarUrl: null }))
    expect(html).toContain('>D</div>')
    expect(html).toContain('width:22px')
  })

  it('renders the photo with the member name as alt text', () => {
    const html = renderToStaticMarkup(createElement(MemberAvatar, { userId: 'd', userName: 'Danka', size: 22, avatarUrl: '/uploads/avatars/d.jpg?v=1' }))
    expect(html).toContain('<img')
    expect(html).toContain('alt="Danka"')
  })
})

import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from './useHousehold'
import type { HouseholdMember } from '../api/households'

/**
 * Who a row belongs to in the family view (Moje / Rodinné): rows without an
 * owner are the user's own. Other members' rows are shown read-only with
 * their avatar.
 */
export function useRowOwner(scope: 'personal' | 'family') {
  const { user } = useAuth()
  const { members } = useHousehold()
  const me = user?.id
  const family = scope === 'family'
  const isMine = useCallback((ownerId?: string | null) => !ownerId || ownerId === me, [me])
  const ownerOf = useCallback((ownerId?: string | null): HouseholdMember | undefined =>
    family ? members.find(m => m.id === (ownerId || me)) : undefined, [family, members, me])
  return { family, isMine, ownerOf }
}

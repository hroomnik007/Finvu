import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dismissSubscription, fetchSubscriptionSuggestions, type SubscriptionSuggestion } from '../api/subscriptions'
import { useAuth } from '../context/AuthContext'

export const SUBSCRIPTION_SUGGESTIONS_KEY = ['subscriptionSuggestions'] as const

export function useSubscriptionSuggestions(enabled = true) {
  const { isAuthenticated } = useAuth()
  const qc = useQueryClient()
  const { data: suggestions = [] } = useQuery({
    queryKey: SUBSCRIPTION_SUGGESTIONS_KEY,
    queryFn: fetchSubscriptionSuggestions,
    enabled: isAuthenticated && enabled,
    staleTime: 5 * 60_000,
  })

  // Hidden at once; the server remembers it for next time
  const dismiss = useCallback(async (key: string) => {
    qc.setQueryData<SubscriptionSuggestion[]>(SUBSCRIPTION_SUGGESTIONS_KEY, prev => (prev ?? []).filter(s => s.key !== key))
    try {
      await dismissSubscription(key)
    } catch {
      await qc.invalidateQueries({ queryKey: SUBSCRIPTION_SUGGESTIONS_KEY })
    }
  }, [qc])

  return { suggestions, dismiss }
}

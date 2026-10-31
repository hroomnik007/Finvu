import { apiClient } from './client'

export interface SubscriptionSuggestion {
  key: string
  name: string
  amount: number
  dayOfMonth: number
  categoryId: string | null
  occurrences: number
  lastDate: string
  nextDate: string
}

export async function fetchSubscriptionSuggestions(): Promise<SubscriptionSuggestion[]> {
  const res = await apiClient.get<{ data: SubscriptionSuggestion[] }>('/api/subscriptions/suggestions')
  return res.data.data
}

export async function dismissSubscription(key: string): Promise<void> {
  await apiClient.post('/api/subscriptions/dismissals', { key })
}

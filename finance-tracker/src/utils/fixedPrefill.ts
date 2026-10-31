// Hand-off from a subscription card elsewhere (the dashboard) to the fixed
// expenses form: set before navigating, read by the fixed expenses page when it
// mounts and cleared once it has.
import type { SubscriptionSuggestion } from '../api/subscriptions'

let pending: SubscriptionSuggestion | null = null

export function setFixedPrefill(s: SubscriptionSuggestion): void {
  pending = s
}

export function peekFixedPrefill(): SubscriptionSuggestion | null {
  return pending
}

export function clearFixedPrefill(): void {
  pending = null
}

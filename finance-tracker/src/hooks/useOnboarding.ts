import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function useOnboarding() {
  const { user, isLoading, isGuest, completeOnboarding: saveOnboarding } = useAuth()
  // Derived from auth state; dismissedForUserId bridges the gap between the
  // user tapping "done" and the backend flag landing in the user object.
  const [dismissedForUserId, setDismissedForUserId] = useState<string | null>(null)

  const showOnboarding =
    !isLoading &&
    !isGuest &&
    !!user && !user.onboardingComplete &&
    dismissedForUserId !== user.id

  async function completeOnboarding() {
    setDismissedForUserId(user?.id ?? null)
    await saveOnboarding()
  }

  return { showOnboarding, completeOnboarding }
}

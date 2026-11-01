import { apiClient, refreshAccessToken } from './client'
import { announceAchievementUnlocks } from '../utils/achievementEvents'
import type { AuthUser, UserSession } from '../types'
import type { ThemePreference } from '../utils/theme'

export async function login(email: string, password: string): Promise<{ user: AuthUser; accessToken: string }> {
  const { data } = await apiClient.post('/api/auth/login', { email, password })
  return data
}

export async function register(
  email: string,
  password: string,
  name: string,
  gdprConsent: boolean,
  theme?: ThemePreference,
): Promise<{ message: string }> {
  const { data } = await apiClient.post('/api/auth/register', { email, password, name, gdprConsent, ...(theme ? { theme } : {}) })
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout')
}

export async function refreshToken(): Promise<{ accessToken: string }> {
  // Routes through the same in-flight-deduplicated refresh as the response
  // interceptor (see client.ts) — a concurrent reactive 401 refresh and this
  // proactive call (e.g. AuthContext boot, PullToRefresh) share one request.
  const accessToken = await refreshAccessToken()
  return { accessToken }
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const { data } = await apiClient.get('/api/auth/me')
  return data
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const { data } = await apiClient.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
  return data
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post('/api/auth/resend-verification', { email })
  return data
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post('/api/auth/forgot-password', { email })
  return data
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  const { data } = await apiClient.post('/api/auth/reset-password', { token, newPassword })
  return data
}

/**
 * What proves it's really the owner deleting the account: the password for
 * password accounts; for passwordless ones a fresh passkey assertion, the PIN
 * (on a device bound to it) or a token just obtained from the linked Google account.
 */
export type DeleteAccountProof =
  | { currentPassword: string }
  | { passkey: object }
  | { pin: string }
  | { googleAccessToken: string }

export async function deleteAccount(proof: DeleteAccountProof): Promise<void> {
  await apiClient.delete('/api/auth/account', { data: proof })
}

export async function updateAvatar(avatarUrl: string): Promise<{ avatarUrl: string }> {
  const { data } = await apiClient.patch('/api/auth/avatar', { avatarUrl })
  return data
}

export async function demoLogin(): Promise<{ user: import('../types').AuthUser; accessToken: string }> {
  const { data } = await apiClient.post('/api/auth/demo-login')
  return data
}

export async function updateWeeklyEmail(enabled: boolean): Promise<{ weeklyEmailEnabled: boolean }> {
  const { data } = await apiClient.patch('/api/auth/weekly-email', { enabled })
  return data
}

export async function googleLogin(accessToken: string, theme?: ThemePreference): Promise<{ user: import('../types').AuthUser; accessToken: string }> {
  // theme only matters if this Google sign-in creates the account
  const { data } = await apiClient.post('/api/auth/google', { accessToken, ...(theme ? { theme } : {}) })
  return data
}

export async function updateUserSettings(settings: {
  onboardingComplete?: boolean
  monthlyEmailEnabled?: boolean
  monthlyEmailScope?: 'personal' | 'family'
  monthlyEmailHour?: number
  defaultPage?: string
  currencyFormat?: string
  theme?: string
  savingsEnabled?: boolean
  trackingStartDate?: string | null
  onboardingBannerDismissed?: boolean
  language?: string
  autoLockMinutes?: number | null
}): Promise<void> {
  await apiClient.patch('/api/auth/settings', settings)
}

export async function getSessions(): Promise<UserSession[]> {
  const { data } = await apiClient.get('/api/auth/sessions')
  return (data as { data: UserSession[] }).data
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/auth/sessions/${sessionId}`)
}

export async function deactivateAccount(): Promise<void> {
  await apiClient.post('/api/auth/deactivate')
}

export async function createSharedReport(data: string, expiresInHours?: number): Promise<{ token: string }> {
  const { data: res } = await apiClient.post('/api/reports', { data, expiresInHours })
  announceAchievementUnlocks(res.newlyUnlockedAchievements)
  return res
}

export async function getSharedReport(token: string): Promise<{ data: string }> {
  const { data } = await apiClient.get(`/api/reports/${token}`)
  return data
}

export async function pinLogin(email: string, pin: string): Promise<{ user: import('../types').AuthUser; accessToken: string }> {
  const { data } = await apiClient.post('/api/auth/pin-login', { email, pin })
  return data
}

// currentPassword/currentPin: re-auth factor required by the backend before
// planting/replacing a PIN (a bare access token is no longer enough — see
// security audit run-1). Pass whichever the caller already collected.
export async function savePin(pin: string, currentPassword?: string, currentPin?: string): Promise<void> {
  await apiClient.patch('/api/auth/pin', { pin, currentPassword, currentPin })
}

export async function deletePin(currentPassword?: string, currentPin?: string): Promise<void> {
  await apiClient.delete('/api/auth/pin', { data: { currentPassword, currentPin } })
}

// Pre-login check for the PIN login screen: does this browser have a valid
// pinDevice cookie at all? Lets the UI distinguish "never set up on this
// device" from "wrong PIN" before the user types anything. No auth/identity
// input — the cookie is sent automatically (withCredentials).
export async function getPinDeviceStatus(): Promise<{ deviceRegistered: boolean }> {
  const { data } = await apiClient.get('/api/auth/pin-device-status')
  return data
}

export interface PinDevice {
  id: string
  label: string | null
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  isCurrentDevice: boolean
}

export async function getPinDevices(): Promise<PinDevice[]> {
  const { data } = await apiClient.get('/api/auth/pin-devices')
  return (data as { data: PinDevice[] }).data
}

export async function deletePinDevice(id: string): Promise<void> {
  await apiClient.delete(`/api/auth/pin-devices/${id}`)
}

export async function webauthnRegisterVerify(body: object): Promise<{ success: boolean }> {
  const { data } = await apiClient.post('/api/auth/webauthn/register-verify', body)
  return data
}

export interface PasskeyInfo {
  id: string
  name: string
  deviceType: string | null
  backedUp: boolean
  createdAt: string
}

export async function getPasskeys(): Promise<PasskeyInfo[]> {
  const { data } = await apiClient.get('/api/auth/webauthn/credentials')
  return (data as { data: PasskeyInfo[] }).data
}

export async function webauthnAuthenticateVerify(body: object): Promise<{ user: import('../types').AuthUser; accessToken: string; sessionId?: string }> {
  const { data } = await apiClient.post('/api/auth/webauthn/authenticate-verify', body)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.patch('/api/auth/password', { currentPassword, newPassword })
}


export async function updateProfile(fields: { phone?: string; country?: string }): Promise<void> {
  await apiClient.patch('/api/auth/profile', fields)
}

export async function sessionCheck(): Promise<{ valid: boolean; reason?: string }> {
  const { data } = await apiClient.get('/api/auth/session-check')
  return data
}

export async function pingSession(): Promise<void> {
  await apiClient.get('/api/auth/ping')
}

// Machine-readable API errors. The `error` text is plain English for logs and
// API clients; the app shows its own translation picked by `code`
// (finance-tracker/src/utils/apiError.ts, i18n group `apiErrors`), so the
// server never has to know the user's language. Sign-in errors live in
// authErrors.ts; this file covers everything else a user can run into.
export const API_ERRORS = {
  INVALID_REQUEST: "Invalid request.",
  RATE_LIMITED: "Too many requests. Try again in a moment.",
  USER_NOT_FOUND: "User not found.",
  // E-mail verification and password reset
  MISSING_VERIFICATION_TOKEN: "Verification token is missing.",
  INVALID_VERIFICATION_LINK: "The verification link is invalid or expired.",
  INVALID_RESET_LINK: "The password reset link is invalid or expired.",
  // Passwords, PIN and re-authentication
  WRONG_PASSWORD: "Incorrect password.",
  WRONG_CURRENT_PASSWORD: "Incorrect current password.",
  CURRENT_PASSWORD_REQUIRED: "Enter your current password.",
  PASSWORD_CHANGE_UNAVAILABLE: "Password change is not available for this account type.",
  PIN_FORMAT: "The PIN must be a 4-digit number.",
  PIN_DEVICE_NOT_BOUND: "The PIN can only be used on the device where it was set up.",
  REAUTH_REQUIRED: "Confirm your identity to continue.",
  REAUTH_FAILED: "Identity verification failed.",
  PASSKEY_REAUTH_FAILED: "Passkey verification failed. Try again.",
  // Google
  GOOGLE_NOT_CONFIGURED: "Google sign-in is not configured.",
  GOOGLE_TOKEN_INVALID: "Invalid Google token.",
  GOOGLE_TOKEN_WRONG_APP: "The Google token was not issued for this app.",
  GOOGLE_ACCOUNT_MISMATCH: "Sign in with the Google account linked to this account.",
  GOOGLE_REAUTH_STALE: "The Google sign-in is too old. Try again.",
  // Passkeys and devices
  CHALLENGE_EXPIRED: "The challenge expired.",
  PASSKEY_REGISTRATION_FAILED: "Passkey registration failed.",
  NO_PASSKEY: "You have no passkey.",
  PASSKEY_NOT_FOUND: "Passkey not found.",
  PASSKEY_NAME_REQUIRED: "Enter a passkey name.",
  LAST_SIGN_IN_METHOD: "This is your only sign-in method. Set up a password, PIN or Google first.",
  DEVICE_NOT_FOUND: "Device not found.",
  // Households
  LEAVE_HOUSEHOLD_FIRST: "Leave your current household first.",
  NOT_HOUSEHOLD_MEMBER: "You are not a member of this household.",
  NO_HOUSEHOLD: "You are not a member of any household.",
  ALREADY_HOUSEHOLD_MEMBER: "You are already a member of this household.",
  HOUSEHOLD_CODE_NOT_FOUND: "No household has this code.",
  HOUSEHOLD_NOT_FOUND: "Household not found.",
  HOUSEHOLD_ADMIN_ONLY: "Only the household admin can do this.",
  MEMBER_NOT_FOUND: "Member not found.",
  CANNOT_REMOVE_SELF: "You can't remove yourself. Use Leave household.",
  // Categories
  SHARING_REQUIRES_HOUSEHOLD: "Categories can only be shared in a household with sharing turned on.",
  SHARED_CATEGORY_LOCKED: "Shared category can't be renamed or use auto limit. Stop sharing it first.",
  CATEGORY_IN_USE: "Cannot delete category with existing transactions. Reassign or delete them first.",
  // Transactions
  RECURRING_NAME_EXISTS: "A recurring item with this name already exists. Edit it or use a different name.",
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export function apiError<C extends ApiErrorCode>(code: C): { error: (typeof API_ERRORS)[C]; code: C } {
  return { error: API_ERRORS[code], code };
}

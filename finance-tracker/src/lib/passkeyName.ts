// A readable default name for a new passkey, from the browser's user agent:
// "iPhone · Safari", "Android · Chrome", "Windows · Edge". The server adds the
// provider (iCloud Keychain, Google Password Manager, ...) from the AAGUID.
// Parsed locally, nothing is sent anywhere else; the user can rename it later.

interface UaInfo { userAgent: string; maxTouchPoints?: number }

export function deviceOs({ userAgent: ua, maxTouchPoints = 0 }: UaInfo): string | null {
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'iPad' // iPadOS asks for desktop sites
  if (/Android/.test(ua)) return 'Android'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}

export function deviceBrowser({ userAgent: ua }: UaInfo): string | null {
  // Order matters: most browsers also claim to be Chrome and/or Safari.
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/EdgA?\/|EdgiOS\//.test(ua)) return 'Edge'
  if (/OPR\/|OPT\//.test(ua)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return null
}

/**
 * attachment = RegistrationResponseJSON.authenticatorAttachment. A passkey that
 * lives on another device (phone via QR code, security key) shouldn't be named
 * after this computer.
 */
export function suggestPasskeyName(
  env: UaInfo,
  attachment: string | undefined,
  names: { passkeyDefaultName: string; passkeyExternalName: string },
): string {
  if (attachment === 'cross-platform') return names.passkeyExternalName
  const parts = [deviceOs(env), deviceBrowser(env)].filter(Boolean)
  return parts.length ? parts.join(' · ') : names.passkeyDefaultName
}

export function currentUa(): UaInfo {
  return typeof navigator === 'undefined' ? { userAgent: '' } : { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }
}

import bcrypt from "bcrypt";

// Re-authentication before planting a durable login credential (passkey, PIN):
// a valid access token alone is not enough. Mirrors the rule used by updatePin —
// the current PIN is accepted if one is set, otherwise the password; an account
// with neither (Google-only, no PIN yet) has no factor to check.
export async function verifyReauth(
  user: { pinHash: string | null; passwordHash: string | null },
  creds: { currentPassword?: unknown; currentPin?: unknown },
): Promise<boolean> {
  const { currentPassword, currentPin } = creds;
  const passwordOk = async () =>
    !!user.passwordHash && typeof currentPassword === "string" && (await bcrypt.compare(currentPassword, user.passwordHash));

  if (user.pinHash) {
    const pinOk = typeof currentPin === "string" && currentPin.length === 4 && (await bcrypt.compare(currentPin, user.pinHash));
    return pinOk || (await passwordOk());
  }
  if (user.passwordHash) return passwordOk();
  return true;
}

// Passwordless account with no PIN yet (Google-only) setting its very first PIN:
// there is no password/PIN to confirm, so the proof is a Google token the user
// just obtained for the linked Google account — the same rule deleteAccount
// applies (account match + freshness). `google` is the verifyGoogleAccessToken result.
export function checkGoogleReauth(
  user: { googleId: string | null },
  google: { ok: true; sub: string; expiresIn: number } | { ok: false; status: number; error: string },
  minExpiresIn: number,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!google.ok) return google;
  if (!user.googleId || google.sub !== user.googleId) {
    return { ok: false, status: 401, error: "Prihlás sa Google účtom, ktorý patrí k tomuto účtu." };
  }
  if (google.expiresIn < minExpiresIn) {
    return { ok: false, status: 401, error: "Prihlásenie cez Google je príliš staré. Skús to znova." };
  }
  return { ok: true };
}

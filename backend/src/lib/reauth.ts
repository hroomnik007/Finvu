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

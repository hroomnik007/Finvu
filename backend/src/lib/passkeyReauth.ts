// "Prove it's still you" with a passkey, for actions a stolen access token
// must not be able to do alone (deleting a passwordless account).
//
// POST /webauthn/reauth-options issues a challenge bound to the signed-in user
// (key `reauth:<userId>`, 2 minutes); the assertion must be made with one of
// that user's own passkeys, with user verification, against that challenge.
// A challenge is single-use, so a replayed or late assertion fails.
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { webauthnCredentials } from "../db/schema";
import { ORIGIN, RP_ID, consumeChallenge, storeChallenge } from "./webauthnChallenges";

export const REAUTH_CHALLENGE_TTL_MS = 2 * 60 * 1000;
const key = (userId: string) => `reauth:${userId}`;

/** Null when the user has no passkey to re-authenticate with. */
export async function passkeyReauthOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const creds = await db
    .select({ credentialId: webauthnCredentials.credentialId })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));
  if (creds.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.map(c => ({ id: c.credentialId, type: "public-key" as const })),
    userVerification: "required",
  });
  storeChallenge(key(userId), options.challenge, REAUTH_CHALLENGE_TTL_MS);
  return options;
}

export async function verifyPasskeyReauth(userId: string, response: unknown): Promise<boolean> {
  const expectedChallenge = consumeChallenge(key(userId));
  if (!expectedChallenge) return false; // none issued, already used, or expired
  const body = response as AuthenticationResponseJSON | null;
  if (!body || typeof body !== "object" || typeof body.id !== "string") return false;

  const [stored] = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.credentialId, body.id), eq(webauthnCredentials.userId, userId)))
    .limit(1);
  if (!stored) return false; // not one of this user's passkeys

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64")),
        counter: stored.counter,
      },
      requireUserVerification: true,
    });
    if (!verification.verified) return false;
    await db.update(webauthnCredentials)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(webauthnCredentials.id, stored.id));
    return true;
  } catch {
    return false;
  }
}

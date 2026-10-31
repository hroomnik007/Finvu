import { env } from "../config/env";

// Verifies a Google OAuth access token from the browser (implicit flow):
// userinfo proves it is live and names the account, tokeninfo proves it was
// issued to *this* app's client id (otherwise a token any other Google app got
// for the user would work here too).
export type GoogleTokenResult =
  | { ok: true; sub: string; email: string; name: string; expiresIn: number }
  | { ok: false; status: number; error: string };

export async function verifyGoogleAccessToken(accessToken: unknown): Promise<GoogleTokenResult> {
  if (!accessToken || typeof accessToken !== "string") return { ok: false, status: 400, error: "accessToken is required" };
  // Without our client id there is no way to tell a token issued for this app
  // from one issued to any other Google app — fail closed instead of accepting both.
  if (!env.GOOGLE_CLIENT_ID) {
    console.error("[google] GOOGLE_CLIENT_ID is not set — Google sign-in is disabled.");
    return { ok: false, status: 503, error: "Google prihlásenie nie je nakonfigurované." };
  }
  const invalid = { ok: false, status: 401, error: "Neplatný Google token." } as const;
  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userinfoRes.ok) return invalid;
    const info = await userinfoRes.json() as { sub?: string; email?: string; name?: string; email_verified?: boolean };
    if (!info.email || !info.sub || info.email_verified !== true) return invalid;

    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) return invalid;
    const tokenInfo = await tokenInfoRes.json() as { aud?: string; azp?: string; expires_in?: string | number };
    if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID && tokenInfo.azp !== env.GOOGLE_CLIENT_ID) {
      return { ok: false, status: 401, error: "Google token nebol vydaný pre túto aplikáciu." };
    }
    const email = info.email.trim().toLowerCase();
    return { ok: true, sub: info.sub, email, name: info.name || email.split("@")[0], expiresIn: Number(tokenInfo.expires_in ?? 0) };
  } catch {
    return { ok: false, status: 401, error: "Nepodarilo sa overiť Google token." };
  }
}

// Google access tokens live 3600 s. Re-auth wants one the user just got by
// signing in to Google again, not one that may have been lying around for an
// hour: at least 55 minutes left = issued within the last ~5 minutes.
export const FRESH_GOOGLE_TOKEN_MIN_EXPIRES_IN = 55 * 60;

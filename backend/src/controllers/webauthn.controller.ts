import { Response } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users, webauthnCredentials } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { verifyReauth } from "../lib/reauth";
import { DEMO_EMAIL } from "../lib/resetDemo";
import { issueTokens, userPublic } from "./auth.controller";
import { cleanPasskeyName, newPasskeyName } from "../lib/passkeyNames";

const RP_NAME = "Finvu";
const RP_ID = env.WEBAUTHN_RP_ID ?? new URL(env.APP_URL).hostname;
const ORIGIN = env.WEBAUTHN_ORIGIN ?? new URL(env.APP_URL).origin;

// Unauthenticated login-challenge issuance (webauthnAuthenticateOptions below)
// means this store must defend itself: bounded size (oldest-inserted entries
// evicted first once full) plus a periodic sweep that reclaims expired
// entries even if the caller never comes back to consume them — a plain
// unbounded Map here was a trivial unauthenticated memory-exhaustion DoS
// (security audit run-1).
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 10_000;

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

function storeChallenge(key: string, challenge: string) {
  if (!challengeStore.has(key) && challengeStore.size >= MAX_CHALLENGES) {
    const oldestKey = challengeStore.keys().next().value;
    if (oldestKey !== undefined) challengeStore.delete(oldestKey);
  }
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (entry.expiresAt < now) challengeStore.delete(key);
  }
}, 60 * 1000);
sweepInterval.unref();

// POST /api/auth/webauthn/register-options  { currentPassword? | currentPin? }
// A passkey is a full-strength login credential, so — like setting a PIN — it
// needs the current password / PIN on top of the access token, otherwise a
// stolen token could plant a durable backdoor. (POST so the secret never
// ends up in a URL or access log.)
export async function webauthnRegisterOptions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  if (req.userEmail?.toLowerCase() === DEMO_EMAIL) {
    res.status(403).json({ error: "Táto akcia nie je v demo účte povolená.", code: "DEMO_RESTRICTED" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const creds = (req.body ?? {}) as { currentPassword?: unknown; currentPin?: unknown };
  if (!(await verifyReauth(user, creds))) {
    res.status(401).json({ error: "Nesprávne overenie totožnosti." });
    return;
  }

  const existingCreds = await db
    .select({ credentialId: webauthnCredentials.credentialId })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    excludeCredentials: existingCreds.map(c => ({ id: c.credentialId, type: 'public-key' as const })),
    // No authenticatorAttachment: besides the device's own authenticator this
    // also allows a phone via QR (hybrid) and USB/NFC security keys, so a desktop
    // without Windows Hello / Touch ID can still add a passkey.
    // residentKey 'required': every passkey must be discoverable, because the
    // login screen asks for one without an e-mail (allowCredentials empty, and
    // the browser autofill flow). With 'preferred' an authenticator could store
    // a non-discoverable credential that the usernameless login can never find.
    // The few U2F-only keys that can't store resident keys are refused up front.
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'required',
    },
  });

  storeChallenge(userId, options.challenge);
  res.json(options);
}

// POST /api/auth/webauthn/register-verify  { ...RegistrationResponseJSON, name? }
// `name` is the browser's suggestion from its user agent ("iPhone · Safari").
export async function webauthnRegisterVerify(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { name: suggestedName, ...body } = (req.body ?? {}) as RegistrationResponseJSON & { name?: unknown };

  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) { res.status(400).json({ error: "Challenge vypršal." }); return; }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message }); return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "Registrácia zlyhala." }); return;
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
  const name = newPasskeyName(suggestedName, aaguid, body.authenticatorAttachment);

  await db.insert(webauthnCredentials).values({
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    ...(name ? { name } : {}),
  });

  res.json({ success: true });
}

// GET /api/auth/webauthn/authenticate-options?email=...
export async function webauthnAuthenticateOptions(req: any, res: Response): Promise<void> {
  const email = req.query.email as string | undefined;

  let allowCredentials: { id: string; type: 'public-key' }[] = [];
  // A fresh random key per request: a shared/guessable key (the old 'anonymous'
  // or the user's id) let anyone consume or overwrite someone else's pending
  // challenge, and echoing the user id leaked the email -> id mapping.
  const challengeKey = randomUUID();

  if (typeof email === 'string' && email) {
    const [user] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`).limit(1);
    if (user) {
      const creds = await db
        .select({ credentialId: webauthnCredentials.credentialId })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, user.id));
      allowCredentials = creds.map(c => ({ id: c.credentialId, type: 'public-key' as const }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'required',
  });

  storeChallenge(challengeKey, options.challenge);
  res.json({ ...options, _challengeKey: challengeKey });
}

// POST /api/auth/webauthn/authenticate-verify
export async function webauthnAuthenticateVerify(req: any, res: Response): Promise<void> {
  const body = req.body as AuthenticationResponseJSON & { _challengeKey?: string };
  const challengeKey = body._challengeKey;
  if (!challengeKey) { res.status(400).json({ error: "Chýba challengeKey." }); return; }

  const expectedChallenge = consumeChallenge(challengeKey);
  if (!expectedChallenge) { res.status(400).json({ error: "Challenge vypršal." }); return; }

  const [storedCred] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, body.id))
    .limit(1);

  if (!storedCred) { res.status(401).json({ error: "Neznáme zariadenie." }); return; }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCred.credentialId,
        publicKey: new Uint8Array(Buffer.from(storedCred.publicKey, 'base64')),
        counter: storedCred.counter,
      },
      requireUserVerification: true,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message }); return;
  }

  if (!verification.verified) { res.status(401).json({ error: "Overenie zlyhalo." }); return; }

  await db.update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter })
    .where(eq(webauthnCredentials.id, storedCred.id));

  const [user] = await db.select().from(users).where(eq(users.id, storedCred.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Používateľ nenájdený." }); return; }
  if (user.isDeactivated) {
    res.status(403).json({ error: "Váš účet je deaktivovaný. Pre reaktiváciu kontaktujte podporu.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  // Same token/session issuing and user payload as every other sign-in method
  const { accessToken, sessionId } = await issueTokens(res, user.id, user.email, req);
  res.json({ user: userPublic(user), accessToken, sessionId });
}

// GET /api/auth/webauthn/credentials — the caller's registered passkeys
export async function listPasskeys(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: webauthnCredentials.id,
      name: webauthnCredentials.name,
      deviceType: webauthnCredentials.deviceType,
      backedUp: webauthnCredentials.backedUp,
      createdAt: webauthnCredentials.createdAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, req.userId!))
    .orderBy(webauthnCredentials.createdAt);
  res.json({ data: rows });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/auth/webauthn/credentials/:id — scoped to the caller, so one user
// can never remove another user's passkey by guessing ids.
export async function deletePasskey(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  if (!UUID_RE.test(id)) { res.status(404).json({ error: "Passkey nenájdený." }); return; }
  // Without another way to sign in, removing the last passkey would lock the account.
  const [u] = await db
    .select({ passwordHash: users.passwordHash, pinHash: users.pinHash, googleId: users.googleId })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, req.userId!));
  if (n <= 1 && !u?.passwordHash && !u?.pinHash && !u?.googleId) {
    res.status(400).json({ error: "Toto je váš jediný spôsob prihlásenia. Najprv nastavte heslo, PIN alebo Google." });
    return;
  }
  const removed = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, req.userId!)))
    .returning({ id: webauthnCredentials.id });
  if (removed.length === 0) { res.status(404).json({ error: "Passkey nenájdený." }); return; }
  res.json({ success: true });
}

// PATCH /api/auth/webauthn/credentials/:id  { name } — rename one of the
// caller's passkeys. Scoped by user id like DELETE: someone else's id is a 404.
export async function renamePasskey(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  if (!UUID_RE.test(id)) { res.status(404).json({ error: "Passkey nenájdený." }); return; }
  const name = cleanPasskeyName((req.body ?? {}).name);
  if (!name) { res.status(400).json({ error: "Zadajte názov passkey." }); return; }
  const updated = await db
    .update(webauthnCredentials)
    .set({ name })
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, req.userId!)))
    .returning({ id: webauthnCredentials.id, name: webauthnCredentials.name });
  if (updated.length === 0) { res.status(404).json({ error: "Passkey nenájdený." }); return; }
  res.json(updated[0]);
}

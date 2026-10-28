import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { lookupLocation } from "../lib/geoip";
import { localDateISO } from "../lib/localDate";
import { isIP } from "net";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { eq, and, gt, desc, sql, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { zodDetails } from "../lib/validation";
import { db } from "../db";
import { users, refreshTokens, categories, transactions, webauthnCredentials, households, passwordResetTokens, userSessions, pinDeviceTokens } from "../db/schema";
import { env } from "../config/env";
import {
  signAccessToken,
  signRefreshToken,
  signAdminToken,
  verifyRefreshToken,
  hashToken,
  compareToken,
  refreshTokenExpiry,
  REFRESH_COOKIE,
  REFRESH_COOKIE_OPTIONS,
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTIONS,
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_COOKIE_OPTIONS,
  PIN_DEVICE_COOKIE,
  PIN_DEVICE_COOKIE_OPTIONS,
  clearCookieOptions,
  generatePinDeviceToken,
  pinDeviceTokenExpiry,
} from "../lib/tokens";
import { sendEmail, verificationEmailHtml, resetPasswordEmailHtml, resetPasswordEmailText, accountExistsEmailHtml } from "../lib/email";
import { DEFAULT_CATEGORIES } from "../lib/defaultCategories";
import { AuthRequest } from "../middleware/authenticate";
import { resetDemoAccount, DEMO_EMAIL } from "../lib/resetDemo";
import { parseImageDataUrl, saveAvatarFile, deleteAvatarFiles } from "../lib/avatarStorage";
import { releaseOwnedHouseholds } from "../lib/household";
import { isLocked, recordFailure, clearFailures, passwordKey, pinKey, ADMIN_KEY, LOCKED_RESPONSE } from "../lib/loginLockout";

// Emails are stored and matched lower-case. Legacy rows may still be mixed-case,
// so lookups go through byEmail() (case-insensitive) instead of plain equality.
const emailSchema = z.string().trim().toLowerCase().email();

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function byEmail(email: string) {
  return sql`lower(${users.email}) = ${email}`;
}

// A real bcrypt hash with the same cost as user passwords, compared against
// when there is no account (or no password) so login takes the same time.
let dummyHash: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), env.BCRYPT_ROUNDS);
  return dummyHash;
}

// The shared demo account uses a publicly known password, so anything that
// would lock the account for everyone else (or persist credentials on it) is
// refused server-side — the UI-only isDemo flag is not a security boundary.
function rejectDemo(req: AuthRequest, res: Response): boolean {
  if (req.userEmail?.toLowerCase() === DEMO_EMAIL) {
    res.status(403).json({ error: "Táto akcia nie je v demo účte povolená.", code: "DEMO_RESTRICTED" });
    return true;
  }
  return false;
}

// Verification links stay valid for a week; "resend" issues a fresh one.
const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  gdprConsent: z.boolean().refine(v => v === true, { message: "GDPR consent is required" }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export function userPublic(u: {
  id: string; email: string; name: string; avatarUrl?: string | null; role?: string;
  weeklyEmailEnabled?: boolean; monthlyEmailEnabled?: boolean; monthlyEmailScope?: string; monthlyEmailHour?: number; onboardingComplete?: boolean;
  currentStreak?: number; longestStreak?: number; badges?: string[];
  defaultPage?: string | null; currencyFormat?: string | null;
  householdId?: number | null; householdEnabled?: boolean | null;
  savingsEnabled?: boolean | null;
  theme?: string | null;
  language?: string | null;
  trackingStartDate?: string | null;
  onboardingBannerDismissed?: boolean | null;
  pinHash?: string | null;
  passwordHash?: string | null;
  autoLockMinutes?: number | null;
}) {
  return {
    id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl ?? null,
    role: u.role ?? 'user', weeklyEmailEnabled: u.weeklyEmailEnabled ?? false,
    monthlyEmailEnabled: u.monthlyEmailEnabled ?? false,
    monthlyEmailScope: u.monthlyEmailScope ?? 'personal',
    monthlyEmailHour: u.monthlyEmailHour ?? 9,
    onboardingComplete: u.onboardingComplete ?? false,
    currentStreak: u.currentStreak ?? 0, longestStreak: u.longestStreak ?? 0,
    badges: u.badges ?? [],
    defaultPage: u.defaultPage ?? 'dashboard',
    currencyFormat: u.currencyFormat ?? 'sk',
    household_id: u.householdId ?? null,
    household_enabled: u.householdEnabled ?? false,
    savings_enabled: u.savingsEnabled ?? false,
    theme: u.theme ?? null,
    language: u.language ?? null,
    tracking_start_date: u.trackingStartDate ?? null,
    onboarding_banner_dismissed: u.onboardingBannerDismissed ?? false,
    has_pin: !!u.pinHash,
    // Lets the frontend decide whether changing/removing a PIN should ask for
    // the current password or the current PIN as the re-auth factor.
    has_password: !!u.passwordHash,
    auto_lock_minutes: u.autoLockMinutes ?? null,
  };
}

// PIN device-binding helpers — shared by pinLogin/updatePin/removePin.

async function issuePinDeviceToken(res: Response, userId: string, req: Request): Promise<void> {
  const token = generatePinDeviceToken();
  const tokenHash = await hashToken(token);
  const label = (req.headers['user-agent'] as string | undefined)?.slice(0, 255) ?? null;
  await db.insert(pinDeviceTokens).values({ userId, tokenHash, label, expiresAt: pinDeviceTokenExpiry() });
  res.cookie(PIN_DEVICE_COOKIE, token, PIN_DEVICE_COOKIE_OPTIONS);
}

async function revokePinDeviceTokens(res: Response, userId: string): Promise<void> {
  await db.delete(pinDeviceTokens).where(eq(pinDeviceTokens.userId, userId));
  res.clearCookie(PIN_DEVICE_COOKIE, clearCookieOptions(PIN_DEVICE_COOKIE_OPTIONS));
}

// Verifies the pinDevice cookie against stored (hashed) tokens for this user
// and, on a match, slides the token's expiry forward another 90 days — both
// in the DB and by re-issuing the cookie — so a device in regular use never
// silently falls out of the binding.
async function verifyAndSlidePinDeviceToken(res: Response, userId: string, req: Request): Promise<boolean> {
  const token: string | undefined = req.cookies?.[PIN_DEVICE_COOKIE];
  if (!token) return false;

  const tokenHash = await hashToken(token);
  const [matched] = await db
    .select()
    .from(pinDeviceTokens)
    .where(and(
      eq(pinDeviceTokens.userId, userId),
      eq(pinDeviceTokens.tokenHash, tokenHash),
      gt(pinDeviceTokens.expiresAt, new Date()),
    ))
    .limit(1);
  if (!matched) return false;

  const now = new Date();
  await db.update(pinDeviceTokens)
    .set({ lastUsedAt: now, expiresAt: pinDeviceTokenExpiry() })
    .where(eq(pinDeviceTokens.id, matched.id));
  res.cookie(PIN_DEVICE_COOKIE, token, PIN_DEVICE_COOKIE_OPTIONS);
  return true;
}

// Pre-login status check for the PIN login screen: lets the frontend tell
// "this device was never bound to a PIN" apart from "wrong PIN" before the
// user even types anything. Deliberately takes no email/identity input and
// returns nothing but a boolean — it must be indistinguishable for a
// nonexistent email, an account with no PIN set, and a foreign device, since
// all three of those states, and "cookie present but expired/revoked",
// collapse to the same false here. Does NOT slide the token's expiry or
// touch lastUsedAt (this is a status check, not a use of the device), and is
// entirely independent of the per-account PIN lockout.
export async function pinDeviceStatus(req: Request, res: Response): Promise<void> {
  const token: string | undefined = req.cookies?.[PIN_DEVICE_COOKIE];
  if (!token) { res.json({ deviceRegistered: false }); return; }

  // Token hashes are deterministic SHA-256, so this is an indexed equality
  // lookup instead of scanning (and comparing against) every device of every user.
  const tokenHash = await hashToken(token);
  const [row] = await db
    .select({ id: pinDeviceTokens.id })
    .from(pinDeviceTokens)
    .where(and(eq(pinDeviceTokens.tokenHash, tokenHash), gt(pinDeviceTokens.expiresAt, new Date())))
    .limit(1);
  res.json({ deviceRegistered: !!row });
}

function parseUA(ua: string): { deviceName: string; browser: string } {
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
  let browser = 'Unknown'
  if (/Chrome\/(\d+)/i.test(ua) && !/Chromium|OPR|Edg/i.test(ua)) {
    browser = `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] ?? ''}`
  } else if (/Firefox\/(\d+)/i.test(ua)) {
    browser = `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] ?? ''}`
  } else if (/Edg\/(\d+)/i.test(ua)) {
    browser = `Edge ${ua.match(/Edg\/(\d+)/)?.[1] ?? ''}`
  } else if (/OPR\/(\d+)/i.test(ua)) {
    browser = `Opera ${ua.match(/OPR\/(\d+)/)?.[1] ?? ''}`
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari'
  }
  let deviceName = 'Desktop'
  if (/iPhone/i.test(ua)) deviceName = 'iPhone'
  else if (/iPad/i.test(ua)) deviceName = 'iPad'
  else if (/Android/i.test(ua)) deviceName = isMobile ? 'Android Phone' : 'Android Tablet'
  else if (/Mac/i.test(ua)) deviceName = 'Mac'
  else if (/Windows/i.test(ua)) deviceName = 'Windows PC'
  else if (/Linux/i.test(ua)) deviceName = 'Linux'
  return { deviceName, browser }
}

async function createSession(userId: string, req: Request): Promise<string> {
  const ua = (req.headers['user-agent'] as string | undefined) ?? ''
  // req.ip honours "trust proxy" (the address nginx saw); the first
  // X-Forwarded-For entry is client-controlled and must not be used.
  const rawIp = req.ip ?? ''
  const { deviceName, browser } = parseUA(ua)

  if (deviceName && browser) {
    const existing = await db.select({ id: userSessions.id })
      .from(userSessions)
      .where(and(eq(userSessions.userId, userId), eq(userSessions.deviceName, deviceName), eq(userSessions.browser, browser)))
      .limit(1)
    if (existing.length > 0) {
      await db.update(userSessions).set({ lastActive: new Date() }).where(eq(userSessions.id, existing[0].id))
      return existing[0].id
    }
  }

  const [session] = await db.insert(userSessions).values({
    userId,
    deviceName,
    browser,
    ip: rawIp,
    location: null,
  }).returning({ id: userSessions.id })

  // Non-blocking location lookup
  if (isIP(rawIp) && rawIp !== '::1' && rawIp !== '127.0.0.1') {
    lookupLocation(rawIp).then((loc) => {
      if (loc) db.update(userSessions).set({ location: loc }).where(eq(userSessions.id, session.id)).catch(() => {})
    })
  }

  return session.id
}

export async function issueTokens(res: Response, userId: string, email: string, req?: Request): Promise<{ accessToken: string; sessionId: string }> {
  const accessToken = signAccessToken({ userId, email });
  const refreshToken = signRefreshToken({ userId, email });
  const tokenHash = await hashToken(refreshToken);

  const sessionId = req ? await createSession(userId, req) : randomUUID()
  await db.insert(refreshTokens).values({
    userId, tokenHash, expiresAt: refreshTokenExpiry(),
    // Only a real session row can be referenced (see refresh_tokens.session_id)
    ...(req ? { sessionId } : {}),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);
  return { accessToken, sessionId };
}

const REGISTER_OK_MSG = "Skontrolujte email. Poslali sme vám odkaz na pokračovanie.";

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }

  const { email, password, name } = body.data;

  // Same answer whether or not the address is taken, so this endpoint can't be
  // used to find out who has an account. The owner gets a heads-up instead.
  const existing = await db.select({ id: users.id }).from(users).where(byEmail(email)).limit(1);
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  if (existing.length > 0) {
    await sendEmail(email, "Finvu — účet s týmto emailom už existuje", accountExistsEmailHtml());
    res.status(201).json({ message: REGISTER_OK_MSG });
    return;
  }

  const verificationToken = randomUUID();

  // Only the hash is stored; the raw token goes out in the e-mail link.
  const [user] = await db
    .insert(users)
    .values({
      email, passwordHash: passwordHash, name, emailVerified: false,
      verificationToken: await hashToken(verificationToken),
      verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id, isDefault: true }))
  );

  await sendEmail(email, "Finvu — Overte váš email", verificationEmailHtml(verificationToken));

  res.status(201).json({ message: REGISTER_OK_MSG });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }

  const { email, password } = body.data;

  // Per-account lockout, keyed by the e-mail so it works the same whether or
  // not the account exists. Checked before the user lookup: a locked address
  // gets the same answer, after the same work, either way — and even the right
  // password is refused until the lock runs out.
  const lockKey = passwordKey(normalizeEmail(email));
  if (await isLocked(lockKey)) {
    res.status(429).json(LOCKED_RESPONSE);
    return;
  }

  const [user] = await db.select().from(users).where(byEmail(email)).limit(1);

  // Unknown email, a Google-only account and a wrong password all get the same
  // answer, and all of them pay for one bcrypt compare so timing doesn't tell
  // them apart either.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? await dummyPasswordHash());
  if (!user || !user.passwordHash || !valid) {
    await recordFailure(lockKey);
    res.status(401).json({ error: "Nesprávne prihlasovacie údaje." });
    return;
  }
  await clearFailures(lockKey);

  if (!user.emailVerified) {
    res.status(403).json({ error: "Prosím overte svoj email pred prihlásením.", code: "EMAIL_NOT_VERIFIED" });
    return;
  }

  if (user.isDeactivated) {
    res.status(403).json({ error: "Váš účet je deaktivovaný. Pre reaktiváciu kontaktujte podporu.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  // Reset demo account data on every login, then re-fetch the updated user record
  let loginUser = user;
  if (user.email.toLowerCase() === DEMO_EMAIL) {
    try {
      await resetDemoAccount(user.id);
      const [refreshed] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (refreshed) loginUser = refreshed;
    } catch (e) {
      console.error("[demo-reset] failed:", e);
    }
  }

  const { accessToken, sessionId } = await issueTokens(res, loginUser.id, loginUser.email, req);
  res.json({ user: userPublic(loginUser), accessToken, sessionId });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  let payload: { userId: string; email: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  const presentedHash = await hashToken(token);
  const [matchedRow] = await db
    .select()
    .from(refreshTokens)
    .where(and(
      eq(refreshTokens.userId, payload.userId),
      eq(refreshTokens.tokenHash, presentedHash),
      gt(refreshTokens.expiresAt, new Date()),
    ))
    .limit(1);

  if (!matchedRow) { res.status(401).json({ error: "Refresh token not recognized or expired" }); return; }

  const [tokenUser] = await db.select({ isDeactivated: users.isDeactivated }).from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!tokenUser || tokenUser.isDeactivated) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.userId));
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS));
    res.status(403).json({ error: "Účet je deaktivovaný.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  // Two requests presenting the same cookie at (almost) the same time — two tabs,
  // a PWA next to a browser, a reload during rotation — are normal, not theft.
  // The loser of that race gets ONE extra access token inside a short window (the
  // browser already holds, or is about to receive, the rotated cookie from the
  // winner). The allowance is single-use and claimed atomically, so a stolen
  // old token can not be replayed for fresh access tokens.
  const REUSE_GRACE_MS = 10_000;
  let graceGranted = false;
  if (matchedRow.revokedAt && Date.now() - matchedRow.revokedAt.getTime() < REUSE_GRACE_MS) {
    const claimed = await db
      .update(refreshTokens)
      .set({ graceUsedAt: new Date() })
      .where(and(eq(refreshTokens.id, matchedRow.id), isNull(refreshTokens.graceUsedAt)))
      .returning({ id: refreshTokens.id });
    graceGranted = claimed.length > 0;
  }

  if (matchedRow.revokedAt && !graceGranted) {
    // This token was already rotated away (and its one grace use, if any, is
    // spent) — someone is replaying an old refresh token, which means it was
    // likely stolen. Kill every active refresh token for the user so both the
    // attacker and the legitimate user are forced to log in again.
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.userId));
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS));
    res.status(401).json({ error: "Refresh token reuse detected — all sessions revoked" });
    return;
  }

  if (!matchedRow.revokedAt) {
    // Rotate atomically: only one concurrent request can flip revoked_at from NULL.
    const won = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, matchedRow.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    if (won.length > 0) {
      const newRefreshToken = signRefreshToken({ userId: payload.userId, email: payload.email });
      const newTokenHash = await hashToken(newRefreshToken);
      await db.insert(refreshTokens).values({ userId: payload.userId, tokenHash: newTokenHash, expiresAt: refreshTokenExpiry(), sessionId: matchedRow.sessionId });
      res.cookie(REFRESH_COOKIE, newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }
  }

  const accessToken = signAccessToken({ userId: payload.userId, email: payload.email });
  res.json({ accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      const tokenHash = await hashToken(token);
      await db.delete(refreshTokens).where(and(eq(refreshTokens.userId, payload.userId), eq(refreshTokens.tokenHash, tokenHash)));
    } catch { /* token invalid — still clear cookie */ }
  }
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS));
  res.json({ success: true });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const [user] = await db
    .select({
      id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl,
      role: users.role, weeklyEmailEnabled: users.weeklyEmailEnabled,
      monthlyEmailEnabled: users.monthlyEmailEnabled, monthlyEmailScope: users.monthlyEmailScope, monthlyEmailHour: users.monthlyEmailHour,
      onboardingComplete: users.onboardingComplete,
      currentStreak: users.currentStreak, longestStreak: users.longestStreak, badges: users.badges,
      defaultPage: users.defaultPage, currencyFormat: users.currencyFormat,
      householdId: users.householdId, householdEnabled: users.householdEnabled,
      savingsEnabled: users.savingsEnabled,
      theme: users.theme,
      language: users.language,
      autoLockMinutes: users.autoLockMinutes,
      trackingStartDate: users.trackingStartDate,
      onboardingBannerDismissed: users.onboardingBannerDismissed,
      pinHash: users.pinHash,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let householdInfo: { id: number; name: string; invite_code: string } | null = null;
  if (user.householdId) {
    const [h] = await db
      .select({ id: households.id, name: households.name, inviteCode: households.inviteCode })
      .from(households)
      .where(eq(households.id, user.householdId))
      .limit(1);
    if (h) householdInfo = { id: h.id, name: h.name, invite_code: h.inviteCode };
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    user: {
      ...userPublic(user),
      household: householdInfo,
    },
  });
}

export async function updateAvatar(req: AuthRequest, res: Response): Promise<void> {
  const { avatarUrl } = req.body as { avatarUrl?: string };
  if (typeof avatarUrl !== 'string') {
    res.status(400).json({ error: "avatarUrl is required" });
    return;
  }

  // Empty string clears the avatar (fall back to initials)
  if (avatarUrl === '') {
    await deleteAvatarFiles(req.userId!);
    await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, req.userId!));
    res.json({ success: true, avatarUrl: null });
    return;
  }

  // Photo upload: decode the data URL and store the image on disk — the DB
  // keeps only the public path, not megabytes of base64.
  if (avatarUrl.startsWith('data:image/')) {
    // ~10MB binary ≈ 13.7M base64 chars (matches the frontend file-size check)
    if (avatarUrl.length > 14_000_000) {
      res.status(413).json({ error: "Avatar too large (max 10MB)" });
      return;
    }
    const parsed = parseImageDataUrl(avatarUrl);
    if (!parsed) {
      res.status(400).json({ error: "Unsupported image format (png/jpeg/webp/gif)" });
      return;
    }
    const publicUrl = await saveAvatarFile(req.userId!, parsed.buffer, parsed.ext);
    await db.update(users).set({ avatarUrl: publicUrl, updatedAt: new Date() }).where(eq(users.id, req.userId!));
    res.json({ success: true, avatarUrl: publicUrl });
    return;
  }

  // Short non-URL string = emoji avatar, stored directly
  if (!avatarUrl.startsWith('http') && !avatarUrl.startsWith('/') && avatarUrl.length <= 16) {
    await deleteAvatarFiles(req.userId!);
    await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, req.userId!));
    res.json({ success: true, avatarUrl });
    return;
  }

  res.status(400).json({ error: "avatarUrl must be an image data URL, an emoji, or empty" });
}

export async function demoLogin(req: Request, res: Response): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Demo account not available. Run db:seed-demo first." });
    return;
  }

  // Reset demo data, then re-fetch for updated household/savings state
  let loginUser = user;
  try {
    await resetDemoAccount(user.id);
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (refreshed) loginUser = refreshed;
  } catch (e) {
    console.error("[demo-reset] failed:", e);
  }

  const { accessToken, sessionId } = await issueTokens(res, loginUser.id, loginUser.email, req);
  res.json({ user: userPublic(loginUser), accessToken, sessionId });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(400).json({ error: "Chýba overovací token." });
    return;
  }

  // Only the hash is stored and compared — never accept the raw value as a
  // fallback, or a stored hash could itself be presented as the token. Rows from
  // before hashing were converted by migration 029; those have no expiry (NULL).
  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.verificationToken, await hashToken(token)),
      or(isNull(users.verificationExpiresAt), gt(users.verificationExpiresAt, new Date())),
    ))
    .limit(1);
  if (!user) {
    res.status(400).json({ error: "Neplatný alebo vypršaný overovací odkaz." });
    return;
  }

  await db
    .update(users)
    .set({ emailVerified: true, verificationToken: null, verificationExpiresAt: null })
    .where(eq(users.id, user.id));

  res.json({ message: "Email bol úspešne overený. Môžete sa prihlásiť." });
}

// Lets a user whose verification mail never arrived (or whose registration
// failed while sending it) get a fresh link. Response is identical whether or
// not the address exists / is already verified.
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req.body as { email?: unknown } | undefined)?.email);
  const OK_MSG = "Ak účet čaká na overenie, bol odoslaný nový overovací odkaz.";

  if (email && z.string().email().safeParse(email).success) {
    const [user] = await db
      .select({ id: users.id, emailVerified: users.emailVerified, passwordHash: users.passwordHash })
      .from(users)
      .where(byEmail(email))
      .limit(1);
    if (user && !user.emailVerified && user.passwordHash) {
      const verificationToken = randomUUID();
      await db.update(users)
        .set({ verificationToken: await hashToken(verificationToken), verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) })
        .where(eq(users.id, user.id));
      await sendEmail(email, "Finvu — Overte váš email", verificationEmailHtml(verificationToken));
    }
  }
  res.json({ message: OK_MSG });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req.body as { email?: unknown } | undefined)?.email);
  const OK_MSG = "Ak email existuje, bol odoslaný odkaz na obnovenie hesla.";

  if (!email || !z.string().email().safeParse(email).success) {
    res.json({ message: OK_MSG });
    return;
  }

  const [user] = await db.select({ id: users.id }).from(users).where(byEmail(email)).limit(1);
  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    // Stored hashed; the raw token only exists in the e-mail link.
    await db.insert(passwordResetTokens).values({ userId: user.id, token: await hashToken(token), expiresAt });

    await sendEmail(
      email,
      "Obnova hesla — FinVu",
      resetPasswordEmailHtml(token),
      resetPasswordEmailText(token),
    );
  }

  res.json({ message: OK_MSG });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Neplatná požiadavka." });
    return;
  }

  const now = new Date();
  const [resetRecord] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, await hashToken(token)), gt(passwordResetTokens.expiresAt, now)))
    .limit(1);

  if (!resetRecord) {
    res.status(400).json({ error: "Neplatný alebo vypršaný odkaz na obnovu hesla." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  const [resetUser] = await db
    .update(users)
    // Receiving the reset link proves control of the mailbox, so an account
    // that was registered but never verified becomes usable here too.
    .set({ passwordHash, pinHash: null, emailVerified: true, verificationToken: null })
    .where(eq(users.id, resetRecord.userId))
    .returning({ email: users.email });
  // The link also proves who this is, so a lock from earlier guesses goes too.
  if (resetUser) await clearFailures(passwordKey(normalizeEmail(resetUser.email)));

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetRecord.id));
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, resetRecord.userId));
  // A password reset is the account's own "I think I was compromised" flow —
  // it must invalidate every standing credential, not just the password.
  // Leaving the PIN (and any device bound to it) alive here was exactly the
  // durable-backdoor gap from security audit run-1.
  await revokePinDeviceTokens(res, resetRecord.userId);

  res.json({ message: "Heslo bolo úspešne zmenené." });
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufB, bufB); // dummy comparison to keep timing similar
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function adminLogin(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  // There is one admin account, so one lock for it.
  if (await isLocked(ADMIN_KEY)) {
    res.status(429).json(LOCKED_RESPONSE);
    return;
  }

  const userOk = safeCompare(username, env.ADMIN_USERNAME);
  const passOk = safeCompare(password, env.ADMIN_PASSWORD);

  if (!userOk || !passOk) {
    await recordFailure(ADMIN_KEY);
    res.status(401).json({ error: "Nesprávne prihlasovacie údaje." });
    return;
  }
  await clearFailures(ADMIN_KEY);

  const token = signAdminToken();
  const csrfToken = randomBytes(32).toString("hex");
  res.cookie(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTIONS);
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, ADMIN_CSRF_COOKIE_OPTIONS);
  res.json({ success: true, csrfToken });
}

export async function adminLogout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(ADMIN_COOKIE, clearCookieOptions(ADMIN_COOKIE_OPTIONS));
  res.clearCookie(ADMIN_CSRF_COOKIE, clearCookieOptions(ADMIN_CSRF_COOKIE_OPTIONS));
  res.json({ success: true });
}

export async function updateWeeklyEmail(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { enabled } = req.body as { enabled: boolean };
  await db.update(users).set({ weeklyEmailEnabled: !!enabled }).where(eq(users.id, userId));
  res.json({ weeklyEmailEnabled: !!enabled });
}

export async function updateUserSettings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { onboardingComplete, monthlyEmailEnabled, monthlyEmailScope, monthlyEmailHour, defaultPage, currencyFormat, theme, savingsEnabled, trackingStartDate, onboardingBannerDismissed, language, autoLockMinutes } = req.body as {
    onboardingComplete?: boolean;
    monthlyEmailEnabled?: boolean;
    monthlyEmailScope?: string;
    monthlyEmailHour?: number;
    defaultPage?: string;
    currencyFormat?: string;
    theme?: string;
    savingsEnabled?: boolean;
    trackingStartDate?: string | null;
    onboardingBannerDismissed?: boolean;
    language?: string;
    autoLockMinutes?: number | null;
  };
  const VALID_PAGES = ['dashboard', 'income', 'variable-expenses', 'fixed-expenses', 'categories', 'settings'];
  const VALID_FORMATS = ['sk', 'en', 'de'];
  const VALID_THEMES = ['dark', 'light', 'system'];
  const VALID_LANGS = ['sk', 'cs', 'pl', 'hu', 'en'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof onboardingComplete === 'boolean') update.onboardingComplete = onboardingComplete;
  if (typeof monthlyEmailEnabled === 'boolean') update.monthlyEmailEnabled = monthlyEmailEnabled;
  if (monthlyEmailScope === 'personal' || monthlyEmailScope === 'family') update.monthlyEmailScope = monthlyEmailScope;
  if (typeof monthlyEmailHour === 'number' && Number.isInteger(monthlyEmailHour) && monthlyEmailHour >= 0 && monthlyEmailHour <= 23) update.monthlyEmailHour = monthlyEmailHour;
  if (typeof defaultPage === 'string' && VALID_PAGES.includes(defaultPage)) update.defaultPage = defaultPage;
  if (typeof currencyFormat === 'string' && VALID_FORMATS.includes(currencyFormat)) update.currencyFormat = currencyFormat;
  if (typeof theme === 'string' && VALID_THEMES.includes(theme)) update.theme = theme;
  if (typeof language === 'string' && VALID_LANGS.includes(language)) update.language = language;
  if (typeof savingsEnabled === 'boolean') update.savingsEnabled = savingsEnabled;
  if (trackingStartDate === null || (typeof trackingStartDate === 'string' && DATE_RE.test(trackingStartDate))) {
    // Floored at the account's real creation date and capped at today — an
    // arbitrarily old value here used to instantly satisfy the "veteran"
    // (daysActive >= 365) achievement with zero genuine usage (security audit
    // run-1). A single fetch is cheap and keeps the floor authoritative
    // (server-recorded createdAt), not something the client can also spoof.
    if (trackingStartDate === null) {
      update.trackingStartDate = null;
    } else {
      const [row] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
      const floor = row ? localDateISO(row.createdAt) : trackingStartDate;
      const today = localDateISO();
      const clamped = trackingStartDate < floor ? floor : (trackingStartDate > today ? today : trackingStartDate);
      update.trackingStartDate = clamped;
    }
  }
  if (typeof onboardingBannerDismissed === 'boolean') update.onboardingBannerDismissed = onboardingBannerDismissed;
  if (autoLockMinutes === null || (typeof autoLockMinutes === 'number' && [0, 1, 5, 15].includes(autoLockMinutes))) {
    update.autoLockMinutes = autoLockMinutes;
  }
  await db.update(users).set(update).where(eq(users.id, userId));
  res.json({ success: true });
}

export async function googleAuth(req: Request, res: Response): Promise<void> {
  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken || typeof accessToken !== "string") {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  // Without our client id there is no way to tell a token issued for this app
  // from one issued to any other Google app — fail closed instead of accepting both.
  if (!env.GOOGLE_CLIENT_ID) {
    console.error("[googleAuth] GOOGLE_CLIENT_ID is not set — Google sign-in is disabled.");
    res.status(503).json({ error: "Google prihlásenie nie je nakonfigurované." });
    return;
  }

  let googleId: string;
  let email: string;
  let name: string;

  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userinfoRes.ok) {
      res.status(401).json({ error: "Neplatný Google token." });
      return;
    }
    const info = await userinfoRes.json() as { sub: string; email: string; name: string; email_verified: boolean };
    if (!info.email || !info.sub || info.email_verified !== true) {
      res.status(401).json({ error: "Neplatný Google token." });
      return;
    }

    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!tokenInfoRes.ok) {
      res.status(401).json({ error: "Neplatný Google token." });
      return;
    }
    const tokenInfo = await tokenInfoRes.json() as { aud?: string; azp?: string };
    if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID && tokenInfo.azp !== env.GOOGLE_CLIENT_ID) {
      res.status(401).json({ error: "Google token nebol vydaný pre túto aplikáciu." });
      return;
    }

    googleId = info.sub;
    email = info.email.trim().toLowerCase();
    name = info.name || email.split("@")[0];
  } catch {
    res.status(401).json({ error: "Nepodarilo sa overiť Google token." });
    return;
  }

  let [user] = await db.select().from(users).where(byEmail(email)).limit(1);

  if (user?.isDeactivated) {
    res.status(403).json({ error: "Váš účet je deaktivovaný. Pre reaktiváciu kontaktujte podporu.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ email, passwordHash: null, name, emailVerified: true, googleId })
      .returning({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl, role: users.role, weeklyEmailEnabled: users.weeklyEmailEnabled });

    await db.insert(categories).values(
      DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: newUser.id, isDefault: true }))
    );

    user = { ...newUser, passwordHash: null, googleId, emailVerified: true, verificationToken: null, verificationExpiresAt: null, resetToken: null, resetTokenExpiry: null, lastLoginAt: null, lastActiveAt: null, createdAt: new Date(), updatedAt: new Date(), monthlyEmailEnabled: false, monthlyEmailScope: 'personal', monthlyEmailHour: 9, monthlyEmailLastSent: null, onboardingComplete: false, currentStreak: 0, longestStreak: 0, lastActivityDate: null, badges: [], pinHash: null, defaultPage: 'dashboard', currencyFormat: 'sk', householdId: null, householdEnabled: false, savingsEnabled: false, theme: 'dark', language: 'sk', trackingStartDate: null, onboardingBannerDismissed: false, autoLockMinutes: null, isDeactivated: false };
  } else if (!user.googleId) {
    // Google just proved control of this mailbox. If the account was registered
    // with a password but never verified, whoever registered it may not be the
    // owner (pre-hijacking) — drop that password so it can't be used afterwards.
    const wasUnverified = !user.emailVerified;
    await db.update(users)
      .set({ googleId, emailVerified: true, ...(wasUnverified ? { passwordHash: null, verificationToken: null } : {}) })
      .where(eq(users.id, user.id));
    if (wasUnverified) user = { ...user, passwordHash: null, verificationToken: null, googleId, emailVerified: true };
  }

  const { accessToken: accessJwt, sessionId } = await issueTokens(res, user.id, user.email, req);
  res.json({ user: userPublic(user), accessToken: accessJwt, sessionId });
}

export async function deleteAccount(req: AuthRequest, res: Response): Promise<void> {
  if (rejectDemo(req, res)) return;
  const userId = req.userId!;
  const { currentPassword } = req.body as { currentPassword?: string };

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Používateľ neexistuje." });
    return;
  }

  // Google-only accounts have no password to verify — nothing to check for them.
  if (user.passwordHash) {
    if (!currentPassword) {
      res.status(400).json({ error: "Pre zmazanie účtu zadajte aktuálne heslo." });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Nesprávne aktuálne heslo." });
      return;
    }
  }

  await deleteAvatarFiles(userId);
  // households.created_by has no cascade — hand over / drop owned households first.
  await releaseOwnedHouseholds(userId);
  // Cascading deletes handle categories, transactions, refresh_tokens automatically
  await db.delete(users).where(eq(users.id, userId));

  res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS));
  res.json({ success: true });
}

// ── PIN login ──────────────────────────────────────────────────────────────

export async function pinLogin(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: unknown; pin?: unknown };
  const email = normalizeEmail(body.email);
  const pin = body.pin;
  if (!email || typeof pin !== 'string' || pin.length !== 4) {
    res.status(400).json({ error: "Neplatná požiadavka." });
    return;
  }

  const GENERIC_FAIL = { error: "Nesprávny PIN." };

  // Unknown email, no PIN and a foreign device all answer identically so the
  // endpoint cannot be used to find out which accounts exist.
  const [user] = await db.select().from(users).where(byEmail(email)).limit(1);
  if (!user || !user.pinHash) {
    res.status(401).json(GENERIC_FAIL);
    return;
  }

  // Device binding: a correct PIN from a browser that never completed PIN
  // setup (no valid pinDevice cookie) is rejected outright, before the PIN is
  // even compared — this is what turns "email + 4 digits from anywhere" into
  // "email + 4 digits from a device that was already trusted". Deliberately
  // does NOT count towards the PIN lockout: it reveals nothing about the
  // PIN itself, so penalizing it would let an attacker lock a legitimate user
  // out just by omitting the cookie.
  const deviceOk = await verifyAndSlidePinDeviceToken(res, user.id, req);
  if (!deviceOk) {
    res.status(401).json(GENERIC_FAIL);
    return;
  }

  // Per-account lockout (on top of the IP-based pinLoginLimiter), checked
  // before the PIN is compared. It comes after the device check on purpose:
  // only a device already bound to this account can see "locked", so the
  // answer reveals nothing to anyone else.
  const lockKey = pinKey(user.id);
  if (await isLocked(lockKey)) {
    res.status(429).json(LOCKED_RESPONSE);
    return;
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    await recordFailure(lockKey);
    res.status(401).json(GENERIC_FAIL);
    return;
  }

  if (user.isDeactivated) {
    res.status(403).json({ error: "Váš účet je deaktivovaný. Pre reaktiváciu kontaktujte podporu.", code: "ACCOUNT_DEACTIVATED" });
    return;
  }

  await clearFailures(lockKey);

  const { accessToken, sessionId } = await issueTokens(res, user.id, user.email, req);
  res.json({ user: userPublic(user), accessToken, sessionId });
}

export async function updatePin(req: AuthRequest, res: Response): Promise<void> {
  if (rejectDemo(req, res)) return;
  const userId = req.userId!;
  const { pin, currentPassword, currentPin } = req.body as { pin?: string; currentPassword?: string; currentPin?: string };
  if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN musí byť 4-miestne číslo." });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Používateľ neexistuje." }); return; }

  // Re-auth before planting/replacing a full-strength login credential — a
  // valid access token alone is not enough (see security audit run-1: a
  // stolen token could otherwise silently set a PIN as a durable backdoor).
  // Whichever factor the account actually has is accepted: current PIN if
  // one is already set, current password if the account has one. A
  // Google-only account setting its very first PIN has no factor to check —
  // consistent with deleteAccount's existing exemption for the same case.
  if (user.pinHash) {
    const pinOk = typeof currentPin === 'string' && currentPin.length === 4 && await bcrypt.compare(currentPin, user.pinHash);
    const pwOk = !pinOk && !!user.passwordHash && typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, user.passwordHash);
    if (!pinOk && !pwOk) {
      res.status(401).json({ error: "Nesprávne overenie totožnosti." });
      return;
    }
  } else if (user.passwordHash) {
    const pwOk = typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, user.passwordHash);
    if (!pwOk) {
      res.status(401).json({ error: "Nesprávne heslo." });
      return;
    }
  }

  // Re-entering the SAME PIN value (e.g. registering PIN login on a second
  // device with the PIN you already use) must not revoke device tokens that
  // were never actually invalidated — only an actual value change does that.
  const isSamePin = !!user.pinHash && await bcrypt.compare(pin, user.pinHash);

  if (isSamePin) {
    await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, userId));
    await clearFailures(pinKey(userId));
    await issuePinDeviceToken(res, userId, req);
  } else {
    const pinHash = await bcrypt.hash(pin, env.BCRYPT_ROUNDS);
    await db.update(users).set({
      pinHash, updatedAt: new Date(),
    }).where(eq(users.id, userId));
    await clearFailures(pinKey(userId));

    // A changed PIN invalidates every device previously bound to the old one —
    // this browser/device gets a fresh token, everyone else must re-set-up.
    await revokePinDeviceTokens(res, userId);
    await issuePinDeviceToken(res, userId, req);
  }

  res.json({ success: true });
}

export async function removePin(req: AuthRequest, res: Response): Promise<void> {
  if (rejectDemo(req, res)) return;
  const userId = req.userId!;
  const { currentPassword, currentPin } = req.body as { currentPassword?: string; currentPin?: string };

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "Používateľ neexistuje." }); return; }

  if (user.pinHash) {
    const pinOk = typeof currentPin === 'string' && currentPin.length === 4 && await bcrypt.compare(currentPin, user.pinHash);
    const pwOk = !pinOk && !!user.passwordHash && typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, user.passwordHash);
    if (!pinOk && !pwOk) {
      res.status(401).json({ error: "Nesprávne overenie totožnosti." });
      return;
    }
  }

  await db.update(users).set({
    pinHash: null, updatedAt: new Date(),
  }).where(eq(users.id, userId));
  await revokePinDeviceTokens(res, userId);

  res.json({ success: true });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Moje zariadenia" — lets a logged-in user see and revoke which browsers
// are PIN-bound to their account. isCurrentDevice is derived here (not
// stored) by comparing this request's own pinDevice cookie against each
// row's hash — never expose tokenHash itself.
export async function getPinDevices(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select({
      id: pinDeviceTokens.id,
      label: pinDeviceTokens.label,
      tokenHash: pinDeviceTokens.tokenHash,
      createdAt: pinDeviceTokens.createdAt,
      lastUsedAt: pinDeviceTokens.lastUsedAt,
      expiresAt: pinDeviceTokens.expiresAt,
    })
    .from(pinDeviceTokens)
    .where(eq(pinDeviceTokens.userId, req.userId!))
    .orderBy(desc(pinDeviceTokens.lastUsedAt));

  const cookieToken: string | undefined = req.cookies?.[PIN_DEVICE_COOKIE];
  const devices = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    isCurrentDevice: !!cookieToken && await compareToken(cookieToken, row.tokenHash),
  })));

  res.json({ data: devices });
}

export async function deletePinDevice(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) { res.status(404).json({ error: "Zariadenie nenájdené." }); return; }

  // Scoped to req.userId — never trust :id alone, or one user could revoke
  // another user's device token by guessing/enumerating IDs.
  const deleted = await db
    .delete(pinDeviceTokens)
    .where(and(eq(pinDeviceTokens.id, id), eq(pinDeviceTokens.userId, req.userId!)))
    .returning({ tokenHash: pinDeviceTokens.tokenHash });

  if (deleted.length === 0) { res.status(404).json({ error: "Zariadenie nenájdené." }); return; }

  const cookieToken: string | undefined = req.cookies?.[PIN_DEVICE_COOKIE];
  if (cookieToken && await compareToken(cookieToken, deleted[0].tokenHash)) {
    res.clearCookie(PIN_DEVICE_COOKIE, clearCookieOptions(PIN_DEVICE_COOKIE_OPTIONS));
  }

  res.json({ success: true });
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  if (rejectDemo(req, res)) return;
  const userId = req.userId!;
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Neplatná požiadavka." });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.passwordHash) {
    res.status(400).json({ error: "Zmena hesla nie je dostupná pre tento typ účtu." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Nesprávne aktuálne heslo." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await db.update(users).set({
    passwordHash, pinHash: null, updatedAt: new Date(),
  }).where(eq(users.id, userId));
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  await revokePinDeviceTokens(res, userId);
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS));
  res.json({ success: true });
}

export async function sessionCheck(req: AuthRequest, res: Response): Promise<void> {
  const [row] = await db
    .select({ lastActiveAt: users.lastActiveAt, autoLockMinutes: users.autoLockMinutes })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!row) { res.status(404).json({ error: "User not found" }); return; }

  if (row.autoLockMinutes === null) {
    res.json({ valid: true });
    return;
  }
  if (row.autoLockMinutes === 0) {
    res.json({ valid: false, reason: "timeout" });
    return;
  }
  const TIMEOUT_MS = row.autoLockMinutes * 60 * 1000;
  if (row.lastActiveAt && Date.now() - row.lastActiveAt.getTime() > TIMEOUT_MS) {
    res.json({ valid: false, reason: "timeout" });
  } else {
    res.json({ valid: true });
  }
}

export async function getSessions(req: AuthRequest, res: Response): Promise<void> {
  const sessions = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.userId, req.userId!))
    .orderBy(userSessions.createdAt)
  res.json({ data: sessions })
}

export async function deleteSession(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params as { id: string }
  const [session] = await db
    .select({ id: userSessions.id, userId: userSessions.userId })
    .from(userSessions)
    .where(eq(userSessions.id, id))
    .limit(1)
  if (!session || session.userId !== req.userId!) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  await db.delete(userSessions).where(eq(userSessions.id, id))
  res.json({ success: true })
}

export async function deactivateAccount(req: AuthRequest, res: Response): Promise<void> {
  if (rejectDemo(req, res)) return
  const userId = req.userId!
  await db.update(users).set({ isDeactivated: true, updatedAt: new Date() }).where(eq(users.id, userId))
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_OPTIONS))
  res.json({ success: true })
}

export async function pingSession(req: AuthRequest, res: Response): Promise<void> {
  res.json({ ok: true });
}

// Kept for older cached app versions. It used to report which sign-in methods
// an email has, which also told anyone whether the account exists. Now every
// email gets the same answer and the login form shows all methods.
export async function getAuthMethods(_req: Request, res: Response): Promise<void> {
  res.json({ pin: true, google: true, password: true, passkey: true })
}

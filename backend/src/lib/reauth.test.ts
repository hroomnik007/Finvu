import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { checkGoogleReauth, verifyReauth } from "./reauth";

const hash = (v: string) => bcrypt.hashSync(v, 4);

describe("verifyReauth", () => {
  const withPin = { pinHash: hash("1234"), passwordHash: hash("secret-password") };
  const passwordOnly = { pinHash: null, passwordHash: hash("secret-password") };
  const googleOnly = { pinHash: null, passwordHash: null };

  it("accepts the current PIN or the password when a PIN is set", async () => {
    expect(await verifyReauth(withPin, { currentPin: "1234" })).toBe(true);
    expect(await verifyReauth(withPin, { currentPassword: "secret-password" })).toBe(true);
  });

  it("rejects a wrong or missing factor when a PIN is set", async () => {
    expect(await verifyReauth(withPin, { currentPin: "9999" })).toBe(false);
    expect(await verifyReauth(withPin, { currentPassword: "nope" })).toBe(false);
    expect(await verifyReauth(withPin, {})).toBe(false);
  });

  it("requires the password when there is no PIN", async () => {
    expect(await verifyReauth(passwordOnly, { currentPassword: "secret-password" })).toBe(true);
    expect(await verifyReauth(passwordOnly, { currentPassword: "wrong" })).toBe(false);
    expect(await verifyReauth(passwordOnly, {})).toBe(false);
  });

  it("does not accept a PIN for an account that has none", async () => {
    expect(await verifyReauth(passwordOnly, { currentPin: "1234" })).toBe(false);
  });

  it("has nothing to check for a Google-only account without a PIN", async () => {
    expect(await verifyReauth(googleOnly, {})).toBe(true);
  });

  it("ignores values that are not strings", async () => {
    expect(await verifyReauth(withPin, { currentPin: 1234, currentPassword: { $ne: "" } })).toBe(false);
  });
});

describe("checkGoogleReauth", () => {
  const ok = { ok: true as const, sub: "g1", expiresIn: 3599 };
  const MIN = 55 * 60;
  it("accepts a fresh token for the linked account", () => {
    expect(checkGoogleReauth({ googleId: "g1" }, ok, MIN)).toEqual({ ok: true });
  });
  it("rejects another Google account or an account without a linked one", () => {
    expect(checkGoogleReauth({ googleId: "g2" }, ok, MIN)).toMatchObject({ ok: false, status: 401 });
    expect(checkGoogleReauth({ googleId: null }, ok, MIN)).toMatchObject({ ok: false, status: 401 });
  });
  it("rejects a stale token and passes verification failures through", () => {
    expect(checkGoogleReauth({ googleId: "g1" }, { ...ok, expiresIn: MIN - 1 }, MIN)).toMatchObject({ ok: false, status: 401 });
    expect(checkGoogleReauth({ googleId: "g1" }, { ok: false, status: 503, error: "x" }, MIN)).toEqual({ ok: false, status: 503, error: "x" });
  });
});

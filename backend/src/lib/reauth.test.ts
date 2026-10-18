import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { verifyReauth } from "./reauth";

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

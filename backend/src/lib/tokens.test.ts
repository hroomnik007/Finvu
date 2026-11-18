import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import {
  compareToken, hashToken,
  signAccessToken, signRefreshToken, signAdminToken,
  verifyAccessToken, verifyRefreshToken, verifyAdminToken,
} from "./tokens";

describe("token hashing", () => {
  it("hashes to a deterministic 64-char SHA-256 hex digest", async () => {
    const a = await hashToken("some-opaque-token");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("some-opaque-token")).toBe(a);
    expect(await hashToken("another-token")).not.toBe(a);
  });

  it("compares a token with its stored hash", async () => {
    const hash = await hashToken("abc");
    expect(await compareToken("abc", hash)).toBe(true);
    expect(await compareToken("abd", hash)).toBe(false);
  });

  it("never matches a legacy bcrypt hash and does not throw", async () => {
    const legacy = "$2b$12$abcdefghijklmnopqrstuuVxQ1c7x2x1x8Qx8m1x8Qx8m1x8Qx8m1";
    expect(await compareToken("abc", legacy)).toBe(false);
  });
});

describe("JWT algorithm pinning", () => {
  const user = { userId: "00000000-0000-4000-8000-000000000001", email: "someone@example.test" };
  const admin = { role: "admin", sub: "admin" };

  const kinds = [
    { kind: "access", secret: env.JWT_ACCESS_SECRET, payload: user, verify: verifyAccessToken },
    { kind: "refresh", secret: env.JWT_REFRESH_SECRET, payload: user, verify: verifyRefreshToken },
    { kind: "admin", secret: env.JWT_ADMIN_SECRET, payload: admin, verify: verifyAdminToken },
  ] as const;

  const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  // An unsigned token as an attacker would craft it: alg "none", empty signature.
  const noneToken = (payload: object) =>
    `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ ...payload, iat: Math.floor(Date.now() / 1000) })}.`;
  const header = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

  it("signs every kind with HS256 explicitly", () => {
    expect(header(signAccessToken(user)).alg).toBe("HS256");
    expect(header(signRefreshToken(user)).alg).toBe("HS256");
    expect(header(signAdminToken()).alg).toBe("HS256");
  });

  for (const { kind, secret, payload, verify } of kinds) {
    it(`${kind}: a token signed with the library default (HS256, as already issued tokens are) verifies`, () => {
      const token = jwt.sign(payload, secret, { expiresIn: "5m" });
      expect(header(token).alg).toBe("HS256");
      expect(verify(token)).toMatchObject(payload);
    });

    it(`${kind}: a token with alg "none" is rejected`, () => {
      expect(() => verify(noneToken(payload))).toThrow();
    });

    it(`${kind}: a token signed with HS384 and the right secret is rejected`, () => {
      const token = jwt.sign(payload, secret, { algorithm: "HS384", expiresIn: "5m" });
      expect(() => verify(token)).toThrow(/invalid algorithm/);
    });
  }

  it("round-trips the app's own tokens", () => {
    expect(verifyAccessToken(signAccessToken(user))).toMatchObject(user);
    expect(verifyRefreshToken(signRefreshToken(user))).toMatchObject(user);
    expect(verifyAdminToken(signAdminToken())).toMatchObject(admin);
  });
});

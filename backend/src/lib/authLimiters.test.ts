import express from "express";
import type { AddressInfo } from "net";
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { authLimiter, signInLimiter, RATE_LIMITED_BODY } from "./authLimiters";
import { LOCKED_RESPONSE } from "./loginLockout";
import { AUTH_ERRORS } from "./authErrors";

// A throwaway express app: POST /try answers 200 when body.ok, 401 otherwise.
const servers: { close: () => void }[] = [];
afterEach(() => { while (servers.length) servers.pop()!.close(); });

async function app(limiter: express.RequestHandler) {
  const a = express();
  a.use(express.json());
  a.post("/try", limiter, (req, res) => {
    if (req.body?.ok) res.json({ ok: true });
    else res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
  });
  const server = a.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return async (ok: boolean) => {
    const res = await fetch(`http://127.0.0.1:${port}/try`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ok }),
    });
    return { status: res.status, body: await res.json() };
  };
}

describe("signInLimiter (password, PIN, passkey)", () => {
  it("does not count successful sign-ins", async () => {
    const attempt = await app(signInLimiter(60_000, 3));
    for (let i = 0; i < 10; i++) expect((await attempt(true)).status).toBe(200);
    // all three failures still allowed after ten successes
    for (let i = 0; i < 3; i++) expect((await attempt(false)).status).toBe(401);
  });

  it("counts failures and then refuses with the coded body", async () => {
    const attempt = await app(signInLimiter(60_000, 3));
    for (let i = 0; i < 3; i++) expect((await attempt(false)).status).toBe(401);
    expect(await attempt(false)).toEqual({ status: 429, body: { error: "Too many attempts. Try again later.", code: "AUTH_RATE_LIMITED" } });
    // once limited even the right credentials wait for the window
    expect((await attempt(true)).status).toBe(429);
  });
});

describe("authLimiter", () => {
  it("counts every request", async () => {
    const attempt = await app(authLimiter(60_000, 2));
    expect((await attempt(true)).status).toBe(200);
    expect((await attempt(true)).status).toBe(200);
    expect(await attempt(true)).toEqual({ status: 429, body: RATE_LIMITED_BODY });
  });
});

describe("error codes", () => {
  it("the account lockout and the IP limit answer identically", () => {
    expect(LOCKED_RESPONSE).toEqual(RATE_LIMITED_BODY);
    expect(RATE_LIMITED_BODY).toEqual({ error: AUTH_ERRORS.AUTH_RATE_LIMITED, code: "AUTH_RATE_LIMITED" });
  });

  it("every auth error text is English", () => {
    for (const text of Object.values(AUTH_ERRORS)) expect(text).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("routes/auth.ts wiring", () => {
  const src = readFileSync(join(__dirname, "../routes/auth.ts"), "utf8");
  const limiterOf = (path: string) => src.match(new RegExp(`router\\.post\\("${path}",\\s*(?:passkeysEnabled,\\s*)?(\\w+)`))?.[1];
  const defOf = (name: string) => src.match(new RegExp(`const ${name} = (\\w+)\\(`))?.[1];

  it("password, PIN and passkey sign-in use failure-only limiters", () => {
    for (const path of ["/login", "/pin-login", "/webauthn/authenticate-verify"]) {
      expect(defOf(limiterOf(path)!), path).toBe("signInLimiter");
    }
  });
  it("other auth endpoints keep counting every request", () => {
    for (const path of ["/register", "/admin-login", "/google", "/forgot-password"]) {
      expect(defOf(limiterOf(path)!), path).toBe("authLimiter");
    }
  });
  it("passkey register / sign-in / re-auth routes sit behind the PASSKEYS_ENABLED gate, management stays open", () => {
    for (const r of ["post(\"/webauthn/register-options\"", "post(\"/webauthn/register-verify\"", "get(\"/webauthn/authenticate-options\"", "post(\"/webauthn/authenticate-verify\"", "post(\"/webauthn/reauth-options\""]) {
      expect(src, r).toMatch(new RegExp(`router\\.${r.replace(/[()]/g, "\\$&")},\\s*passkeysEnabled,`));
    }
    expect(src).not.toMatch(/router\.(get|patch|delete)\("\/webauthn\/credentials[^)]*\),\s*passkeysEnabled/);
  });
  it("no limiter is defined without the coded message", () => {
    expect(src).not.toMatch(/rateLimit\(/);
  });
});

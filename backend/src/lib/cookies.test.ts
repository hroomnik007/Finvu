import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

// Serialise every auth cookie through a real Express response and read the
// Set-Cookie headers back, so the test sees exactly what a browser gets.
async function setCookieHeaders(nodeEnv: string): Promise<string[]> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  const t = await import("./tokens");
  const all = [
    [t.REFRESH_COOKIE, t.REFRESH_COOKIE_OPTIONS],
    [t.ADMIN_COOKIE, t.ADMIN_COOKIE_OPTIONS],
    [t.ADMIN_CSRF_COOKIE, t.ADMIN_CSRF_COOKIE_OPTIONS],
    [t.PIN_DEVICE_COOKIE, t.PIN_DEVICE_COOKIE_OPTIONS],
  ] as const;
  const app = express();
  app.get("/set", (_req, res) => { for (const [n, o] of all) res.cookie(n, "v", o); res.end(); });
  app.get("/clear", (_req, res) => { for (const [n, o] of all) res.clearCookie(n, t.clearCookieOptions(o)); res.end(); });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const set = (await fetch(`${base}/set`)).headers.getSetCookie();
    const clear = (await fetch(`${base}/clear`)).headers.getSetCookie();
    return [...set, ...clear];
  } finally {
    server.close();
  }
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("auth cookies", () => {
  it.each(["production", "development"])("are SameSite=Lax, never None (%s)", async (nodeEnv) => {
    const headers = await setCookieHeaders(nodeEnv);
    expect(headers).toHaveLength(8);
    for (const h of headers) {
      expect(h).toMatch(/; SameSite=Lax/);
      expect(h).not.toMatch(/SameSite=None/i);
    }
  });

  it("are Secure in production only", async () => {
    for (const h of await setCookieHeaders("production")) expect(h).toMatch(/; Secure/);
    for (const h of await setCookieHeaders("development")) expect(h).not.toMatch(/; Secure/);
  });

  it("keep httpOnly except the CSRF cookie, and clear with the same path", async () => {
    const headers = await setCookieHeaders("production");
    const byName = (name: string) => headers.filter(h => h.startsWith(`${name}=`));
    for (const [name, path] of [["refreshToken", "/api/auth"], ["adminToken", "/api/admin"], ["pinDevice", "/api/auth"]]) {
      for (const h of byName(name)) { expect(h).toMatch(/HttpOnly/); expect(h).toContain(`Path=${path}`); }
    }
    for (const h of byName("adminCsrf")) { expect(h).not.toMatch(/HttpOnly/); expect(h).toContain("Path=/api/admin"); }
    // the clear headers expire the cookie
    expect(headers.slice(4).every(h => /Expires=Thu, 01 Jan 1970/.test(h))).toBe(true);
  });
});

import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The admin routes never need the database for these paths; keep it inert.
vi.mock("../db", () => ({ db: {} }));
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));

const { default: adminRouter } = await import("./admin");
const { adminLogin } = await import("../controllers/auth.controller");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.post("/api/auth/admin-login", adminLogin);
app.use("/api/admin", adminRouter);

let base = "";
let server: ReturnType<typeof app.listen>;
beforeAll(async () => {
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const cookieJar = (res: Response) =>
  res.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");

async function login() {
  const res = await fetch(`${base}/api/auth/admin-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-admin-password" }),
  });
  return { res, body: await res.json() as { csrfToken?: string }, cookies: cookieJar(res) };
}

describe("admin CSRF", () => {
  it("login returns the CSRF token that matches the httpOnly cookie", async () => {
    const { res, body, cookies } = await login();
    expect(res.status).toBe(200);
    expect(body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(cookies).toContain(`adminCsrf=${body.csrfToken}`);
    expect(res.headers.getSetCookie().find(c => c.startsWith("adminCsrf="))).toMatch(/HttpOnly/);
  });

  it("GET /csrf needs the admin cookie", async () => {
    expect((await fetch(`${base}/api/admin/csrf`)).status).toBe(401);
    const { body, cookies } = await login();
    const res = await fetch(`${base}/api/admin/csrf`, { headers: { cookie: cookies } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ csrfToken: body.csrfToken });
  });

  it("GET /csrf issues a new token when the CSRF cookie is gone", async () => {
    const { cookies } = await login();
    const adminOnly = cookies.split("; ").filter(c => c.startsWith("adminToken=")).join("; ");
    const res = await fetch(`${base}/api/admin/csrf`, { headers: { cookie: adminOnly } });
    const { csrfToken } = await res.json() as { csrfToken: string };
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(cookieJar(res)).toBe(`adminCsrf=${csrfToken}`);
  });

  it("POST with a missing or wrong header is 403", async () => {
    const { body, cookies } = await login();
    const post = (headers: Record<string, string>) =>
      fetch(`${base}/api/admin/logout`, { method: "POST", headers: { cookie: cookies, ...headers } });
    expect((await post({})).status).toBe(403);
    expect((await post({ "x-admin-csrf-token": "nope" })).status).toBe(403);
    expect((await post({ "x-admin-csrf-token": body.csrfToken!.replace(/.$/, c => c === "0" ? "1" : "0") })).status).toBe(403);
    expect((await post({ "x-admin-csrf-token": "é".repeat(32) })).status).toBe(403);
    // header without the cookie
    const noCookie = await fetch(`${base}/api/admin/logout`, { method: "POST", headers: { "x-admin-csrf-token": body.csrfToken! } });
    expect(noCookie.status).toBe(403);
  });

  it("logout with the right header passes and clears both cookies", async () => {
    const { body, cookies } = await login();
    const res = await fetch(`${base}/api/admin/logout`, {
      method: "POST", headers: { cookie: cookies, "x-admin-csrf-token": body.csrfToken! },
    });
    expect(res.status).toBe(200);
    const cleared = res.headers.getSetCookie();
    expect(cleared.some(c => c.startsWith("adminToken=;"))).toBe(true);
    expect(cleared.some(c => c.startsWith("adminCsrf=;"))).toBe(true);
  });
});

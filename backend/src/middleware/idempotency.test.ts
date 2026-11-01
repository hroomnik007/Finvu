import { readFileSync } from "fs";
import { join } from "path";
import express from "express";
import cors from "cors";
import type { AddressInfo } from "net";
import { describe, expect, it } from "vitest";
import { isValidIdempotencyKey, requestFingerprint, KEY_TTL_MS } from "./idempotency";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("Idempotency-Key helpers", () => {
  it("accepts UUIDs and url-safe tokens, rejects the rest", () => {
    expect(isValidIdempotencyKey(crypto.randomUUID())).toBe(true);
    expect(isValidIdempotencyKey("abc_DEF-1234")).toBe(true);
    for (const bad of ["", "short", "has space here", "a".repeat(101), "ключ-ключ-ключ", "a/b/c/d/e/f"]) {
      expect(isValidIdempotencyKey(bad)).toBe(false);
    }
  });

  it("fingerprints method, path and body", () => {
    const a = requestFingerprint("POST", "/api/transactions", { amount: 1 });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(requestFingerprint("POST", "/api/transactions", { amount: 1 })).toBe(a);
    expect(requestFingerprint("POST", "/api/transactions", { amount: 2 })).not.toBe(a);
    expect(requestFingerprint("POST", "/api/categories", { amount: 1 })).not.toBe(a);
  });

  it("keeps keys for 24 hours", () => {
    expect(KEY_TTL_MS).toBe(86_400_000);
  });
});

describe("wiring", () => {
  it("every create route runs the middleware after authentication", () => {
    const tx = src("routes/transactions.ts"), sav = src("routes/savings.ts"), cat = src("routes/categories.ts");
    expect(tx).toMatch(/router\.post\("\/",\s+idempotent, createTransaction\)/);
    expect(tx).toMatch(/router\.post\("\/bulk",\s+idempotent, createTransactionsBulk\)/);
    expect(sav).toMatch(/router\.post\("\/",\s+idempotent, createSavingsGoal\)/);
    expect(sav).toMatch(/router\.post\("\/:id\/deposits", idempotent, addDeposit\)/);
    expect(cat).toMatch(/router\.post\("\/",\s+idempotent, createCategory\)/);
    for (const s of [tx, sav, cat]) expect(s.indexOf("router.use(authenticateToken)")).toBeLessThan(s.indexOf("idempotent,"));
  });

  it("the nightly cleanup prunes old keys", () => {
    expect(src("jobs/cleanup.ts")).toMatch(/delete\(idempotencyKeys\)/);
  });

  it("CORS lets browsers send Idempotency-Key and read Idempotent-Replayed", async () => {
    const index = src("index.ts");
    expect(index).not.toMatch(/allowedHeaders\s*:/);
    expect(index).toMatch(/exposedHeaders: \["Idempotent-Replayed"/);

    // Same options as index.ts, against a real preflight
    const app = express();
    app.use(cors({ origin: (_o, cb) => cb(null, true), credentials: true, exposedHeaders: ["Idempotent-Replayed", "Retry-After"] }));
    app.post("/x", (_req, res) => { res.json({ ok: true }); });
    const server = app.listen(0);
    await new Promise(r => server.once("listening", r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
      const pre = await fetch(url, { method: "OPTIONS", headers: {
        origin: "http://localhost:5173", "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      } });
      expect(pre.status).toBe(204);
      expect(pre.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
      const post = await fetch(url, { method: "POST", headers: { origin: "http://localhost:5173" } });
      expect(post.headers.get("access-control-expose-headers")).toContain("Idempotent-Replayed");
    } finally {
      await new Promise<void>(r => server.close(() => r()));
    }
  });
});

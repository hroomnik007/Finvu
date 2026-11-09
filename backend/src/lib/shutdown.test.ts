import { describe, it, expect, vi } from "vitest";
import { createShutdown } from "./shutdown";

function deps(overrides: Partial<Parameters<typeof createShutdown>[0]> = {}) {
  const order: string[] = [];
  const d = {
    stopJobs: vi.fn(() => { order.push("jobs"); }),
    closeServer: vi.fn(async () => { order.push("server"); }),
    closeDb: vi.fn(async () => { order.push("db"); }),
    exit: vi.fn(),
    log: () => {},
    ...overrides,
  };
  return { d, order };
}

describe("createShutdown", () => {
  it("stops jobs, drains the server, closes the db, then exits 0", async () => {
    const { d, order } = deps();
    await createShutdown(d)("SIGTERM");
    expect(order).toEqual(["jobs", "server", "db"]);
    expect(d.exit).toHaveBeenCalledWith(0);
  });

  it("runs only once when signalled repeatedly", async () => {
    const { d } = deps();
    const shutdown = createShutdown(d);
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(d.closeServer).toHaveBeenCalledTimes(1);
    expect(d.exit).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when a step fails", async () => {
    const { d } = deps({ closeServer: vi.fn(async () => { throw new Error("boom"); }) });
    await createShutdown(d)("SIGTERM");
    expect(d.closeDb).not.toHaveBeenCalled();
    expect(d.exit).toHaveBeenCalledWith(1);
  });

  it("forces exit 1 when draining hangs past the timeout", async () => {
    vi.useFakeTimers();
    const { d } = deps({ closeServer: vi.fn(() => new Promise<void>(() => {})) });
    void createShutdown({ ...d, timeoutMs: 1000 })("SIGTERM");
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});

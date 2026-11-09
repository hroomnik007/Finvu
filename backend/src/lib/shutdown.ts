// Graceful shutdown for SIGTERM/SIGINT. Node runs as PID 1 in the container
// (docker-entrypoint execs it), and PID 1 ignores SIGTERM unless it has a
// handler, so without this every `docker compose up` waited the stop timeout
// and then SIGKILLed the process in the middle of requests.
export interface ShutdownDeps {
  closeServer: () => Promise<void>;
  stopJobs: () => void;
  closeDb: () => Promise<void>;
  exit: (code: number) => void;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const { closeServer, stopJobs, closeDb, exit, timeoutMs = 20_000, log = console.log } = deps;
  let started = false;

  return async (signal: string) => {
    if (started) return;
    started = true;
    log(`[shutdown] ${signal} received, draining`);

    // Hard stop if draining hangs (a stuck request or DB connection)
    const timer = setTimeout(() => {
      log("[shutdown] timed out, forcing exit");
      exit(1);
    }, timeoutMs);
    timer.unref?.();

    let code = 0;
    try {
      stopJobs();             // no new cron runs
      await closeServer();    // stop accepting, let in-flight requests finish
      await closeDb();        // then release the pool
      log("[shutdown] done");
    } catch (err) {
      log(`[shutdown] error: ${err instanceof Error ? err.message : String(err)}`);
      code = 1;
    }
    clearTimeout(timer);
    exit(code);
  };
}

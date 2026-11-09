// Readiness of the database for /api/health: the container healthcheck and the
// deploy's `docker compose up --wait` should fail when Postgres is unreachable,
// not report "ok" for a backend that can't serve a single request.
export async function checkDatabase(query: () => Promise<unknown>, timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([query().then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

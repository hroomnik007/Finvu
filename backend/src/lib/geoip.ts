// Rough location (city, country) of an IP for the "devices" list. The lookup goes over
// HTTPS and is best effort: any failure just leaves the location empty.
const LOOKUP_TIMEOUT_MS = 3000;

export function formatLocation(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { success?: unknown; city?: unknown; country?: unknown };
  if (d.success === false) return null;
  const parts = [d.city, d.country].filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return parts.length ? parts.join(", ").slice(0, 255) : null;
}

export async function lookupLocation(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return formatLocation(await res.json());
  } catch {
    return null;
  }
}

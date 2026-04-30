import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Simple in-memory fixed-window rate limiter, scoped per process.
 * Sufficient for low-to-moderate single-region deployments. For multi-region
 * or autoscaled deployments switch to a shared store (Redis/Upstash).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/**
 * Best-effort client identifier from request headers. Falls back to "unknown"
 * when running outside a request context.
 */
export async function getClientKey(prefix: string): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      "unknown";
    return `${prefix}:${ip}`;
  } catch {
    return `${prefix}:unknown`;
  }
}

// Periodic cleanup so the map can't grow unbounded under attack.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
declare global {
  var __rateLimitCleanupTimer: NodeJS.Timeout | undefined;
}
if (!globalThis.__rateLimitCleanupTimer) {
  globalThis.__rateLimitCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive solely for cleanup.
  globalThis.__rateLimitCleanupTimer.unref?.();
}

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

/**
 * Fixed-window in-memory rate limiter. A bucket older than its window resets.
 */
export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now()
): { allowed: boolean; retryAfterMs: number } {
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    if (buckets.size > MAX_BUCKETS) prune(now)
    return { allowed: true, retryAfterMs: 0 }
  }

  if (bucket.count < options.limit) {
    bucket.count += 1
    return { allowed: true, retryAfterMs: 0 }
  }

  return { allowed: false, retryAfterMs: bucket.resetAt - now }
}

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function resetRateLimitForTests() {
  buckets.clear()
}

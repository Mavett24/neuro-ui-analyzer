// Best-effort per-IP rate limit for the Gemini routes, so one visitor can't drain the shared free quota.
// State lives in memory, so each serverless instance keeps its own count. That is enough to stop a
// simple loop; a shared store (Redis, Vercel KV) would be needed for a strict global limit.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 10;
const buckets = new Map();

export function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Returns null when the request may go ahead, or the number of seconds to wait.
export function rateLimit(key, now = Date.now()) {
  const recent = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    buckets.set(key, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) if (now - times[times.length - 1] >= WINDOW_MS) buckets.delete(k);
  }
  return null;
}

export function tooManyRequests(retryAfter) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  return Response.json(
    { error: `Too many analyses from this connection. Try again in about ${minutes} minute${minutes > 1 ? "s" : ""}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

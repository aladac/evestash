import { MAX_COMBINATIONS } from "../lib/namegen"

interface Env {
  CACHE: KVNamespace
}

const DAILY_LIMIT = 10

// GET /api/share-status — return daily remaining + global usage
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // Daily limit for this fingerprint
  const fingerprint = await hashFingerprint(request)
  const today = new Date().toISOString().slice(0, 10)
  const rateLimitKey = `ratelimit:share:${today}:${fingerprint}`

  const currentStr = await env.CACHE.get(rateLimitKey)
  const dailyUsed = currentStr ? parseInt(currentStr, 10) : 0

  // Global counter
  const globalStr = await env.CACHE.get("share:_count")
  const globalUsed = globalStr ? parseInt(globalStr, 10) : 0

  return new Response(
    JSON.stringify({
      daily_used: dailyUsed,
      daily_limit: DAILY_LIMIT,
      daily_remaining: Math.max(0, DAILY_LIMIT - dailyUsed),
      global_used: globalUsed,
      global_limit: MAX_COMBINATIONS,
      global_remaining: Math.max(0, MAX_COMBINATIONS - globalUsed),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  )
}

async function hashFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown"
  const ua = request.headers.get("user-agent") || "unknown"
  const raw = `${ip}:${ua}`
  const encoded = new TextEncoder().encode(raw)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16)
}

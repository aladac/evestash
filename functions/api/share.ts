import { generateName, MAX_COMBINATIONS } from "../lib/namegen"

interface Env {
  CACHE: KVNamespace
}

const DAILY_LIMIT = 10
const MAX_RETRIES = 20
const SHARE_TTL_DAYS = 5
const SHARE_TTL_SECONDS = SHARE_TTL_DAYS * 86400

// POST /api/share — save appraisal input, return short ID
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  let body: { text: string; hub: string }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const { text, hub } = body
  if (!text || typeof text !== "string") {
    return jsonResponse({ error: "Missing 'text' field" }, 400)
  }

  if (text.length > 10000) {
    return jsonResponse({ error: "Input too large (max 10KB)" }, 400)
  }

  // Rate limit: 10 shares per day per fingerprint hash
  const fingerprint = await hashFingerprint(request)
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const rateLimitKey = `ratelimit:share:${today}:${fingerprint}`

  const currentStr = await env.CACHE.get(rateLimitKey)
  const current = currentStr ? parseInt(currentStr, 10) : 0

  if (current >= DAILY_LIMIT) {
    return jsonResponse({ error: "Daily share limit reached (10/day)" }, 429)
  }

  // Generate EVE-themed ID, retry on collision
  let id = ""
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = generateName()
    const existing = await env.CACHE.get(`share:${candidate}`)
    if (!existing) {
      id = candidate
      break
    }
  }

  if (!id) {
    return jsonResponse({
      error: `All ${MAX_COMBINATIONS.toLocaleString()} share slots are taken. Links expire after ${SHARE_TTL_DAYS} days — try again later.`,
    }, 503)
  }

  // Increment rate limit counter with TTL of 24h
  await env.CACHE.put(rateLimitKey, String(current + 1), { expirationTtl: 86400 })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + SHARE_TTL_SECONDS * 1000).toISOString()
  const payload = JSON.stringify({
    text,
    hub: hub || "jita",
    created_at: now.toISOString(),
    expires_at: expiresAt,
  })

  await env.CACHE.put(`share:${id}`, payload, { expirationTtl: SHARE_TTL_SECONDS })

  // Increment global counter
  const globalStr = await env.CACHE.get("share:_count")
  const globalUsed = globalStr ? parseInt(globalStr, 10) : 0
  await env.CACHE.put("share:_count", String(globalUsed + 1))

  return jsonResponse({
    id,
    expires_at: expiresAt,
    remaining: DAILY_LIMIT - current - 1,
  })
}

// GET /api/share?id=xxx — retrieve saved appraisal input
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context
  const url = new URL(context.request.url)
  const id = url.searchParams.get("id")

  if (!id || !/^[a-zA-Z0-9_-]{3,50}$/.test(id)) {
    return jsonResponse({ error: "Invalid or missing 'id' parameter" }, 400)
  }

  const payload = await env.CACHE.get(`share:${id}`)
  if (!payload) {
    return jsonResponse({ error: "Appraisal not found or expired" }, 404)
  }

  const data = JSON.parse(payload) as {
    text: string
    hub: string
    created_at?: string
    expires_at?: string
  }

  return jsonResponse({
    text: data.text,
    hub: data.hub,
    expires_at: data.expires_at,
  })
}

/**
 * Create a SHA-256 hash from IP + User-Agent.
 * We never store the raw values — only the hash — so no PII is retained.
 */
async function hashFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown"
  const ua = request.headers.get("user-agent") || "unknown"
  const raw = `${ip}:${ua}`
  const encoded = new TextEncoder().encode(raw)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16)
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

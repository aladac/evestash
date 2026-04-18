import { parseMultibuy } from "../../src/lib/parser"
import {
  TRADE_HUBS,
  ESI_BASE,
  MAX_CONCURRENT,
  PRICE_CACHE_TTL,
} from "../../src/lib/constants"
import type {
  AppraisalRequest,
  AppraisalResponse,
  AppraisalItem,
  ParsedItem,
} from "../../src/lib/types"
import type { TradeHubKey } from "../../src/lib/constants"

interface Env {
  CACHE: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  let body: AppraisalRequest
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const { text, hub } = body
  if (!text || typeof text !== "string") {
    return jsonResponse({ error: "Missing 'text' field" }, 400)
  }

  const validHubs = ["jita", "amarr", "dodixie", "rens", "hek", "universe"]
  const selectedHub = validHubs.includes(hub) ? hub : "jita"

  const parsed = parseMultibuy(text)
  if (parsed.length === 0) {
    return jsonResponse({ error: "No items parsed from input" }, 400)
  }

  // Resolve names to type IDs
  const { resolved, errors } = await resolveTypeIds(parsed, env.CACHE)

  // Fetch prices
  const items: AppraisalItem[] = []
  if (resolved.length > 0) {
    const prices = await fetchPrices(resolved, selectedHub, env.CACHE)
    for (const item of prices) {
      items.push({
        name: item.name,
        type_id: item.type_id,
        quantity: item.quantity,
        sell_price: item.sell_price,
        buy_price: item.buy_price,
        sell_total: item.sell_price * item.quantity,
        buy_total: item.buy_price * item.quantity,
      })
    }
  }

  const totals = {
    sell: items.reduce((sum, i) => sum + i.sell_total, 0),
    buy: items.reduce((sum, i) => sum + i.buy_total, 0),
  }

  const response: AppraisalResponse = {
    items,
    totals,
    errors,
    hub: selectedHub,
    cached_at: new Date().toISOString(),
  }

  return jsonResponse(response)
}

interface ResolvedItem {
  name: string
  type_id: number
  quantity: number
}

async function resolveTypeIds(
  parsed: ParsedItem[],
  cache: KVNamespace
): Promise<{
  resolved: ResolvedItem[]
  errors: Array<{ name: string; reason: string }>
}> {
  const resolved: ResolvedItem[] = []
  const errors: Array<{ name: string; reason: string }> = []
  const toResolve: ParsedItem[] = []

  // Check cache first
  for (const item of parsed) {
    const cacheKey = `typeid:${item.name.toLowerCase()}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      resolved.push({
        name: item.name,
        type_id: parseInt(cached, 10),
        quantity: item.quantity,
      })
    } else {
      toResolve.push(item)
    }
  }

  if (toResolve.length === 0) {
    return { resolved, errors }
  }

  // ESI POST /universe/ids/ accepts up to 500 names
  const names = toResolve.map((i) => i.name)
  const batches: string[][] = []
  for (let i = 0; i < names.length; i += 500) {
    batches.push(names.slice(i, i + 500))
  }

  const nameToItem = new Map<string, ParsedItem>()
  for (const item of toResolve) {
    nameToItem.set(item.name.toLowerCase(), item)
  }

  for (const batch of batches) {
    try {
      const resp = await fetch(`${ESI_BASE}/universe/ids/?datasource=tranquility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      })

      if (!resp.ok) {
        for (const name of batch) {
          errors.push({ name, reason: "ESI lookup failed" })
        }
        continue
      }

      const data = (await resp.json()) as {
        inventory_types?: Array<{ id: number; name: string }>
      }

      const foundNames = new Set<string>()

      if (data.inventory_types) {
        for (const entry of data.inventory_types) {
          const key = entry.name.toLowerCase()
          foundNames.add(key)
          const item = nameToItem.get(key)
          if (item) {
            resolved.push({
              name: item.name,
              type_id: entry.id,
              quantity: item.quantity,
            })
            // Cache with no expiry
            await cache.put(`typeid:${key}`, String(entry.id))
          }
        }
      }

      // Mark unresolved names as errors
      for (const name of batch) {
        if (!foundNames.has(name.toLowerCase())) {
          errors.push({ name, reason: "Item not found in ESI" })
        }
      }
    } catch {
      for (const name of batch) {
        errors.push({ name, reason: "Network error during ESI lookup" })
      }
    }
  }

  return { resolved, errors }
}

interface PricedItem {
  name: string
  type_id: number
  quantity: number
  sell_price: number
  buy_price: number
}

async function fetchPrices(
  items: ResolvedItem[],
  hub: string,
  cache: KVNamespace
): Promise<PricedItem[]> {
  if (hub === "universe") {
    return fetchUniversePrices(items, cache)
  }

  const hubConfig = TRADE_HUBS[hub as TradeHubKey]
  if (!hubConfig) {
    return fetchUniversePrices(items, cache)
  }

  const results: PricedItem[] = []

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const batch = items.slice(i, i + MAX_CONCURRENT)
    const batchResults = await Promise.all(
      batch.map((item) => fetchHubPrice(item, hubConfig, hub, cache))
    )
    results.push(...batchResults)
  }

  return results
}

async function fetchHubPrice(
  item: ResolvedItem,
  hubConfig: { regionId: number; systemId: number },
  hubKey: string,
  cache: KVNamespace
): Promise<PricedItem> {
  const cacheKey = `price:${hubKey}:${item.type_id}`
  const cached = await cache.get(cacheKey)

  if (cached) {
    const prices = JSON.parse(cached) as { sell: number; buy: number }
    return {
      name: item.name,
      type_id: item.type_id,
      quantity: item.quantity,
      sell_price: prices.sell,
      buy_price: prices.buy,
    }
  }

  let sellPrice = 0
  let buyPrice = 0

  try {
    // Fetch all orders for this type in the region
    const url = `${ESI_BASE}/markets/${hubConfig.regionId}/orders/?datasource=tranquility&type_id=${item.type_id}&order_type=all`
    const resp = await fetch(url)

    if (resp.ok) {
      const orders = (await resp.json()) as Array<{
        is_buy_order: boolean
        price: number
        location_id: number
        system_id: number
      }>

      // Filter to the hub's system
      const hubOrders = orders.filter(
        (o) => o.system_id === hubConfig.systemId
      )

      const sellOrders = hubOrders
        .filter((o) => !o.is_buy_order)
        .map((o) => o.price)
      const buyOrders = hubOrders
        .filter((o) => o.is_buy_order)
        .map((o) => o.price)

      if (sellOrders.length > 0) {
        sellPrice = Math.min(...sellOrders)
      }
      if (buyOrders.length > 0) {
        buyPrice = Math.max(...buyOrders)
      }
    }
  } catch {
    // Price stays 0
  }

  // Cache with TTL
  await cache.put(
    cacheKey,
    JSON.stringify({ sell: sellPrice, buy: buyPrice }),
    { expirationTtl: PRICE_CACHE_TTL }
  )

  return {
    name: item.name,
    type_id: item.type_id,
    quantity: item.quantity,
    sell_price: sellPrice,
    buy_price: buyPrice,
  }
}

async function fetchUniversePrices(
  items: ResolvedItem[],
  cache: KVNamespace
): Promise<PricedItem[]> {
  // Check if we have a cached universe price list
  const cacheKey = "prices:universe"
  let priceMap: Map<number, { adjusted: number; average: number }>

  const cached = await cache.get(cacheKey)
  if (cached) {
    const list = JSON.parse(cached) as Array<{
      type_id: number
      adjusted_price: number
      average_price: number
    }>
    priceMap = new Map(
      list.map((p) => [
        p.type_id,
        { adjusted: p.adjusted_price, average: p.average_price },
      ])
    )
  } else {
    try {
      const resp = await fetch(
        `${ESI_BASE}/markets/prices/?datasource=tranquility`
      )
      if (!resp.ok) {
        return items.map((i) => ({
          ...i,
          sell_price: 0,
          buy_price: 0,
        }))
      }

      const list = (await resp.json()) as Array<{
        type_id: number
        adjusted_price?: number
        average_price?: number
      }>

      priceMap = new Map(
        list.map((p) => [
          p.type_id,
          {
            adjusted: p.adjusted_price ?? 0,
            average: p.average_price ?? 0,
          },
        ])
      )

      // Cache the full list
      await cache.put(cacheKey, JSON.stringify(list), {
        expirationTtl: PRICE_CACHE_TTL,
      })
    } catch {
      return items.map((i) => ({
        ...i,
        sell_price: 0,
        buy_price: 0,
      }))
    }
  }

  return items.map((item) => {
    const prices = priceMap.get(item.type_id)
    return {
      name: item.name,
      type_id: item.type_id,
      quantity: item.quantity,
      sell_price: prices?.average ?? 0,
      buy_price: prices?.adjusted ?? 0,
    }
  })
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

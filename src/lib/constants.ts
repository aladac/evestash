export const TRADE_HUBS = {
  jita: { name: "Jita", regionId: 10000002, systemId: 30000142 },
  amarr: { name: "Amarr", regionId: 10000043, systemId: 30002187 },
  dodixie: { name: "Dodixie", regionId: 10000032, systemId: 30002659 },
  rens: { name: "Rens", regionId: 10000030, systemId: 30002510 },
  hek: { name: "Hek", regionId: 10000042, systemId: 30002053 },
} as const

export type TradeHubKey = keyof typeof TRADE_HUBS
export type HubSelection = TradeHubKey | "universe"

export const ESI_BASE = "https://esi.evetech.net/latest"
export const MAX_CONCURRENT = 20
export const PRICE_CACHE_TTL = 300

export interface ParsedItem {
  name: string
  quantity: number
}

export interface AppraisalItem {
  name: string
  type_id: number
  quantity: number
  sell_price: number
  buy_price: number
  sell_total: number
  buy_total: number
}

export interface AppraisalResponse {
  items: AppraisalItem[]
  totals: { sell: number; buy: number }
  errors: Array<{ name: string; reason: string }>
  hub: string
  cached_at: string
}

export interface AppraisalRequest {
  text: string
  hub: string
}

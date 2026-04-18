import type { ParsedItem } from "./types"

export function parseMultibuy(text: string): ParsedItem[] {
  const lines = text
    .split("\n")
    .map((l) => sanitizeLine(l))
    .filter((l) => l.length > 0)

  const consolidated = new Map<string, number>()

  for (const line of lines) {
    const parsed = parseLine(line)
    if (!parsed) continue

    const key = parsed.name.toLowerCase()
    const existing = consolidated.get(key) ?? 0
    consolidated.set(key, existing + parsed.quantity)
  }

  const results: ParsedItem[] = []
  const nameMap = new Map<string, string>()

  // Preserve original casing from first occurrence
  for (const line of lines) {
    const parsed = parseLine(line)
    if (!parsed) continue
    const key = parsed.name.toLowerCase()
    if (!nameMap.has(key)) {
      nameMap.set(key, parsed.name)
    }
  }

  for (const [key, quantity] of consolidated) {
    results.push({
      name: nameMap.get(key) ?? key,
      quantity,
    })
  }

  return results
}

/**
 * Pre-process a line to handle EVE export formats:
 * - Strip trailing tab/multi-space separated columns (e.g. "Item\t1\t-\t-")
 * - Skip summary lines like "Total:" or empty content
 * - Normalize whitespace
 */
function sanitizeLine(raw: string): string {
  let line = raw.trim()

  // Skip summary/total lines
  if (/^total:/i.test(line)) return ""

  // EVE fitting/inventory export: tab-separated columns
  // Format: "Item Name\tQty\tPrice\tTotal" or with multi-spaces
  // Strip trailing columns that are just "-", "0", or empty
  if (line.includes("\t")) {
    const cols = line.split("\t").map((c) => c.trim())
    // Find the last meaningful column (not "-", "", or "0")
    // Typically: [name, qty, price, total] or [name, qty, -, -]
    const meaningful = cols.filter((c) => c !== "" && c !== "-" && c !== "0")
    if (meaningful.length >= 2) {
      // Name is first col, qty is second col
      return `${cols[0]} ${cols[1]}`
    } else if (meaningful.length === 1) {
      return meaningful[0]
    }
    return ""
  }

  // Same pattern but with multi-space separation (3+ spaces = column separator)
  // e.g. "Damage Control II    1    -    -"
  const multiSpaceParts = line.split(/\s{3,}/).map((c) => c.trim())
  if (multiSpaceParts.length >= 3) {
    const meaningful = multiSpaceParts.filter((c) => c !== "" && c !== "-" && c !== "0")
    if (meaningful.length >= 2) {
      return `${multiSpaceParts[0]} ${multiSpaceParts[1]}`
    } else if (meaningful.length === 1) {
      return meaningful[0]
    }
    return ""
  }

  // Fallback: strip trailing dash-columns with any spacing
  // Handles "Item Name 1 - -" or "Item Name 1 -  -"
  line = line.replace(/(\s+-\s*)+\s*$/, "").trim()

  return line
}

function parseLine(line: string): ParsedItem | null {
  // Format: "Item Name x1000" or "Item Name x 1000"
  const xMatch = line.match(/^(.+?)\s+x\s*(\d[\d,]*)\s*$/i)
  if (xMatch) {
    return {
      name: xMatch[1].trim(),
      quantity: parseQty(xMatch[2]),
    }
  }

  // Format: "1000 Item Name" (quantity first — only if line starts with digits)
  const qtyFirstMatch = line.match(/^(\d[\d,]*)\s+(.+)$/)
  if (qtyFirstMatch) {
    const candidateName = qtyFirstMatch[2].trim()
    // Make sure the "name" part isn't just more numbers
    if (!/^\d+$/.test(candidateName)) {
      return {
        name: candidateName,
        quantity: parseQty(qtyFirstMatch[1]),
      }
    }
  }

  // Format: "Item Name 1000" (quantity last)
  const qtyLastMatch = line.match(/^(.+?)\s+(\d[\d,]*)\s*$/)
  if (qtyLastMatch) {
    return {
      name: qtyLastMatch[1].trim(),
      quantity: parseQty(qtyLastMatch[2]),
    }
  }

  // Implicit quantity 1
  return {
    name: line.trim(),
    quantity: 1,
  }
}

function parseQty(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10) || 1
}

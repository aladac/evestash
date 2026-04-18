import type { AppraisalResponse } from "./lib/types"

const textarea = document.getElementById("cargo-input") as HTMLTextAreaElement
const hubSelect = document.getElementById("hub-select") as HTMLSelectElement
const scanBtn = document.getElementById("scan-btn") as HTMLButtonElement
const resultsSection = document.getElementById("results") as HTMLElement
const resultsBody = document.getElementById("results-body") as HTMLTableSectionElement
const totalsSell = document.getElementById("totals-sell") as HTMLElement
const totalsBuy = document.getElementById("totals-buy") as HTMLElement
const errorsSection = document.getElementById("errors") as HTMLElement
const errorsList = document.getElementById("errors-list") as HTMLElement
const loadingOverlay = document.getElementById("loading") as HTMLElement
const hubLabel = document.getElementById("hub-label") as HTMLElement
const formatToggle = document.getElementById("format-toggle") as HTMLButtonElement
const shareBtn = document.getElementById("share-btn") as HTMLButtonElement
const toast = document.getElementById("toast") as HTMLElement

type FormatMode = "detailed" | "compact" | "human"
const modes: FormatMode[] = ["detailed", "compact", "human"]
const modeLabels: Record<FormatMode, string> = {
  detailed: "Detailed",
  compact: "Compact",
  human: "Human",
}
let modeIndex = initModeFromUrl()
let lastData: AppraisalResponse | null = null
let lastInputText = ""
let currentShareId: string | null = null
let currentShareUrl: string | null = null

// Capacity config — easy to change
const SHARE_CAPACITY = 10_000
const SHARE_TTL_DAYS = 5

function initModeFromUrl(): number {
  const params = new URLSearchParams(window.location.search)
  const fmt = params.get("format")
  if (fmt) {
    const idx = modes.indexOf(fmt as FormatMode)
    if (idx !== -1) return idx
  }
  return 0
}

function initHubFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const hub = params.get("hub")
  if (hub) {
    const opt = hubSelect.querySelector(`option[value="${hub}"]`)
    if (opt) hubSelect.value = hub
  }
}

function updateUrl() {
  const mode = modes[modeIndex]
  const url = new URL(window.location.href)
  if (mode === "detailed") {
    url.searchParams.delete("format")
  } else {
    url.searchParams.set("format", mode)
  }
  if (hubSelect.value === "jita") {
    url.searchParams.delete("hub")
  } else {
    url.searchParams.set("hub", hubSelect.value)
  }
  history.replaceState(null, "", url.toString())
}

initHubFromUrl()

// Set initial button label based on URL state
{
  const nextMode = modes[(modeIndex + 1) % modes.length]
  formatToggle.textContent = modeLabels[nextMode]
}

function formatIsk(value: number): string {
  const mode = modes[modeIndex]
  if (mode === "compact") return formatCompact(value)
  if (mode === "human") return formatHumanWords(value)
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return (value / 1e12).toFixed(2) + "T"
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + "M"
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + "K"
  return value.toFixed(2)
}

function formatHumanWords(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + " trillion"
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + " billion"
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + " million"
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + " thousand"
  return value.toFixed(2)
}

function showToast(msg: string) {
  toast.textContent = msg
  toast.classList.remove("hidden")
  toast.classList.add("show")
  setTimeout(() => {
    toast.classList.remove("show")
    setTimeout(() => toast.classList.add("hidden"), 300)
  }, 2500)
}

formatToggle.addEventListener("click", () => {
  modeIndex = (modeIndex + 1) % modes.length
  const nextMode = modes[(modeIndex + 1) % modes.length]
  formatToggle.textContent = modeLabels[nextMode]
  updateUrl()
  if (lastData) renderResults(lastData)
})

// Share button — save to KV, copy short URL (idempotent per scan)
shareBtn.addEventListener("click", async () => {
  if (!lastInputText) return

  // If we already have a share link for this scan, just re-copy
  if (currentShareUrl) {
    await navigator.clipboard.writeText(currentShareUrl)
    flashShareBtn()
    return
  }

  shareBtn.disabled = true
  try {
    const resp = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastInputText, hub: hubSelect.value }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Failed" }))
      showToast((err as { error: string }).error || "Failed to share")
      return
    }

    const data = (await resp.json()) as { id: string; expires_at: string; remaining: number }
    currentShareId = data.id
    currentShareUrl = `${window.location.origin}/s/${data.id}`
    await navigator.clipboard.writeText(currentShareUrl)
    flashShareBtn()
    showShareInfo(data.expires_at)
    showCapacityBar(data.remaining)
  } catch {
    showToast("Failed to create share link")
  } finally {
    shareBtn.disabled = false
  }
})

async function doAppraise(text: string, hub: string) {
  scanBtn.disabled = true
  loadingOverlay.classList.remove("hidden")
  resultsSection.classList.add("hidden")
  errorsSection.classList.add("hidden")

  try {
    const resp = await fetch("/api/appraise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, hub }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }))
      alert((err as { error: string }).error || "Request failed")
      return
    }

    const data: AppraisalResponse = await resp.json()
    lastData = data
    lastInputText = text
    currentShareId = null
    currentShareUrl = null
    hideShareInfo()
    renderResults(data)
  } catch (e) {
    alert("Network error. Please try again.")
    console.error(e)
  } finally {
    scanBtn.disabled = false
    loadingOverlay.classList.add("hidden")
  }
}

scanBtn.addEventListener("click", () => {
  const text = textarea.value.trim()
  if (!text) return
  doAppraise(text, hubSelect.value)
})

function renderResults(data: AppraisalResponse) {
  resultsBody.innerHTML = ""

  for (const item of data.items) {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td class="cell-name"><span class="name-wrap"><img class="type-icon" src="https://images.evetech.net/types/${item.type_id}/icon?size=32" alt="" loading="lazy"><span>${escapeHtml(item.name)}</span></span></td>
      <td class="cell-qty">${item.quantity.toLocaleString()}</td>
      <td class="cell-isk">${formatIsk(item.sell_price)}</td>
      <td class="cell-isk">${formatIsk(item.buy_price)}</td>
      <td class="cell-isk cell-total">${formatIsk(item.sell_total)}</td>
      <td class="cell-isk cell-total">${formatIsk(item.buy_total)}</td>
    `
    resultsBody.appendChild(tr)
  }

  totalsSell.textContent = formatIsk(data.totals.sell)
  totalsBuy.textContent = formatIsk(data.totals.buy)

  const hubNames: Record<string, string> = {
    jita: "Jita 4-4",
    amarr: "Amarr VIII",
    dodixie: "Dodixie IX",
    rens: "Rens VI",
    hek: "Hek VIII",
    universe: "Universe Average",
  }
  hubLabel.textContent = hubNames[data.hub] ?? data.hub

  resultsSection.classList.remove("hidden")

  if (data.errors.length > 0) {
    errorsList.innerHTML = data.errors
      .map(
        (e) =>
          `<div class="error-item"><span class="error-name">${escapeHtml(e.name)}</span> &mdash; ${escapeHtml(e.reason)}</div>`
      )
      .join("")
    errorsSection.classList.remove("hidden")
  }
}

function flashShareBtn() {
  const original = shareBtn.textContent
  shareBtn.textContent = "Copied!"
  shareBtn.classList.add("btn-success")
  setTimeout(() => {
    shareBtn.textContent = original
    shareBtn.classList.remove("btn-success")
  }, 1500)
}

function showShareInfo(expiresAt: string) {
  const el = document.getElementById("share-info")
  if (!el) return
  const expires = new Date(expiresAt)
  const now = new Date()
  const diffMs = expires.getTime() - now.getTime()
  const days = Math.ceil(diffMs / 86400000)
  const dateStr = expires.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
  el.innerHTML = `<span class="share-link-text">${escapeHtml(currentShareUrl || "")}</span> — expires in ${days} day${days !== 1 ? "s" : ""} (${dateStr})`
  el.classList.remove("hidden")
}

function hideShareInfo() {
  const el = document.getElementById("share-info")
  if (el) el.classList.add("hidden")
  const bar = document.getElementById("capacity-bar")
  if (bar) bar.classList.add("hidden")
}

function showCapacityBar(dailyRemaining: number) {
  const bar = document.getElementById("capacity-bar")
  const fill = document.getElementById("capacity-fill")
  const text = document.getElementById("capacity-text")
  if (!bar || !fill || !text) return

  const dailyLimit = 10 // matches backend DAILY_LIMIT
  const used = dailyLimit - dailyRemaining
  const pct = (dailyRemaining / dailyLimit) * 100

  text.textContent = `${dailyRemaining}/${dailyLimit} shares remaining today`

  fill.style.width = `${pct}%`
  fill.classList.remove("level-green", "level-amber", "level-red")
  if (pct > 50) {
    fill.classList.add("level-green")
  } else if (pct > 20) {
    fill.classList.add("level-amber")
  } else {
    fill.classList.add("level-red")
  }

  bar.classList.remove("hidden")
}

function escapeHtml(s: string): string {
  const div = document.createElement("div")
  div.textContent = s
  return div.innerHTML
}

hubSelect.addEventListener("change", () => updateUrl())

// Allow Ctrl+Enter to scan
textarea.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault()
    scanBtn.click()
  }
})

// Load shared appraisal from /s/:id
async function loadShared() {
  const match = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)$/)
  if (!match) return

  const id = match[1]
  try {
    const resp = await fetch(`/api/share?id=${encodeURIComponent(id)}`)
    if (!resp.ok) {
      showToast("Shared appraisal not found")
      return
    }

    const data = (await resp.json()) as { text: string; hub: string; expires_at?: string }
    textarea.value = data.text
    if (data.hub) {
      const opt = hubSelect.querySelector(`option[value="${data.hub}"]`)
      if (opt) hubSelect.value = data.hub
    }
    currentShareId = id
    currentShareUrl = `${window.location.origin}/s/${id}`
    updateUrl()
    await doAppraise(data.text, data.hub || "jita")
    if (data.expires_at) {
      showShareInfo(data.expires_at)
    }
  } catch {
    showToast("Failed to load shared appraisal")
  }
}

loadShared()

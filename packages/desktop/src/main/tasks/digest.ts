import { mkdir, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app } from "electron"
import { buildDigestMarkdown, digestDateLabel, digestFileName, type DigestQuote } from "./digest-content"
import { isDigestDue } from "./digest-due"

const QUOTES: ReadonlyArray<{ symbol: string; name: string }> = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow" },
  { symbol: "^IXIC", name: "Nasdaq" },
  { symbol: "^RUT", name: "Russell 2000" },
  { symbol: "SLV", name: "Silver (SLV)" },
  { symbol: "GLD", name: "Gold (GLD)" },
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "CL=F", name: "WTI Crude" },
]

const HOUR_MS = 60 * 60 * 1000

async function fetchQuote(symbol: string, name: string): Promise<DigestQuote> {
  let payload: unknown

  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    })

    payload = await response.json()
  } catch {
    return { symbol, name, error: "request failed" }
  }

  // SAFETY: Yahoo JSON is untrusted network input; validate shape explicitly
  // so a short quote list degrades to an error row instead of NaN%.
  // oxlint-disable-next-line anti-slop/require-readable-spacing -- try follows comment per existing style
  try {
    // SAFETY: payload is unknown network JSON; this assertion only reads optional chart.result.
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- see SAFETY above
    const chart = (payload as { chart?: { result?: Array<unknown> } }).chart

    // SAFETY: chart.result[0] is unknown; narrowed by optional chaining and finite-number filter below.
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- see SAFETY above
    const result = chart?.result?.[0] as
      | { meta?: { regularMarketPrice?: unknown }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }
      | undefined

    const rawCloses = result?.indicators?.quote?.[0]?.close ?? []

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above: filters untrusted closes to finite numbers
    const closes = rawCloses.filter((close): close is number => typeof close === "number" && Number.isFinite(close))

    if (closes.length < 2) return { symbol, name, error: "unexpected response shape" }

    const latest = closes[closes.length - 1]
    const previous = closes[closes.length - 2]
    const first = closes[0]
    const metaPrice = result?.meta?.regularMarketPrice

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above: accepts only finite meta price
    const price = typeof metaPrice === "number" && Number.isFinite(metaPrice) ? metaPrice : latest

    if (latest === undefined || previous === undefined || first === undefined || previous === 0 || first === 0)
      return { symbol, name, error: "unexpected response shape" }

    return {
      symbol,
      name,
      price,
      dayPct: 100 * (latest / previous - 1),
      weekPct: 100 * (latest / first - 1),
    }
  } catch {
    return { symbol, name, error: "unexpected response shape" }
  }
}

// A daily Markdown digest is a deliberate file exception to the prefer-sqlite
// rule: it is a human-readable artifact the user opens directly, like a log,
// not queryable app state.
function digestDir(): string {
  return join(app.getPath("userData"), "digests")
}

async function generate() {
  const now = new Date()
  const directory = digestDir()

  await mkdir(directory, { recursive: true })

  const quotes = await Promise.all(QUOTES.map((entry) => fetchQuote(entry.symbol, entry.name)))

  await writeFile(join(directory, digestFileName(now)), buildDigestMarkdown(digestDateLabel(now), quotes))
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function runOnce() {
  if (!isDigestDue({ now: new Date(), existsToday: await fileExists(join(digestDir(), digestFileName())) })) return

  await generate().catch(() => undefined)
}

// Called once the window is up (see main/index.ts): runs a missed digest, then
// re-checks hourly while awake so a day-long session still fires at 08:00.
// Returns a stop function so the caller can clear the hourly timer on hide/quit.
export function runDueDigestTasks(): () => void {
  void runOnce()

  const timer = setInterval(() => void runOnce(), HOUR_MS)

  timer.unref()
  return () => clearInterval(timer)
}

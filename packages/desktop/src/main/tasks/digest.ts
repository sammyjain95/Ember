import { existsSync, mkdirSync, writeFileSync } from "node:fs"
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

  // SAFETY: Yahoo JSON is untrusted network input; the indexed access below is
  // guarded by the surrounding try/catch, and any shape mismatch degrades to
  // an error row in the digest instead of throwing.
  try {
    const result = (payload as { chart: { result: Array<{ meta: { regularMarketPrice: number }; indicators: { quote: Array<{ close: Array<number | null> }> } }> } }).chart.result[0]
    const closes = result.indicators.quote[0].close.filter((close): close is number => close !== null)

    return {
      symbol,
      name,
      price: result.meta.regularMarketPrice ?? closes[closes.length - 1],
      dayPct: 100 * (closes[closes.length - 1] / closes[closes.length - 2] - 1),
      weekPct: 100 * (closes[closes.length - 1] / closes[0] - 1),
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

  mkdirSync(directory, { recursive: true })

  const quotes = await Promise.all(QUOTES.map((entry) => fetchQuote(entry.symbol, entry.name)))

  writeFileSync(join(directory, digestFileName(now)), buildDigestMarkdown(digestDateLabel(now), quotes))
}

function runOnce() {
  if (!isDigestDue({ now: new Date(), existsToday: existsSync(join(digestDir(), digestFileName())) })) return

  void generate().catch(() => undefined)
}

// Called once the window is up (see main/index.ts): runs a missed digest, then
// re-checks hourly while awake so a day-long session still fires at 08:00.
export function runDueDigestTasks() {
  runOnce()

  const timer = setInterval(runOnce, HOUR_MS)

  timer.unref()
}

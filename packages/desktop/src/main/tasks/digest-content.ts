export interface DigestQuote {
  symbol: string
  name: string
  price?: number
  dayPct?: number
  weekPct?: number
  error?: string
}

export function digestFileName(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")

  return `${now.getFullYear()}-${month}-${day}.md`
}

export function digestDateLabel(now = new Date()): string {
  return digestFileName(now).slice(0, 10)
}

function formatRow(quote: DigestQuote): string {
  if (quote.error !== undefined || quote.price === undefined) return `| ${quote.name} | n/a | ${quote.error ?? "unknown error"} | |`

  const day = quote.dayPct ?? 0
  const week = quote.weekPct ?? 0

  return `| ${quote.name} | ${quote.price.toFixed(2)} | ${day >= 0 ? "+" : ""}${day.toFixed(2)}% | ${week >= 0 ? "+" : ""}${week.toFixed(2)}% |`
}

export function buildDigestMarkdown(date: string, quotes: ReadonlyArray<DigestQuote>): string {
  const rows = quotes.map(formatRow).join("\n")

  return `# Markets digest — ${date}\n\n| Instrument | Price | Day | 5-day |\n|---|---|---|---|\n${rows}\n`
}

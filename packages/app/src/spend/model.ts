import type { SessionInfo } from "@opencode/client/promise"

export interface DayBucket {
  key: string
  start: number
  total: number
  count: number
}

const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })

// Boundary parser for untrusted session costs; finite numbers pass, else 0.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser, see above
function cleanAmount(value: unknown): number {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- finite-number boundary check
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function formatMoney(amount: number): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- defensive format guard, see cleanAmount
  return usd.format(typeof amount === "number" && Number.isFinite(amount) ? amount : 0)
}

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)

  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function isToday(timestamp: number, now = Date.now()): boolean {
  return dayKey(timestamp) === dayKey(now)
}

export function isYesterday(timestamp: number, now = Date.now()): boolean {
  const yesterday = new Date(now)

  yesterday.setDate(yesterday.getDate() - 1)

  return dayKey(timestamp) === dayKey(yesterday.getTime())
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { timeStyle: "short" })
}

export function formatDayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

export function bucketByDay(
  sessions: ReadonlyArray<SessionInfo>,
  days: number,
  now = Date.now(),
): Array<DayBucket> {
  const base = new Date(now)

  base.setHours(0, 0, 0, 0)

  // Calendar days, not 24h steps, so a 23h/25h DST day keeps distinct midnights.
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(base)

    date.setDate(base.getDate() - (days - 1 - index))

    const start = date.getTime()

    return { key: dayKey(start), start, total: 0, count: 0 }
  })

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  for (const session of sessions) {
    const bucket = byKey.get(dayKey(session.time.created))

    if (bucket) {
      bucket.total += cleanAmount(session.cost)
      bucket.count += 1
    }
  }

  return buckets
}

export function sumCost(sessions: ReadonlyArray<SessionInfo>): number {
  return sessions.reduce((total, session) => total + cleanAmount(session.cost), 0)
}

export interface ModelBucket {
  provider: string
  model: string
  total: number
  input: number
  output: number
  count: number
}

export function bucketByModel(sessions: ReadonlyArray<SessionInfo>): Array<ModelBucket> {
  const byKey = new Map<string, ModelBucket>()

  for (const session of sessions) {
    const provider = session.model?.providerID ?? "unknown"
    const model = session.model?.id ?? "unknown"
    const key = `${provider}/${model}`
    const bucket = byKey.get(key)
    const total = cleanAmount(session.cost)
    const input = cleanAmount(session.tokens?.input)
    const output = cleanAmount(session.tokens?.output)

    if (bucket) {
      bucket.total += total
      bucket.input += input
      bucket.output += output
      bucket.count += 1
    } else {
      byKey.set(key, {
        provider,
        model,
        total,
        input,
        output,
        count: 1,
      })
    }
  }

  return [...byKey.values()].sort((a, b) => b.total - a.total)
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count)

  const units: Array<[number, string]> = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1000, "K"],
  ]

  for (const [divisor, suffix] of units) {
    if (count >= divisor) {
      const value = count / divisor

      return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10}${suffix}`
    }
  }

  return String(count)
}

export function lookbackCutoff(now: number, days: number): number {
  const date = new Date(now)

  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (days - 1))

  return date.getTime()
}

export function shouldStopPaging(
  oldestCreated: number | undefined,
  next: string | undefined,
  cutoff: number,
): boolean {
  if (!next || oldestCreated === undefined) return true

  return oldestCreated < cutoff
}

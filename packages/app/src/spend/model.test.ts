import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { bucketByDay, bucketByModel, dayKey, formatTokens, isYesterday, lookbackCutoff, shouldStopPaging, startOfDay, sumCost } from "./model"

function session(created: number, cost: number, overrides: Partial<SessionInfo> = {}): SessionInfo {
  // SAFETY: test fixture only; cost/time/fields under test are fully populated, the rest is never read.
  return {
    id: `ses_${created}`,
    projectID: "proj_test",
    cost,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, updated: created },
    location: { directory: "/tmp" },
    ...overrides,
  } as SessionInfo
}

describe("spend aggregation", () => {
  test("buckets sessions by local day with correct dollar totals", () => {
    const now = new Date(2026, 9, 15, 14, 30).getTime()
    const today = startOfDay(now)
    const yesterday = today - 24 * 60 * 60 * 1000

    const sessions = [
      session(today + 3_600_000, 0.42),
      session(today + 7_200_000, 1.08),
      session(yesterday + 3_600_000, 2.5),
      session(yesterday - 20 * 24 * 60 * 60 * 1000, 99.99),
    ]

    const buckets = bucketByDay(sessions, 14, now)

    expect(buckets).toHaveLength(14)
    expect(buckets[13]?.key).toBe(dayKey(now))
    expect(buckets[13]?.total).toBeCloseTo(1.5, 10)
    expect(buckets[13]?.count).toBe(2)
    expect(buckets[12]?.total).toBeCloseTo(2.5, 10)
    expect(buckets[12]?.count).toBe(1)
    expect(buckets[0]?.total).toBe(0)
  })

  test("sums cost across sessions", () => {
    const now = Date.now()
    const sessions = [session(now, 0.1), session(now, 0.2), session(now, 0.3)]

    expect(sumCost(sessions)).toBeCloseTo(0.6, 10)
    expect(sumCost([])).toBe(0)
  })

  test("dayKey is stable for the same local day", () => {
    const morning = new Date(2026, 0, 5, 8, 0).getTime()
    const evening = new Date(2026, 0, 5, 22, 0).getTime()

    expect(dayKey(morning)).toBe(dayKey(evening))
    expect(dayKey(morning)).toBe("2026-01-05")
  })

  test("buckets keep midnight starts across a DST boundary", () => {
    const previousTZ = process.env.TZ

    process.env.TZ = "America/New_York"

    try {
      // Nov 1 2026 is the 25h fall-back day in New York.
      const now = new Date(2026, 10, 2, 12, 0).getTime()
      const buckets = bucketByDay([], 3, now)

      expect(buckets).toHaveLength(3)
      expect(new Set(buckets.map((bucket) => bucket.key))).toHaveLength(3)

      for (const bucket of buckets) {
        expect(bucket.start).toBe(startOfDay(bucket.start))
      }
    } finally {
      if (previousTZ === undefined) delete process.env.TZ
      else process.env.TZ = previousTZ
    }
  })

  test("isYesterday follows the calendar, not 24h ago", () => {
    const previousTZ = process.env.TZ

    process.env.TZ = "America/New_York"

    try {
      // 25h Sunday: yesterday 00:30 is 25h+ before Monday noon, still yesterday.
      const now = new Date(2026, 10, 2, 12, 0).getTime()
      const lateYesterday = new Date(2026, 10, 1, 23, 30).getTime()

      expect(isYesterday(lateYesterday, now)).toBe(true)
      expect(isYesterday(now, now)).toBe(false)
    } finally {
      if (previousTZ === undefined) delete process.env.TZ
      else process.env.TZ = previousTZ
    }
  })

  test("lookbackCutoff lands on a calendar midnight", () => {
    const now = new Date(2026, 9, 15, 14, 30).getTime()

    expect(lookbackCutoff(now, 14)).toBe(startOfDay(new Date(2026, 9, 2, 12, 0).getTime()))
  })

  test("paging stops at the end, on missing data, or before the cutoff", () => {
    expect(shouldStopPaging(undefined, undefined, 100)).toBe(true)
    expect(shouldStopPaging(50, undefined, 100)).toBe(true)
    expect(shouldStopPaging(50, "next", 100)).toBe(true)
    expect(shouldStopPaging(100, "next", 100)).toBe(false)
    expect(shouldStopPaging(150, "next", 100)).toBe(false)
  })

  test("buckets usage by model sorted by cost with token totals", () => {
    const now = Date.now()

    const sessions = [
      session(now, 1.0, { model: { id: "a", providerID: "p1" }, tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } } }),
      session(now, 2.0, { model: { id: "a", providerID: "p1" }, tokens: { input: 200, output: 100, reasoning: 0, cache: { read: 0, write: 0 } } }),
      session(now, 5.0, { model: { id: "b", providerID: "p2" }, tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } }),
      session(now, 0.5),
    ]

    const buckets = bucketByModel(sessions)

    expect(buckets).toHaveLength(3)
    expect(buckets[0]).toMatchObject({ provider: "p2", model: "b", total: 5, count: 1 })
    expect(buckets[1]).toMatchObject({ provider: "p1", model: "a", total: 3, input: 300, output: 150, count: 2 })
    expect(buckets[2]).toMatchObject({ provider: "unknown", model: "unknown" })
    expect(bucketByModel([])).toEqual([])
  })

  test("formats token counts compactly", () => {
    expect(formatTokens(412)).toBe("412")
    expect(formatTokens(1500)).toBe("1.5K")
    expect(formatTokens(2400000)).toBe("2.4M")
    expect(formatTokens(300000000)).toBe("300M")
  })
})

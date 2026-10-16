import { describe, expect, test } from "bun:test"
import { isDigestDue } from "./digest-due"

describe("digest due check", () => {
  const cases = [
    { name: "runs when past 8am and missing", now: new Date(2026, 9, 16, 9, 0), exists: false, want: true },
    { name: "runs exactly at 8am when missing", now: new Date(2026, 9, 16, 8, 0), exists: false, want: true },
    { name: "waits before 8am", now: new Date(2026, 9, 16, 7, 59), exists: false, want: false },
    { name: "never runs twice in one day", now: new Date(2026, 9, 16, 18, 0), exists: true, want: false },
    { name: "early file still blocks a rerun", now: new Date(2026, 9, 16, 6, 0), exists: true, want: false },
  ]

  for (const item of cases) {
    test(item.name, () => {
      expect(isDigestDue({ now: item.now, existsToday: item.exists })).toBe(item.want)
    })
  }
})

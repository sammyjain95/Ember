import { describe, expect, test } from "bun:test"
import { buildDigestMarkdown, digestDateLabel, digestFileName } from "./digest-content"

describe("digest file naming", () => {
  const cases = [
    { name: "zero-pads month and day", now: new Date(2026, 0, 5, 9, 0), want: "2026-01-05.md" },
    { name: "keeps double digits plain", now: new Date(2026, 9, 16, 18, 0), want: "2026-10-16.md" },
    { name: "rolls to the next day after midnight", now: new Date(2026, 9, 17, 0, 5), want: "2026-10-17.md" },
  ]

  for (const item of cases) {
    test(item.name, () => {
      expect(digestFileName(item.now)).toBe(item.want)
      expect(digestDateLabel(item.now)).toBe(item.want.slice(0, 10))
    })
  }
})

describe("digest markdown", () => {
  test("renders quote rows and error rows without stale trade levels", () => {
    const markdown = buildDigestMarkdown("2026-10-16", [
      { symbol: "SLV", name: "Silver (SLV)", price: 51.92, dayPct: 3.39, weekPct: -5.22 },
      { symbol: "BAD", name: "Broken", error: "boom" },
    ])

    expect(markdown).toContain("# Markets digest — 2026-10-16")
    expect(markdown).toContain("| Silver (SLV) | 51.92 | +3.39% | -5.22% |")
    expect(markdown).toContain("| Broken | n/a | boom | |")
    expect(markdown).not.toContain("SLV map:")
  })
})

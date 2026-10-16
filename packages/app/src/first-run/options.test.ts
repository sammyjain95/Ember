import { describe, expect, test } from "bun:test"
import { buildProviderOptions } from "./options"

describe("first-run provider options", () => {
  test("prefers curated providers in presentation order with help links", () => {
    const options = buildProviderOptions([
      { id: "openai", name: "OpenAI" },
      { id: "google", name: "Google" },
      { id: "anthropic", name: "Anthropic" },
      { id: "other", name: "Other" },
    ])

    expect(options.map((option) => option.id)).toEqual(["anthropic", "openai", "google"])
    expect(options[0]?.helpUrl).toContain("anthropic.com")
  })

  test("falls back to the first catalog entries and stays empty when none exist", () => {
    expect(
      buildProviderOptions([
        { id: "b", name: "B" },
        { id: "a", name: "A" },
      ]).map((option) => option.id),
    ).toEqual(["b", "a"])
    expect(buildProviderOptions([])).toEqual([])
  })
})

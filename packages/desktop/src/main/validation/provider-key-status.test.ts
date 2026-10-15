import { describe, expect, test } from "bun:test"
import { classifyProviderKeyStatus, isProviderKeyInput } from "./provider-key-status"

describe("provider key validation", () => {
  test("rejects malformed IPC input without probing", () => {
    expect(isProviderKeyInput(null)).toBe(false)
    expect(isProviderKeyInput({})).toBe(false)
    expect(isProviderKeyInput({ providerID: "openai", key: "" })).toBe(false)
    expect(isProviderKeyInput({ providerID: "openai", key: "sk-x" })).toBe(true)
  })

  test("maps provider status codes without blocking on inconclusive responses", () => {
    expect(classifyProviderKeyStatus(401)).toEqual({ valid: false, reason: "invalid_key" })
    expect(classifyProviderKeyStatus(403)).toEqual({ valid: false, reason: "invalid_key" })
    expect(classifyProviderKeyStatus(200)).toEqual({ valid: true })
    expect(classifyProviderKeyStatus(429)).toEqual({ valid: true })
    expect(classifyProviderKeyStatus(500)).toEqual({ valid: false, reason: "unreachable" })
  })
})

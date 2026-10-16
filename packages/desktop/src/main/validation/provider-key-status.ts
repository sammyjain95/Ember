export type ProviderKeyReason = "invalid_key" | "unreachable" | "unsupported"

export interface ProviderKeyVerdict {
  valid: boolean
  reason?: ProviderKeyReason
}

export function isProviderKeyInput(input: unknown): input is { providerID: string; key: string } {
  // SAFETY: Electron delivers untrusted IPC arguments; the checks below establish the complete
  // contract before use: a non-null object whose providerID and key are both non-empty strings.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
  if (typeof input !== "object" || input === null) return false
  // SAFETY: the typeof guard above established input as a non-null object.
  const { providerID, key } = input as { providerID?: unknown; key?: unknown }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
  return typeof providerID === "string" && typeof key === "string" && key.length > 0
}

export function classifyProviderKeyStatus(status: number): ProviderKeyVerdict {
  // 401/403 means the provider rejected the key. Anything else below 500
  // means the key was accepted (even 429: rate-limited, not invalid).
  if (status === 401 || status === 403) return { valid: false, reason: "invalid_key" }

  if (status < 500) return { valid: true }

  return { valid: false, reason: "unreachable" }
}

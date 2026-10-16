import { Show, createMemo, createResource, For } from "solid-js"

import { useServerSDK } from "@/runtime/server/client"

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })

function totalTokens(tokens: any): number {
  if (!tokens) return 0
  return (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
}

export function HomeTokenUsage() {
  const sdk = useServerSDK()

  const [stats] = createResource(
    () => sdk.connection.status() === "connected",
    () =>
      sdk.api.session
        .stats({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          tools: "none",
        })
        .catch(() => undefined),
  )

  const models = createMemo(() => {
    const list = stats()?.models ?? []
    return [...list]
      .map((entry: any) => ({
        providerID: entry.model?.providerID ?? "unknown",
        id: entry.model?.id ?? "unknown",
        steps: entry.steps ?? 0,
        cost: entry.cost ?? 0,
        tokens: totalTokens(entry.tokens),
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6)
  })

  const total = createMemo(() => (stats()?.tokens ? totalTokens(stats()!.tokens) : 0))

  return (
    <Show when={sdk.connection.status() === "connected"}>
      <section class="flex min-w-0 flex-col gap-2 rounded-[10px] bg-v2-background-bg-layer-01 p-4 shadow-[var(--v2-elevation-raised)]">
        <div class="flex items-center justify-between">
          <span class="text-13-medium [font-weight:530]">Token usage by model</span>
          <span class="text-11-regular text-v2-text-text-muted">{compact.format(total())} total</span>
        </div>
        <Show when={stats.loading}>
          <span class="text-11-regular text-v2-text-text-muted">Loading usage…</span>
        </Show>
        <Show when={!stats.loading && models().length === 0}>
          <span class="text-11-regular text-v2-text-text-muted">No token usage recorded yet.</span>
        </Show>
        <div class="flex min-w-0 flex-col gap-1">
          <For each={models()}>
            {(entry) => {
              const share = total() ? (entry.tokens / total()) * 100 : 0
              return (
                <div class="flex min-w-0 items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-11-medium text-v2-text-text-base capitalize">
                      {entry.id}
                    </div>
                    <div class="text-10-regular text-v2-text-text-muted">
                      {entry.providerID} · {compact.format(entry.tokens)} tokens · {money.format(entry.cost)}
                    </div>
                  </div>
                  <span class="shrink-0 text-10-regular text-v2-text-text-muted">{share.toFixed(0)}%</span>
                </div>
              )
            }}
          </For>
        </div>
      </section>
    </Show>
  )
}

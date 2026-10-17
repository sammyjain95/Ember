import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"

import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })

const MAX_COLLAPSED_MODELS = 6

interface TokenTotals {
  input?: unknown
  output?: unknown
  reasoning?: unknown
  cache?: { read?: unknown; write?: unknown }
}

// Boundary parser for untrusted session stats; callers pass through, no revalidation downstream.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: unknown in, finite number out
function cleanCount(value: unknown): number {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary finite-number check, see above
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function totalTokens(tokens: TokenTotals | undefined | null): number {
  if (!tokens) return 0

  return (
    cleanCount(tokens.input) +
    cleanCount(tokens.output) +
    cleanCount(tokens.reasoning) +
    cleanCount(tokens.cache?.read) +
    cleanCount(tokens.cache?.write)
  )
}

interface ModelEntry {
  model?: { providerID?: unknown; id?: unknown }
  steps?: unknown
  cost?: unknown
  tokens?: TokenTotals | null
}

export function HomeTokenUsage() {
  const sdk = useServerSDK()
  const language = useLanguage()
  const [state, setState] = createStore({ expanded: false })

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
    const list: ReadonlyArray<ModelEntry> = stats()?.models ?? []

    return [...list]
      .map((entry) => ({
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary string check for untrusted model IDs
        providerID: typeof entry.model?.providerID === "string" ? entry.model.providerID : "unknown",
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary string check, see above
        id: typeof entry.model?.id === "string" ? entry.model.id : "unknown",
        steps: cleanCount(entry.steps),
        cost: cleanCount(entry.cost),
        tokens: totalTokens(entry.tokens),
      }))
      .sort((a, b) => b.tokens - a.tokens)
  })

  const visibleModels = createMemo(() => {
    const all = models()
    return state.expanded ? all : all.slice(0, MAX_COLLAPSED_MODELS)
  })

  const total = createMemo(() => {
    const snapshot = stats()

    if (!snapshot?.tokens) return 0

    return totalTokens(snapshot.tokens)
  })

  const toggle = () => {
    setState("expanded", !state.expanded)
  }

  const canToggle = models().length > MAX_COLLAPSED_MODELS

  return (
    <Show when={sdk.connection.status() === "connected"}>
      <section class="flex min-w-0 flex-col gap-2 rounded-[10px] bg-v2-background-bg-layer-01 p-4 shadow-[var(--v2-elevation-raised)]">
        <div class="flex items-center justify-between">
          <span class="text-13-medium [font-weight:530]">{language.t("home.tokenUsage.title")}</span>
          <div class="flex items-center gap-2">
            <span class="text-11-regular text-v2-text-text-muted">
              {language.t("home.tokenUsage.total", { total: compact.format(total()) })}
            </span>
            <Show when={canToggle}>
              <IconButton
                type="button"
                variant="ghost-muted"
                size="small"
                class="text-v2-icon-icon-muted"
                icon={
                  <Icon
                    name="chevron-down"
                    size="small"
                    class="transition-transform duration-150 ease-in-out"
                    style={{ transform: `rotate(${state.expanded ? 0 : -90}deg)` }}
                  />
                }
                aria-label={
                  state.expanded
                    ? language.t("home.tokenUsage.collapse")
                    : language.t("home.tokenUsage.expand")
                }
                aria-expanded={state.expanded}
                onClick={toggle}
              />
            </Show>
          </div>
        </div>
        <Show when={stats.loading}>
          <span class="text-11-regular text-v2-text-text-muted">{language.t("home.tokenUsage.loading")}</span>
        </Show>
        <Show when={!stats.loading && models().length === 0}>
          <span class="text-11-regular text-v2-text-text-muted">{language.t("home.tokenUsage.empty")}</span>
        </Show>
        <div class="flex min-w-0 flex-col gap-1">
          <For each={visibleModels()}>
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

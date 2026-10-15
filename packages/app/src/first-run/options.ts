export interface ProviderOption {
  id: string
  name: string
  helpUrl?: string
}

interface CatalogEntry {
  id: string
  name: string
}

const CURATED = [
  { id: "anthropic", helpUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", helpUrl: "https://platform.openai.com/api-keys" },
  { id: "google", helpUrl: "https://aistudio.google.com/apikey" },
]

export function buildProviderOptions(list: ReadonlyArray<CatalogEntry>): Array<ProviderOption> {
  const curated = CURATED.flatMap((entry) => {
    const found = list.find((item) => item.id === entry.id)

    return found ? [{ id: found.id, name: found.name, helpUrl: entry.helpUrl }] : []
  })

  if (curated.length > 0) return curated

  return list.slice(0, 3).map((item) => ({ id: item.id, name: item.name }))
}

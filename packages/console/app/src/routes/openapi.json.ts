export async function GET() {
  const response = await fetch(
    "https://raw.githubusercontent.com/sammyjain95/Ember/refs/heads/dev/packages/protocol/openapi.json",
  )
  const json = await response.json()
  return json
}

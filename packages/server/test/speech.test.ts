import { expect } from "bun:test"
import { Speech } from "@opencode/core/speech"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Effect, Layer, Predicate } from "effect"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

let captured: Speech.SpeechInput | undefined
const speech = makeLocationNode({
  service: Speech.Service,
  layer: Layer.succeed(
    Speech.Service,
    Speech.Service.of({
      generate: (input) =>
        Effect.gen(function* () {
          captured = input
          if (input.text === "fail-selection") return yield* new Speech.ModelSelectionError({ message: "nope" })
          if (input.text === "fail-unavailable") return yield* new Speech.UnavailableError({ message: "down" })
          return { bytes: Uint8Array.from([1, 2, 3]), mediaType: "audio/mpeg" }
        }),
    }),
  ),
  deps: [],
})

const makeHandler = ServerFetch.make(
  {
    database: { path: ":memory:" },
    fs: { filewatcher: false },
    models: { fetch: false },
  },
  { overrides: [Speech.node.replace(speech)] },
)

it.live("returns speech audio through the base configuration", () =>
  Effect.gen(function* () {
    const handler = yield* makeHandler
    const response = yield* request(handler, { text: "Hi", voice: "echo", format: "mp3" })

    expect(response.status).toBe(200)
    expect(captured?.text).toBe("Hi")
    expect(captured?.voice).toBe("echo")
    expect(captured?.format).toBe("mp3")
    expect(captured?.model).toBeUndefined()
    const body: unknown = yield* Effect.promise(() => response.json())
    if (!Predicate.isObject(body) || !Predicate.isObject(body.data)) throw new Error("Expected a speech response")
    expect(body.data.mediaType).toBe("audio/mpeg")
    expect(Array.from(Buffer.from(body.data.audio as string, "base64"))).toEqual([1, 2, 3])
  }),
)

it.live("maps speech failures onto request and availability errors", () =>
  Effect.gen(function* () {
    const handler = yield* makeHandler
    expect((yield* request(handler, { text: "fail-selection" })).status).toBe(400)
    expect((yield* request(handler, { text: "fail-unavailable" })).status).toBe(503)
  }),
)

function request(
  handler: (request: Request) => Promise<Response>,
  payload: { text: string; voice?: string; format?: string },
) {
  return Effect.promise(() =>
    handler(
      new Request(new URL("http://opencode.local/api/speech"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  )
}

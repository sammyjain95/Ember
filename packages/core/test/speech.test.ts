import { expect } from "bun:test"
import { Media, SpeechClient, SpeechResponse } from "@opencode/ai"
import { RequestExecutor } from "@opencode/ai/route"
import { Document, Info as ConfigInfo, type Entry as ConfigEntry } from "@opencode/schema/config"
import { Config } from "@opencode/core/config"
import { Integration } from "@opencode/core/integration"
import { ID, Info, Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Speech } from "@opencode/core/speech"
import { SpeechResolver } from "@opencode/core/speech-resolver"
import { Npm } from "@opencode/util/npm"
import { Effect, Layer, Schema, Stream } from "effect"
import { testEffect } from "./lib/effect"

const selected = Info.make({
  ...Info.default(Provider.ID.make("openrouter"), ID.make("fish-audio-tts")),
  package: "@opencode/ai/providers/openrouter",
  modelID: ID.make("fish-audio/s2.1-pro-free"),
})

const speechInfo = Schema.decodeUnknownSync(ConfigInfo)({
  speech: { model: "openrouter/fish-audio-tts", voice: "echo", format: "mp3" },
})
const speechEntries = [new Document({ type: "document", info: speechInfo })]

const config = (entries: readonly ConfigEntry[]) =>
  Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () => Effect.succeed(Array.from(entries)),
      changes: () => Stream.never,
    }),
  )
const providers = Layer.mock(Provider.Service, {
  get: () => Effect.undefined,
})
const models = Layer.mock(Model.Service, {
  get: () => Effect.succeed(selected),
})
const integrations = Layer.mock(Integration.Service, {
  revision: () => 0,
  connection: {
    active: () => Effect.undefined,
    resolve: () => Effect.die("unused"),
    key: () => Effect.die("unused"),
    external: () => Effect.die("unused"),
    activate: () => Effect.die("unused"),
    update: () => Effect.die("unused"),
    remove: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
  },
  oauth: {
    connect: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
    complete: () => Effect.die("unused"),
    cancel: () => Effect.die("unused"),
  },
  command: {
    connect: () => Effect.die("unused"),
    status: () => Effect.die("unused"),
    cancel: () => Effect.die("unused"),
  },
})
const npm = Layer.mock(Npm.Service, {
  add: () => Effect.die("unused"),
  which: () => Effect.die("unused"),
})
const executor = Layer.mock(RequestExecutor.Service, {
  execute: () => Effect.die("unused"),
})

const audio = Media.bytes(Uint8Array.from([1, 2, 3]), "audio/mpeg")
const response = new SpeechResponse({ audio })
let captured: { model: string; text: string; voice: unknown; format: unknown } | undefined
const client = Layer.mock(SpeechClient.Service, {
  generate: (request) =>
    Effect.gen(function* () {
      captured = { model: request.model.id, text: request.text, voice: request.voice, format: request.format }
      return response
    }),
})

const resolver = (entries: readonly ConfigEntry[]) =>
  SpeechResolver.layer.pipe(Layer.provide(Layer.mergeAll(config(entries), providers, models, integrations, npm)))
const it = testEffect(Speech.layer.pipe(Layer.provide(Layer.mergeAll(resolver(speechEntries), client, executor))))
const resolverIt = testEffect(resolver(speechEntries))
const emptyIt = testEffect(
  Speech.layer.pipe(
    Layer.provide(Layer.mergeAll(resolver([]), client, executor)),
  ),
)

it.effect("generates speech audio through the configured model", () =>
  Effect.gen(function* () {
    const speech = yield* Speech.Service
    const result = yield* speech.generate({ text: "Hi" })

    expect(result.mediaType).toBe("audio/mpeg")
    expect(result.bytes).toEqual(Uint8Array.from([1, 2, 3]))
    expect(captured).toEqual({ model: "fish-audio/s2.1-pro-free", text: "Hi", voice: "echo", format: "mp3" })
  }),
)

it.effect("prefers per-request voice and format over configured defaults", () =>
  Effect.gen(function* () {
    const speech = yield* Speech.Service
    yield* speech.generate({ text: "Hi", voice: "alloy", format: "wav" })

    expect(captured).toMatchObject({ voice: "alloy", format: "wav" })
  }),
)

resolverIt.effect("resolves the configured speech model with its provider identity", () =>
  Effect.gen(function* () {
    const resolver = yield* SpeechResolver.Service
    const result = yield* resolver.resolve()

    expect(result?.providerID).toBe(Provider.ID.make("openrouter"))
    expect(result?.modelID).toBe("fish-audio/s2.1-pro-free")
    expect(result?.voice).toBe("echo")
    expect(result?.format).toBe("mp3")
    expect(result?.model.route.id).toBe("openrouter-speech")
  }),
)

emptyIt.effect("reports a missing speech model instead of failing", () =>
  Effect.gen(function* () {
    const speech = yield* Speech.Service
    const error = yield* speech.generate({ text: "Hi" }).pipe(Effect.flip)

    expect(error._tag).toBe("Speech.ModelSelectionError")
  }),
)

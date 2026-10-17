export * as Speech from "./speech.js"

import { Speech as AISpeech, SpeechClient, type AIError } from "@opencode/ai"
import { RequestExecutor } from "@opencode/ai/route"
import { SessionID } from "@opencode/schema/session-id"
import { ConfigModel } from "@opencode/schema/config/model"
import { Context, Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { requestExecutor, speechClient } from "./effect/app-node-platform.js"
import { SpeechResolver } from "./speech-resolver.js"

export interface SpeechInput {
  readonly text: string
  readonly voice?: string
  readonly format?: string
  readonly model?: ConfigModel.Selection
}

export interface GeneratedSpeech {
  readonly bytes: Uint8Array
  readonly mediaType: string
}

export class ModelSelectionError extends Schema.TaggedError<ModelSelectionError>()("Speech.ModelSelectionError", {
  message: Schema.String,
}) {}

export class UnavailableError extends Schema.TaggedError<UnavailableError>()("Speech.UnavailableError", {
  message: Schema.String,
  service: Schema.optional(Schema.String),
}) {}

export type Error = ModelSelectionError | UnavailableError

export interface Interface {
  readonly generate: (input: SpeechInput) => Effect.Effect<GeneratedSpeech, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Speech") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const client = yield* SpeechClient.Service
    const resolver = yield* SpeechResolver.Service
    const executor = yield* RequestExecutor.Service

    const runGenerate = Effect.fn("Speech.generate")(function* (input: SpeechInput) {
      const resolved = yield* resolver.resolve(input.model).pipe(
        Effect.catchTag(
          [
            "SessionRunnerModel.VariantUnavailableError",
            "SpeechResolver.UnsupportedPackageError",
            "SpeechResolver.ModelConfigurationError",
            "SpeechResolver.ModelInitializationError",
            "SpeechResolver.UnresolvedProviderVariablesError",
          ],
          (error) => {
            const mapped: Error = input.model
              ? new ModelSelectionError({ message: error.message })
              : new UnavailableError({ message: error.message, service: error.providerID })
            return Effect.fail(mapped)
          },
        ),
      )
      if (!resolved)
        return yield* new ModelSelectionError({
          message: input.model
            ? `Speech model unavailable: ${input.model.providerID}/${input.model.model}`
            : `No speech model configured (set "speech.model" to a "providerID/model" selection)`,
        })
      const response = yield* client
        .generate(
          AISpeech.request({
            model: resolved.model,
            text: input.text,
            voice: input.voice ?? resolved.voice,
            format: input.format ?? resolved.format,
            // Gateways require session attribution even for a stateless call; no Session is stored.
            http: { headers: { "x-opencode-session": SessionID.create() } },
          }),
        )
        .pipe(
          Effect.mapError(
            (error: AIError) =>
              new UnavailableError({
                message: error.message,
                service: resolved.providerID,
              }),
          ),
        )
      const bytes = yield* response.audio.bytes().pipe(
        Effect.provideService(RequestExecutor.Service, executor),
        Effect.mapError(
          (error: AIError) =>
            new UnavailableError({
              message: error.message,
              service: resolved.providerID,
            }),
        ),
      )
      return { bytes, mediaType: response.audio.mediaType }
    })

    const generate: Interface["generate"] = (input) =>
      runGenerate(input).pipe(
        Effect.catchTag(
          "Integration.Authorization",
          () =>
            new UnavailableError({
              message: "Speech credentials are unavailable",
            }),
        ),
      )

    return Service.of({ generate })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [SpeechResolver.node, speechClient, requestExecutor],
})

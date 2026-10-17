import { Speech } from "@opencode/core/speech"
import { Location } from "@opencode/core/location"
import { LocationServiceMap } from "@opencode/core/location-services"
import { AbsolutePath } from "@opencode/core/schema"
import { InvalidRequestError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, locationErrors } from "../location"

export const SpeechHandler = HttpApiBuilder.group(Api, "server.speech", (handlers) =>
  Effect.gen(function* () {
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    const services = locations.get(Location.Ref.make({ directory: AbsolutePath.make(global.config) }))
    return handlers.handle(
      "speech.generate",
      Effect.fn("server.speech.generate")(
        function* (request) {
          yield* awaitPlugins
          const speech = yield* Speech.Service
          const result = yield* speech
            .generate({
              text: request.payload.text,
              voice: request.payload.voice,
              format: request.payload.format,
              model: request.payload.model && {
                providerID: request.payload.model.providerID,
                model: request.payload.model.id,
                ...(request.payload.model.variant === undefined
                  ? {}
                  : { variant: request.payload.model.variant }),
              },
            })
            .pipe(
              Effect.mapError((error) =>
                error._tag === "Speech.ModelSelectionError"
                  ? new InvalidRequestError({ message: error.message })
                  : new ServiceUnavailableError({ message: error.message, service: error.service }),
              ),
            )
          return { data: { audio: result.bytes, mediaType: result.mediaType } }
        },
        Effect.provide(services),
        locationErrors,
      ),
    )
  }),
)

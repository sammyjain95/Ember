import { Model } from "@opencode/schema/model"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { LocationNotFoundError, InvalidRequestError, ServiceUnavailableError } from "../errors.js"

export const SpeechGroup = HttpApiGroup.make("server.speech")
  .add(
    HttpApiEndpoint.post("speech.generate", "/api/speech", {
      payload: Schema.Struct({
        text: Schema.String,
        voice: Schema.String.pipe(Schema.optional),
        format: Schema.String.pipe(Schema.optional),
        model: Model.Ref.pipe(Schema.optional),
      }),
      success: Schema.Struct({
        data: Schema.Struct({
          audio: Schema.Uint8ArrayFromBase64,
          mediaType: Schema.String,
        }),
      }).annotate({ identifier: "SpeechGenerateResponse" }),
      error: [InvalidRequestError, ServiceUnavailableError, LocationNotFoundError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "speech.generate",
        summary: "Generate speech",
        description:
          "Run one stateless text-to-speech generation using the server's base configuration and return the audio bytes. Uses the base configuration's speech model when none is specified.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "speech",
      description: "One-shot text-to-speech routes.",
    }),
  )

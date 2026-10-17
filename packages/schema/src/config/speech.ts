export * as ConfigSpeech from "./speech.js"

import { Schema } from "effect"
import { optional } from "../schema.js"
import { ConfigModel } from "./model.js"

export class Info extends Schema.Class<Info>("Config.Speech")({
  model: ConfigModel.Selection.pipe(optional),
  voice: Schema.String.pipe(optional),
  format: Schema.String.pipe(optional),
}) {}

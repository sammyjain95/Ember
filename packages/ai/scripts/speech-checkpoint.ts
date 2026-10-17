// Phase 1 checkpoint: proves fish-audio synthesizes real audio through OpenRouter.
//
// Run with your key:
//   OPENROUTER_API_KEY=sk-or-... bun scripts/speech-checkpoint.ts
//
// Writes /tmp/openrouter-speech.mp3 and prints its size.

import { Speech } from "../src/index.js"
import { OpenRouter } from "../src/providers.js"
import { Effect } from "effect"

const apiKey = process.env.OPENROUTER_API_KEY
if (apiKey === undefined) {
  console.error("Set OPENROUTER_API_KEY first.")
  process.exit(1)
}

const model = OpenRouter.configure({ apiKey }).speech("fish-audio/s2.1-pro-free")
const out = "/tmp/openrouter-speech.mp3"

const program = Effect.gen(function* () {
  const response = yield* Speech.generate({
    model,
    text: "Hello from OpenCode. Text to speech wiring is alive.",
    voice: process.env.SPEECH_VOICE ?? "b347db033a6549378b48d00acb0d06cd",
    format: "mp3",
  })
  const bytes = yield* response.audio.bytes()
  yield* Effect.promise(() => Bun.write(out, bytes))
  console.log(`wrote ${bytes.length} bytes to ${out} (mediaType: ${response.audio.mediaType})`)
}).pipe(Effect.scoped, Effect.exit)

const exit = await Effect.runPromise(program)
if (exit._tag === "Failure") {
  console.error("speech checkpoint failed:", exit.cause)
  process.exit(1)
}

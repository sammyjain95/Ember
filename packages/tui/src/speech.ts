import { spawn } from "node:child_process"
import { rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const extensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/pcm": "pcm",
}

export const extensionFor = (mediaType: string): string => extensions[mediaType.toLowerCase()] ?? "bin"

export interface Playback {
  readonly command: string
  readonly args: ReadonlyArray<string>
}

/** Ordered playback candidates; the first that spawns successfully wins. */
export const playersFor = (platform: NodeJS.Platform, file: string): ReadonlyArray<Playback> => {
  if (platform === "darwin") return [{ command: "afplay", args: [file] }]
  if (platform === "win32")
    return [
      {
        command: "powershell",
        args: ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${file}').PlaySync()`],
      },
    ]
  return [
    { command: "ffplay", args: ["-nodisp", "-autoexit", file] },
    { command: "mpv", args: ["--no-video", file] },
    { command: "aplay", args: [file] },
    { command: "paplay", args: [file] },
  ]
}

/** Writes speech audio to a temp file and plays it through a system player. */
export async function playAudio(bytes: Uint8Array, mediaType: string): Promise<void> {
  const file = path.join(os.tmpdir(), `opencode-speech-${Date.now()}.${extensionFor(mediaType)}`)
  await writeFile(file, bytes)
  try {
    await playFile(file)
  } finally {
    await rm(file, { force: true }).catch(() => {})
  }
}

const playFile = async (file: string): Promise<void> => {
  const players = playersFor(process.platform, file)
  if (players.length === 0) throw new Error(`No audio player available for ${process.platform}`)
  let lastError: unknown
  for (const player of players) {
    try {
      await playWith(player)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

const playWith = (player: Playback): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(player.command, [...player.args], { stdio: "ignore" })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve()
      reject(new Error(`Audio playback failed (${player.command} exited with ${signal ? `signal ${signal}` : `code ${code}`})`))
    })
  })

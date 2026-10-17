import { describe, expect, test } from "bun:test"
import { extensionFor, playersFor } from "../src/speech"

describe("speech playback", () => {
  test("maps audio media types onto file extensions", () => {
    expect(extensionFor("audio/mpeg")).toBe("mp3")
    expect(extensionFor("audio/wav")).toBe("wav")
    expect(extensionFor("audio/ogg")).toBe("ogg")
    expect(extensionFor("audio/aac")).toBe("aac")
    expect(extensionFor("audio/flac")).toBe("flac")
    expect(extensionFor("AUDIO/MPEG")).toBe("mp3")
    expect(extensionFor("application/octet-stream")).toBe("bin")
  })

  test("selects afplay on macOS", () => {
    expect(playersFor("darwin", "/tmp/speech.mp3")).toEqual([{ command: "afplay", args: ["/tmp/speech.mp3"] }])
  })

  test("prefers desktop players with CLI fallbacks on Linux", () => {
    const players = playersFor("linux", "/tmp/speech.mp3")
    expect(players[0]).toEqual({ command: "ffplay", args: ["-nodisp", "-autoexit", "/tmp/speech.mp3"] })
    expect(players.map((player) => player.command)).toEqual(["ffplay", "mpv", "aplay", "paplay"])
  })

  test("plays WAV through PowerShell on Windows", () => {
    const players = playersFor("win32", "C:\\Temp\\speech.wav")
    expect(players).toHaveLength(1)
    expect(players[0]?.command).toBe("powershell")
  })
})

import { EOL } from "node:os"
import { readFile } from "node:fs/promises"
import { Effect } from "effect"
import { parse, type ParseError } from "jsonc-parser"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { resolveConfigPath } from "../mcp/add"

export default Runtime.handler(
  Commands.commands.skill.commands.list,
  Effect.fn("cli.skill.list")(function* (input) {
    const global = yield* Global.Service
    const configPath = yield* Effect.promise(() => resolveConfigPath(input.global ? global.config : process.cwd()))
    const skills = yield* Effect.promise(() => readSkills(configPath))
    if (skills.length === 0) {
      process.stdout.write("No skills configured" + EOL)
      return
    }
    for (const skill of skills) process.stdout.write(skill + EOL)
  }),
)

async function readSkills(configPath: string): Promise<string[]> {
  const text = await readFile(configPath, "utf8").catch((error) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return "{}"
    throw error
  })
  const errors: ParseError[] = []
  const config: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof config !== "object" || config === null || Array.isArray(config)) return []
  const skills = "skills" in config ? config.skills : undefined
  if (!Array.isArray(skills)) return []
  return skills.map((entry) => {
    if (typeof entry === "string") return entry
    if (typeof entry === "object" && entry !== null && "path" in entry && typeof entry.path === "string")
      return entry.path
    return String(entry)
  })
}

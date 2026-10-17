import { EOL } from "node:os"
import { readFile, rename, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { resolveConfigPath } from "../mcp/add"

export default Runtime.handler(
  Commands.commands.skill.commands.remove,
  Effect.fn("cli.skill.remove")(function* (input) {
    const global = yield* Global.Service
    const configPath = yield* Effect.promise(() => resolveConfigPath(input.global ? global.config : process.cwd()))
    const removed = yield* Effect.promise(() => removeSkillConfig(configPath, input.path))
    process.stdout.write(
      removed
        ? `Skill "${input.path}" removed from ${configPath}${EOL}`
        : `Skill "${input.path}" is not configured${EOL}`,
    )
  }),
)

async function removeSkillConfig(configPath: string, spec: string): Promise<boolean> {
  const text = await readFile(configPath, "utf8").catch((error) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (text === undefined) return false
  const errors: ParseError[] = []
  const config: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof config !== "object" || config === null || Array.isArray(config))
    throw new Error(`Invalid global configuration: ${configPath}`)
  const skills = "skills" in config ? config.skills : undefined
  if (skills !== undefined && !Array.isArray(skills)) throw new Error(`Invalid skills configuration: ${configPath}`)
  if (!configured(skills, spec)) return false

  const updated = applyEdits(
    text,
    modify(
      text,
      ["skills"],
      skills?.filter((entry) => !matches(entry, spec)),
      {
        formattingOptions: { tabSize: 2, insertSpaces: true },
      },
    ),
  )
  const temporary = configPath + ".tmp"
  await writeFile(temporary, updated.endsWith("\n") ? updated : updated + "\n", { mode: 0o600 })
  await rename(temporary, configPath)
  return true
}

function configured(skills: readonly unknown[] | undefined, spec: string) {
  return skills?.some((entry) => matches(entry, spec)) ?? false
}

function matches(entry: unknown, spec: string) {
  return entry === spec || (typeof entry === "object" && entry !== null && "path" in entry && entry.path === spec)
}

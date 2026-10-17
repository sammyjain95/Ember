import { EOL } from "node:os"
import path from "node:path"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { resolveConfigPath } from "../mcp/add"

export default Runtime.handler(
  Commands.commands.skill.commands.add,
  Effect.fn("cli.skill.add")(function* (input) {
    const global = yield* Global.Service
    const configPath = yield* Effect.promise(() => resolveConfigPath(input.global ? global.config : process.cwd()))
    const changed = yield* Effect.promise(() => writeSkillConfig(configPath, input.path))
    process.stdout.write(
      changed
        ? `Skill "${input.path}" added to ${configPath}${EOL}`
        : `Skill "${input.path}" is already configured in ${configPath}${EOL}`,
    )
  }),
)

async function writeSkillConfig(configPath: string, spec: string): Promise<boolean> {
  const text = await readFile(configPath, "utf8").catch((error) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return "{}"
    throw error
  })
  const errors: ParseError[] = []
  const config: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof config !== "object" || config === null || Array.isArray(config))
    throw new Error(`Invalid global configuration: ${configPath}`)
  const skills = "skills" in config ? config.skills : undefined
  if (skills !== undefined && !Array.isArray(skills)) throw new Error(`Invalid skills configuration: ${configPath}`)
  if (configured(skills, spec)) return false

  const updated = applyEdits(
    text,
    modify(text, ["skills"], [...(skills ?? []), spec], { formattingOptions: { tabSize: 2, insertSpaces: true } }),
  )
  await mkdir(path.dirname(configPath), { recursive: true })
  const temporary = configPath + ".tmp"
  await writeFile(temporary, updated.endsWith("\n") ? updated : updated + "\n", { mode: 0o600 })
  await rename(temporary, configPath)
  return true
}

function configured(skills: readonly unknown[] | undefined, spec: string) {
  return skills?.some(
    (entry) =>
      entry === spec || (typeof entry === "object" && entry !== null && "path" in entry && entry.path === spec),
  )
}

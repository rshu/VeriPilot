import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Milestone } from "./types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT = path.resolve(HERE, "..", "milestones.json")

/** Load + validate the milestone plan. Pass `data` to validate an in-memory plan. */
export function loadMilestones(data?: { milestones: Milestone[] }): Milestone[] {
  const parsed = data ?? (JSON.parse(readFileSync(DEFAULT, "utf8")) as { milestones: Milestone[] })
  const ms = parsed.milestones
  const ids = new Set(ms.map((m) => m.id))
  for (const m of ms) {
    if (!m.acceptance || m.acceptance.length === 0) throw new Error(`milestone ${m.id} has no acceptance items`)
    const seen = new Set<string>()
    for (const a of m.acceptance) {
      if (seen.has(a.id)) throw new Error(`milestone ${m.id} duplicate acceptance id ${a.id}`)
      seen.add(a.id)
    }
    for (const d of m.deps) if (!ids.has(d)) throw new Error(`milestone ${m.id} dep ${d} is not a milestone`)
  }
  return ms
}

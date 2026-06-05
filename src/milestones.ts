import { readFileSync } from "node:fs"
import type { Milestone } from "./types.ts"

const TIERS = new Set(["A", "B", "C", "graceful"])

/**
 * Load + validate a milestone plan. VeriPilot is a generic tool: the milestones
 * are *project input*, not bundled in the tool. Pass the project's own plan as
 * either a JSON file path (the normal case) or an in-memory object (tests).
 */
export function loadMilestones(source: string | { milestones: Milestone[] }): Milestone[] {
  const parsed: { milestones: Milestone[] } =
    typeof source === "string"
      ? (JSON.parse(readFileSync(source, "utf8")) as { milestones: Milestone[] })
      : source
  const ms = parsed.milestones
  const ids = new Set(ms.map((m) => m.id))
  for (const m of ms) {
    if (!m.acceptance || m.acceptance.length === 0) throw new Error(`milestone ${m.id} has no acceptance items`)
    const seen = new Set<string>()
    for (const a of m.acceptance) {
      if (seen.has(a.id)) throw new Error(`milestone ${m.id} duplicate acceptance id ${a.id}`)
      if (!TIERS.has(a.tier)) throw new Error(`milestone ${m.id} acceptance ${a.id} has unknown tier ${a.tier}`)
      seen.add(a.id)
    }
    for (const d of m.deps) if (!ids.has(d)) throw new Error(`milestone ${m.id} dep ${d} is not a milestone`)
  }
  return ms
}

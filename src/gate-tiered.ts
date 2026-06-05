import type { Gate } from "./gate.ts"
import type { GateItem, GateResult, ItemResult, Milestone } from "./types.ts"

/**
 * Composes per-tier sub-gates into one milestone gate. Each Tier-A/B/C item
 * takes its result from the matching sub-gate (run once per milestone, in
 * parallel); `graceful` items auto-pass (device/AGC-gated, out of automated
 * scope). A present tier with no configured sub-gate yields fail ("no gate for
 * Tier X") so coverage gaps surface rather than silently passing.
 */
export class TieredGate implements Gate {
  constructor(private gates: { A?: Gate; B?: Gate; C?: Gate }) {}
  async run(milestone: Milestone): Promise<GateResult> {
    const tiers = new Set(milestone.acceptance.map((a) => a.tier))
    const [a, b, c] = await Promise.all([
      tiers.has("A") && this.gates.A ? this.gates.A.run(milestone) : Promise.resolve(null),
      tiers.has("B") && this.gates.B ? this.gates.B.run(milestone) : Promise.resolve(null),
      tiers.has("C") && this.gates.C ? this.gates.C.run(milestone) : Promise.resolve(null),
    ])
    const byTier: Record<"A" | "B" | "C", Record<string, GateItem>> = { A: index(a), B: index(b), C: index(c) }
    const items: GateItem[] = milestone.acceptance.map((it) => {
      if (it.tier === "graceful") return { id: it.id, result: "graceful" as ItemResult, evidence: "" }
      const sub = byTier[it.tier][it.id]
      if (!sub) return { id: it.id, result: "fail", evidence: `no gate for Tier ${it.tier}` }
      return sub
    })
    const failures = items.filter((i) => i.result === "fail")
    return { milestone: milestone.id, passed: failures.length === 0, items, failures }
  }
}

function index(r: GateResult | null): Record<string, GateItem> {
  const m: Record<string, GateItem> = {}
  if (r) for (const it of r.items) m[it.id] = it
  return m
}

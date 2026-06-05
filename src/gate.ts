import type { GateItem, GateResult, ItemResult, Milestone } from "./types.ts"

export interface Gate {
  run(milestone: Milestone): Promise<GateResult>
}

export function toResult(milestone: Milestone, results: Record<string, ItemResult>): GateResult {
  const items: GateItem[] = milestone.acceptance.map((a) => ({
    id: a.id,
    result: results[a.id] ?? "fail",
    evidence: results[a.id] === undefined ? "no result reported" : "",
  }))
  const failures = items.filter((i) => i.result === "fail")
  return { milestone: milestone.id, passed: failures.length === 0, items, failures }
}

/** A scripted gate for tests: each run() consumes the next result map. */
export class FakeGate implements Gate {
  private i = 0
  constructor(private script: Record<string, ItemResult>[]) {}
  async run(milestone: Milestone): Promise<GateResult> {
    const results = this.script[Math.min(this.i, this.script.length - 1)] ?? {}
    this.i++
    return toResult(milestone, results)
  }
}

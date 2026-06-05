import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import type { GateResult, LedgerEntry, LedgerState, MilestoneId, MilestoneStatus, RouteObservation } from "./types.ts"

export class Ledger {
  private state: LedgerState
  constructor(private file: string) {
    this.state = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as LedgerState)
      : { milestones: {} }
  }

  private entry(id: MilestoneId): LedgerEntry {
    return (this.state.milestones[id] ??= { id, status: "pending", attempts: [] })
  }

  record(id: MilestoneId, gate: GateResult, feedbackText?: string): void {
    const e = this.entry(id)
    e.attempts.push({ n: e.attempts.length + 1, gate, feedbackText })
    e.status = gate.passed ? "passed" : "in_progress"
    this.flush()
  }

  escalate(id: MilestoneId): void {
    this.entry(id).status = "escalated"
    this.flush()
  }

  /** Record that the agent routed to `target` while working this milestone.
   *  `flagged` comes from an external classifier (e.g. VeriKit). Observability
   *  only — the gap-closing loop never reads routes; they feed the cross-layer
   *  join. Resume-safe: an entry loaded without `routes` gets one lazily. */
  recordRoute(id: MilestoneId, route: { target: string; flagged: boolean; note?: string }): void {
    const e = this.entry(id)
    ;(e.routes ??= []).push({ milestone: id, ...route })
    this.flush()
  }

  routes(id: MilestoneId): RouteObservation[] {
    return this.entry(id).routes ?? []
  }

  status(id: MilestoneId): MilestoneStatus {
    return this.state.milestones[id]?.status ?? "pending"
  }

  attempts(id: MilestoneId) {
    return this.entry(id).attempts
  }

  /** True when the last two attempts failed on the identical set of items.
   *  Note: this compares persisted attempts, so it also spans a resume — the
   *  first attempt after a restart is compared against the last pre-restart
   *  attempt. That is intentional (an identical repeated gap is still no
   *  progress), so a resumed milestone does not get a fresh retry budget if it
   *  reproduces the same failure. */
  noProgress(id: MilestoneId): boolean {
    const a = this.entry(id).attempts
    if (a.length < 2) return false
    const key = (g: GateResult) => g.failures.map((f) => f.id).sort().join(",")
    return key(a[a.length - 1]!.gate) === key(a[a.length - 2]!.gate)
  }

  /** Snapshot of the full state (read-only use). */
  snapshot(): LedgerState {
    return this.state
  }

  private flush(): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.state, null, 2) + "\n")
  }
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import type { GateResult, LedgerEntry, LedgerState, MilestoneId, MilestoneStatus } from "./types.ts"

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

  status(id: MilestoneId): MilestoneStatus {
    return this.state.milestones[id]?.status ?? "pending"
  }

  attempts(id: MilestoneId) {
    return this.entry(id).attempts
  }

  /** True when the last two attempts failed on the identical set of items. */
  noProgress(id: MilestoneId): boolean {
    const a = this.entry(id).attempts
    if (a.length < 2) return false
    const key = (g: GateResult) => g.failures.map((f) => f.id).sort().join(",")
    return key(a[a.length - 1]!.gate) === key(a[a.length - 2]!.gate)
  }

  private flush(): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.state, null, 2) + "\n")
  }
}

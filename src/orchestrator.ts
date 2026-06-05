import type { Agent } from "./agent.ts"
import type { Gate } from "./gate.ts"
import type { Judge } from "./judge.ts"
import type { Ledger } from "./ledger.ts"
import type { Feedback, LedgerEntry, LedgerState, Milestone } from "./types.ts"

export interface OrchestratorDeps {
  agent: Agent
  gate: Gate
  judge: Judge
  ledger: Ledger
  maxRetries: number
  /** Build the prompt for the agent: the requirement, plus recovery feedback on a retry. */
  dispatch: (milestone: Milestone, feedback?: Feedback) => string
}

/** Run the gap-closing loop for one milestone: monitor -> gaps -> feedback, until gaps = ∅. */
export async function runMilestone(milestone: Milestone, d: OrchestratorDeps): Promise<LedgerEntry> {
  let feedback: Feedback | undefined
  for (let attempt = 1; attempt <= d.maxRetries; attempt++) {
    await d.agent.run(d.dispatch(milestone, feedback)) // MONITOR (agent works)
    const gate = await d.gate.run(milestone) // EVALUATE (gate -> gaps)
    d.ledger.record(milestone.id, gate, feedback?.text)
    if (gate.passed) return entryOf(d, milestone.id) // gaps = ∅ -> achieved
    feedback = d.judge.compose(milestone, gate.failures) // FEEDBACK
    if (d.ledger.noProgress(milestone.id)) break // same gaps twice -> stop early
  }
  d.ledger.escalate(milestone.id)
  return entryOf(d, milestone.id)
}

/** Sequence milestones; never start M+1 until M passes. Stops at the first escalation. */
export async function runAll(milestones: Milestone[], d: OrchestratorDeps): Promise<LedgerState> {
  for (const m of milestones) {
    if (d.ledger.status(m.id) === "passed") continue // resume: skip done
    const e = await runMilestone(m, d)
    if (e.status !== "passed") break // gate not met -> halt the workflow
  }
  return d.ledger.snapshot()
}

function entryOf(d: OrchestratorDeps, id: string): LedgerEntry {
  return { id, status: d.ledger.status(id), attempts: d.ledger.attempts(id) }
}

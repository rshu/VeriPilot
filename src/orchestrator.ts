import type { Agent } from "./agent.ts"
import type { Gate } from "./gate.ts"
import type { Judge } from "./judge.ts"
import type { Ledger } from "./ledger.ts"
import { noopSink, type EventSink } from "./events.ts"
import type { Feedback, GateItem, GateResult, LedgerEntry, LedgerState, Milestone } from "./types.ts"

export interface OrchestratorDeps {
  agent: Agent
  gate: Gate
  judge: Judge
  ledger: Ledger
  maxRetries: number
  /** Build the prompt for the agent: the requirement, plus recovery feedback on a retry. */
  dispatch: (milestone: Milestone, feedback?: Feedback) => string
  /** Optional monitor sink (dashboard). Defaults to a no-op, so the core is unaffected. */
  events?: EventSink
}

/** Run the gap-closing loop for one milestone: monitor -> gaps -> feedback, until gaps = ∅. */
export async function runMilestone(milestone: Milestone, d: OrchestratorDeps): Promise<LedgerEntry> {
  const events = d.events ?? noopSink
  events.emit({
    type: "milestone:start", ts: Date.now(), id: milestone.id,
    title: milestone.title, requirement: milestone.requirement, acceptance: milestone.acceptance,
  })
  let feedback: Feedback | undefined
  for (let attempt = 1; attempt <= d.maxRetries; attempt++) {
    events.emit({ type: "attempt:start", ts: Date.now(), id: milestone.id, attempt })
    // The agent and the gate do real I/O (subprocesses, devices) and can throw
    // or hang. An exception here must NOT abort the workflow with no ledger
    // trace — turn it into a recorded failed attempt so feedback + recovery +
    // escalation still run.
    let gate: GateResult
    try {
      await d.agent.run(d.dispatch(milestone, feedback)) // MONITOR (agent works)
      gate = await d.gate.run(milestone) // EVALUATE (gate -> gaps)
    } catch (e) {
      gate = errorGate(milestone, e)
    }
    d.ledger.record(milestone.id, gate, feedback?.text)
    events.emit({ type: "attempt:result", ts: Date.now(), id: milestone.id, attempt, gate, feedback: feedback?.text })
    if (gate.passed) {
      events.emit({ type: "milestone:end", ts: Date.now(), id: milestone.id, status: "passed" })
      return entryOf(d, milestone.id) // gaps = ∅ -> achieved
    }
    feedback = d.judge.compose(milestone, gate.failures) // FEEDBACK
    if (d.ledger.noProgress(milestone.id)) break // same gaps twice -> stop early
  }
  d.ledger.escalate(milestone.id)
  events.emit({ type: "milestone:end", ts: Date.now(), id: milestone.id, status: "escalated" })
  return entryOf(d, milestone.id)
}

/** Sequence milestones; never start a milestone until its deps have passed.
 *  Stops at the first unmet dependency or escalation. */
export async function runAll(milestones: Milestone[], d: OrchestratorDeps): Promise<LedgerState> {
  const events = d.events ?? noopSink
  events.emit({ type: "run:start", ts: Date.now(), milestones: milestones.map((m) => ({ id: m.id, title: m.title })) })
  for (const m of milestones) {
    if (d.ledger.status(m.id) === "passed") continue // resume: skip done
    // Enforce deps at runtime rather than trusting array order: a milestone
    // whose prerequisite hasn't passed (or escalated) must not run.
    if (m.deps.some((dep) => d.ledger.status(dep) !== "passed")) break
    const e = await runMilestone(m, d)
    if (e.status !== "passed") break // gate not met -> halt the workflow
  }
  events.emit({ type: "run:end", ts: Date.now() })
  return d.ledger.snapshot()
}

function entryOf(d: OrchestratorDeps, id: string): LedgerEntry {
  return { id, status: d.ledger.status(id), attempts: d.ledger.attempts(id) }
}

/** Build a synthetic failed gate result when the agent or gate throws, so the
 *  exception is recorded as a normal failed attempt instead of crashing runAll. */
function errorGate(milestone: Milestone, e: unknown): GateResult {
  const item: GateItem = {
    id: `${milestone.id}:error`,
    result: "fail",
    evidence: `attempt threw: ${e instanceof Error ? e.message : String(e)}`,
  }
  return { milestone: milestone.id, passed: false, items: [item], failures: [item] }
}

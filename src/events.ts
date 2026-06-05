import type { AcceptanceItem, GateResult, MilestoneId, MilestoneStatus } from "./types.ts"

/** Workflow-level lifecycle events the orchestrator emits for monitoring. Kit-
 *  agnostic by construction: only milestones, tiers, and attempts appear. */
export type VeriPilotEvent =
  | { type: "run:start"; ts: number; milestones: { id: MilestoneId; title: string }[] }
  | { type: "milestone:start"; ts: number; id: MilestoneId; title: string; requirement: string; acceptance: AcceptanceItem[] }
  | { type: "attempt:start"; ts: number; id: MilestoneId; attempt: number } // agent dispatched
  | { type: "attempt:result"; ts: number; id: MilestoneId; attempt: number; gate: GateResult; feedback?: string }
  | { type: "milestone:end"; ts: number; id: MilestoneId; status: MilestoneStatus }
  | { type: "run:end"; ts: number }

export interface EventSink {
  emit(e: VeriPilotEvent): void
}

/** Default sink: drops everything. Lets `events` stay optional on the orchestrator. */
export const noopSink: EventSink = { emit() {} }

/** Fan-out sink: forwards each event to every current subscriber. The dashboard
 *  server uses one to broadcast to all connected SSE clients. */
export class FanoutSink implements EventSink {
  private subs = new Set<(e: VeriPilotEvent) => void>()
  subscribe(fn: (e: VeriPilotEvent) => void): () => void {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }
  emit(e: VeriPilotEvent): void {
    for (const fn of this.subs) fn(e)
  }
}

export type MilestoneId = string // "M0".."M6"
export type Tier = "A" | "B" | "C" | "graceful"

export interface AcceptanceItem {
  id: string // e.g. "9.1.1"
  text: string // the §9 acceptance line
  tier: Tier
}

export interface Milestone {
  id: MilestoneId
  title: string
  requirement: string // §3 text dispatched to the agent (no Kit named)
  acceptance: AcceptanceItem[] // §9.M items
  slices: string[] // owning slices (informational; see proposal.md)
  deps: MilestoneId[] // milestones that must pass first
}

export type ItemResult = "pass" | "graceful" | "fail"

export interface GateItem {
  id: string // matches an AcceptanceItem.id
  result: ItemResult
  evidence: string // build log line / failed assertion / judge verdict
}

export interface GateResult {
  milestone: MilestoneId
  passed: boolean // true iff every item is pass|graceful
  items: GateItem[]
  failures: GateItem[] // items with result === "fail"
}

export interface Gap {
  id: string // failing AcceptanceItem.id
  why: string // the evidence
}

export interface Feedback {
  milestone: MilestoneId
  gaps: Gap[]
  text: string // the recovery prompt body
}

export interface Attempt {
  n: number
  gate: GateResult
  feedbackText?: string
}

export type MilestoneStatus = "pending" | "in_progress" | "passed" | "escalated"

export interface LedgerEntry {
  id: MilestoneId
  status: MilestoneStatus
  attempts: Attempt[]
}

export interface LedgerState {
  milestones: Record<MilestoneId, LedgerEntry>
}

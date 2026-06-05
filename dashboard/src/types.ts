// Mirror of the dashboard-server's DashboardState shape (the client only renders;
// the server is the source of truth and is the only place that mutates state).
export type Tier = "A" | "B" | "C" | "graceful"
export type ItemResult = "pass" | "graceful" | "fail"
export type MilestoneStatus = "pending" | "in_progress" | "passed" | "escalated"

export interface AcceptanceItem {
  id: string
  text: string
  tier: Tier
}
export interface GateItem {
  id: string
  result: ItemResult
  evidence: string
}
export interface GateResult {
  milestone: string
  passed: boolean
  items: GateItem[]
  failures: GateItem[]
}
export interface Attempt {
  n: number
  gate: GateResult
  feedback?: string
}
export interface DashboardMilestone {
  id: string
  title: string
  requirement: string
  acceptance: AcceptanceItem[]
  status: MilestoneStatus
  activeAttempt: number | null
  attempts: Attempt[]
}
export interface DashboardState {
  order: string[]
  milestones: Record<string, DashboardMilestone>
  running: boolean
}

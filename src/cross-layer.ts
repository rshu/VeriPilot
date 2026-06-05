import type { LedgerState, MilestoneId } from "./types.ts"

export interface MilestoneJoin {
  milestone: MilestoneId
  targets: string[] // distinct targets (Kits) the agent routed to
  flaggedTargets: string[] // distinct targets VeriKit flagged as defective metadata
  attempts: number
  evaluated: boolean // the gate ran at least once (there is build evidence to join)
  passed: boolean
  firstPass: boolean // passed on the first attempt, no recovery
  recoveryRounds: number // attempts beyond the first
  struggled: boolean // evaluated AND (needed recovery OR never passed)
}

/** 2x2 of (routed to a VeriKit-flagged target) x (struggled at the gate), over
 *  evaluated milestones. The hypothesis: authoring-time-defective Kit routes
 *  concentrate in `flaggedStruggled`. */
export interface Contingency {
  flaggedStruggled: number
  flaggedClean: number
  unflaggedStruggled: number
  unflaggedClean: number
}

export interface CrossLayerReport {
  perMilestone: MilestoneJoin[]
  contingency: Contingency
}

/**
 * Joins the authoring-time route log (which Kits the agent selected, flagged by
 * VeriKit when their selection metadata is self-colliding) against the
 * build-time gate outcomes recorded in the ledger. This is the paper's "one
 * problem, two layers" evidence: do authoring-time-defective Kit routes
 * co-occur with build-time gate trouble (false-done / recovery rounds)?
 *
 * The contingency table is computed over milestones that were actually gated
 * (`evaluated`); a milestone with routes but no gate run carries no build
 * evidence and is reported in `perMilestone` but excluded from the contingency.
 */
export function crossLayerJoin(state: LedgerState): CrossLayerReport {
  const perMilestone: MilestoneJoin[] = []
  const c: Contingency = { flaggedStruggled: 0, flaggedClean: 0, unflaggedStruggled: 0, unflaggedClean: 0 }
  for (const e of Object.values(state.milestones)) {
    const routes = e.routes ?? []
    const targets = [...new Set(routes.map((r) => r.target))]
    const flaggedTargets = [...new Set(routes.filter((r) => r.flagged).map((r) => r.target))]
    const attempts = e.attempts.length
    const evaluated = attempts >= 1
    const passed = e.status === "passed"
    const recoveryRounds = Math.max(0, attempts - 1)
    const firstPass = passed && recoveryRounds === 0
    const struggled = evaluated && (recoveryRounds > 0 || !passed)
    perMilestone.push({
      milestone: e.id, targets, flaggedTargets, attempts, evaluated, passed, firstPass, recoveryRounds, struggled,
    })
    if (!evaluated) continue
    const hasFlagged = flaggedTargets.length > 0
    if (hasFlagged && struggled) c.flaggedStruggled++
    else if (hasFlagged && !struggled) c.flaggedClean++
    else if (!hasFlagged && struggled) c.unflaggedStruggled++
    else c.unflaggedClean++
  }
  return { perMilestone, contingency: c }
}

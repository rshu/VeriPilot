import { execFile } from "node:child_process"
import type { Gate } from "./gate.ts"
import type { AcceptanceItem, GateItem, GateResult, Milestone } from "./types.ts"

/** Captures one screenshot of the running app and returns the local image path. */
export type Screenshotter = (milestone: Milestone) => Promise<{ imagePath: string }>

/** Rules on a single Tier-C acceptance item given a screenshot. */
export type VisualJudge = (item: AcceptanceItem, imagePath: string) => Promise<{ pass: boolean; reason: string }>

/**
 * Tier-C gate: captures one screenshot of the running app, then asks a visual
 * judge to rule on each Tier-C acceptance item. The judge is pluggable (an LLM
 * vision judge in deployment, a stub in tests) and SHOULD be a different model
 * family than the coding agent to avoid self-grading. Non-Tier-C items are left
 * as fail/"not run"; a {@link TieredGate} overrides them.
 */
export class ScreenshotJudgeGate implements Gate {
  constructor(private shoot: Screenshotter, private judge: VisualJudge) {}
  async run(milestone: Milestone): Promise<GateResult> {
    const cItems = milestone.acceptance.filter((a) => a.tier === "C")
    const verdicts: Record<string, { pass: boolean; reason: string }> = {}
    if (cItems.length > 0) {
      // A capture or judge failure must NOT throw out of the gate (that would
      // crash the orchestrator loop); it becomes a per-item Tier-C failure so
      // the gap is recorded and the recovery/escalation path still runs.
      let imagePath: string | null = null
      let captureError = ""
      try {
        imagePath = (await this.shoot(milestone)).imagePath
      } catch (e) {
        captureError = `screenshot capture failed: ${errMsg(e)}`
      }
      for (const a of cItems) {
        if (imagePath === null) {
          verdicts[a.id] = { pass: false, reason: captureError }
          continue
        }
        try {
          verdicts[a.id] = await this.judge(a, imagePath)
        } catch (e) {
          verdicts[a.id] = { pass: false, reason: `visual judge failed: ${errMsg(e)}` }
        }
      }
    }
    const items: GateItem[] = milestone.acceptance.map((a) => {
      if (a.tier !== "C") return { id: a.id, result: "fail", evidence: `Tier ${a.tier} not run by ScreenshotJudgeGate` }
      const v = verdicts[a.id]!
      return { id: a.id, result: v.pass ? "pass" : "fail", evidence: v.reason }
    })
    const failures = items.filter((i) => i.result === "fail")
    return { milestone: milestone.id, passed: failures.length === 0, items, failures }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Default screenshotter: `hdc shell snapshot_display` then `hdc file recv`.
 * Proven against the HarmonyOS emulator 2026-06-05.
 */
export function hdcScreenshotter(hdc: string, remote = "/data/local/tmp/_veripilot.jpeg", localDir = "/tmp"): Screenshotter {
  return (milestone) =>
    new Promise((resolve, reject) => {
      const local = `${localDir}/veripilot-${milestone.id}.jpeg`
      execFile(hdc, ["shell", "snapshot_display", "-f", remote], (e1) => {
        if (e1) return reject(e1)
        execFile(hdc, ["file", "recv", remote, local], (e2) => (e2 ? reject(e2) : resolve({ imagePath: local })))
      })
    })
}

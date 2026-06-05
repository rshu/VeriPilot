import { execFile } from "node:child_process"
import type { Gate } from "./gate.ts"
import type { GateItem, GateResult, Milestone } from "./types.ts"

export type BuildRunner = (appDir: string) => Promise<{ code: number; output: string }>

/** Default runner: `hvigorw assembleHap` in the app dir. */
const defaultRunner: BuildRunner = (appDir) =>
  new Promise((resolve) => {
    execFile("./hvigorw", ["assembleHap"], { cwd: appDir, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0, output: `${stdout}\n${stderr}` })
    })
  })

/** Tier-A gate: runs the build; Tier-A items pass iff the build succeeds. Tier B/C
 *  are out of scope for this gate (the follow-on plan adds hypium/hdc + judge). */
export class HvigorGate implements Gate {
  constructor(private appDir: string, private runner: BuildRunner = defaultRunner) {}
  async run(milestone: Milestone): Promise<GateResult> {
    const build = await this.runner(this.appDir)
    const buildOk = build.code === 0
    const tail = build.output.split("\n").slice(-8).join("\n").trim()
    const items: GateItem[] = milestone.acceptance.map((a) => {
      if (a.tier === "A") return { id: a.id, result: buildOk ? "pass" : "fail", evidence: buildOk ? "" : tail }
      return { id: a.id, result: "fail", evidence: `Tier ${a.tier} not run by HvigorGate` }
    })
    const failures = items.filter((i) => i.result === "fail")
    return { milestone: milestone.id, passed: failures.length === 0, items, failures }
  }
}

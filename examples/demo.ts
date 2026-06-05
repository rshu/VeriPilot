// Runnable end-to-end demo of the VeriPilot loop, driving the example milestones
// with a fake agent + a demo gate (no HarmonyOS toolchain / Agent SDK needed).
// It proves the orchestrator actually sequences milestones and runs the
// gap -> feedback -> fix -> pass loop. Run:  bun examples/demo.ts
import path from "node:path"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { loadMilestones } from "../src/milestones.ts"
import { runAll, type OrchestratorDeps } from "../src/orchestrator.ts"
import { TemplateJudge } from "../src/judge.ts"
import { Ledger } from "../src/ledger.ts"
import { toResult, type Gate } from "../src/gate.ts"
import type { Agent } from "../src/agent.ts"
import type { ItemResult, Milestone } from "../src/types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Each milestone fails its non-graceful items on the FIRST attempt, then passes
 *  on the next — exercising the gap -> feedback -> fix -> pass loop. */
class DemoGate implements Gate {
  private seen = new Set<string>()
  async run(m: Milestone) {
    const first = !this.seen.has(m.id)
    this.seen.add(m.id)
    const results: Record<string, ItemResult> = {}
    for (const a of m.acceptance) results[a.id] = a.tier === "graceful" ? "graceful" : first ? "fail" : "pass"
    return toResult(m, results)
  }
}

/** A fake coding agent that just logs what it was dispatched. */
class LoggingAgent implements Agent {
  async run(prompt: string) {
    const recovery = prompt.includes("not yet complete")
    console.log(`  agent <- ${recovery ? "[recovery] " : "[start]    "}${(prompt.split("\n")[0] ?? "").slice(0, 64)}`)
  }
}

const milestones = loadMilestones(path.resolve(HERE, "flowershop.milestones.json"))
const ledger = new Ledger(path.join(mkdtempSync(path.join(tmpdir(), "vp-demo-")), "state.json"))
const deps: OrchestratorDeps = {
  agent: new LoggingAgent(),
  gate: new DemoGate(),
  judge: new TemplateJudge(),
  ledger,
  maxRetries: 3,
  dispatch: (m, fb) => (fb ? `${m.requirement}\n${fb.text}` : m.requirement),
}

console.log(`VeriPilot demo — driving ${milestones.length} milestones from examples/flowershop.milestones.json\n`)
const state = await runAll(milestones, deps)
console.log("\nResult (gate met before each advance):")
for (const m of milestones) {
  const e = state.milestones[m.id]
  console.log(`  ${m.id}  ${m.title.padEnd(18)} ${(e?.status ?? "(not reached)").padEnd(10)} ${e?.attempts.length ?? 0} attempt(s)`)
}

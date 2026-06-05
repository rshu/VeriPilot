import path from "node:path"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { startDashboard } from "../src/dashboard-server.ts"
import { runAll, type OrchestratorDeps } from "../src/orchestrator.ts"
import { FakeGate } from "../src/gate.ts"
import { TemplateJudge } from "../src/judge.ts"
import { Ledger } from "../src/ledger.ts"
import type { Agent } from "../src/agent.ts"
import type { Milestone } from "../src/types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(HERE, "..", "dashboard", "dist")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A deliberately slow agent so the gap-closing loop is watchable live.
class SlowAgent implements Agent {
  async run(): Promise<void> {
    await sleep(1600)
  }
}

const milestones: Milestone[] = [
  { id: "M0", title: "Foundation", requirement: "App builds and launches on the device", slices: [], deps: [],
    acceptance: [{ id: "9.0.1", text: "app builds", tier: "A" }, { id: "9.0.2", text: "app launches", tier: "B" }] },
  { id: "M1", title: "Browse", requirement: "Browse the product list with category filters", slices: [], deps: ["M0"],
    acceptance: [{ id: "9.1.1", text: "list loads", tier: "B" }, { id: "9.1.2", text: "home screen renders", tier: "C" }] },
  { id: "M2", title: "Detail", requirement: "Product detail page shows the price and Add-to-Cart", slices: [], deps: ["M1"],
    acceptance: [{ id: "9.2.1", text: "price is shown", tier: "C" }, { id: "9.2.2", text: "add to cart works", tier: "B" }] },
]

// Scripted gate, consumed per attempt in order: M0 passes; M1 fails then passes;
// M2 fails then passes — so the dashboard shows two gap-closing recoveries.
const script: Record<string, "pass" | "fail">[] = [
  { "9.0.1": "pass", "9.0.2": "pass" }, // M0 #1
  { "9.1.1": "fail", "9.1.2": "pass" }, // M1 #1
  { "9.1.1": "pass", "9.1.2": "pass" }, // M1 #2
  { "9.2.1": "fail", "9.2.2": "pass" }, // M2 #1
  { "9.2.1": "pass", "9.2.2": "pass" }, // M2 #2
]

const ledgerFile = path.join(mkdtempSync(path.join(tmpdir(), "vp-demo-")), "ledger.json")

const server = await startDashboard({ port: 4317, distDir: dist })
console.log(`\n  VeriPilot dashboard → ${server.url}\n  (open it now; the run starts in 3s)\n`)
await sleep(3000)

const deps: OrchestratorDeps = {
  agent: new SlowAgent(),
  gate: new FakeGate(script),
  judge: new TemplateJudge(),
  ledger: new Ledger(ledgerFile),
  maxRetries: 3,
  dispatch: (m, fb) => (fb ? `${m.requirement}\n${fb.text}` : m.requirement),
  events: server.sink,
}
await runAll(milestones, deps)
console.log("  run complete — dashboard is live; Ctrl-C to stop.")

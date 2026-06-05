# VeriPilot

An **online milestone orchestrator & guidance tool** that stands beside a coding
agent: it drives a build one milestone at a time, monitors what the agent
produces, identifies the **gaps** between that and each milestone's goal, and
feeds back fixes until every gap is closed — only then releasing the next
milestone.

VeriPilot is **generic**. Milestones are *project input* read from a file, not
hardcoded in the tool. It operates at the **workflow level** (sequence, verify,
gate); choosing *which capability/Kit* a requirement needs is a separate,
lower-level concern (e.g. VeriKit).

## Design

- **Milestone model** — a JSON plan: each milestone has a `requirement`, an
  `acceptance` list (the goal), `deps`, and owned units. See
  `examples/flowershop.milestones.json`.
- **Gap-closing loop** (`src/orchestrator.ts`) — per milestone: dispatch to the
  agent → run the gate → if gaps remain, compose feedback and re-dispatch;
  advance only when gaps are empty; escalate after `maxRetries`; resume skips
  passed milestones (state persisted by `src/ledger.ts`).
- **Pluggable interfaces** — `Gate` (what "goal met" means), `Agent` (drives the
  coding agent), `Judge` (turns gaps into feedback). In-memory fakes ship for
  tests. Real adapters ship too: `ClaudeCodeAgent` (headless `claude -p`),
  tiered gates — `HvigorGate` (Tier-A build), `HypiumGate` (Tier-B on-device
  tests via `hdc`/`aa test`), `ScreenshotJudgeGate` (Tier-C screenshot + judge),
  composed by `TieredGate` (graceful items auto-pass) — and a deterministic
  `TemplateJudge`.
- **Dashboard** — an optional, read-only web UI that live-monitors a run. The
  orchestrator emits lifecycle events to an optional `events` sink; the
  dashboard server (`src/dashboard-server.ts`) broadcasts them over SSE to a
  React app (`dashboard/`). Kit-agnostic: it shows milestones, tiers, the
  gap-closing attempt timeline, and Tier-C screenshots — never Kit choices.

## Use

```ts
import { loadMilestones } from "./src/milestones.ts"
import { runAll } from "./src/orchestrator.ts"

const milestones = loadMilestones("./my-project.milestones.json") // your plan
await runAll(milestones, {
  agent,    // your coding-agent driver (e.g. headless Claude Code)
  gate,     // your build/acceptance gate
  judge,    // TemplateJudge, or an LLM judge
  ledger,   // resumable state
  maxRetries: 3,
  dispatch: (m, fb) => (fb ? `${m.requirement}\n${fb.text}` : m.requirement),
})
```

## Dashboard

```bash
cd dashboard && npm install && npm run build   # build the React UI once
bun examples/dashboard-demo.ts                 # server + a scripted run → http://localhost:4317
```

To wire it into a real run, start the server and pass its sink as `events`:

```ts
import { startDashboard } from "./src/dashboard-server.ts"
const server = await startDashboard({ distDir: "./dashboard/dist" })
await runAll(milestones, { agent, gate, judge, ledger, maxRetries: 3, dispatch, events: server.sink })
```

## Develop

```bash
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun examples/demo.ts           # end-to-end demo (fake agent + demo gate)
bun examples/dashboard-demo.ts # live dashboard demo (build dashboard/ first)
```

## Status

Validated end-to-end on a live HarmonyOS emulator: the tiered gate (build +
on-device hypium + screenshot) and the full gap-closing loop with a real
headless Claude Code agent. A real LLM vision judge for Tier-C plugs into the
`VisualJudge` interface; everything else is shipped.

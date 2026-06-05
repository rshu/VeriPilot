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
  tests; a deterministic `TemplateJudge` and a Tier-A build gate (`HvigorGate`)
  ship for real use.

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

## Develop

```bash
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun examples/demo.ts  # runnable end-to-end demo (fake agent + demo gate)
```

## Status

This repo is the **core engine**: milestone model, resumable ledger, the
gap-closing loop, the pluggable interfaces, a deterministic judge, and a Tier-A
build gate. The real headless-Claude-Code agent driver, an LLM judge, and
runtime acceptance gate tiers (UI/instrumented tests) are the follow-on layer
that implements the same interfaces.

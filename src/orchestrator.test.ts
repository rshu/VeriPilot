import { test } from "node:test"
import assert from "node:assert"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { runMilestone, runAll, type OrchestratorDeps } from "./orchestrator.ts"
import { FakeGate } from "./gate.ts"
import { FakeAgent } from "./agent.ts"
import { TemplateJudge } from "./judge.ts"
import { Ledger } from "./ledger.ts"
import type { Milestone } from "./types.ts"

const m = (id: string, deps: string[] = []): Milestone => ({
  id, title: id, requirement: `build ${id}`, slices: [], deps,
  acceptance: [{ id: `${id}.a`, text: "works", tier: "B" }],
})
const tmpLedger = () => new Ledger(path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json"))
const deps = (over: Partial<OrchestratorDeps>): OrchestratorDeps => ({
  agent: new FakeAgent(), judge: new TemplateJudge(), ledger: tmpLedger(),
  maxRetries: 3, dispatch: (mm, fb) => (fb ? `${mm.requirement}\n${fb.text}` : mm.requirement),
  ...over,
} as OrchestratorDeps)

test("passes on the first attempt when the gate passes", async () => {
  const agent = new FakeAgent()
  const d = deps({ agent, gate: new FakeGate([{ "M1.a": "pass" }]) })
  const e = await runMilestone(m("M1"), d)
  assert.equal(e.status, "passed")
  assert.equal(agent.prompts.length, 1) // dispatched once
})

test("re-dispatches with feedback on a gap, then passes (gap-closing loop)", async () => {
  const agent = new FakeAgent()
  const d = deps({ agent, gate: new FakeGate([{ "M1.a": "fail" }, { "M1.a": "pass" }]) })
  const e = await runMilestone(m("M1"), d)
  assert.equal(e.status, "passed")
  assert.equal(agent.prompts.length, 2) // initial + one recovery
  assert.match(agent.prompts[1]!, /not yet complete/) // feedback injected
})

test("escalates after maxRetries when gaps persist", async () => {
  const d = deps({ gate: new FakeGate([{ "M1.a": "fail" }]), maxRetries: 2 })
  const e = await runMilestone(m("M1"), d)
  assert.equal(e.status, "escalated")
  assert.equal(e.attempts.length, 2)
})

test("runAll gates in order and stops at the first escalation", async () => {
  const ledger = tmpLedger()
  // M1 passes, M2 never passes -> escalates, M3 never reached
  const gate = new FakeGate([{ "M1.a": "pass" }, { "M2.a": "fail" }])
  const d = deps({ ledger, gate, maxRetries: 1 })
  const state = await runAll([m("M1"), m("M2", ["M1"]), m("M3", ["M2"])], d)
  assert.equal(state.milestones["M1"]!.status, "passed")
  assert.equal(state.milestones["M2"]!.status, "escalated")
  assert.equal(state.milestones["M3"], undefined) // not reached
})

test("runAll resumes: an already-passed milestone is skipped (agent not re-dispatched)", async () => {
  const ledger = tmpLedger()
  const agent = new FakeAgent()
  await runAll([m("M1")], deps({ ledger, agent, gate: new FakeGate([{ "M1.a": "pass" }]) }))
  const before = agent.prompts.length
  await runAll([m("M1")], deps({ ledger, agent, gate: new FakeGate([{ "M1.a": "pass" }]) }))
  assert.equal(agent.prompts.length, before) // skipped on the second run
})

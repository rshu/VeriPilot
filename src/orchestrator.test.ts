import { test } from "node:test"
import assert from "node:assert"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { runMilestone, runAll, type OrchestratorDeps } from "./orchestrator.ts"
import { FakeGate, type Gate } from "./gate.ts"
import { FakeAgent } from "./agent.ts"
import { TemplateJudge } from "./judge.ts"
import { Ledger } from "./ledger.ts"
import type { EventSink, VeriPilotEvent } from "./events.ts"
import type { Milestone } from "./types.ts"

const m = (id: string, deps: string[] = []): Milestone => ({
  id, title: id, requirement: `build ${id}`, slices: [], deps,
  acceptance: [{ id: `${id}.a`, text: "works", tier: "B" }],
})
const tmpLedger = () => new Ledger(path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json"))
const deps = (over: Partial<OrchestratorDeps>): OrchestratorDeps => ({
  agent: new FakeAgent(), gate: new FakeGate([{}]), judge: new TemplateJudge(), ledger: tmpLedger(),
  maxRetries: 3, dispatch: (mm, fb) => (fb ? `${mm.requirement}\n${fb.text}` : mm.requirement),
  ...over,
})

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

test("a throwing gate is recorded as a failed attempt and escalates, not a crash", async () => {
  const throwingGate: Gate = {
    run: async () => {
      throw new Error("device offline")
    },
  }
  const e = await runMilestone(m("M1"), deps({ gate: throwingGate, maxRetries: 2 }))
  assert.equal(e.status, "escalated")
  assert.equal(e.attempts.length, 2)
  assert.match(e.attempts[0]!.gate.failures[0]!.evidence, /attempt threw.*device offline/)
})

test("runAll enforces deps: a milestone whose dep has not passed does not run", async () => {
  const agent = new FakeAgent()
  // array order puts M2 (deps M1) BEFORE M1; M2 must not run out of order
  const state = await runAll([m("M2", ["M1"]), m("M1")], deps({ agent, gate: new FakeGate([{ "M1.a": "pass" }]) }))
  assert.equal(state.milestones["M2"], undefined) // refused: dep M1 not passed
  assert.equal(agent.prompts.length, 0) // nothing dispatched
})

test("emits the run/milestone/attempt lifecycle for a fail-then-pass milestone", async () => {
  const seen: VeriPilotEvent[] = []
  const events: EventSink = { emit: (e) => seen.push(e) }
  await runAll([m("M1")], deps({ gate: new FakeGate([{ "M1.a": "fail" }, { "M1.a": "pass" }]), events }))
  assert.deepEqual(
    seen.map((e) => e.type),
    ["run:start", "milestone:start", "attempt:start", "attempt:result", "attempt:start", "attempt:result", "milestone:end", "run:end"],
  )
  assert.ok(seen.some((e) => e.type === "milestone:end" && e.status === "passed"))
})

test("omitting events still works (no-op default sink)", async () => {
  const e = await runMilestone(m("M1"), deps({ gate: new FakeGate([{ "M1.a": "pass" }]) }))
  assert.equal(e.status, "passed")
})

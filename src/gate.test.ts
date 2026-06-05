import { test } from "node:test"
import assert from "node:assert"
import { FakeGate } from "./gate.ts"
import type { Milestone } from "./types.ts"

const m: Milestone = {
  id: "M1", title: "Browse", requirement: "x", slices: [], deps: [],
  acceptance: [{ id: "9.1.1", text: "list", tier: "B" }, { id: "9.1.2", text: "refresh", tier: "C" }],
}

test("FakeGate returns scripted results per call and computes passed/failures", async () => {
  const gate = new FakeGate([
    { "9.1.1": "fail", "9.1.2": "pass" },
    { "9.1.1": "pass", "9.1.2": "pass" },
  ])
  const r1 = await gate.run(m)
  assert.equal(r1.passed, false)
  assert.deepEqual(r1.failures.map((f) => f.id), ["9.1.1"])
  const r2 = await gate.run(m)
  assert.equal(r2.passed, true)
  assert.equal(r2.failures.length, 0)
})

test("FakeGate treats 'graceful' as passing", async () => {
  const gate = new FakeGate([{ "9.1.1": "graceful", "9.1.2": "pass" }])
  const r = await gate.run(m)
  assert.equal(r.passed, true)
})

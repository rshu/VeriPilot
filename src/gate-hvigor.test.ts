import { test } from "node:test"
import assert from "node:assert"
import { HvigorGate } from "./gate-hvigor.ts"
import type { Milestone } from "./types.ts"

const m: Milestone = {
  id: "M0", title: "Foundation", requirement: "x", slices: [], deps: [],
  acceptance: [{ id: "9.0.1", text: "app builds and launches", tier: "A" }],
}

test("HvigorGate passes the Tier-A item when the build command exits 0", async () => {
  const gate = new HvigorGate("/tmp/app", async () => ({ code: 0, output: "BUILD SUCCESSFUL" }))
  const r = await gate.run(m)
  assert.equal(r.passed, true)
  assert.equal(r.items[0]!.result, "pass")
})

test("HvigorGate fails the Tier-A item with the build output as evidence when exit != 0", async () => {
  const gate = new HvigorGate("/tmp/app", async () => ({ code: 1, output: "error: cannot find module X" }))
  const r = await gate.run(m)
  assert.equal(r.passed, false)
  assert.equal(r.failures[0]!.id, "9.0.1")
  assert.match(r.failures[0]!.evidence, /cannot find module X/)
})

test("HvigorGate only evaluates Tier-A items (B/C left as fail with a 'not run' note)", async () => {
  const m2: Milestone = { ...m, acceptance: [...m.acceptance, { id: "9.0.2", text: "runtime", tier: "B" }] }
  const gate = new HvigorGate("/tmp/app", async () => ({ code: 0, output: "ok" }))
  const r = await gate.run(m2)
  const b = r.items.find((i) => i.id === "9.0.2")!
  assert.equal(b.result, "fail")
  assert.match(b.evidence, /Tier B not run/)
})

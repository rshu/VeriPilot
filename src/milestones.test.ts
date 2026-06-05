import { test } from "node:test"
import assert from "node:assert"
import { loadMilestones } from "./milestones.ts"

test("loads all 7 milestones M0..M6 in dependency order", () => {
  const ms = loadMilestones()
  assert.deepEqual(ms.map((m) => m.id), ["M0", "M1", "M2", "M3", "M4", "M5", "M6"])
})

test("every milestone has at least one acceptance item with a known tier", () => {
  const ms = loadMilestones()
  const tiers = new Set(["A", "B", "C", "graceful"])
  for (const m of ms) {
    assert.ok(m.acceptance.length > 0, `${m.id} has no acceptance items`)
    for (const a of m.acceptance) assert.ok(tiers.has(a.tier), `${m.id}/${a.id} bad tier`)
  }
})

test("acceptance item ids are unique within a milestone and deps are valid", () => {
  const ms = loadMilestones()
  const ids = new Set(ms.map((m) => m.id))
  for (const m of ms) {
    const seen = new Set<string>()
    for (const a of m.acceptance) {
      assert.ok(!seen.has(a.id), `${m.id} duplicate item ${a.id}`)
      seen.add(a.id)
    }
    for (const d of m.deps) assert.ok(ids.has(d), `${m.id} dep ${d} not a milestone`)
  }
})

test("loadMilestones throws on a milestone with no acceptance items", () => {
  assert.throws(() => loadMilestones({ milestones: [{ id: "X", title: "x", requirement: "x", slices: [], deps: [], acceptance: [] }] as never }))
})

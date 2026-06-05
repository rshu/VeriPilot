import { test } from "node:test"
import assert from "node:assert"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Ledger } from "./ledger.ts"
import { crossLayerJoin } from "./cross-layer.ts"
import type { GateResult } from "./types.ts"

const gate = (mid: string, passed: boolean, failIds: string[] = []): GateResult => ({
  milestone: mid, passed,
  items: failIds.map((id) => ({ id, result: "fail" as const, evidence: "x" })),
  failures: failIds.map((id) => ({ id, result: "fail" as const, evidence: "x" })),
})

// Four evaluated milestones, one each in the 2x2, plus one un-gated milestone.
function buildLedger(): Ledger {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  // M1: flagged route + struggled (fail then pass)
  l.recordRoute("M1", { target: "KitA", flagged: true })
  l.record("M1", gate("M1", false, ["9.1.1"]))
  l.record("M1", gate("M1", true))
  // M2: clean route + first-pass
  l.recordRoute("M2", { target: "KitB", flagged: false })
  l.record("M2", gate("M2", true))
  // M3: flagged route + first-pass
  l.recordRoute("M3", { target: "KitC", flagged: true })
  l.record("M3", gate("M3", true))
  // M4: no routes + struggled
  l.record("M4", gate("M4", false, ["9.4.1"]))
  l.record("M4", gate("M4", true))
  // M5: routes only, never gated -> excluded from contingency
  l.recordRoute("M5", { target: "KitD", flagged: true })
  return l
}

test("crossLayerJoin builds the (flagged route) x (struggled) contingency", () => {
  const r = crossLayerJoin(buildLedger().snapshot())
  assert.deepEqual(r.contingency, {
    flaggedStruggled: 1, // M1: defective Kit route AND needed recovery
    flaggedClean: 1, // M3
    unflaggedStruggled: 1, // M4
    unflaggedClean: 1, // M2
  })
})

test("crossLayerJoin reports per-milestone routes/recovery and excludes un-gated from the contingency", () => {
  const r = crossLayerJoin(buildLedger().snapshot())
  const m1 = r.perMilestone.find((m) => m.milestone === "M1")!
  assert.deepEqual(m1.flaggedTargets, ["KitA"])
  assert.equal(m1.recoveryRounds, 1)
  assert.equal(m1.struggled, true)
  assert.equal(m1.passed, true)
  const m5 = r.perMilestone.find((m) => m.milestone === "M5")!
  assert.equal(m5.evaluated, false)
  assert.equal(m5.attempts, 0)
})

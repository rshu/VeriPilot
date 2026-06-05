import { test } from "node:test"
import assert from "node:assert"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Ledger } from "./ledger.ts"
import type { GateResult } from "./types.ts"

const gate = (mid: string, passed: boolean, failIds: string[] = []): GateResult => ({
  milestone: mid, passed,
  items: failIds.map((id) => ({ id, result: "fail" as const, evidence: "boom" })),
  failures: failIds.map((id) => ({ id, result: "fail" as const, evidence: "boom" })),
})

test("records an attempt and persists across reload", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  l.record("M0", gate("M0", true))
  const reloaded = new Ledger(file)
  assert.equal(reloaded.status("M0"), "passed")
  assert.equal(reloaded.attempts("M0").length, 1)
})

test("status is 'passed' on a passing gate, 'in_progress' on a failing one", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  l.record("M1", gate("M1", false, ["9.1.1"]))
  assert.equal(l.status("M1"), "in_progress")
  l.record("M1", gate("M1", true))
  assert.equal(l.status("M1"), "passed")
})

test("noProgress is true when the same failures repeat", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  l.record("M1", gate("M1", false, ["9.1.1"]))
  assert.equal(l.noProgress("M1"), false) // only one attempt
  l.record("M1", gate("M1", false, ["9.1.1"]))
  assert.equal(l.noProgress("M1"), true) // identical failing set twice in a row
})

test("noProgress is false when the failing set changes", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  l.record("M1", gate("M1", false, ["9.1.1", "9.1.2"]))
  l.record("M1", gate("M1", false, ["9.1.1"]))
  assert.equal(l.noProgress("M1"), false)
})

test("recordRoute appends route observations to an entry created without routes and persists", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vp-")), "state.json")
  const l = new Ledger(file)
  l.record("M1", gate("M1", false, ["9.1.1"])) // entry now exists with no `routes`
  l.recordRoute("M1", { target: "KitA", flagged: true })
  l.recordRoute("M1", { target: "KitB", flagged: false, note: "ok" })
  const reloaded = new Ledger(file)
  const routes = reloaded.routes("M1")
  assert.equal(routes.length, 2)
  assert.equal(routes[0]!.target, "KitA")
  assert.equal(routes[0]!.flagged, true)
  assert.equal(routes[0]!.milestone, "M1")
})

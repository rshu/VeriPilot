import { test } from "node:test"
import assert from "node:assert"
import { parseOhosReport, HypiumGate } from "./gate-hypium.ts"
import type { DeviceTestRunner } from "./gate-hypium.ts"
import type { Milestone } from "./types.ts"

// Captured verbatim from the HarmonyOS emulator (MultiShopping Tier-B smoke, 2026-06-05).
const REAL_PASS = `
OHOS_REPORT_SUM: 1
OHOS_REPORT_STATUS: class=MultiShoppingTierB
OHOS_REPORT_STATUS: test=harnessRunsOnDevice
OHOS_REPORT_STATUS_CODE: 1
OHOS_REPORT_STATUS: class=MultiShoppingTierB
OHOS_REPORT_STATUS: test=harnessRunsOnDevice
OHOS_REPORT_STATUS_CODE: 0
OHOS_REPORT_STATUS: consuming=1
OHOS_REPORT_RESULT: stream=Tests run: 1, Failure: 0, Error: 0, Pass: 1, Ignore: 0
OHOS_REPORT_CODE: 0
TestFinished-ResultCode: 0
`

test("parseOhosReport reads the real passing device output", () => {
  const r = parseOhosReport(REAL_PASS)
  assert.equal(r.tests["harnessRunsOnDevice"], "pass")
  assert.deepEqual(r.summary, { run: 1, failure: 0, error: 0, pass: 1, ignore: 0 })
  assert.equal(r.ok, true)
})

const MIXED = `
OHOS_REPORT_STATUS: test=9.1.1
OHOS_REPORT_STATUS_CODE: 1
OHOS_REPORT_STATUS: test=9.1.1
OHOS_REPORT_STATUS_CODE: 0
OHOS_REPORT_STATUS: test=9.1.2
OHOS_REPORT_STATUS_CODE: 1
OHOS_REPORT_STATUS: test=9.1.2
OHOS_REPORT_STATUS_CODE: 2
OHOS_REPORT_RESULT: stream=Tests run: 2, Failure: 1, Error: 0, Pass: 1, Ignore: 0
OHOS_REPORT_CODE: 0
`

test("parseOhosReport marks the last non-zero status code as a failure", () => {
  const r = parseOhosReport(MIXED)
  assert.equal(r.tests["9.1.1"], "pass")
  assert.equal(r.tests["9.1.2"], "fail")
})

const m = (acceptance: Milestone["acceptance"]): Milestone => ({
  id: "M1", title: "Browse", requirement: "x", slices: [], deps: [], acceptance,
})

test("HypiumGate maps each Tier-B item to the test of the same id", async () => {
  const runner: DeviceTestRunner = async () => ({ code: 0, output: MIXED })
  const gate = new HypiumGate(runner)
  const r = await gate.run(m([
    { id: "9.1.1", text: "browse loads", tier: "B" },
    { id: "9.1.2", text: "filter works", tier: "B" },
  ]))
  assert.equal(r.items.find((i) => i.id === "9.1.1")!.result, "pass")
  assert.equal(r.items.find((i) => i.id === "9.1.2")!.result, "fail")
  assert.equal(r.passed, false)
})

test("HypiumGate fails a Tier-B item with no matching device test", async () => {
  const runner: DeviceTestRunner = async () => ({ code: 0, output: REAL_PASS })
  const gate = new HypiumGate(runner)
  const r = await gate.run(m([{ id: "9.1.9", text: "missing", tier: "B" }]))
  assert.equal(r.failures[0]!.id, "9.1.9")
  assert.match(r.failures[0]!.evidence, /no device test/)
})

test("HypiumGate leaves non-Tier-B items as fail/'not run'", async () => {
  const runner: DeviceTestRunner = async () => ({ code: 0, output: REAL_PASS })
  const gate = new HypiumGate(runner)
  const r = await gate.run(m([{ id: "9.1.0", text: "builds", tier: "A" }]))
  assert.match(r.items[0]!.evidence, /Tier A not run by HypiumGate/)
})

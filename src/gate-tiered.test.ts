import { test } from "node:test"
import assert from "node:assert"
import { TieredGate } from "./gate-tiered.ts"
import { HvigorGate } from "./gate-hvigor.ts"
import { HypiumGate } from "./gate-hypium.ts"
import { ScreenshotJudgeGate } from "./gate-screenshot.ts"
import type { Milestone } from "./types.ts"

const full: Milestone = {
  id: "M5", title: "Pay", requirement: "x", slices: [], deps: [],
  acceptance: [
    { id: "9.5.0", text: "builds", tier: "A" },
    { id: "9.5.1", text: "checkout flow", tier: "B" },
    { id: "9.5.2", text: "looks right", tier: "C" },
    { id: "9.5.3", text: "biometric pay", tier: "graceful" },
  ],
}

const passReport = `
OHOS_REPORT_STATUS: test=9.5.1
OHOS_REPORT_STATUS_CODE: 0
OHOS_REPORT_RESULT: stream=Tests run: 1, Failure: 0, Error: 0, Pass: 1, Ignore: 0
OHOS_REPORT_CODE: 0
`

test("TieredGate routes each item to its tier's gate and auto-passes graceful", async () => {
  const gate = new TieredGate({
    A: new HvigorGate("/tmp/app", async () => ({ code: 0, output: "BUILD SUCCESSFUL" })),
    B: new HypiumGate(async () => ({ code: 0, output: passReport })),
    C: new ScreenshotJudgeGate(async () => ({ imagePath: "/tmp/x.jpeg" }), async () => ({ pass: true, reason: "ok" })),
  })
  const r = await gate.run(full)
  assert.equal(r.passed, true)
  assert.equal(r.items.find((i) => i.id === "9.5.0")!.result, "pass") // A
  assert.equal(r.items.find((i) => i.id === "9.5.1")!.result, "pass") // B
  assert.equal(r.items.find((i) => i.id === "9.5.2")!.result, "pass") // C
  assert.equal(r.items.find((i) => i.id === "9.5.3")!.result, "graceful") // graceful auto-pass
})

test("TieredGate surfaces a failure from any tier", async () => {
  const gate = new TieredGate({
    A: new HvigorGate("/tmp/app", async () => ({ code: 0, output: "BUILD SUCCESSFUL" })),
    B: new HypiumGate(async () => ({ code: 1, output: "OHOS_REPORT_STATUS: test=9.5.1\nOHOS_REPORT_STATUS_CODE: 2\n" })),
    C: new ScreenshotJudgeGate(async () => ({ imagePath: "/tmp/x.jpeg" }), async () => ({ pass: true, reason: "ok" })),
  })
  const r = await gate.run(full)
  assert.equal(r.passed, false)
  assert.equal(r.failures[0]!.id, "9.5.1")
})

test("TieredGate fails a present tier that has no configured sub-gate", async () => {
  const gate = new TieredGate({ A: new HvigorGate("/tmp/app", async () => ({ code: 0, output: "ok" })) })
  const r = await gate.run(full)
  const b = r.items.find((i) => i.id === "9.5.1")!
  assert.equal(b.result, "fail")
  assert.match(b.evidence, /no gate for Tier B/)
})

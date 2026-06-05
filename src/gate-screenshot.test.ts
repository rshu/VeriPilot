import { test } from "node:test"
import assert from "node:assert"
import { ScreenshotJudgeGate } from "./gate-screenshot.ts"
import type { Screenshotter, VisualJudge } from "./gate-screenshot.ts"
import type { Milestone } from "./types.ts"

const m = (acceptance: Milestone["acceptance"]): Milestone => ({
  id: "M2", title: "Detail", requirement: "x", slices: [], deps: [], acceptance,
})

test("ScreenshotJudgeGate rules each Tier-C item via the judge", async () => {
  const shoot: Screenshotter = async () => ({ imagePath: "/tmp/x.jpeg" })
  const judge: VisualJudge = async (item) =>
    item.id === "9.2.1" ? { pass: true, reason: "banner present" } : { pass: false, reason: "price missing" }
  const gate = new ScreenshotJudgeGate(shoot, judge)
  const r = await gate.run(m([
    { id: "9.2.1", text: "shows banner", tier: "C" },
    { id: "9.2.2", text: "shows price", tier: "C" },
  ]))
  assert.equal(r.items.find((i) => i.id === "9.2.1")!.result, "pass")
  const fail = r.items.find((i) => i.id === "9.2.2")!
  assert.equal(fail.result, "fail")
  assert.match(fail.evidence, /price missing/)
})

test("ScreenshotJudgeGate does not capture when there are no Tier-C items", async () => {
  let shots = 0
  const shoot: Screenshotter = async () => {
    shots++
    return { imagePath: "/tmp/x.jpeg" }
  }
  const judge: VisualJudge = async () => ({ pass: true, reason: "" })
  const gate = new ScreenshotJudgeGate(shoot, judge)
  await gate.run(m([{ id: "9.2.0", text: "builds", tier: "A" }]))
  assert.equal(shots, 0)
})

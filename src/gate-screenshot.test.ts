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

test("ScreenshotJudgeGate turns a capture failure into Tier-C fails, not a throw", async () => {
  const shoot: Screenshotter = async () => {
    throw new Error("hdc snapshot died")
  }
  const judge: VisualJudge = async () => ({ pass: true, reason: "" })
  const r = await new ScreenshotJudgeGate(shoot, judge).run(m([{ id: "9.2.1", text: "x", tier: "C" }]))
  assert.equal(r.passed, false)
  assert.match(r.items[0]!.evidence, /screenshot capture failed.*hdc snapshot died/)
})

test("ScreenshotJudgeGate turns a judge error into a Tier-C fail, not a throw", async () => {
  const shoot: Screenshotter = async () => ({ imagePath: "/tmp/x.jpeg" })
  const judge: VisualJudge = async () => {
    throw new Error("judge exploded")
  }
  const r = await new ScreenshotJudgeGate(shoot, judge).run(m([{ id: "9.2.1", text: "x", tier: "C" }]))
  assert.equal(r.passed, false)
  assert.match(r.items[0]!.evidence, /visual judge failed.*judge exploded/)
})

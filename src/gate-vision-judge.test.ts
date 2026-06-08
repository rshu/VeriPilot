import { test } from "node:test"
import assert from "node:assert"
import { parseVerdict, claudeVisionJudge, visionPrompt } from "./gate-vision-judge.ts"
import type { VisionRunner } from "./gate-vision-judge.ts"
import type { AcceptanceItem } from "./types.ts"

const item: AcceptanceItem = { id: "9.1.2", text: "pull-refresh shows a loading indicator", tier: "C" }

test("parseVerdict reads a clean single-line JSON verdict", () => {
  assert.deepEqual(parseVerdict('{"pass": true, "reason": "spinner visible"}'), { pass: true, reason: "spinner visible" })
})

test("parseVerdict tolerates prose around the JSON and takes the last verdict line", () => {
  const out = "Looking at the screenshot...\nHere is my verdict: {\"pass\": false, \"reason\": \"no spinner\"} done."
  assert.deepEqual(parseVerdict(out), { pass: false, reason: "no spinner" })
})

test("parseVerdict returns null when there is no JSON verdict", () => {
  assert.equal(parseVerdict("I could not open the image."), null)
})

test("parseVerdict ignores objects without a boolean pass", () => {
  assert.equal(parseVerdict('{"reason": "missing pass field"}'), null)
})

test("visionPrompt embeds the image path and the criterion", () => {
  const p = visionPrompt(item, "/tmp/veripilot-M1.jpeg")
  assert.match(p, /\/tmp\/veripilot-M1\.jpeg/)
  assert.match(p, /pull-refresh shows a loading indicator/)
})

test("claudeVisionJudge passes/fails per the model verdict", async () => {
  const yes: VisionRunner = async () => ({ code: 0, output: '{"pass": true, "reason": "spinner shown"}' })
  const no: VisionRunner = async () => ({ code: 0, output: '{"pass": false, "reason": "no spinner"}' })
  assert.deepEqual(await claudeVisionJudge({}, yes)(item, "/tmp/x.jpeg"), { pass: true, reason: "spinner shown" })
  assert.deepEqual(await claudeVisionJudge({}, no)(item, "/tmp/x.jpeg"), { pass: false, reason: "no spinner" })
})

test("claudeVisionJudge fails closed on a runner error or an unparseable verdict", async () => {
  const errored: VisionRunner = async () => ({ code: 1, output: "model overloaded" })
  const garbage: VisionRunner = async () => ({ code: 0, output: "the screen looks fine to me" })
  const e = await claudeVisionJudge({}, errored)(item, "/tmp/x.jpeg")
  assert.equal(e.pass, false)
  assert.match(e.reason, /vision judge failed \(exit 1\)/)
  const g = await claudeVisionJudge({}, garbage)(item, "/tmp/x.jpeg")
  assert.equal(g.pass, false)
  assert.match(g.reason, /no parseable verdict/)
})

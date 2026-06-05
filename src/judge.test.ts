import { test } from "node:test"
import assert from "node:assert"
import { TemplateJudge } from "./judge.ts"
import type { Milestone, GateItem } from "./types.ts"

const m: Milestone = {
  id: "M1", title: "Browse", requirement: "show the product list", slices: [], deps: [],
  acceptance: [{ id: "9.1.1", text: "product list displays", tier: "B" }],
}

test("TemplateJudge builds feedback that names each gap, its evidence, and the milestone", () => {
  const failures: GateItem[] = [{ id: "9.1.1", result: "fail", evidence: "list is empty" }]
  const fb = new TemplateJudge().compose(m, failures)
  assert.deepEqual(fb.gaps.map((g) => g.id), ["9.1.1"])
  assert.match(fb.text, /M1/)
  assert.match(fb.text, /product list displays/)
  assert.match(fb.text, /list is empty/)
})

test("TemplateJudge never names a Kit (kit selection is VeriKit's job)", () => {
  const failures: GateItem[] = [{ id: "9.1.1", result: "fail", evidence: "x" }]
  const fb = new TemplateJudge().compose(m, failures)
  assert.doesNotMatch(fb.text.toLowerCase(), /-kit\b|notification-kit|arkdata/)
})

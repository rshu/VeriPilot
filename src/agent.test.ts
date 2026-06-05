import { test } from "node:test"
import assert from "node:assert"
import { FakeAgent } from "./agent.ts"

test("FakeAgent records every prompt it is dispatched", async () => {
  const a = new FakeAgent()
  await a.run("do M0")
  await a.run("fix gap 9.1.1")
  assert.deepEqual(a.prompts, ["do M0", "fix gap 9.1.1"])
})

test("FakeAgent can run an onRun side effect (e.g., simulate editing the repo)", async () => {
  let edits = 0
  const a = new FakeAgent(() => { edits++ })
  await a.run("x")
  assert.equal(edits, 1)
})

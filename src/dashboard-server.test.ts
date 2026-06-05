import { test } from "node:test"
import assert from "node:assert"
import { reduce, emptyState, startDashboard } from "./dashboard-server.ts"
import type { VeriPilotEvent } from "./events.ts"
import type { GateResult } from "./types.ts"

const gate = (id: string, passed: boolean, failIds: string[] = []): GateResult => ({
  milestone: id, passed,
  items: failIds.map((i) => ({ id: i, result: "fail" as const, evidence: "x" })),
  failures: failIds.map((i) => ({ id: i, result: "fail" as const, evidence: "x" })),
})

const sequence: VeriPilotEvent[] = [
  { type: "run:start", ts: 1, milestones: [{ id: "M1", title: "Browse" }] },
  { type: "milestone:start", ts: 2, id: "M1", title: "Browse", requirement: "show items", acceptance: [{ id: "M1.a", text: "loads", tier: "B" }] },
  { type: "attempt:start", ts: 3, id: "M1", attempt: 1 },
  { type: "attempt:result", ts: 4, id: "M1", attempt: 1, gate: gate("M1", false, ["M1.a"]), feedback: undefined },
  { type: "attempt:start", ts: 5, id: "M1", attempt: 2 },
  { type: "attempt:result", ts: 6, id: "M1", attempt: 2, gate: gate("M1", true), feedback: "fix loads" },
  { type: "milestone:end", ts: 7, id: "M1", status: "passed" },
  { type: "run:end", ts: 8 },
]

test("reduce folds a full event sequence into the dashboard state", () => {
  const state = sequence.reduce(reduce, emptyState())
  assert.deepEqual(state.order, ["M1"])
  assert.equal(state.running, false)
  const m = state.milestones["M1"]!
  assert.equal(m.title, "Browse")
  assert.equal(m.requirement, "show items")
  assert.equal(m.status, "passed")
  assert.equal(m.activeAttempt, null)
  assert.equal(m.attempts.length, 2)
  assert.equal(m.attempts[0]!.gate.passed, false)
  assert.equal(m.attempts[1]!.gate.passed, true)
})

test("reduce marks the in-flight attempt active until its result arrives", () => {
  const partial = sequence.slice(0, 3).reduce(reduce, emptyState()) // up to attempt:start
  assert.equal(partial.milestones["M1"]!.activeAttempt, 1)
  assert.equal(partial.milestones["M1"]!.status, "in_progress")
})

test("GET /api/state reflects events fed to the sink", async () => {
  const srv = await startDashboard({ port: 0 })
  try {
    let res = await fetch(`${srv.url}/api/state`)
    assert.deepEqual((await res.json()).order, [])
    for (const e of sequence) srv.sink.emit(e)
    res = await fetch(`${srv.url}/api/state`)
    const state = await res.json()
    assert.deepEqual(state.order, ["M1"])
    assert.equal(state.milestones["M1"].status, "passed")
  } finally {
    srv.stop()
  }
})

test("GET /api/events streams emitted events as SSE", async () => {
  const srv = await startDashboard({ port: 0 })
  try {
    const res = await fetch(`${srv.url}/api/events`)
    const reader = res.body!.getReader()
    srv.sink.emit({ type: "run:end", ts: 99 })
    const dec = new TextDecoder()
    let buf = ""
    for (let i = 0; i < 50 && !/data: .+/.test(buf); i++) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
    }
    assert.match(buf, /data: .*"type":"run:end"/)
    await reader.cancel()
  } finally {
    srv.stop()
  }
})

test("GET /api/screenshot/:id 404s for an unknown milestone and rejects bad ids", async () => {
  const srv = await startDashboard({ port: 0, screenshotsDir: "/tmp" })
  try {
    assert.equal((await fetch(`${srv.url}/api/screenshot/nope`)).status, 404)
    assert.equal((await fetch(`${srv.url}/api/screenshot/..%2f..%2fetc`)).status, 404)
  } finally {
    srv.stop()
  }
})

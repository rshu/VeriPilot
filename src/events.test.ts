import { test } from "node:test"
import assert from "node:assert"
import { FanoutSink, noopSink } from "./events.ts"
import type { VeriPilotEvent } from "./events.ts"

const ev = (): VeriPilotEvent => ({ type: "run:end", ts: 1 })

test("noopSink.emit does not throw", () => {
  noopSink.emit(ev())
})

test("FanoutSink forwards each event to all subscribers", () => {
  const f = new FanoutSink()
  const a: VeriPilotEvent[] = []
  const b: VeriPilotEvent[] = []
  f.subscribe((e) => a.push(e))
  f.subscribe((e) => b.push(e))
  f.emit(ev())
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
})

test("FanoutSink unsubscribe stops further delivery", () => {
  const f = new FanoutSink()
  const got: VeriPilotEvent[] = []
  const off = f.subscribe((e) => got.push(e))
  f.emit(ev())
  off()
  f.emit(ev())
  assert.equal(got.length, 1)
})

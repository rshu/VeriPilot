import { execFile } from "node:child_process"
import type { Gate } from "./gate.ts"
import type { GateItem, GateResult, Milestone } from "./types.ts"

/** Per-test outcome parsed from an `aa test` (hypium) OHOS_REPORT stream. */
export interface OhosTestReport {
  tests: Record<string, "pass" | "fail"> // keyed by the `it` name (the test= field)
  summary: { run: number; pass: number; failure: number; error: number; ignore: number } | null
  ok: boolean // OHOS_REPORT_CODE === 0 (the run reported overall success)
}

/**
 * Parse the OHOS_REPORT_* stream emitted by `hdc shell aa test`. Per test the
 * framework prints `OHOS_REPORT_STATUS: test=<name>` then
 * `OHOS_REPORT_STATUS_CODE: <n>` (1=start, 0=pass, anything else=fail); the LAST
 * code seen for a name is its terminal outcome. The trailing
 * `OHOS_REPORT_RESULT: Tests run: ...` line carries the aggregate counts and
 * `OHOS_REPORT_CODE` the overall exit. Matched against real device output
 * (MultiShopping Tier-B smoke, 2026-06-05).
 */
export function parseOhosReport(output: string): OhosTestReport {
  const last: Record<string, number> = {}
  let current = ""
  let summary: OhosTestReport["summary"] = null
  let ok = false
  for (const raw of output.split("\n")) {
    const line = raw.trim()
    const t = /^OHOS_REPORT_STATUS:\s*test=(.+)$/.exec(line)
    if (t) {
      current = t[1]!.trim()
      continue
    }
    const c = /^OHOS_REPORT_STATUS_CODE:\s*(-?\d+)$/.exec(line)
    if (c && current) {
      last[current] = Number(c[1]!)
      continue
    }
    const r = /Tests run:\s*(\d+),\s*Failure:\s*(\d+),\s*Error:\s*(\d+),\s*Pass:\s*(\d+),\s*Ignore:\s*(\d+)/.exec(line)
    if (r) {
      summary = { run: +r[1]!, failure: +r[2]!, error: +r[3]!, pass: +r[4]!, ignore: +r[5]! }
      continue
    }
    const code = /^OHOS_REPORT_CODE:\s*(-?\d+)$/.exec(line)
    if (code) ok = Number(code[1]!) === 0
  }
  const tests: Record<string, "pass" | "fail"> = {}
  for (const [name, code] of Object.entries(last)) tests[name] = code === 0 ? "pass" : "fail"
  return { tests, summary, ok }
}

/** Runs the milestone's on-device tests and returns the raw `aa test` output. */
export type DeviceTestRunner = (milestone: Milestone) => Promise<{ code: number; output: string }>

/**
 * Tier-B gate: runs on-device hypium tests and maps each Tier-B acceptance item
 * to the `it` of the same id (convention: name the test after the acceptance id,
 * e.g. `it("9.1.1", ...)`). Non-Tier-B items are left as fail/"not run"; a
 * {@link TieredGate} overrides them with the owning tier's result.
 */
export class HypiumGate implements Gate {
  constructor(private runner: DeviceTestRunner) {}
  async run(milestone: Milestone): Promise<GateResult> {
    const res = await this.runner(milestone)
    const report = parseOhosReport(res.output)
    const items: GateItem[] = milestone.acceptance.map((a) => {
      if (a.tier !== "B") return { id: a.id, result: "fail", evidence: `Tier ${a.tier} not run by HypiumGate` }
      const outcome = report.tests[a.id]
      if (outcome === undefined) return { id: a.id, result: "fail", evidence: `no device test '${a.id}' in OHOS_REPORT` }
      return { id: a.id, result: outcome, evidence: outcome === "pass" ? "" : `device test '${a.id}' failed` }
    })
    const failures = items.filter((i) => i.result === "fail")
    return { milestone: milestone.id, passed: failures.length === 0, items, failures }
  }
}

export interface HdcTestConfig {
  hdc: string // path to the hdc binary
  bundle: string // app bundle name (aa test -b)
  testModule: string // ohosTest module name (aa test -m), e.g. "phone_test"
  testClass: string // hypium describe() name (aa test -s class)
  appHap: string // path to the app HAP (installed unsigned)
  testHap: string // path to the ohosTest HAP (installed unsigned)
  runner?: string // aa test -s unittest, default "/ets/testrunner/OpenHarmonyTestRunner"
  timeoutSec?: number // aa test -w, default 40
}

/**
 * Default runner: installs the (unsigned) app + test HAPs and runs `aa test`.
 * Proven against the HarmonyOS emulator 2026-06-05 — the emulator accepts
 * unsigned dev HAPs, so no signing/Huawei-account step is needed.
 */
export function hdcDeviceTestRunner(cfg: HdcTestConfig): DeviceTestRunner {
  const runner = cfg.runner ?? "/ets/testrunner/OpenHarmonyTestRunner"
  const w = String(cfg.timeoutSec ?? 40)
  const sh = (args: string[]) =>
    new Promise<{ code: number; output: string }>((resolve) => {
      execFile(cfg.hdc, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({ code: err ? 1 : 0, output: `${stdout}\n${stderr}` })
      })
    })
  return async () => {
    await sh(["install", "-r", cfg.appHap])
    await sh(["install", "-r", cfg.testHap])
    return sh([
      "shell", "aa", "test",
      "-b", cfg.bundle,
      "-m", cfg.testModule,
      "-s", "unittest", runner,
      "-s", "class", cfg.testClass,
      "-w", w,
    ])
  }
}

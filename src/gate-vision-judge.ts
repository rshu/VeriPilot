import { execFile } from "node:child_process"
import path from "node:path"
import type { AcceptanceItem } from "./types.ts"
import type { VisualJudge } from "./gate-screenshot.ts"

/** Runs the vision model on (prompt, image) and returns its raw output. Injectable
 *  so the judge logic is unit-testable without a real model call. */
export type VisionRunner = (prompt: string, imagePath: string) => Promise<{ code: number; output: string }>

export interface VisionJudgeConfig {
  claude?: string // path to a vision-capable judge CLI, default "claude"
  model?: string // judge model — SHOULD be a DIFFERENT family than the coding agent to avoid self-grading
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000

/** The strict acceptance-review prompt: the model views the screenshot and emits a verdict. */
export function visionPrompt(item: AcceptanceItem, imagePath: string): string {
  return [
    "You are a strict UI acceptance reviewer for a mobile app screenshot.",
    `View the screenshot image at: ${imagePath} (use your file-reading tool to open and look at it).`,
    `Acceptance criterion to judge: "${item.text}"`,
    "Decide whether the screenshot CLEARLY satisfies the criterion. Be strict: if you cannot see clear evidence, fail it.",
    "Respond with ONLY a single JSON object as the last line, no other prose:",
    '{"pass": true|false, "reason": "<one short sentence of visual evidence>"}',
  ].join("\n")
}

/** Extract the verdict: the last line that contains a JSON object with a boolean `pass`. */
export function parseVerdict(output: string): { pass: boolean; reason: string } | null {
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const start = lines[i]!.indexOf("{")
    const end = lines[i]!.lastIndexOf("}")
    if (start < 0 || end < start) continue
    try {
      const obj = JSON.parse(lines[i]!.slice(start, end + 1)) as { pass?: unknown; reason?: unknown }
      if (typeof obj.pass === "boolean") return { pass: obj.pass, reason: typeof obj.reason === "string" ? obj.reason : "" }
    } catch {
      // not JSON on this line; keep scanning upward
    }
  }
  return null
}

/** Default runner: a vision-capable `claude -p` that reads the screenshot file. */
export function claudeVisionRunner(cfg: VisionJudgeConfig): VisionRunner {
  const bin = cfg.claude ?? "claude"
  const timeout = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return (prompt, imagePath) =>
    new Promise((resolve) => {
      const args = ["-p", prompt, "--output-format", "text", "--permission-mode", "acceptEdits", "--add-dir", path.dirname(imagePath)]
      if (cfg.model) args.push("--model", cfg.model)
      execFile(bin, args, { maxBuffer: 16 * 1024 * 1024, timeout, killSignal: "SIGTERM" }, (err, stdout, stderr) => {
        resolve({ code: err ? 1 : 0, output: [stdout, stderr, (err as Error | null)?.message].filter(Boolean).join("\n") })
      })
    })
}

/**
 * A real Tier-C {@link VisualJudge}: a vision model views the screenshot and
 * rules on the acceptance criterion. Fails CLOSED — a non-zero run or an
 * unparseable verdict is a fail (a verification gate must never pass on doubt).
 * Configure `model` to a DIFFERENT family than the coding agent so Tier-C is not
 * self-graded; the κ validation sub-study quantifies judge agreement.
 */
export function claudeVisionJudge(cfg: VisionJudgeConfig = {}, runner: VisionRunner = claudeVisionRunner(cfg)): VisualJudge {
  return async (item, imagePath) => {
    const res = await runner(visionPrompt(item, imagePath), imagePath)
    if (res.code !== 0) {
      const tail = res.output.split("\n").slice(-4).join(" ").slice(0, 160)
      return { pass: false, reason: `vision judge failed (exit ${res.code}): ${tail}` }
    }
    return parseVerdict(res.output) ?? { pass: false, reason: "vision judge returned no parseable verdict" }
  }
}

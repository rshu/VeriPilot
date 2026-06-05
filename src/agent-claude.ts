import { execFile } from "node:child_process"
import type { Agent } from "./agent.ts"

/** Runs the agent for one dispatch and returns its exit code + combined output. */
export type AgentRunner = (prompt: string) => Promise<{ code: number; output: string }>

export interface ClaudeCodeAgentConfig {
  cwd: string // the project dir the agent edits (claude operates on its cwd)
  claude?: string // path to the claude binary, default "claude"
  model?: string // --model (e.g. "opus", "sonnet", or a full id)
  permissionMode?: string // --permission-mode, default "acceptEdits"
  skipPermissions?: boolean // --dangerously-skip-permissions (autonomous/sandboxed runs)
  appendSystemPrompt?: string // --append-system-prompt (extra system-prompt guidance)
  addDirs?: string[] // --add-dir
  extraArgs?: string[] // any additional claude flags
  timeoutMs?: number // kill the headless agent after this long so an unattended run can't hang forever (default 30 min)
  killSignal?: NodeJS.Signals // signal used on timeout (default "SIGTERM")
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Build the argv for a headless (`-p`) Claude Code run. Pure + exported so the
 * flag wiring is unit-testable without spawning the CLI.
 */
export function buildClaudeArgs(cfg: ClaudeCodeAgentConfig, prompt: string): string[] {
  const args = ["-p", prompt, "--output-format", "text"]
  if (cfg.model) args.push("--model", cfg.model)
  if (cfg.skipPermissions) args.push("--dangerously-skip-permissions")
  else args.push("--permission-mode", cfg.permissionMode ?? "acceptEdits")
  if (cfg.appendSystemPrompt) args.push("--append-system-prompt", cfg.appendSystemPrompt)
  for (const dir of cfg.addDirs ?? []) args.push("--add-dir", dir)
  if (cfg.extraArgs) args.push(...cfg.extraArgs)
  return args
}

/** Default runner: spawn `claude -p ...` in the project dir (claude acts on cwd).
 *  Bounded by a timeout so an unattended run can't hang forever; err.message is
 *  folded into the output so an ENOENT/timeout/maxBuffer failure (empty streams)
 *  still yields a diagnosable, non-empty error. */
export function claudeRunner(cfg: ClaudeCodeAgentConfig): AgentRunner {
  const bin = cfg.claude ?? "claude"
  const timeout = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return (prompt) =>
    new Promise((resolve) => {
      execFile(
        bin,
        buildClaudeArgs(cfg, prompt),
        { cwd: cfg.cwd, maxBuffer: 64 * 1024 * 1024, timeout, killSignal: cfg.killSignal ?? "SIGTERM" },
        (err, stdout, stderr) => {
          const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string }) | null
          const timedOut = !!e && (e.killed === true || e.signal != null)
          const note = timedOut ? `agent timed out after ${timeout}ms` : e?.message
          resolve({ code: err ? 1 : 0, output: [stdout, stderr, note].filter(Boolean).join("\n") })
        },
      )
    })
}

/**
 * Real {@link Agent}: drives headless Claude Code (`claude -p`) in the project
 * dir to act on a dispatched milestone prompt. Edits happen as a side effect;
 * the gate then checks the result. For fully autonomous runs set
 * `skipPermissions: true` (or `permissionMode: "bypassPermissions"`) so non-edit
 * tools (bash, etc.) don't block on a prompt. Extra system-prompt guidance can
 * be carried via `appendSystemPrompt`.
 */
export class ClaudeCodeAgent implements Agent {
  private runner: AgentRunner
  constructor(cfg: ClaudeCodeAgentConfig, runner?: AgentRunner) {
    this.runner = runner ?? claudeRunner(cfg)
  }
  async run(prompt: string): Promise<void> {
    const { code, output } = await this.runner(prompt)
    if (code !== 0) {
      const tail = output.split("\n").slice(-6).join("\n").trim()
      throw new Error(`claude agent failed (exit ${code}): ${tail}`)
    }
  }
}

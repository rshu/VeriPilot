import { test } from "node:test"
import assert from "node:assert"
import { buildClaudeArgs, ClaudeCodeAgent, claudeRunner } from "./agent-claude.ts"
import type { AgentRunner } from "./agent-claude.ts"

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

test("buildClaudeArgs uses print mode + acceptEdits by default", () => {
  const args = buildClaudeArgs({ cwd: "/app" }, "do the thing")
  assert.deepEqual(args, ["-p", "do the thing", "--output-format", "text", "--permission-mode", "acceptEdits"])
})

test("buildClaudeArgs switches to skip-permissions and threads model/system/dirs", () => {
  const args = buildClaudeArgs(
    { cwd: "/app", model: "opus", skipPermissions: true, appendSystemPrompt: "use VeriKit", addDirs: ["/lib"] },
    "x",
  )
  assert.ok(args.includes("--dangerously-skip-permissions"))
  assert.ok(!args.includes("--permission-mode"))
  assert.equal(after(args, "--model"), "opus")
  assert.equal(after(args, "--append-system-prompt"), "use VeriKit")
  assert.equal(after(args, "--add-dir"), "/lib")
})

test("ClaudeCodeAgent resolves and passes the prompt through when the runner exits 0", async () => {
  let seen = ""
  const runner: AgentRunner = async (p) => {
    seen = p
    return { code: 0, output: "done" }
  }
  await new ClaudeCodeAgent({ cwd: "/app" }, runner).run("edit M1")
  assert.equal(seen, "edit M1")
})

test("ClaudeCodeAgent throws with the output tail when the runner fails", async () => {
  const runner: AgentRunner = async () => ({ code: 1, output: "line1\nboom: model overloaded" })
  await assert.rejects(
    () => new ClaudeCodeAgent({ cwd: "/app" }, runner).run("edit M1"),
    /claude agent failed \(exit 1\)[\s\S]*model overloaded/,
  )
})

test("claudeRunner maps a missing binary to exit 1 with a diagnosable message, and run() rejects", async () => {
  const cfg = { cwd: process.cwd(), claude: "definitely-not-a-real-bin-xyz" }
  const res = await claudeRunner(cfg)("x")
  assert.equal(res.code, 1)
  assert.ok(res.output.trim().length > 0) // err.message folded in -> non-empty
  await assert.rejects(() => new ClaudeCodeAgent(cfg).run("x"), /claude agent failed \(exit 1\)/)
})

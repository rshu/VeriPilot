/** Drives a coding agent that edits the app repo. The real implementation
 *  (ClaudeCodeAgent) spawns headless Claude Code; the agent is the only thing
 *  that writes code — gates judge the outcome. */
export interface Agent {
  run(prompt: string): Promise<void>
}

export class FakeAgent implements Agent {
  readonly prompts: string[] = []
  constructor(private onRun?: (prompt: string) => void) {}
  async run(prompt: string): Promise<void> {
    this.prompts.push(prompt)
    this.onRun?.(prompt)
  }
}

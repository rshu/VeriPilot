/** Drives a coding agent that edits the app repo. The real implementation
 *  (follow-on plan) spawns headless Claude Code + the VeriKit plugin. */
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

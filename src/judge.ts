import type { Feedback, GateItem, Milestone } from "./types.ts"

export interface Judge {
  compose(milestone: Milestone, failures: GateItem[]): Feedback
}

/**
 * Deterministic, outcome-level feedback. Names the unmet acceptance items and
 * their evidence, never a Kit (kit choice is VeriKit's responsibility — a
 * wrong kit surfaces here only as an unmet outcome). The real LLM judge in the
 * follow-on plan implements this same interface.
 */
export class TemplateJudge implements Judge {
  compose(milestone: Milestone, failures: GateItem[]): Feedback {
    const byId = new Map(milestone.acceptance.map((a) => [a.id, a.text]))
    const gaps = failures.map((f) => ({ id: f.id, why: f.evidence }))
    const lines = failures.map(
      (f) => `- [${f.id}] not met: "${byId.get(f.id) ?? f.id}" — evidence: ${f.evidence || "(none)"}`,
    )
    const text = [
      `Milestone ${milestone.id} ("${milestone.title}") is not yet complete.`,
      `Goal: ${milestone.requirement}`,
      `The following acceptance items still fail; fix each so it passes:`,
      ...lines,
    ].join("\n")
    return { milestone: milestone.id, gaps, text }
  }
}

import type { DashboardMilestone } from "../types"

const firstLine = (s: string) => s.split("\n")[0]?.slice(0, 120) ?? ""

export function AttemptTimeline({ milestone }: { milestone: DashboardMilestone }) {
  return (
    <section className="timeline-panel">
      <h2>
        {milestone.id} · {milestone.title}
      </h2>
      <p className="req muted">{milestone.requirement || "—"}</p>
      <ol className="timeline">
        {milestone.attempts.map((a) => (
          <li key={a.n} className={a.gate.passed ? "pass" : "fail"}>
            <span className="n">#{a.n}</span>
            {a.gate.passed ? (
              <span className="ok">✓ gate passed</span>
            ) : (
              <span className="bad">
                ✗ {firstLine(a.gate.failures[0]?.evidence ?? "") || a.gate.failures.map((f) => f.id).join(", ") || "failed"}
                {a.gate.failures.length > 1 && <em className="muted"> (+{a.gate.failures.length - 1} more)</em>}
              </span>
            )}
            {a.feedback && <div className="feedback muted">↳ feedback sent to agent</div>}
          </li>
        ))}
        {milestone.activeAttempt != null && (
          <li className="active">
            <span className="n">#{milestone.activeAttempt}</span>
            <span className="working">… agent working</span>
          </li>
        )}
        {milestone.attempts.length === 0 && milestone.activeAttempt == null && (
          <li className="muted">No attempts yet.</li>
        )}
      </ol>
    </section>
  )
}

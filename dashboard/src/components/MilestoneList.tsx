import type { DashboardMilestone, DashboardState, ItemResult, Tier } from "../types"

const STATUS_ICON: Record<string, string> = { pending: "⬜", in_progress: "⏳", passed: "✅", escalated: "⬛" }
const TIERS: Tier[] = ["A", "B", "C"]

function latestResults(m: DashboardMilestone): Map<string, ItemResult> {
  const last = m.attempts.at(-1)
  return new Map((last?.gate.items ?? []).map((it) => [it.id, it.result]))
}

function tierBadge(m: DashboardMilestone, tier: Tier, results: Map<string, ItemResult>) {
  const items = m.acceptance.filter((a) => a.tier === tier)
  if (items.length === 0) return null
  const states = items.map((a) => results.get(a.id))
  const sym = states.every((r) => r === "pass" || r === "graceful")
    ? "✅"
    : states.some((r) => r === "fail")
      ? "❌"
      : "▫"
  return (
    <span key={tier} className="badge" title={`Tier ${tier}`}>
      {tier}
      {sym}
    </span>
  )
}

function counts(m: DashboardMilestone, results: Map<string, ItemResult>) {
  const passed = m.acceptance.filter((a) => {
    const r = results.get(a.id)
    return r === "pass" || r === "graceful" || a.tier === "graceful"
  }).length
  return { passed, total: m.acceptance.length }
}

export function MilestoneList({
  state,
  selected,
  onSelect,
}: {
  state: DashboardState
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <ul className="milestones">
      {state.order.map((id) => {
        const m = state.milestones[id]
        if (!m) return null
        const results = latestResults(m)
        const c = counts(m, results)
        return (
          <li
            key={id}
            className={`row ${m.status} ${selected === id ? "sel" : ""}`}
            onClick={() => onSelect(id)}
          >
            <span className="ic">{STATUS_ICON[m.status] ?? "⬜"}</span>
            <span className="mid">{m.id}</span>
            <span className="title">{m.title}</span>
            <span className="count muted">
              {c.passed}/{c.total}
            </span>
            <span className="badges">{TIERS.map((t) => tierBadge(m, t, results))}</span>
            <span className="att muted">
              {m.activeAttempt ? `attempt ${m.activeAttempt}…` : `${m.attempts.length} att`}
            </span>
          </li>
        )
      })}
      {state.order.length === 0 && <li className="row empty muted">No run yet…</li>}
    </ul>
  )
}

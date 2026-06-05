import { useEffect, useMemo, useState } from "react"
import { fetchState, subscribe } from "./api"
import type { DashboardState } from "./types"
import { MilestoneList } from "./components/MilestoneList"
import { AttemptTimeline } from "./components/AttemptTimeline"
import { ScreenshotPanel } from "./components/ScreenshotPanel"

const EMPTY: DashboardState = { order: [], milestones: {}, running: false }

export function App() {
  const [state, setState] = useState<DashboardState>(EMPTY)
  const [live, setLive] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const refresh = () =>
      fetchState()
        .then((s) => alive && setState(s))
        .catch(() => {})
    refresh()
    const off = subscribe(refresh, (l) => alive && setLive(l))
    return () => {
      alive = false
      off()
    }
  }, [])

  const sel = selected && state.milestones[selected] ? selected : (state.order[0] ?? null)
  const milestone = sel ? state.milestones[sel] : undefined

  const progress = useMemo(() => {
    const ms = state.order.map((id) => state.milestones[id]).filter(Boolean)
    return { passed: ms.filter((m) => m!.status === "passed").length, total: ms.length }
  }, [state])

  return (
    <div className="app">
      <header>
        <h1>
          VeriPilot <span className="muted">— milestone monitor</span>
        </h1>
        <div className={`live ${live ? "on" : "off"}`}>{live ? "● live" : "○ offline"}</div>
      </header>
      <div className="progress">
        {progress.passed}/{progress.total} milestones passed
        {state.running ? " · run in progress" : ""}
      </div>
      <div className="cols">
        <MilestoneList state={state} selected={sel} onSelect={setSelected} />
        <div className="detail">
          {milestone ? (
            <>
              <AttemptTimeline milestone={milestone} />
              <ScreenshotPanel milestone={milestone} />
            </>
          ) : (
            <p className="muted">Waiting for a run to start…</p>
          )}
        </div>
      </div>
    </div>
  )
}

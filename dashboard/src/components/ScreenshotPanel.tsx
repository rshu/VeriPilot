import { useState } from "react"
import type { DashboardMilestone } from "../types"

export function ScreenshotPanel({ milestone }: { milestone: DashboardMilestone }) {
  const [missing, setMissing] = useState(false)
  // Cache-bust on attempt count so the image refreshes as the run progresses.
  const src = `/api/screenshot/${encodeURIComponent(milestone.id)}?v=${milestone.attempts.length}`
  return (
    <section className="shot">
      <h3>Latest screen (Tier-C)</h3>
      {missing ? (
        <div className="shot-empty muted">no screenshot captured</div>
      ) : (
        <img
          key={src}
          src={src}
          alt={`latest screenshot for ${milestone.id}`}
          onLoad={() => setMissing(false)}
          onError={() => setMissing(true)}
        />
      )}
    </section>
  )
}

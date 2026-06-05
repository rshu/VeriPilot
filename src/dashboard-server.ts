import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { FanoutSink, type EventSink, type VeriPilotEvent } from "./events.ts"
import type { AcceptanceItem, GateResult, MilestoneStatus } from "./types.ts"

export interface DashboardMilestone {
  id: string
  title: string
  requirement: string
  acceptance: AcceptanceItem[]
  status: MilestoneStatus
  activeAttempt: number | null // the in-flight attempt number, or null when idle
  attempts: { n: number; gate: GateResult; feedback?: string }[]
}

export interface DashboardState {
  order: string[] // milestone ids in plan order
  milestones: Record<string, DashboardMilestone>
  running: boolean
}

export function emptyState(): DashboardState {
  return { order: [], milestones: {}, running: false }
}

/** Pure: fold one event into the dashboard state. Shared shape with the client,
 *  and reconstructable from a persisted ledger by replaying its attempts. */
export function reduce(state: DashboardState, e: VeriPilotEvent): DashboardState {
  const milestones = { ...state.milestones }
  const at = (id: string): DashboardMilestone =>
    milestones[id] ?? { id, title: id, requirement: "", acceptance: [], status: "pending", activeAttempt: null, attempts: [] }
  switch (e.type) {
    case "run:start": {
      for (const m of e.milestones) milestones[m.id] = { ...at(m.id), title: m.title }
      return { order: e.milestones.map((m) => m.id), milestones, running: true }
    }
    case "milestone:start":
      milestones[e.id] = { ...at(e.id), title: e.title, requirement: e.requirement, acceptance: e.acceptance, status: "in_progress", activeAttempt: null }
      return { ...state, milestones }
    case "attempt:start":
      milestones[e.id] = { ...at(e.id), status: "in_progress", activeAttempt: e.attempt }
      return { ...state, milestones }
    case "attempt:result": {
      const cur = at(e.id)
      milestones[e.id] = { ...cur, activeAttempt: null, attempts: [...cur.attempts, { n: e.attempt, gate: e.gate, feedback: e.feedback }] }
      return { ...state, milestones }
    }
    case "milestone:end":
      milestones[e.id] = { ...at(e.id), status: e.status, activeAttempt: null }
      return { ...state, milestones }
    case "run:end":
      return { ...state, running: false }
  }
}

export interface DashboardServer {
  sink: EventSink // hand this to the orchestrator's `events`
  port: number
  url: string
  state(): DashboardState
  stop(): void
}

export interface DashboardOptions {
  port?: number // default 4317; pass 0 for an ephemeral port (tests)
  screenshotsDir?: string // default os.tmpdir(); serves veripilot-<id>.jpeg
  distDir?: string // built dashboard (dashboard/dist); if absent, serves a stub page
}

const CORS = { "access-control-allow-origin": "*" }
const safeId = (id: string) => /^[A-Za-z0-9._-]+$/.test(id)

export function startDashboard(opts: DashboardOptions = {}): Promise<DashboardServer> {
  const fan = new FanoutSink()
  let state = emptyState()
  const sink: EventSink = {
    emit(e) {
      state = reduce(state, e)
      fan.emit(e)
    },
  }
  const screenshotsDir = opts.screenshotsDir ?? tmpdir()

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? "/").split("?")[0]!
    if (url === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", ...CORS })
      res.end(JSON.stringify(state))
    } else if (url === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS })
      res.write(": connected\n\n")
      const off = fan.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`))
      req.on("close", off)
    } else if (url.startsWith("/api/screenshot/")) {
      const id = decodeURIComponent(url.slice("/api/screenshot/".length))
      const file = path.join(screenshotsDir, `veripilot-${id}.jpeg`)
      if (!safeId(id) || !existsSync(file)) {
        res.writeHead(404, CORS)
        res.end()
      } else {
        res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store", ...CORS })
        res.end(readFileSync(file))
      }
    } else {
      serveStatic(res, opts.distDir, url)
    }
  })

  return new Promise((resolve) => {
    server.listen(opts.port ?? 4317, () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 4317)
      resolve({ sink, port, url: `http://localhost:${port}`, state: () => state, stop: () => server.close() })
    })
  })
}

const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon",
}

function serveStatic(res: ServerResponse, distDir: string | undefined, url: string): void {
  if (!distDir) {
    res.writeHead(200, { "content-type": "text/html" })
    res.end(STUB_HTML)
    return
  }
  const root = path.resolve(distDir)
  let file = path.join(root, url === "/" ? "index.html" : url.replace(/^\/+/, ""))
  if (!file.startsWith(root)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, "index.html") // SPA fallback
  if (!existsSync(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
}

const STUB_HTML = `<!doctype html><meta charset="utf-8"><title>VeriPilot Dashboard</title>
<body style="font:14px system-ui;margin:3rem">
<h1>VeriPilot Dashboard</h1>
<p>The UI is not built yet. From <code>packages/veripilot/dashboard/</code> run
<code>npm install &amp;&amp; npm run build</code>, then start the server with
<code>distDir</code> pointing at <code>dashboard/dist</code>.</p>
<p>The API is live: <a href="/api/state">/api/state</a> · <code>/api/events</code> (SSE).</p>
</body>`

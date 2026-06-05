import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Dev: proxy /api to the dashboard server (default port 4317) so SSE + state work
// during `vite dev`. Prod: the server serves the built dist on the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:4317", changeOrigin: true },
    },
  },
})

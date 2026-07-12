import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The console always calls same-origin paths under the `/wisper` prefix. In dev,
// Vite proxies those to a running wisper-api instance (stripping the prefix) so
// the browser never issues cross-origin requests and we avoid CORS entirely.
// WebSocket endpoints (the shell PTY) are proxied too via `ws: true`.
//
// wisper-api must be running in its DEV harness mode (Tunnel:EnableDevEndpoints)
// so the money-free `/dev/leases` surface this app drives is mapped.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_WISPER_TARGET || 'http://127.0.0.1:8090'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/wisper': {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/wisper/, ''),
        },
      },
    },
  }
})

import { useEffect, useState } from 'react'

export type HealthState = 'connecting' | 'connected' | 'disconnected'

/**
 * Polls `GET /wisper/healthz` on an interval and reports connectivity to
 * wisper-api. The `/wisper` prefix is proxied by Vite to the configured
 * wisper-api instance, so this is a same-origin request in the browser (no CORS).
 */
export function useHealth(intervalMs = 3000): HealthState {
  const [state, setState] = useState<HealthState>('connecting')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch('/wisper/healthz', {
          headers: { Accept: 'application/json' },
        })
        if (cancelled) return
        if (!res.ok) {
          setState('disconnected')
          return
        }
        const body = (await res.json()) as { status?: string }
        if (cancelled) return
        setState(body.status === 'ok' ? 'connected' : 'disconnected')
      } catch {
        if (!cancelled) setState('disconnected')
      }
    }

    check()
    const id = setInterval(check, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return state
}

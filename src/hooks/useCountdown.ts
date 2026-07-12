import { useEffect, useRef, useState } from 'react'

/**
 * A per-second countdown that ticks locally while staying in sync with a
 * source value polled from the server.
 *
 * `seconds` is the authoritative remaining TTL from the contracts poll. Each
 * time it changes the countdown re-seeds from it, and between polls the value
 * ticks down once per second so the UI feels live. The result is clamped at 0.
 *
 * When `frozen` is true (a terminal contract) the countdown stops ticking and
 * simply reflects the seeded value (typically 0).
 */
export function useCountdown(seconds: number | undefined, frozen = false): number {
  const [value, setValue] = useState<number>(() => Math.max(0, seconds ?? 0))

  // Track the last polled value + the client time it was observed, so a local
  // tick can compute the true remaining time (avoids drift from missed ticks).
  const seededAt = useRef<number>(Date.now())
  const seededValue = useRef<number>(Math.max(0, seconds ?? 0))

  // Re-seed whenever a fresh polled value arrives.
  useEffect(() => {
    const next = Math.max(0, seconds ?? 0)
    seededValue.current = next
    seededAt.current = Date.now()
    setValue(next)
  }, [seconds])

  useEffect(() => {
    if (frozen) return
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - seededAt.current) / 1000)
      setValue(Math.max(0, seededValue.current - elapsed))
    }, 1000)
    return () => clearInterval(id)
  }, [frozen])

  return frozen ? Math.max(0, seconds ?? 0) : value
}

/**
 * A per-second up-counter that measures elapsed wall-clock seconds since
 * `since` (a `Date.now()` timestamp). When `frozen` is true it stops updating.
 */
export function useElapsed(since: number, frozen = false): number {
  const compute = () => Math.max(0, Math.floor((Date.now() - since) / 1000))
  const [value, setValue] = useState<number>(compute)

  useEffect(() => {
    setValue(compute())
    if (frozen) return
    const id = setInterval(() => setValue(compute()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, frozen])

  return value
}

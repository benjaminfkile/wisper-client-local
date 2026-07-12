import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as wisper from '../wisper/client'
import { WisperError } from '../wisper/client'
import type {
  CreateLeaseRequest,
  LeaseStatus,
  WisperNetwork,
} from '../wisper/types'

/** localStorage key under which tracked leases are persisted. */
export const LEASES_KEY = 'wisper.leases'

/** How often the local TTL/expiry loop ticks. */
const TICK_INTERVAL_MS = 1000

/**
 * A lease this console created and now tracks. The dev harness has no
 * "list leases" endpoint (and no status-GET), so the console is the source of
 * truth for which leases exist. The `hostId` used at creation is stored so
 * exec / shell / release all address the same host even if the default host
 * setting changes afterwards.
 */
export interface TrackedLease {
  leaseId: string
  /** The wisp contract id the host created (returned at creation). */
  wispContractId?: string
  /** The tunnel host id this lease runs on. */
  hostId: string
  /** The image this lease was created from. */
  image?: string
  /** The network mode the lease was created with. */
  network?: WisperNetwork
  ttl_seconds: number
  /** Client clock (`Date.now()`) at creation. */
  created_at: number
  status: LeaseStatus
  /** Remaining TTL, recomputed locally each tick (no server poll exists). */
  ttl_seconds_remaining?: number
  /** True once released or expired locally. */
  ended?: boolean
  /** Client clock when the lease ended (for the activity timeline). */
  ended_at?: number
}

export interface Leases {
  leases: TrackedLease[]
  createLease(req: CreateLeaseRequest): Promise<TrackedLease>
  releaseLease(id: string): Promise<void>
  removeLease(id: string): void
  /** The lease whose detail view is open, or `null` for the list. */
  selectedId: string | null
  /** Open the detail view for `id`, or return to the list with `null`. */
  select(id: string | null): void
}

/** Terminal states that no longer tick. */
const TERMINAL: ReadonlySet<LeaseStatus> = new Set<LeaseStatus>([
  'released',
  'expired',
])

/** True when a lease should no longer be ticked. */
function isDone(l: TrackedLease): boolean {
  return l.ended === true || TERMINAL.has(l.status)
}

/** Remaining whole seconds for a lease, from its created_at + ttl. */
function remainingSeconds(l: TrackedLease): number {
  return Math.max(0, Math.floor((l.created_at + l.ttl_seconds * 1000 - Date.now()) / 1000))
}

/** Read persisted tracked leases, tolerating unavailable/corrupt storage. */
function readLeases(): TrackedLease[] {
  try {
    const raw = localStorage.getItem(LEASES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TrackedLease[]) : []
  } catch {
    return []
  }
}

/** Persist tracked leases, tolerating unavailable storage. */
function writeLeases(leases: TrackedLease[]): void {
  try {
    localStorage.setItem(LEASES_KEY, JSON.stringify(leases))
  } catch {
    // Storage unavailable (private mode / disabled) — keep in-memory state.
  }
}

const LeasesContext = createContext<Leases | null>(null)

/**
 * Provides the app-wide list of tracked leases, persisted to localStorage, and
 * runs a single background interval that recomputes each live lease's remaining
 * TTL and flips it to `expired` when the client clock passes its deadline.
 *
 * There is no server status poll — the dev harness exposes no lease-status
 * endpoint — so expiry is inferred locally from `created_at + ttl_seconds`.
 */
export function LeasesProvider({ children }: { children: ReactNode }) {
  const [leases, setLeases] = useState<TrackedLease[]>(readLeases)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  // Persist on every change.
  useEffect(() => {
    writeLeases(leases)
  }, [leases])

  /** Merge a partial patch into one lease by id. */
  const patch = useCallback((id: string, fields: Partial<TrackedLease>) => {
    setLeases((prev) =>
      prev.map((l) => (l.leaseId === id ? { ...l, ...fields } : l)),
    )
  }, [])

  const createLease = useCallback(
    async (req: CreateLeaseRequest): Promise<TrackedLease> => {
      const res = await wisper.createLease(req)
      const tracked: TrackedLease = {
        leaseId: res.leaseId,
        wispContractId: res.wispContractId,
        hostId: req.hostId,
        image: req.image || undefined,
        network: req.network,
        ttl_seconds: req.ttl_seconds,
        created_at: Date.now(),
        status: res.status === 'released' || res.status === 'expired' ? res.status : 'ready',
        ttl_seconds_remaining: req.ttl_seconds,
      }
      setLeases((prev) => [tracked, ...prev])
      return tracked
    },
    [],
  )

  const releaseLease = useCallback(
    async (id: string): Promise<void> => {
      const lease = leases.find((l) => l.leaseId === id)
      const hostId = lease?.hostId
      if (hostId) {
        try {
          await wisper.releaseLease(id, hostId)
        } catch (err) {
          // A 404 means it's already gone — treat as released either way.
          if (!(err instanceof WisperError && err.status === 404)) throw err
        }
      }
      patch(id, {
        ended: true,
        status: 'released',
        ttl_seconds_remaining: 0,
        ended_at: Date.now(),
      })
    },
    [leases, patch],
  )

  const removeLease = useCallback((id: string) => {
    setLeases((prev) => prev.filter((l) => l.leaseId !== id))
    // If the removed lease was open in the detail view, return to the list.
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  // Single app-wide loop: recompute remaining TTL for live leases and expire
  // them locally when the deadline passes. Kept in a ref so the interval never
  // has to be torn down/recreated on each change.
  const leasesRef = useRef(leases)
  leasesRef.current = leases

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      let changed = false
      const next = leasesRef.current.map((l) => {
        if (isDone(l)) return l
        const remaining = Math.max(
          0,
          Math.floor((l.created_at + l.ttl_seconds * 1000 - now) / 1000),
        )
        if (remaining <= 0) {
          changed = true
          return { ...l, ended: true, status: 'expired' as LeaseStatus, ttl_seconds_remaining: 0, ended_at: now }
        }
        if (l.ttl_seconds_remaining !== remaining) {
          changed = true
          return { ...l, ttl_seconds_remaining: remaining }
        }
        return l
      })
      if (changed) setLeases(next)
    }
    const id = setInterval(tick, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const value = useMemo<Leases>(
    () => ({
      leases,
      createLease,
      releaseLease,
      removeLease,
      selectedId,
      select,
    }),
    [leases, createLease, releaseLease, removeLease, selectedId, select],
  )

  return <LeasesContext.Provider value={value}>{children}</LeasesContext.Provider>
}

/** Access the tracked-leases store. Must be used within a `LeasesProvider`. */
export function useLeases(): Leases {
  const ctx = useContext(LeasesContext)
  if (!ctx) {
    throw new Error('useLeases must be used within a LeasesProvider')
  }
  return ctx
}

export { remainingSeconds }

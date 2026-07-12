// Typed HTTP/WebSocket client for the wisper-api DEV lease harness.
// Mirrors docs/WISPER_DEV_API.md and reuses the shapes from ./types.
// Every call is a SAME-ORIGIN request under `/wisper` (Vite proxies it), so the
// browser never hits CORS. URL/string builders here do NOT open sockets or SSE
// streams — the hooks/components consume them.

import type {
  CreateLeaseRequest,
  CreateLeaseResponse,
  ExecResponse,
} from './types'

/** Base path for the same-origin wisper dev proxy. */
const BASE = '/wisper'

/**
 * Error thrown for any non-2xx wisper-api response. wisper-api uses a uniform
 * error envelope `{ "error": { "code", "message", "request_id", "details" } }`;
 * `message` is that `error.message` (or `res.statusText` when unavailable) and
 * `code` is the typed error code when present.
 */
export class WisperError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'WisperError'
    this.status = status
    this.code = code
  }
}

/** Parse a non-2xx response into a WisperError, reading the error envelope. */
export async function toWisperError(res: Response): Promise<WisperError> {
  let message = res.statusText
  let code: string | undefined
  try {
    const body = (await res.json()) as { error?: unknown }
    const err = body?.error
    if (typeof err === 'string' && err) {
      message = err
    } else if (err && typeof err === 'object') {
      const e = err as { message?: unknown; code?: unknown }
      if (typeof e.message === 'string' && e.message) message = e.message
      if (typeof e.code === 'string') code = e.code
    }
  } catch {
    // Not JSON — keep the statusText fallback.
  }
  return new WisperError(res.status, message, code)
}

/** Perform a fetch and parse a 2xx JSON body into `T`, else throw WisperError. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw await toWisperError(res)
  return (await res.json()) as T
}

/** `GET /wisper/healthz` — true iff the body reports `ok`. */
export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/healthz`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return false
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok'
  } catch {
    return false
  }
}

/** `POST /dev/leases` — create + drive a lease on `hostId` (money-free harness). */
export function createLease(
  req: CreateLeaseRequest,
): Promise<CreateLeaseResponse> {
  return request<CreateLeaseResponse>('/dev/leases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

/** `POST /dev/leases/:id/exec` — run a command on the lease (host named in body). */
export function execSync(
  leaseId: string,
  hostId: string,
  command: string,
): Promise<ExecResponse> {
  return request<ExecResponse>(
    `/dev/leases/${encodeURIComponent(leaseId)}/exec`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId, command }),
    },
  )
}

/** `DELETE /dev/leases/:id?hostId=…` — release the container (idempotent). */
export async function releaseLease(leaseId: string, hostId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/dev/leases/${encodeURIComponent(leaseId)}?hostId=${encodeURIComponent(hostId)}`,
    { method: 'DELETE', headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw await toWisperError(res)
}

// --- URL / string builders (no I/O — the hooks open the actual streams) ---

/** Path for the streaming exec SSE endpoint (POST with `{hostId, command}`). */
export function execStreamPath(leaseId: string): string {
  return `${BASE}/dev/leases/${encodeURIComponent(leaseId)}/exec?stream=1`
}

/** Same-origin WebSocket URL matching the page protocol (`ws:`/`wss:`). */
function wsOrigin(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

/**
 * Same-origin WS URL for the shell PTY, passing the host id and initial window.
 * The dev shell carries raw PTY bytes as BINARY frames (stdin/stdout) and a
 * `{t:"resize",cols,rows}` TEXT control frame — see docs/WISPER_DEV_API.md.
 */
export function shellWsUrl(
  leaseId: string,
  hostId: string,
  cols?: number,
  rows?: number,
): string {
  const parts = [`hostId=${encodeURIComponent(hostId)}`]
  if (cols && cols > 0) parts.push(`cols=${cols}`)
  if (rows && rows > 0) parts.push(`rows=${rows}`)
  return `${wsOrigin()}${BASE}/dev/leases/${encodeURIComponent(leaseId)}/shell?${parts.join('&')}`
}

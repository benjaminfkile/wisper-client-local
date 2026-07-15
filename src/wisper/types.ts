// TypeScript types for the wisper-api DEV lease harness (`/dev/leases`).
// These mirror docs/WISPER_DEV_API.md. This module is TYPES ONLY — the
// HTTP/WebSocket client lives in ./client.
//
// Unlike wisp's own broker API, the dev harness is money-free and auth-free:
// there is no per-lease token; a lease is addressed by its `leaseId` together
// with the `hostId` of the tunnel-connected host that runs it. There is also no
// image-discovery, no lease-status GET, and no events bus (see the doc).

/**
 * Lease lifecycle as this console models it. The dev harness creates a lease
 * synchronously and returns it already `ready`; the remaining states are
 * tracked client-side (there is no status-GET endpoint):
 *   ready -> released (explicit DELETE) | expired (client TTL elapsed)
 */
export type LeaseStatus = 'ready' | 'released' | 'expired'

/** Network mode for a lease's container (wisp's `limits.networks`). */
export type WisperNetwork = 'none' | 'open' | 'egress'

/**
 * OS family of a lease's container image, as reported by the create response.
 * `null` (or absent, on an older wisper-api) means the host didn't tell us —
 * the console treats that as unknown and falls back to Linux-flavoured hints.
 */
export type LeaseOs = 'linux' | 'windows' | null

/** Optional per-lease resource caps forwarded to wisp via the tunnel. */
export interface LeaseResources {
  cpus?: number
  memory_mb?: number
  pids?: number
}

/**
 * Body for `POST /dev/leases`. `hostId` names the tunnel-connected host that
 * will run the container (the id the host's agent token maps to); `ttl_seconds`
 * is required. `image` must be one the host's wisp advertises; `network`
 * defaults to `none` in the harness.
 */
export interface CreateLeaseRequest {
  hostId: string
  ttl_seconds: number
  image?: string
  network?: WisperNetwork
  resources?: LeaseResources
  userdata?: string
  /**
   * Optional environment variables forwarded to the container (e.g.
   * `CLAUDE_CODE_OAUTH_TOKEN`). Sent verbatim in the request body. NOTE: these
   * travel as plaintext to the dev harness — local/trusted use only.
   */
  env?: Record<string, string>
}

/** `201` response from `POST /dev/leases`. There is no per-lease token. */
export interface CreateLeaseResponse {
  leaseId: string
  wispContractId: string
  status: LeaseStatus
  /**
   * OS family of the leased image (`'linux'` | `'windows'` | `null`). Absent on
   * an older wisper-api that predates this field — treated as unknown.
   */
  os?: LeaseOs
}

/** Body for `POST /dev/leases/:id/exec` — the host is named per call. */
export interface ExecRequest {
  hostId: string
  command: string
}

/** Non-streaming response from `POST /dev/leases/:id/exec`. */
export interface ExecResponse {
  stdout: string
  stderr: string
  exit_code: number
}

/**
 * SSE `event: chunk` payload from `POST /dev/leases/:id/exec?stream=1`.
 * One per output chunk until the terminal exit event.
 */
export interface ExecStreamChunk {
  stream: 'stdout' | 'stderr'
  data: string
}

/** SSE terminal `event: exit` payload from the streaming exec. */
export interface ExecExit {
  exit_code: number
}

/** SSE `event: error` payload — a failure mid-stream. */
export interface ExecStreamError {
  error: string
}

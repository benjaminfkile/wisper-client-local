# wisper-api Dev Harness API Reference

This is the API contract **wisper-client-local** builds against: the **money-free,
auth-free dev lease harness** exposed by wisper-api when it runs in Development
with `Tunnel:EnableDevEndpoints=true`. These endpoints (`/dev/leases…`) drive a
real container end-to-end through the full chain:

```
this app → wisper-api → WS tunnel → wisp-agent → wisp → Docker container
```

They are the local-dev stand-in for the authenticated, billed consumer surface
(`/v1/leases`, which needs Cognito + Stripe). **Never enable them in production.**

All paths below are relative to the wisper-api base URL. **In the app, every call
goes through the same-origin `/wisper` dev proxy** (configured in
`vite.config.ts`), which strips the `/wisper` prefix and forwards to the real
wisper-api instance — HTTP and WebSocket alike. So `GET /healthz` is reached
in-app as `GET /wisper/healthz`. This avoids browser CORS entirely.

## Prerequisites

For a lease to actually boot, the backing stack must be up:

- **wisper-api** in Development with `Tunnel:EnableDevEndpoints=true` and a host
  token mapped to a host id via `Tunnel:HostTokens` (e.g. `devtoken → dev-host-1`).
- **wisp-agent** connected to wisper-api's `/agent` tunnel with that host token,
  bridging to a local **wisp** broker.
- **wisp** running with Docker and the target image available (e.g. `wisp-base`).

The `hostId` this app sends must match the id the agent's host token maps to.

## Authentication

**None.** The dev harness has no tokens — not an app token, not a per-lease
token. A lease is addressed by its `leaseId` plus the `hostId` of the connected
host that runs it. (The authenticated `/v1` surface is what adds identity and
billing; this harness deliberately omits both.)

## Error envelope

Non-2xx responses use wisper-api's uniform envelope:

```json
{ "error": { "code": "host_offline", "message": "…", "request_id": "…", "details": {} } }
```

The client surfaces `error.message` and the typed `error.code`.

## Endpoints

### `GET /healthz` (and `GET /api/health`)

Unauthenticated liveness. A DB-less (tunnel-only) boot still reports `ok`.

```json
{ "status": "ok", "checks": { "database": { "status": "healthy", "description": "skipped: no database configured" } } }
```

### `POST /dev/leases`

Create and drive a lease on a host. `hostId` and `ttl_seconds` are required;
`image`, `network`, `resources`, and `userdata` are optional. `network` defaults
to `none`.

```json
{
  "hostId": "dev-host-1",
  "ttl_seconds": 600,
  "image": "wisp-base",
  "network": "none",
  "resources": { "cpus": 2, "memory_mb": 2048, "pids": 256 },
  "userdata": "#!/bin/sh\n…"
}
```

Response `201` — note there is **no token**:

```json
{ "leaseId": "lease_…", "wispContractId": "…", "status": "ready" }
```

A host that isn't connected yields `409` with `code: "host_offline"`.

### `POST /dev/leases/:id/exec`

Run a command in the lease's container. The host is named in the body.

```json
{ "hostId": "dev-host-1", "command": "uname -a" }
```

Response:

```json
{ "stdout": "…", "stderr": "…", "exit_code": 0 }
```

> Each exec is a fresh process — no shared cwd/env between calls. Use a compound
> command (e.g. `cd /repo && ls`) to keep state within one call.

### `POST /dev/leases/:id/exec?stream=1`

Same, but streams output as [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events).
Because it is a POST carrying `{hostId, command}`, the browser `EventSource`
API can't be used — the app reads `response.body` and parses SSE frames.

- `event: chunk` — `data: {"stream":"stdout","data":"…"}` (`stream` is `stdout`/`stderr`)
- `event: exit`  — `data: {"exit_code":0}`
- `event: error` — `data: {"error":"…"}` (failure instead of a normal exit)

### `DELETE /dev/leases/:id?hostId=…`

Release and destroy the container. Idempotent (safe to retry). Returns `200`.

### `WS /dev/leases/:id/shell?hostId=…&cols=…&rows=…`

Interactive PTY over a raw WebSocket, relayed to the host's wisp shell:

- **BINARY** frames are raw PTY bytes: server→client is terminal output; client→
  server is keystrokes (stdin). Keystrokes **must** be binary.
- A **TEXT** frame `{"t":"resize","cols":100,"rows":30}` resizes the PTY.

`cols`/`rows` query params set the initial window.

## Lease lifecycle (as this console models it)

The harness creates a lease synchronously and returns it `ready`; there is **no
status-GET endpoint and no events bus** (those live on `/v1`). So this console is
the source of truth for the leases it created and tracks lifecycle client-side:

```
ready ──DELETE──▶ released
      ──TTL elapsed (local clock)──▶ expired
```

TTL is counted down locally from `created_at + ttl_seconds`.

# wisper-client-local

A standalone **React + Vite + TypeScript** browser console for driving
**wisper-api's local dev harness** — the money-free, auth-free `/dev/leases`
surface wisper-api exposes in Development mode. It's the same idea as
[wisp-dashboard](https://github.com/benjaminfkile/wisp-dashboard) (create a
lease, drive a container, open a shell), but instead of talking to a wisp broker
directly it talks to **wisper-api**, which relays every call through the tunnel:

```
this app → wisper-api → WS tunnel → wisp-agent → wisp → Docker container
```

So it exercises the whole Wisper compute path end-to-end, locally, with **no
Cognito and no Stripe** — the parts the real consumer app (`wisper-web`) needs.

The UI is **Material UI (MUI)** + Emotion with the dark theme in
[`src/theme.ts`](src/theme.ts). The full dev-harness API contract is captured in
[`docs/WISPER_DEV_API.md`](docs/WISPER_DEV_API.md).

## What it does

- **New Lease** — `POST /dev/leases` against a configured host id; boots a real
  container through the tunnel.
- **Leases list** — every lease this console created, with a locally counted-down
  TTL and Release / Remove actions (the harness has no list/status endpoint, so
  the console tracks them in `localStorage`).
- **Overview** — status, host, image, network, wisp contract id, live uptime +
  TTL countdown, and a local activity timeline.
- **Console** — a real xterm.js PTY over `WS /dev/leases/:id/shell`.
- **Exec** — one-shot commands, synchronous or live-streamed (SSE).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Pointing at wisper-api

The console never calls wisper-api directly. It requests same-origin paths under
the `/wisper` prefix (e.g. `/wisper/healthz`), and the Vite dev server **proxies**
those to a running wisper-api — stripping the prefix and forwarding HTTP + WS.
This avoids browser CORS.

Configure the proxy target with `VITE_WISPER_TARGET`:

```bash
cp .env.example .env
# set, e.g.:
# VITE_WISPER_TARGET=http://127.0.0.1:8090
```

Defaults to `http://127.0.0.1:8090` when unset. Once wisper-api is reachable
there, the header **health chip** (`GET /wisper/healthz`) shows connected.

## Running the full backend

For a lease to actually boot you need the whole dev stack up. In short:

1. **wisp** broker with Docker + the `wisp-base` image
   (`scripts/run-local.sh` in the wisp repo, or `WISP_ADDR=127.0.0.1:8081 go run ./cmd/wispd`).
2. **wisper-api** in Development with the dev endpoints + a host-token mapping:
   ```bash
   ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:8090 \
   Tunnel__EnableDevEndpoints=true Tunnel__HostTokens__devtoken=dev-host-1 \
   dotnet run --project src/Wisper.Api
   ```
3. **wisp-agent** dialing the tunnel:
   ```bash
   go run ./cmd/wisp-agent --manager ws://127.0.0.1:8090/agent \
     --host-token devtoken --wisp http://127.0.0.1:8081
   ```

Then set this app's **Host id** (Settings) to the id the token maps to
(`dev-host-1` above) and its **Default image** to one wisp allow-lists
(`wisp-base`). See [`docs/WISPER_DEV_API.md`](docs/WISPER_DEV_API.md) for the
full contract.

## Project layout

```
docs/WISPER_DEV_API.md     the dev-harness API contract (endpoints, lifecycle)
src/wisper/types.ts        TypeScript types for the dev harness
src/wisper/client.ts       typed HTTP/WebSocket client (/dev/leases…)
src/theme.ts               MUI dark theme
src/App.tsx                app shell (header + health + list/detail)
src/hooks/useSettings.tsx  host id + default image, persisted to localStorage
src/hooks/useLeases.tsx    tracked-leases store + local TTL/expiry loop
src/hooks/useExecStream.ts streaming-exec SSE reader
src/hooks/useHealth.ts     polls /wisper/healthz
src/components/…           list, detail, overview, console (xterm), exec, activity
vite.config.ts             the /wisper -> VITE_WISPER_TARGET dev proxy
```

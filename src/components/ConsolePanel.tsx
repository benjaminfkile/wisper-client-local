import { useEffect, useRef, useState } from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import ReplayIcon from '@mui/icons-material/Replay'
import TerminalIcon from '@mui/icons-material/Terminal'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { shellWsUrl } from '../wisper/client'
import type { TrackedLease } from '../hooks/useLeases'

/** Live connection state of the shell WebSocket. */
type ConnStatus = 'connecting' | 'connected' | 'disconnected'

/** Closing sooner than this after opening hints at a rejected/offline host. */
const IMMEDIATE_CLOSE_MS = 1500

const STATUS_LABEL: Record<ConnStatus, string> = {
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'disconnected',
}

type ChipColor = 'success' | 'warning' | 'default'

const STATUS_COLOR: Record<ConnStatus, ChipColor> = {
  connecting: 'warning',
  connected: 'success',
  disconnected: 'default',
}

/** Monospace stack matching the app theme, for the terminal font. */
const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

/** Encodes keystrokes to the raw bytes the dev shell expects as stdin. */
const ENCODER = new TextEncoder()

/**
 * The Console tab: a real interactive xterm.js terminal wired to the wisper-api
 * dev shell over `WS /dev/leases/:id/shell?hostId=…`, which relays through the
 * tunnel to the host's wisp PTY. The socket carries raw duplex bytes as BINARY
 * frames — server bytes are terminal output (`term.write`) and keystrokes are
 * forwarded as binary stdin (`term.onData -> ws.send(bytes)`). Terminal resizes
 * are sent as a `{t:"resize",cols,rows}` TEXT control frame.
 */
export default function ConsolePanel({ lease }: { lease: TrackedLease }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [handshakeFailed, setHandshakeFailed] = useState(false)
  const [reconnectNonce, setReconnectNonce] = useState(0)

  const ended =
    lease.ended === true ||
    lease.status === 'released' ||
    lease.status === 'expired'
  // The shell is available while the lease is live (ready).
  const usable = !ended && lease.status === 'ready'

  /** Send a resize control frame (TEXT) so the host PTY tracks the window. */
  function sendResize() {
    const ws = wsRef.current
    const term = termRef.current
    if (ws && ws.readyState === WebSocket.OPEN && term) {
      try {
        ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }))
      } catch {
        // Socket closing under us — ignore.
      }
    }
  }

  // Create the xterm terminal + FitAddon once the lease is usable, keep it
  // fitted to its container, and dispose it (with the ResizeObserver) on unmount
  // or when the lease stops being usable.
  useEffect(() => {
    if (!usable) return
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: MONO,
      fontSize: 13,
      convertEol: false,
      scrollback: 2000,
      theme: {
        background: '#0b0f14',
        foreground: '#d7e0ea',
        cursor: '#5ed1b4',
        cursorAccent: '#0b0f14',
        selectionBackground: '#223042',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // Container not laid out yet — a later ResizeObserver tick fits it.
    }
    termRef.current = term
    fitRef.current = fit

    // Forward keystrokes to the live socket as BINARY stdin (dropped when not
    // open). Text frames are reserved for the resize control, so stdin must be
    // binary or the host would treat it as a (malformed) control message.
    const dataSub = term.onData((d) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(ENCODER.encode(d))
    })

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
        sendResize()
      } catch {
        // Zero-sized container (e.g. hidden tab) — ignore until it has a size.
      }
    })
    observer.observe(container)

    return () => {
      dataSub.dispose()
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [usable])

  // Open the shell WebSocket whenever the lease is usable, wiring raw bytes both
  // ways. Re-runs on Reconnect (nonce) and when the target lease changes.
  useEffect(() => {
    if (!usable) return

    setStatus('connecting')
    setHandshakeFailed(false)

    let closedByUs = false
    let openedAt = 0
    let ws: WebSocket
    try {
      ws = new WebSocket(
        shellWsUrl(lease.leaseId, lease.hostId, termRef.current?.cols, termRef.current?.rows),
      )
    } catch {
      setStatus('disconnected')
      setHandshakeFailed(true)
      return
    }
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      openedAt = Date.now()
      setStatus('connected')
      // Re-fit now that the panel is settled, sync the size, then focus.
      try {
        fitRef.current?.fit()
      } catch {
        // Ignore — the ResizeObserver will fit once sized.
      }
      sendResize()
      termRef.current?.focus()
    }

    ws.onmessage = (ev) => {
      const term = termRef.current
      if (!term) return
      const data = ev.data
      // Raw PTY output: binary frames are the norm; tolerate text just in case.
      if (data instanceof ArrayBuffer) {
        term.write(new Uint8Array(data))
      } else if (typeof data === 'string') {
        term.write(data)
      }
    }

    ws.onclose = () => {
      if (closedByUs) return
      // An immediate close that never opened is the signature of an offline
      // host or an unknown lease (the relay refuses the shell open).
      const openMs = openedAt ? Date.now() - openedAt : 0
      if (!openedAt || openMs < IMMEDIATE_CLOSE_MS) setHandshakeFailed(true)
      setStatus('disconnected')
    }

    ws.onerror = () => {
      // `onclose` follows and drives the disconnected state; nothing to do here.
    }

    return () => {
      closedByUs = true
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {
        // Already closing/closed — ignore.
      }
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [usable, lease.leaseId, lease.hostId, reconnectNonce])

  if (!usable) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
          <TerminalIcon fontSize="large" color="disabled" />
          <Typography variant="h6" component="p">
            {ended ? 'Shell unavailable' : 'Shell not ready yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ended
              ? 'This lease has ended, so its interactive shell is no longer available.'
              : `The shell becomes available once the lease is ready (currently: ${lease.status}).`}
          </Typography>
        </Stack>
      </Paper>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Chip
          size="small"
          color={STATUS_COLOR[status]}
          variant={status === 'connected' ? 'filled' : 'outlined'}
          label={STATUS_LABEL[status]}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<ReplayIcon />}
          onClick={() => setReconnectNonce((n) => n + 1)}
          disabled={status === 'connecting'}
        >
          Reconnect
        </Button>
      </Stack>

      {status === 'disconnected' && (
        <Alert severity={handshakeFailed ? 'error' : 'warning'} variant="outlined">
          {handshakeFailed
            ? 'Could not open the shell — the connection was refused immediately. The host may be offline or the lease unknown (is wisp-agent connected?).'
            : 'The shell connection closed. Use Reconnect to try again.'}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 1,
          bgcolor: '#0b0f14',
          height: '60vh',
          minHeight: 320,
          overflow: 'hidden',
        }}
      >
        <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
      </Paper>
    </Stack>
  )
}

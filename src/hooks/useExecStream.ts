import { useCallback, useEffect, useRef, useState } from 'react'
import { execStreamPath, toWisperError, WisperError } from '../wisper/client'
import type { ExecExit, ExecStreamChunk } from '../wisper/types'

/**
 * Callbacks invoked as the streaming exec SSE frames arrive. Kept in a ref
 * internally, so the latest closures are always used without restarting a
 * running stream.
 */
export interface ExecStreamHandlers {
  /** One `event: chunk` payload — a slice of stdout or stderr. */
  onChunk?: (chunk: ExecStreamChunk) => void
  /** The terminal `event: exit` payload with the process exit code. */
  onExit?: (exit: ExecExit) => void
  /**
   * A failure: either an SSE `event: error` frame, a non-2xx HTTP response
   * (surfaced as a `WisperError`), or a transport error. Never fired for a
   * caller-initiated `stop()`/unmount abort.
   */
  onError?: (message: string, err?: unknown) => void
}

/** Imperative controller returned by {@link useExecStream}. */
export interface ExecStreamController {
  /** True while a stream request is in flight. */
  running: boolean
  /** Begin streaming `command` on `leaseId` (host `hostId`); aborts any in flight. */
  start: (leaseId: string, hostId: string, command: string) => void
  /** Abort the in-flight stream, if any. Does not fire `onError`. */
  stop: () => void
}

/**
 * Parse one SSE frame (the text between blank lines) into its `event` name and
 * concatenated `data` payload, then dispatch to the matching handler.
 *
 * wisper-api emits `chunk` / `exit` / `error` events, each with a single JSON
 * `data:` line, but this tolerates multi-line `data:` (joined with `\n`, per the
 * SSE spec) and leading-space trimming after the field colon.
 */
function dispatchFrame(frame: string, handlers: ExecStreamHandlers): void {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of frame.split('\n')) {
    // Blank lines and comments (`:`-prefixed) carry no field.
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }

  if (dataLines.length === 0) return
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return // Not JSON — ignore this frame rather than crashing the reader.
  }

  if (event === 'chunk') {
    const c = data as Partial<ExecStreamChunk>
    if ((c.stream === 'stdout' || c.stream === 'stderr') && typeof c.data === 'string') {
      handlers.onChunk?.({ stream: c.stream, data: c.data })
    }
  } else if (event === 'exit') {
    const e = data as Partial<ExecExit>
    if (typeof e.exit_code === 'number') handlers.onExit?.({ exit_code: e.exit_code })
  } else if (event === 'error') {
    const e = data as { error?: unknown }
    handlers.onError?.(typeof e.error === 'string' ? e.error : 'stream error')
  }
}

/**
 * POST to the wisper-api streaming exec endpoint and pump its SSE body through
 * `dispatchFrame`. The browser `EventSource` API cannot be used because it can
 * only issue GETs (the dev exec is a POST carrying `{hostId, command}`), so this
 * reads `response.body` manually and parses SSE frames (split on blank lines).
 */
async function runStream(
  leaseId: string,
  hostId: string,
  command: string,
  signal: AbortSignal,
  handlers: ExecStreamHandlers,
): Promise<void> {
  const res = await fetch(execStreamPath(leaseId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ hostId, command }),
    signal,
  })

  if (!res.ok) throw await toWisperError(res)

  const body = res.body
  if (!body) throw new Error('Streaming exec returned no response body')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // Normalise CRLF so frames split cleanly on blank lines either way.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        dispatchFrame(frame, handlers)
      }
    }
    // Dispatch any trailing frame that lacked a final blank-line terminator.
    const tail = buffer.trim()
    if (tail) dispatchFrame(tail, handlers)
  } finally {
    reader.releaseLock()
  }
}

/**
 * Manage a single streaming exec request over `POST /dev/leases/:id/exec?stream=1`.
 *
 * Encapsulates the fetch + `response.body.getReader()` + SSE-frame parse +
 * `AbortController` cancellation. Call `start()` to run a command (any in-flight
 * stream is aborted first) and `stop()` to cancel; the stream is also aborted on
 * unmount. Output is delivered incrementally through `handlers`.
 */
export function useExecStream(handlers: ExecStreamHandlers): ExecStreamController {
  const [running, setRunning] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  // Keep the latest handlers without re-subscribing a live stream.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const stop = useCallback(() => {
    const ctrl = controllerRef.current
    if (ctrl) {
      controllerRef.current = null
      ctrl.abort()
    }
    setRunning(false)
  }, [])

  const start = useCallback((leaseId: string, hostId: string, command: string) => {
    // Abort any stream already running before starting a new one.
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)

    void runStream(leaseId, hostId, command, controller.signal, handlersRef.current)
      .catch((err) => {
        // A caller-initiated abort is not an error to report.
        if (controller.signal.aborted) return
        const message =
          err instanceof WisperError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err)
        handlersRef.current.onError?.(message, err)
      })
      .finally(() => {
        // Only clear state if this is still the active stream.
        if (controllerRef.current === controller) {
          controllerRef.current = null
          setRunning(false)
        }
      })
  }, [])

  // Abort a live stream on unmount.
  useEffect(
    () => () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    },
    [],
  )

  return { running, start, stop }
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { execSync, WisperError } from '../wisper/client'
import { useExecStream } from '../hooks/useExecStream'
import type { TrackedLease } from '../hooks/useLeases'

/** Monospace stack matching the app theme, for the input and output. */
const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

/** Cap the retained output so a chatty stream can't grow memory unbounded. */
const MAX_OUTPUT_CHARS = 256 * 1024

/** A couple of harmless commands to prefill the input from. */
const QUICK_COMMANDS = ['pwd', 'ls -la', 'uname -a', 'env']

/** Run either a single buffered exec or a live streaming one. */
type ExecMode = 'sync' | 'stream'

/** Which output stream a segment came from (drives its colour). */
type OutStream = 'stdout' | 'stderr'

/** One contiguous run of same-stream output text. */
interface OutputSegment {
  id: number
  stream: OutStream
  text: string
}

/** The output buffer plus whether it has been front-trimmed by the cap. */
interface OutputState {
  segments: OutputSegment[]
  truncated: boolean
}

const EMPTY_OUTPUT: OutputState = { segments: [], truncated: false }

/**
 * The Exec tab: run one-shot commands in the leased container two ways — a
 * synchronous exec (buffered stdout/stderr/exit) via `execSync`, and a live
 * streaming exec whose SSE output is appended as it arrives (see
 * `useExecStream`). Both relay through the tunnel to the host's wisp. This is
 * the machine-readable / log-watching counterpart to the interactive Console.
 */
export default function ExecPanel({ lease }: { lease: TrackedLease }) {
  const [mode, setMode] = useState<ExecMode>('sync')
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<OutputState>(EMPTY_OUTPUT)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const segIdRef = useRef(0)
  const outputRef = useRef<HTMLDivElement | null>(null)

  const ended =
    lease.ended === true ||
    lease.status === 'released' ||
    lease.status === 'expired'
  // Exec is offered while the lease is ready.
  const usable = !ended && lease.status === 'ready'

  /** Append text to the output, coalescing with the last same-stream run and
   * front-trimming to the size cap. */
  const append = useCallback((stream: OutStream, text: string) => {
    if (!text) return
    setOutput((prev) => {
      const segments = prev.segments.slice()
      const last = segments[segments.length - 1]
      if (last && last.stream === stream) {
        segments[segments.length - 1] = { ...last, text: last.text + text }
      } else {
        segments.push({ id: segIdRef.current++, stream, text })
      }

      let total = 0
      for (const s of segments) total += s.text.length
      let truncated = prev.truncated
      while (total > MAX_OUTPUT_CHARS && segments.length > 0) {
        const first = segments[0]
        const over = total - MAX_OUTPUT_CHARS
        if (first.text.length <= over) {
          segments.shift()
          total -= first.text.length
        } else {
          segments[0] = { ...first, text: first.text.slice(over) }
          total -= over
        }
        truncated = true
      }
      return { segments, truncated }
    })
  }, [])

  const stream = useExecStream({
    onChunk: (chunk) => append(chunk.stream, chunk.data),
    onExit: (exit) => setExitCode(exit.exit_code),
    onError: (message) => setError(message),
  })

  const { running: streaming, start: startStream, stop: stopStream } = stream
  const busy = syncBusy || streaming

  // Auto-scroll to the newest output as it arrives (layout effect so it lands
  // before paint, avoiding a visible jump).
  useLayoutEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [output])

  // Abort a live stream if the lease stops being usable out from under us.
  useEffect(() => {
    if (!usable && streaming) stopStream()
  }, [usable, streaming, stopStream])

  const clear = useCallback(() => {
    setOutput(EMPTY_OUTPUT)
    setExitCode(null)
    setError(null)
  }, [])

  async function copyOutput() {
    const text = output.segments.map((s) => s.text).join('')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable — no-op.
    }
  }

  async function runSync(cmd: string) {
    setSyncBusy(true)
    setError(null)
    setExitCode(null)
    try {
      const res = await execSync(lease.leaseId, lease.hostId, cmd)
      if (res.stdout) append('stdout', res.stdout)
      if (res.stderr) append('stderr', res.stderr)
      setExitCode(res.exit_code)
    } catch (err) {
      if (err instanceof WisperError) setError(`${err.status}: ${err.message}`)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncBusy(false)
    }
  }

  function submit() {
    const cmd = command.trim()
    if (!usable || busy || !cmd) return
    if (mode === 'sync') {
      void runSync(cmd)
    } else {
      setError(null)
      setExitCode(null)
      startStream(lease.leaseId, lease.hostId, cmd)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Enter submits; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const hasOutput = output.segments.length > 0

  return (
    <Stack spacing={1.5}>
      {!usable && (
        <Alert severity="info" variant="outlined">
          {ended
            ? 'This lease has ended, so commands can no longer be run against it.'
            : `Commands can be run once the lease is ready (currently: ${lease.status}).`}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {QUICK_COMMANDS.map((qc) => (
          <Button
            key={qc}
            size="small"
            variant="outlined"
            color="inherit"
            disabled={!usable || busy}
            onClick={() => setCommand(qc)}
            sx={{ fontFamily: MONO, textTransform: 'none' }}
          >
            {qc}
          </Button>
        ))}
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          label="Command"
          placeholder="e.g. cd /tmp && ls -la"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!usable || busy}
          slotProps={{ input: { sx: { fontFamily: MONO } } }}
        />
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            disabled={busy}
            onChange={(_, v: ExecMode | null) => v && setMode(v)}
            aria-label="Exec mode"
          >
            <ToggleButton value="sync" aria-label="Run synchronously">
              Run
            </ToggleButton>
            <ToggleButton value="stream" aria-label="Stream live output">
              Stream
            </ToggleButton>
          </ToggleButtonGroup>

          {streaming ? (
            <Button
              variant="contained"
              color="error"
              startIcon={<StopIcon />}
              onClick={stopStream}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={submit}
              disabled={!usable || busy || command.trim() === ''}
            >
              {mode === 'sync' ? 'Run' : 'Stream'}
            </Button>
          )}
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" variant="outlined" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {exitCode !== null && (
            <Chip
              size="small"
              color={exitCode === 0 ? 'success' : 'error'}
              variant="outlined"
              label={`exit ${exitCode}`}
            />
          )}
          {streaming && (
            <Chip size="small" color="warning" variant="filled" label="streaming…" />
          )}
          {output.truncated && (
            <Typography variant="caption" color="text.secondary">
              output truncated (showing last {Math.round(MAX_OUTPUT_CHARS / 1024)} KB)
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={copied ? 'Copied!' : 'Copy output'}>
            <span>
              <IconButton
                size="small"
                aria-label="Copy output"
                onClick={copyOutput}
                disabled={!hasOutput}
              >
                {copied ? (
                  <CheckIcon fontSize="small" color="success" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear output">
            <span>
              <IconButton
                size="small"
                aria-label="Clear output"
                onClick={clear}
                disabled={!hasOutput && exitCode === null && !error}
              >
                <ClearAllIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Paper
        variant="outlined"
        ref={outputRef}
        sx={{
          p: 1.5,
          bgcolor: '#0b0f14',
          height: '48vh',
          minHeight: 260,
          overflow: 'auto',
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {hasOutput ? (
          output.segments.map((s) => (
            <Box
              key={s.id}
              component="span"
              sx={{ color: s.stream === 'stderr' ? 'error.main' : 'text.primary' }}
            >
              {s.text}
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: MONO }}>
            No output yet. Enter a command and press Run or Stream.
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}

import { useEffect, useRef, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { useLeases } from '../hooks/useLeases'
import { useSettings } from '../hooks/useSettings'
import { WisperError } from '../wisper/client'
import type { LeaseResources, WisperNetwork } from '../wisper/types'

interface CreateLeaseDialogProps {
  /** Whether the dialog is open. */
  open: boolean
  /** Close the dialog (backdrop click, Cancel, Escape, or on success). */
  onClose: () => void
}

type Unit = 'seconds' | 'minutes' | 'hours'

/** One row of the environment-variable editor, with a stable id for React keys. */
interface EnvRow {
  id: number
  key: string
  value: string
}

const UNIT_SECONDS: Record<Unit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
}

/** The network modes wisp exposes; the dev harness defaults to `none`. */
const NETWORKS: WisperNetwork[] = ['none', 'open', 'egress']

/** Human label for each network mode shown in the dropdown. */
const NETWORK_LABEL: Record<WisperNetwork, string> = {
  none: 'none — no network',
  open: 'open — full network',
  egress: 'egress — outbound only',
}

/** Parse a numeric string, returning `undefined` when blank/invalid. */
function parsePositive(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Modal that creates a new lease via `POST /dev/leases`. The dev harness has no
 * image-discovery endpoint, so the image is a free-text field prefilled from
 * settings (must be one the host's wisp allow-list permits), the network is a
 * simple select (default `none`), and resources/TTL/userdata are optional. The
 * lease is driven against the configured host id. Errors surface inline.
 */
export default function CreateLeaseDialog({
  open,
  onClose,
}: CreateLeaseDialogProps) {
  const { createLease } = useLeases()
  const { hostId, defaultImage } = useSettings()

  const [amount, setAmount] = useState('10')
  const [unit, setUnit] = useState<Unit>('minutes')
  const [image, setImage] = useState(defaultImage)
  const [network, setNetwork] = useState<WisperNetwork>('none')
  const [cpus, setCpus] = useState('')
  const [memoryMb, setMemoryMb] = useState('')
  const [pids, setPids] = useState('')
  const [userdata, setUserdata] = useState('')
  const [envRows, setEnvRows] = useState<EnvRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Monotonic id source for env rows, so keys stay stable across add/remove.
  const nextEnvId = useRef(0)

  function addEnvRow() {
    setEnvRows((rows) => [...rows, { id: nextEnvId.current++, key: '', value: '' }])
  }

  function removeEnvRow(id: number) {
    setEnvRows((rows) => rows.filter((r) => r.id !== id))
  }

  function updateEnvRow(id: number, fields: Partial<Pick<EnvRow, 'key' | 'value'>>) {
    setEnvRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r)))
  }

  // Prefill the image from settings each time the dialog opens.
  useEffect(() => {
    if (open) setImage(defaultImage)
  }, [open, defaultImage])

  const amountNum = Number(amount)
  const ttlSeconds = Math.floor(amountNum) * UNIT_SECONDS[unit]
  const ttlValid = Number.isFinite(amountNum) && ttlSeconds > 0

  const cpusNum = parsePositive(cpus)
  const memoryNum = parsePositive(memoryMb)
  const pidsNum = parsePositive(pids)

  const imageValid = image.trim() !== ''
  const hostValid = hostId.trim() !== ''
  const canSubmit = ttlValid && imageValid && hostValid && !submitting

  function reset() {
    setAmount('10')
    setUnit('minutes')
    setImage(defaultImage)
    setNetwork('none')
    setCpus('')
    setMemoryMb('')
    setPids('')
    setUserdata('')
    setEnvRows([])
    setError(null)
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function submit() {
    if (!ttlValid) {
      setError('TTL must be a positive whole number.')
      return
    }
    if (!imageValid) {
      setError('An image is required.')
      return
    }
    if (!hostValid) {
      setError('A host id is required — set one in Settings.')
      return
    }

    const resources: LeaseResources = {}
    if (cpusNum !== undefined) resources.cpus = cpusNum
    if (memoryNum !== undefined) resources.memory_mb = memoryNum
    if (pidsNum !== undefined) resources.pids = pidsNum
    const hasResources = Object.keys(resources).length > 0

    // Build env from rows whose key is non-empty; a later row wins on collision.
    // Omit `env` entirely when no row contributes a key.
    const env: Record<string, string> = {}
    for (const row of envRows) {
      const key = row.key.trim()
      if (key !== '') env[key] = row.value
    }
    const hasEnv = Object.keys(env).length > 0

    setSubmitting(true)
    setError(null)
    try {
      await createLease({
        hostId,
        ttl_seconds: ttlSeconds,
        image: image.trim() || undefined,
        network,
        resources: hasResources ? resources : undefined,
        userdata: userdata.trim() ? userdata : undefined,
        env: hasEnv ? env : undefined,
      })
      reset()
      onClose()
    } catch (err) {
      if (err instanceof WisperError) {
        setError(
          err.code === 'host_offline' || err.status === 409
            ? `${err.message} — is wisp-agent connected for host "${hostId}"?`
            : `${err.status}: ${err.message}`,
        )
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create lease.')
      }
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="create-lease-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="create-lease-title">New Lease</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 1 }}>
          <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
            Host:{' '}
            <Box component="code" sx={{ color: 'primary.main' }}>
              {hostId || '(unset — see Settings)'}
            </Box>
          </Alert>

          <Stack direction="row" spacing={2}>
            <TextField
              id="lease-ttl-amount"
              label="TTL"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={amount !== '' && !ttlValid}
              helperText={amount !== '' && !ttlValid ? 'Must be a positive integer' : ' '}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-ttl-unit"
              label="Unit"
              select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              helperText=" "
              sx={{ width: 140 }}
            >
              <MenuItem value="seconds">seconds</MenuItem>
              <MenuItem value="minutes">minutes</MenuItem>
              <MenuItem value="hours">hours</MenuItem>
            </TextField>
          </Stack>

          <TextField
            id="lease-image"
            label="Image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="e.g. wisp-base"
            helperText="An image the host's wisp allow-list permits"
            fullWidth
            margin="normal"
            spellCheck={false}
            autoComplete="off"
          />

          <TextField
            id="lease-network"
            label="Network"
            select
            value={network}
            onChange={(e) => setNetwork(e.target.value as WisperNetwork)}
            helperText="Container network mode"
            fullWidth
            margin="normal"
          >
            {NETWORKS.map((net) => (
              <MenuItem key={net} value={net}>
                {NETWORK_LABEL[net]}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={2}>
            <TextField
              id="lease-cpus"
              label="CPUs (optional)"
              type="number"
              value={cpus}
              onChange={(e) => setCpus(e.target.value)}
              helperText=" "
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-memory"
              label="Memory MB (optional)"
              type="number"
              value={memoryMb}
              onChange={(e) => setMemoryMb(e.target.value)}
              helperText=" "
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-pids"
              label="PIDs (optional)"
              type="number"
              value={pids}
              onChange={(e) => setPids(e.target.value)}
              helperText=" "
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <TextField
            id="lease-userdata"
            label="Userdata (optional)"
            value={userdata}
            onChange={(e) => setUserdata(e.target.value)}
            placeholder={'#!/bin/sh\n# provisioning script run at boot'}
            fullWidth
            multiline
            minRows={3}
            margin="normal"
            spellCheck={false}
            autoComplete="off"
            slotProps={{ htmlInput: { style: { fontFamily: 'inherit' } } }}
          />

          <Box sx={{ mt: 2 }}>
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: envRows.length > 0 ? 1 : 0,
              }}
            >
              <Tooltip title="Forwarded to the container (e.g. CLAUDE_CODE_OAUTH_TOKEN). Values are hidden here but still sent as plaintext on the wire.">
                <Typography variant="subtitle2" color="text.secondary">
                  Environment variables (optional)
                </Typography>
              </Tooltip>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addEnvRow}
              >
                Add
              </Button>
            </Stack>

            {envRows.map((row) => (
              <Stack
                key={row.id}
                direction="row"
                spacing={1}
                sx={{ alignItems: 'flex-start', mb: 1 }}
              >
                <TextField
                  label="Key"
                  value={row.key}
                  onChange={(e) => updateEnvRow(row.id, { key: e.target.value })}
                  placeholder="CLAUDE_CODE_OAUTH_TOKEN"
                  size="small"
                  spellCheck={false}
                  autoComplete="off"
                  sx={{ flex: 1 }}
                />
                <Tooltip title="Hidden here for shoulder-surfing, but still sent as plaintext on the wire.">
                  <TextField
                    label="Value"
                    type="password"
                    value={row.value}
                    onChange={(e) => updateEnvRow(row.id, { value: e.target.value })}
                    size="small"
                    spellCheck={false}
                    autoComplete="off"
                    sx={{ flex: 1 }}
                  />
                </Tooltip>
                <Tooltip title="Remove variable">
                  <IconButton
                    aria-label="Remove environment variable"
                    onClick={() => removeEnvRow(row.id)}
                    sx={{ mt: 0.5 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create Lease'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

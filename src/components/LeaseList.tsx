import { useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { useLeases, type TrackedLease } from '../hooks/useLeases'
import type { LeaseStatus } from '../wisper/types'

type ChipColor = 'success' | 'default'

/** Map a lease status to a themed Chip color. */
const STATUS_COLOR: Record<LeaseStatus, ChipColor> = {
  ready: 'success',
  released: 'default',
  expired: 'default',
}

/** Terminal states — the Release action is disabled for these. */
function isTerminal(l: TrackedLease): boolean {
  return l.ended === true || l.status === 'released' || l.status === 'expired'
}

/** Shorten a lease id for display, keeping enough to disambiguate. */
function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}…${id.slice(-4)}` : id
}

/** Format seconds as a human duration, e.g. `58m 12s` or `1h 03m`. */
function humanDuration(total?: number): string {
  if (total === undefined || total < 0) return '—'
  const s = Math.floor(total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** A single tracked-lease card. */
function LeaseCard({ lease }: { lease: TrackedLease }) {
  const { releaseLease, removeLease, select } = useLeases()
  const [copied, setCopied] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const terminal = isTerminal(lease)

  async function copyId() {
    try {
      await navigator.clipboard.writeText(lease.leaseId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable — no-op.
    }
  }

  async function release() {
    setReleasing(true)
    try {
      await releaseLease(lease.leaseId)
    } finally {
      setReleasing(false)
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{ opacity: terminal ? 0.6 : 1, transition: 'opacity 0.2s' }}
    >
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography
                variant="subtitle1"
                component="span"
                title={lease.leaseId}
                sx={{ fontWeight: 600 }}
              >
                {shortId(lease.leaseId)}
              </Typography>
              <Tooltip title={copied ? 'Copied!' : 'Copy lease id'}>
                <IconButton size="small" aria-label="Copy lease id" onClick={copyId}>
                  {copied ? (
                    <CheckIcon fontSize="small" color="success" />
                  ) : (
                    <ContentCopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Chip
                size="small"
                variant={terminal ? 'outlined' : 'filled'}
                color={STATUS_COLOR[lease.status]}
                label={lease.status}
              />
              {lease.os && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={lease.os}
                  sx={{ textTransform: 'none' }}
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              host:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {lease.hostId}
              </Box>
              {'  ·  '}
              image:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {lease.image || 'default'}
              </Box>
              {lease.network && (
                <>
                  {'  ·  '}
                  network:{' '}
                  <Box component="span" sx={{ color: 'text.primary' }}>
                    {lease.network}
                  </Box>
                </>
              )}
              {'  ·  '}
              remaining:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {terminal ? '—' : humanDuration(lease.ttl_seconds_remaining)}
              </Box>
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => select(lease.leaseId)}
            >
              Open
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={release}
              disabled={terminal || releasing}
            >
              {releasing ? 'Releasing…' : 'Release'}
            </Button>
            {terminal && (
              <Tooltip title="Forget this lease">
                <IconButton
                  size="small"
                  aria-label="Remove lease"
                  onClick={() => removeLease(lease.leaseId)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

/**
 * The live list of leases this console has created. Each card shows a shortened
 * id (with copy), a status chip, the host/image/network, and the remaining TTL
 * (counted down locally), plus Release / Remove actions.
 */
export default function LeaseList() {
  const { leases } = useLeases()

  if (leases.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" component="p" gutterBottom>
          No leases yet.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create your first lease with the <strong>New Lease</strong> button to
          spin up a short-lived container through wisper-api's dev harness.
        </Typography>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      {leases.map((l) => (
        <LeaseCard key={l.leaseId} lease={l} />
      ))}
    </Stack>
  )
}

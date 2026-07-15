import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useCountdown, useElapsed } from '../hooks/useCountdown'
import ActivityFeed from './ActivityFeed'
import type { TrackedLease } from '../hooks/useLeases'
import type { LeaseStatus } from '../wisper/types'

type ChipColor = 'success' | 'default'

const STATUS_COLOR: Record<LeaseStatus, ChipColor> = {
  ready: 'success',
  released: 'default',
  expired: 'default',
}

/** True when the lease will never change again (release/expiry reached). */
function isTerminal(l: TrackedLease): boolean {
  return l.ended === true || l.status === 'released' || l.status === 'expired'
}

/** Format whole seconds as `1h 02m 05s` (drops the hours part when zero). */
function formatDuration(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${m}m ${ss}s`
}

/** A labelled value row inside the details card. */
function Field({
  label,
  children,
  mono,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          fontWeight: mono ? 600 : 400,
          wordBreak: 'break-all',
        }}
      >
        {children}
      </Typography>
    </Stack>
  )
}

/**
 * The Overview tab for a lease: a details card (status, host, image, network,
 * wisp contract id, created-at, live uptime, live TTL countdown, computed
 * expires-at) plus a local activity timeline. Uptime and the countdown tick
 * locally every second; the countdown re-syncs from the store's locally
 * recomputed `ttl_seconds_remaining` and freezes at 0 once the lease is terminal.
 */
export default function LeaseOverview({ lease }: { lease: TrackedLease }) {
  const terminal = isTerminal(lease)

  const uptime = useElapsed(lease.created_at, terminal)
  const remaining = useCountdown(
    lease.ttl_seconds_remaining ?? lease.ttl_seconds,
    terminal,
  )

  const expiresAt = lease.created_at + lease.ttl_seconds * 1000

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Field label="Status">
              <Chip
                size="small"
                variant={terminal ? 'outlined' : 'filled'}
                color={STATUS_COLOR[lease.status]}
                label={lease.status}
              />
            </Field>
            <Divider flexItem />
            <Field label="Host">{lease.hostId}</Field>
            <Field label="Image">{lease.image || 'default'}</Field>
            {lease.os && (
              <Field label="OS">
                <Chip
                  size="small"
                  variant="outlined"
                  label={lease.os}
                  sx={{ textTransform: 'none' }}
                />
              </Field>
            )}
            {lease.network && <Field label="Network">{lease.network}</Field>}
            {lease.wispContractId && (
              <Field label="wisp contract" mono>
                {lease.wispContractId}
              </Field>
            )}
            <Field label="Created">{new Date(lease.created_at).toLocaleString()}</Field>
            <Field label="Uptime" mono>
              {formatDuration(uptime)}
            </Field>
            <Field label="TTL remaining" mono>
              <Box
                component="span"
                sx={{
                  color: terminal
                    ? 'text.secondary'
                    : remaining <= 30
                      ? 'warning.main'
                      : 'text.primary',
                }}
              >
                {formatDuration(remaining)}
              </Box>
            </Field>
            <Field label="Expires">{new Date(expiresAt).toLocaleString()}</Field>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <ActivityFeed lease={lease} />
        </CardContent>
      </Card>
    </Stack>
  )
}

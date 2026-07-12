import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { useLeases, type TrackedLease } from '../hooks/useLeases'
import type { LeaseStatus } from '../wisper/types'
import LeaseOverview from './LeaseOverview'
import ConsolePanel from './ConsolePanel'
import ExecPanel from './ExecPanel'

type ChipColor = 'success' | 'default'

const STATUS_COLOR: Record<LeaseStatus, ChipColor> = {
  ready: 'success',
  released: 'default',
  expired: 'default',
}

function isTerminal(l: TrackedLease): boolean {
  return l.ended === true || l.status === 'released' || l.status === 'expired'
}

/** Shorten a lease id for display, keeping enough to disambiguate. */
function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}…${id.slice(-4)}` : id
}

/** Renders `children` only when its tab is active, keeping mounts scoped. */
function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Box role="tabpanel" hidden={!active} sx={{ pt: 3 }}>
      {active && children}
    </Box>
  )
}

/**
 * Per-lease detail surface: a header (id + copy, status chip, Back, Release) and
 * a Tabs control with Overview / Console / Exec. Each tab panel receives the
 * selected `TrackedLease` as `lease`.
 */
export default function LeaseDetail({ lease }: { lease: TrackedLease }) {
  const { select, releaseLease } = useLeases()
  const [tab, setTab] = useState(0)
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
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => select(null)}
          >
            Back
          </Button>
          <Typography
            variant="h6"
            component="h2"
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
        </Stack>

        <Button
          size="small"
          color="error"
          variant="outlined"
          onClick={release}
          disabled={terminal || releasing}
          sx={{ flexShrink: 0 }}
        >
          {releasing ? 'Releasing…' : 'Release'}
        </Button>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v as number)} aria-label="Lease detail tabs">
          <Tab label="Overview" id="lease-tab-0" aria-controls="lease-tabpanel-0" />
          <Tab label="Console" id="lease-tab-1" aria-controls="lease-tabpanel-1" />
          <Tab label="Exec" id="lease-tab-2" aria-controls="lease-tabpanel-2" />
        </Tabs>
      </Box>

      <TabPanel active={tab === 0}>
        <LeaseOverview lease={lease} />
      </TabPanel>
      <TabPanel active={tab === 1}>
        <ConsolePanel lease={lease} />
      </TabPanel>
      <TabPanel active={tab === 2}>
        <ExecPanel lease={lease} />
      </TabPanel>
    </Box>
  )
}

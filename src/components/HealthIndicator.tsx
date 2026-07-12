import Chip from '@mui/material/Chip'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { useHealth, type HealthState } from '../hooks/useHealth'

const LABELS: Record<HealthState, string> = {
  connecting: 'connecting…',
  connected: 'connected',
  disconnected: 'disconnected',
}

const COLORS: Record<HealthState, 'success' | 'error' | 'default'> = {
  connecting: 'default',
  connected: 'success',
  disconnected: 'error',
}

/** Header chip showing live wisper-api connectivity, polled from `/wisper/healthz`. */
export default function HealthIndicator() {
  const state = useHealth(3000)
  return (
    <Chip
      variant="outlined"
      color={COLORS[state]}
      size="small"
      icon={<FiberManualRecordIcon fontSize="small" />}
      label={`wisper-api: ${LABELS[state]}`}
      title="GET /wisper/healthz"
    />
  )
}

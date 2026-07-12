import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import TimerOffIcon from '@mui/icons-material/TimerOff'
import type { SvgIconComponent } from '@mui/icons-material'
import type { TrackedLease } from '../hooks/useLeases'

type FeedColor = 'info' | 'default' | 'error'

interface ActivityItem {
  key: string
  icon: SvgIconComponent
  color: FeedColor
  label: string
  at: number
}

/** Format a timestamp as a local wall-clock time. */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

/**
 * A local lifecycle timeline for a lease. wisper-api's dev harness has no events
 * bus (that lives on the authenticated `/v1` surface), so — unlike the wisp
 * dashboard's live feed — this is derived from the lease record the console
 * already tracks: when it was created and, if it has ended, whether it was
 * released or expired locally.
 */
export default function ActivityFeed({ lease }: { lease: TrackedLease }) {
  const items: ActivityItem[] = [
    {
      key: 'created',
      icon: AddCircleOutlineIcon,
      color: 'info',
      label: 'Created',
      at: lease.created_at,
    },
  ]
  if (lease.ended && lease.ended_at) {
    if (lease.status === 'released') {
      items.push({
        key: 'released',
        icon: LogoutIcon,
        color: 'default',
        label: 'Released',
        at: lease.ended_at,
      })
    } else if (lease.status === 'expired') {
      items.push({
        key: 'expired',
        icon: TimerOffIcon,
        color: 'error',
        label: 'Expired (TTL elapsed)',
        at: lease.ended_at,
      })
    }
  }

  // Newest first.
  items.reverse()

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Activity
        </Typography>
      </Stack>

      <List dense disablePadding>
        {items.map(({ key, icon: Icon, color, label, at }) => (
          <ListItem key={key} disableGutters sx={{ alignItems: 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
              <Icon fontSize="small" color={color === 'default' ? 'disabled' : color} />
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
              }
              secondary={formatTime(at)}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}

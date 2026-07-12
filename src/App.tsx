import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import SettingsIcon from '@mui/icons-material/Settings'
import HealthIndicator from './components/HealthIndicator'
import SettingsPanel from './components/SettingsPanel'
import CreateLeaseDialog from './components/CreateLeaseDialog'
import LeaseList from './components/LeaseList'
import LeaseDetail from './components/LeaseDetail'
import { useLeases } from './hooks/useLeases'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const { leases, selectedId } = useLeases()

  const selected = selectedId
    ? leases.find((l) => l.leaseId === selectedId) ?? null
    : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, letterSpacing: '0.02em' }}>
            <Box component="span" sx={{ color: 'primary.main', mr: 1 }} aria-hidden="true">
              ◇
            </Box>
            Wisper Dev Console
          </Typography>
          <HealthIndicator />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New Lease
          </Button>
          <IconButton
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          p: { xs: 3, sm: 4 },
        }}
      >
        <Container maxWidth="md">
          {selected ? (
            <LeaseDetail lease={selected} />
          ) : (
            <>
              <Typography variant="h5" component="h2" gutterBottom>
                Leases
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Leases this console has created via wisper-api's dev harness. Each
                drives a real container through the tunnel → agent → wisp. TTL is
                counted down locally.
              </Typography>
              <LeaseList />
            </>
          )}
        </Container>
      </Box>

      <CreateLeaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </Box>
  )
}

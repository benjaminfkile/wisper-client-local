import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { useSettings, DEFAULT_HOST_ID, DEFAULT_IMAGE } from '../hooks/useSettings'

interface SettingsPanelProps {
  /** Close the panel (e.g. backdrop click, Close button, or Escape). */
  onClose: () => void
}

/**
 * Modal to view/edit the dev settings: the tunnel host id leases are driven
 * against and the image prefilled in the New Lease dialog. Both persist locally
 * via `useSettings` (localStorage). There is no token — the dev harness is
 * auth-free — so the host id is what identifies which connected host runs a lease.
 */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { hostId, defaultImage, setHostId, setDefaultImage } = useSettings()
  const [hostDraft, setHostDraft] = useState(hostId)
  const [imageDraft, setImageDraft] = useState(defaultImage)

  // Keep drafts in sync if stored values change while open.
  useEffect(() => {
    setHostDraft(hostId)
  }, [hostId])
  useEffect(() => {
    setImageDraft(defaultImage)
  }, [defaultImage])

  function save() {
    setHostId(hostDraft)
    setDefaultImage(imageDraft)
    onClose()
  }

  function reset() {
    setHostDraft(DEFAULT_HOST_ID)
    setImageDraft(DEFAULT_IMAGE)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="settings-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="settings-title">Settings</DialogTitle>
      <DialogContent>
        <TextField
          id="wisper-host-id"
          label="Host id"
          value={hostDraft}
          onChange={(e) => setHostDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder={DEFAULT_HOST_ID}
          fullWidth
          margin="normal"
          spellCheck={false}
          autoComplete="off"
          helperText="The tunnel host id leases run on — the id a dev host token maps to in wisper-api's Tunnel:HostTokens."
        />
        <TextField
          id="wisper-default-image"
          label="Default image"
          value={imageDraft}
          onChange={(e) => setImageDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder={DEFAULT_IMAGE}
          fullWidth
          margin="normal"
          spellCheck={false}
          autoComplete="off"
          helperText="Prefilled in the New Lease dialog. Must be an image the host's wisp allow-list permits."
        />

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Stored locally in this browser (localStorage). The proxy target
          (wisper-api base URL) is configured separately via{' '}
          <Box component="code" sx={{ color: 'primary.main' }}>
            VITE_WISPER_TARGET
          </Box>
          .
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={reset}>
          Reset
        </Button>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={save}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

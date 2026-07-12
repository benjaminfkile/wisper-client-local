import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { SettingsProvider } from './hooks/useSettings'
import { LeasesProvider } from './hooks/useLeases'
import theme from './theme'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SettingsProvider>
        <LeasesProvider>
          <App />
        </LeasesProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)

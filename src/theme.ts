import { createTheme } from '@mui/material/styles'

/**
 * Shared dark theme for the wisp dashboard — a clean, slightly terminal-ish
 * aesthetic (deep dark background, a readable teal accent). Applied app-wide via
 * `<ThemeProvider>` + `<CssBaseline />` in `src/main.tsx`.
 */
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0b0f14',
      paper: '#121821',
    },
    primary: {
      main: '#5ed1b4',
    },
    success: {
      main: '#43d17a',
    },
    error: {
      main: '#e5556e',
    },
    warning: {
      main: '#e0b341',
    },
    text: {
      primary: '#d7e0ea',
      secondary: '#7c8aa0',
    },
    divider: '#223042',
  },
  typography: {
    fontFamily: [
      'ui-monospace',
      'SFMono-Regular',
      "'SF Mono'",
      'Menlo',
      'Consolas',
      "'Liberation Mono'",
      'monospace',
    ].join(','),
  },
})

export default theme

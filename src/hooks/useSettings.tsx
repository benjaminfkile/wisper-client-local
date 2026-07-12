import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** localStorage keys for the console's dev settings. */
export const HOST_ID_KEY = 'wisper.hostId'
export const DEFAULT_IMAGE_KEY = 'wisper.defaultImage'

/**
 * Defaults matching the dev-run docs: the host-token mapping in wisper-api
 * (`Tunnel:HostTokens`) points a dev token at a host id, and wisp's built-in
 * allow-list defaults to `wisp-base`.
 */
export const DEFAULT_HOST_ID = 'dev-host-1'
export const DEFAULT_IMAGE = 'wisp-base'

export interface Settings {
  /** The tunnel host id the dev harness drives leases against. */
  hostId: string
  /** Image prefilled in the New Lease dialog. */
  defaultImage: string
  setHostId: (id: string) => void
  setDefaultImage: (image: string) => void
}

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Storage unavailable (private mode / disabled) — keep in-memory state.
  }
}

const SettingsContext = createContext<Settings | null>(null)

/** Wraps the app so descendants share the dev settings, backed by storage. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hostId, setHostIdState] = useState<string>(() =>
    read(HOST_ID_KEY, DEFAULT_HOST_ID),
  )
  const [defaultImage, setDefaultImageState] = useState<string>(() =>
    read(DEFAULT_IMAGE_KEY, DEFAULT_IMAGE),
  )

  const setHostId = useCallback((id: string) => {
    const next = id.trim() || DEFAULT_HOST_ID
    setHostIdState(next)
    write(HOST_ID_KEY, next)
  }, [])

  const setDefaultImage = useCallback((image: string) => {
    const next = image.trim() || DEFAULT_IMAGE
    setDefaultImageState(next)
    write(DEFAULT_IMAGE_KEY, next)
  }, [])

  const value = useMemo<Settings>(
    () => ({ hostId, defaultImage, setHostId, setDefaultImage }),
    [hostId, defaultImage, setHostId, setDefaultImage],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

/** Access the dev settings. Must be used within a `SettingsProvider`. */
export function useSettings(): Settings {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}

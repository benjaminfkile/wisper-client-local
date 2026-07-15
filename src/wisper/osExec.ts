// Pure, unit-testable helpers that pick OS-appropriate exec suggestions for the
// ExecPanel. The lease's `os` comes from the create response and may be unknown
// (`null`/absent on an older wisper-api); unknown falls back to the Linux
// flavour, which is what the console assumed everywhere before this field
// existed.

import type { LeaseOs } from './types'

/** Quick-fill commands and an input placeholder for one OS flavour. */
export interface ExecSuggestions {
  /** Harmless commands to prefill the input from. */
  quickCommands: string[]
  /** Example command shown as the input placeholder. */
  placeholder: string
}

/** Linux / unknown flavour — the console's historical default. */
const LINUX_SUGGESTIONS: ExecSuggestions = {
  quickCommands: ['pwd', 'ls -la', 'uname -a', 'env'],
  placeholder: 'e.g. cd /tmp && ls -la',
}

/** Windows flavour — cmd-style equivalents. */
const WINDOWS_SUGGESTIONS: ExecSuggestions = {
  quickCommands: ['cd', 'dir', 'ver', 'set'],
  placeholder: 'e.g. cd C:\\ && dir',
}

/**
 * Choose the exec quick commands and placeholder for a lease's OS. Windows gets
 * cmd-style commands; Linux and unknown (`null`/`undefined`) both keep the
 * original Linux list unchanged.
 */
export function execSuggestionsFor(os: LeaseOs | undefined): ExecSuggestions {
  return os === 'windows' ? WINDOWS_SUGGESTIONS : LINUX_SUGGESTIONS
}

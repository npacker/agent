/**
 * User-facing error formatting for tool invocations.
 */

import { errorMessage, isAbortError } from "./inspect-error"
import { UserFacingError } from "./user-facing-error"

/**
 * Minimal context surface required by the tool-error formatter for warning output.
 */
interface ToolErrorContext {
  /** Logger used to surface non-fatal failures. */
  warn: (message: string) => void
}

/**
 * Map a tool error to a user-facing string, warning on unexpected failures.
 *
 * @param error - Error caught during tool execution.
 * @param context - Minimal context surface used to emit warnings.
 * @param prefix - Leading label for the error string, e.g. `"Search failed"`. Defaults to
 * `"Error"`.
 * @returns A user-facing error string.
 */
export function formatToolError(error: unknown, context: ToolErrorContext, prefix = "Error"): string {
  if (isAbortError(error)) {
    return "Agent run aborted by user."
  }

  if (error instanceof UserFacingError) {
    return `${prefix}: ${error.message}`
  }

  const message = errorMessage(error)

  context.warn(`${prefix}: ${message}`)

  return `${prefix}: ${message}`
}

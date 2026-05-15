/**
 * User-facing error formatting for tool invocations.
 */

import { AgentTimeoutError, EmptyAgentResponseError, UnknownAllowedToolsError } from "./agent-error"
import { errorMessage, isAbortError } from "./inspect-error"

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
 * @returns A user-facing error string.
 */
export function formatToolError(error: unknown, context: ToolErrorContext): string {
  if (isAbortError(error)) {
    return "Agent run aborted by user."
  }

  if (
    error instanceof AgentTimeoutError ||
    error instanceof EmptyAgentResponseError ||
    error instanceof UnknownAllowedToolsError
  ) {
    return `Error: ${error.message}`
  }

  const message = errorMessage(error)
  context.warn(`Error during agent run: ${message}`)

  return `Error: ${message}`
}

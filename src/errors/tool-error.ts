/**
 * User-facing error formatting for tool invocations.
 */

import { AgentTimeoutError, EmptyAgentResponseError } from "./agent-error"
import { errorMessage, isAbortError } from "./inspect-error"

/**
 * Minimal context surface required by the tool-error formatter for warning output.
 */
interface ToolErrorContext {
  /** Logger used to surface non-fatal failures. */
  warn: (message: string) => void
}

/**
 * Kinds of tool flows supported by `formatToolError`, used to tailor user-facing messages.
 */
type ToolErrorKind = "run-agent"

/**
 * Tool-kind-specific message templates used by `formatToolError`.
 */
interface ToolErrorTemplates {
  /** Message returned when the caller aborts the flow. */
  aborted: string
  /** Prefix applied to generic unexpected errors in warning output. */
  unexpectedPrefix: string
}

/**
 * Static mapping from tool kind to its user-facing message templates.
 */
const TOOL_ERROR_TEMPLATES: Record<ToolErrorKind, ToolErrorTemplates> = {
  "run-agent": {
    aborted: "Agent run aborted by user.",
    unexpectedPrefix: "Error during agent run",
  },
}

/**
 * Map a tool error to a user-facing string, warning on unexpected failures.
 *
 * @param error - Error caught during tool execution.
 * @param context - Minimal context surface used to emit warnings.
 * @param kind - Tool flow the error originated from, controlling message phrasing.
 * @returns A user-facing error string.
 */
export function formatToolError(error: unknown, context: ToolErrorContext, kind: ToolErrorKind): string {
  const templates = TOOL_ERROR_TEMPLATES[kind]

  if (isAbortError(error)) {
    return templates.aborted
  }

  if (error instanceof AgentTimeoutError) {
    return `Error: ${error.message}`
  }

  if (error instanceof EmptyAgentResponseError) {
    return `Error: ${error.message}`
  }

  const message = errorMessage(error)
  context.warn(`${templates.unexpectedPrefix}: ${message}`)

  return `Error: ${message}`
}

/**
 * Errors raised by the agent runner before, during, or after a `.act` invocation.
 */

/**
 * Raised when the agent timeout fires before the run completes.
 */
export class AgentTimeoutError extends Error {
  /** Configured wall-clock timeout that elapsed, in milliseconds. */
  public readonly timeout: number

  /**
   * Construct an AgentTimeoutError for the supplied timeout.
   *
   * @param timeoutMs - The wall-clock cap that fired, in milliseconds.
   */
  public constructor(timeoutMs: number) {
    super(`Agent run exceeded the configured timeout of ${(timeoutMs / 1000).toString()}s.`)
    this.name = "AgentTimeoutError"
    this.timeout = timeoutMs
  }
}

/**
 * Raised when an `.act` invocation completes but produced no assistant text content.
 *
 * Can occur when the configured model issues only tool calls (none registered here) or
 * stops on a content-filter / context-length boundary before emitting visible output.
 */
export class EmptyAgentResponseError extends Error {
  /**
   * Construct an EmptyAgentResponseError with a default user-facing message.
   */
  public constructor() {
    super("Agent run completed without producing any text output.")
    this.name = "EmptyAgentResponseError"
  }
}

/**
 * Raised before an agent run begins when one or more Allowed Tools entries fail to match a tool
 * exposed by the configured source plugins. Aborting on any mismatch (not just total failure)
 * preserves the operator's intent: a typo silently dropping a tool is worse than a loud error.
 *
 * The message embeds a "did you mean?" suggestion for each unknown entry when a close match
 * exists (case-insensitive, punctuation-insensitive) plus the full list of available names so
 * the operator can fix the configuration without leaving LM Studio.
 */
export class UnknownAllowedToolsError extends Error {
  /** Operator-supplied entries that did not match a known tool. */
  public readonly unknown: readonly string[]
  /** Tool names exposed by the source plugins, after dedupe. */
  public readonly available: readonly string[]

  /**
   * Construct an UnknownAllowedToolsError carrying both the unknown and available names.
   *
   * @param unknown - Allowed-tools entries that failed to match.
   * @param available - The full list of tool names actually exposed by the source plugins.
   */
  public constructor(unknown: readonly string[], available: readonly string[]) {
    super(buildUnknownToolsMessage(unknown, available))
    this.name = "UnknownAllowedToolsError"
    this.unknown = unknown
    this.available = available
  }
}

/**
 * Compose the user-facing message for `UnknownAllowedToolsError`. Includes per-entry "did you
 * mean?" suggestions when one available name normalises to the same form as the unknown entry,
 * and always lists the full set of available names so the operator can pick the correct value.
 *
 * @param unknown - Allowed-tools entries that failed to match.
 * @param available - Tool names exposed by the source plugins.
 * @returns The full error message.
 */
function buildUnknownToolsMessage(unknown: readonly string[], available: readonly string[]): string {
  const entries = unknown
    .map(entry => {
      const suggestion = suggestMatch(entry, available)

      return suggestion === undefined ? `"${entry}"` : `"${entry}" (did you mean "${suggestion}"?)`
    })
    .join(", ")

  const availableHint =
    available.length === 0
      ? "No tools are exposed by the configured source plugins — check Tool Source Plugins, or leave Allowed Tools empty to allow every tool from a configured source."
      : `Available tool names (case-sensitive, copy verbatim): ${available.join(", ")}.`

  return `Allowed Tools entries did not match any exposed tool: ${entries}. ${availableHint}`
}

/**
 * Find the available tool name whose normalised form (lowercase, alphanumeric only) matches the
 * unknown entry's normalised form. Returns `undefined` when no available name matches or when
 * the match is ambiguous (more than one candidate normalises to the same form).
 *
 * @param entry - Operator-supplied entry that failed exact-match lookup.
 * @param available - Tool names exposed by the source plugins.
 * @returns The single suggested name, or `undefined` when none can be suggested unambiguously.
 */
function suggestMatch(entry: string, available: readonly string[]): string | undefined {
  const normalised = normaliseForSuggestion(entry)

  if (normalised === "") {
    return undefined
  }

  const candidates = available.filter(name => normaliseForSuggestion(name) === normalised)

  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Normalise a tool name for suggestion matching: lowercase and strip everything that is not an
 * alphanumeric character. This collapses casing and punctuation differences (`"Web Search"` ↔
 * `"web_search"` ↔ `"websearch"`) so the most common operator typos can be suggested.
 *
 * @param value - Tool name to normalise.
 * @returns The normalised form.
 */
function normaliseForSuggestion(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "")
}

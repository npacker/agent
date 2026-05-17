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
 * Raised when an `.act` run completes but the host LLM's `requiredTools` were not all invoked
 * within the configured retry budget. Carries the missing names so the host (and the operator
 * reading logs) can see exactly which tools the sub-agent declined to call.
 */
export class RequiredToolNotCalledError extends Error {
  /** Required tool names that the sub-agent never invoked across all attempts. */
  public readonly missing: readonly string[]
  /** Number of `.act` attempts made before giving up (initial attempt plus retries). */
  public readonly attempts: number

  /**
   * Construct a RequiredToolNotCalledError carrying the missing names and attempt count.
   *
   * @param missing - Required tool names that were never invoked.
   * @param attempts - Number of `.act` attempts made before giving up.
   */
  public constructor(missing: readonly string[], attempts: number) {
    super(buildRequiredToolNotCalledMessage(missing, attempts))
    this.name = "RequiredToolNotCalledError"
    this.missing = missing
    this.attempts = attempts
  }
}

/**
 * Compose the user-facing message for `RequiredToolNotCalledError`. Lifted out of the constructor
 * so the missing-names join can sit at module scope, avoiding the nested template-literal lint.
 *
 * @param missing - Required tool names that were never invoked.
 * @param attempts - Number of `.act` attempts made before giving up.
 * @returns The full error message.
 */
function buildRequiredToolNotCalledMessage(missing: readonly string[], attempts: number): string {
  const list = missing.map(name => `"${name}"`).join(", ")

  return `Agent run did not call required tools after ${attempts.toString()} attempt(s): ${list}.`
}

/**
 * Raised when one or more entries in the host LLM's `requiredTools` argument do not match any
 * tool actually exposed to the sub-agent (after the operator's `allowedTools` filter has been
 * applied). Validated before the first `.act` call so an impossible-to-satisfy requirement
 * fails fast instead of burning the entire retry budget.
 *
 * The message embeds a "did you mean?" suggestion for each unknown entry when a close match
 * exists and always lists the available names so the host can correct the argument.
 */
export class UnknownRequiredToolsError extends Error {
  /** Host-supplied entries that did not match any tool exposed to the sub-agent. */
  public readonly unknown: readonly string[]
  /** Tool names actually exposed to the sub-agent, after the operator's filter. */
  public readonly available: readonly string[]

  /**
   * Construct an UnknownRequiredToolsError carrying both the unknown and available names.
   *
   * @param unknown - `requiredTools` entries that failed to match.
   * @param available - Tool names exposed to the sub-agent after operator filtering.
   */
  public constructor(unknown: readonly string[], available: readonly string[]) {
    super(buildUnknownRequiredToolsMessage(unknown, available))
    this.name = "UnknownRequiredToolsError"
    this.unknown = unknown
    this.available = available
  }
}

/**
 * Audience-specific strings supplied by each call site of `buildUnknownNamesMessage`. The
 * structural skeleton (entries with "did you mean ...?" suggestions plus an availability hint)
 * is shared; the prefix and hint wording differs between the operator-facing `Allowed Tools`
 * error and the host-LLM-facing `requiredTools` error.
 */
interface UnknownNamesMessageOptions {
  /** Sentence opener naming the offending input (no trailing colon or punctuation). */
  prefix: string
  /** Full sentence shown when no tools are available at all. */
  emptyHint: string
  /** Label shown before the comma-joined list when at least one tool is available. */
  availableLabel: string
}

/**
 * Compose the user-facing message for `UnknownAllowedToolsError`. The wording targets the
 * operator, who edits `Allowed Tools` in the plugin UI.
 *
 * @param unknown - Allowed-tools entries that failed to match.
 * @param available - Tool names exposed by the source plugins.
 * @returns The full error message.
 */
function buildUnknownToolsMessage(unknown: readonly string[], available: readonly string[]): string {
  return buildUnknownNamesMessage(unknown, available, {
    prefix: "Allowed Tools entries did not match any exposed tool",
    emptyHint:
      "No tools are exposed by the configured source plugins — check Tool Source Plugins, or leave Allowed Tools empty to allow every tool from a configured source.",
    availableLabel: "Available tool names (case-sensitive, copy verbatim)",
  })
}

/**
 * Compose the user-facing message for `UnknownRequiredToolsError`. The wording targets the host
 * LLM, which supplied the `requiredTools` argument that failed validation.
 *
 * @param unknown - `requiredTools` entries that failed to match.
 * @param available - Tool names exposed to the sub-agent after operator filtering.
 * @returns The full error message.
 */
function buildUnknownRequiredToolsMessage(unknown: readonly string[], available: readonly string[]): string {
  return buildUnknownNamesMessage(unknown, available, {
    prefix: "`requiredTools` entries did not match any tool exposed to the sub-agent",
    emptyHint:
      "No tools are exposed to the sub-agent — the operator's Tool Source Plugins and Allowed Tools settings yield an empty tool set.",
    availableLabel: "Available tool names (case-sensitive)",
  })
}

/**
 * Shared skeleton for "unknown names" error messages: list the offending entries with per-entry
 * "did you mean ...?" suggestions (when an unambiguous match exists), then append either the
 * empty-set hint or the labelled list of available names.
 *
 * @param unknown - Entries that failed to match an available name.
 * @param available - Names actually available, used to suggest matches and populate the hint.
 * @param options - Audience-specific wording for the prefix and the two availability hints.
 * @returns The full error message.
 */
function buildUnknownNamesMessage(
  unknown: readonly string[],
  available: readonly string[],
  options: UnknownNamesMessageOptions
): string {
  const entries = unknown
    .map(entry => {
      const suggestion = suggestMatch(entry, available)

      return suggestion === undefined ? `"${entry}"` : `"${entry}" (did you mean "${suggestion}"?)`
    })
    .join(", ")

  const availableHint =
    available.length === 0 ? options.emptyHint : `${options.availableLabel}: ${available.join(", ")}.`

  return `${options.prefix}: ${entries}. ${availableHint}`
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

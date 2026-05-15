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

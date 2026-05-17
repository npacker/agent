/**
 * Status state machine for a single sub-agent run.
 *
 * Translates the granular `model.act` callbacks (round, prompt-progress, per-tool-call lifecycle)
 * into a sequence of single-line status updates and structured warnings for the host UI. State is
 * mutable because the SDK callbacks fire in order over the life of one `.act` invocation; a fresh
 * reporter must be constructed per run.
 */

import { errorMessage } from "../errors/inspect-error"

/**
 * Inputs needed to construct a reporter.
 */
export interface StatusReporterOptions {
  /** Maximum number of `.act` prediction rounds the run may take. Used to format the status. */
  maxRounds: number
  /** Status callback wired to the tool-call context. Replaces the previous line. */
  onStatus: (text: string) => void
  /** Warning callback wired to the tool-call context. Used for tool-call generation failures. */
  onWarn: (text: string) => void
}

/**
 * Discrete prompt-processing buckets reported between 0% and 90%. The 100% point is suppressed so
 * the final tick never lingers before the generation phase takes over the status line.
 */
const PROMPT_PROGRESS_BUCKETS = 10

/**
 * Surface granular sub-agent activity through the host's status line and warning channel.
 *
 * State is intentionally per-instance: a single reporter belongs to a single `.act` run. Callers
 * should not reuse one across runs because the callId map and round counter would carry over.
 */
export class StatusReporter {
  /** Options captured at construction; held for the round formatter and warn dispatcher. */
  private readonly options: StatusReporterOptions
  /** Tool name keyed by SDK `callId` so failure / execute phases can refer to the tool by name. */
  private readonly toolNames: Map<number, string>
  /** Currently active attempt, 1-based for display. Zero until the first attempt starts. */
  private currentAttempt: number
  /** Upper bound on attempts for the run. `1` suppresses the attempt prefix in status output. */
  private maxAttempts: number
  /** Currently active round, 1-based for display. Zero until the first round starts. */
  private currentRound: number
  /** Last prompt-processing bucket emitted in the current round, or `-1` if none yet. */
  private lastProgressBucket: number

  /**
   * Build a reporter for one sub-agent run.
   *
   * @param options - Maximum round count and the status / warn sinks supplied by the tool context.
   */
  public constructor(options: StatusReporterOptions) {
    this.options = options
    this.toolNames = new Map()
    this.currentAttempt = 0
    this.maxAttempts = 1
    this.currentRound = 0
    this.lastProgressBucket = -1
  }

  /**
   * Handle the start of a new `.act` attempt: bump the attempt counter, capture the new upper
   * bound, and clear per-attempt state (round counter, progress bucket, and tool-name map) so
   * stale `callId → name` entries from the previous attempt cannot collide.
   *
   * @param attempt - One-based index of the attempt that is starting.
   * @param maxAttempts - Upper bound on attempts for the run. When `1`, output omits the attempt prefix.
   */
  public attemptStart(attempt: number, maxAttempts: number): void {
    this.currentAttempt = attempt
    this.maxAttempts = maxAttempts
    this.currentRound = 0
    this.lastProgressBucket = -1
    this.toolNames.clear()
  }

  /**
   * Handle a `.act` round-start event: bump the round counter, reset the progress bucket, and
   * emit the round-start "thinking" status.
   *
   * @param roundIndex - Zero-based round index supplied by the SDK.
   */
  public roundStart(roundIndex: number): void {
    this.currentRound = roundIndex + 1
    this.lastProgressBucket = -1
    this.emit("thinking")
  }

  /**
   * Handle a prompt-processing progress fragment. Emissions are throttled to integer 10% buckets
   * and the 100% point is suppressed so the line moves cleanly into the generation phase.
   *
   * @param progress - Fraction of prompt processing completed, in the range 0..1 inclusive.
   */
  public promptProgress(progress: number): void {
    const bucket = Math.floor(progress * PROMPT_PROGRESS_BUCKETS)

    if (bucket === this.lastProgressBucket || bucket >= PROMPT_PROGRESS_BUCKETS) {
      return
    }

    this.lastProgressBucket = bucket
    this.emit(`processing prompt ${(bucket * PROMPT_PROGRESS_BUCKETS).toString()}%`)
  }

  /**
   * Handle the SDK's "tool call request is starting" signal: the model has decided to call a tool
   * but has not yet emitted the tool name.
   */
  public toolCallStart(): void {
    this.emit("preparing tool call")
  }

  /**
   * Handle the SDK's "tool name received" signal: stash the name against the call ID so later
   * phases (execute, failure) can refer to it, then emit the "calling X" status.
   *
   * @param callId - SDK-supplied call identifier, stable across the lifecycle of this tool call.
   * @param name - Tool name as parsed from the model output.
   */
  public toolCallNameReceived(callId: number, name: string): void {
    this.toolNames.set(callId, name)
    this.emit(`calling \`${name}\``)
  }

  /**
   * Handle the SDK's "tool call is about to execute" signal. Looks up the name stashed by
   * `toolCallNameReceived`; falls back to a generic label if the SDK ever skips the name event.
   *
   * @param callId - SDK-supplied call identifier for this tool call.
   */
  public toolCallExecuting(callId: number): void {
    const name = this.toolNames.get(callId) ?? "tool"

    this.emit(`executing \`${name}\``)
  }

  /**
   * Handle a tool-call generation failure: emit a warning naming the tool (when known) and the
   * SDK-supplied error message. The status line is intentionally left untouched so the in-flight
   * round phase continues to be visible.
   *
   * @param callId - SDK-supplied call identifier for the failing tool call.
   * @param error - Error reported by the SDK for this failed call.
   */
  public toolCallFailure(callId: number, error: Error): void {
    const name = this.toolNames.get(callId) ?? "tool"

    this.options.onWarn(`Tool call \`${name}\` failed: ${errorMessage(error)}`)
  }

  /**
   * Format and forward a status line for the current round. Includes an `attempt A/T` prefix when
   * the run is budgeted for more than one attempt, so the host UI distinguishes the initial run
   * from required-tool retries.
   *
   * @param phase - Phase-specific suffix appended after the round prefix.
   */
  private emit(phase: string): void {
    const round = `round ${this.currentRound.toString()}/${this.options.maxRounds.toString()}`
    const prefix =
      this.maxAttempts > 1
        ? `Agent attempt ${this.currentAttempt.toString()}/${this.maxAttempts.toString()} ${round}`
        : `Agent ${round}`

    this.options.onStatus(`${prefix} — ${phase}`)
  }
}

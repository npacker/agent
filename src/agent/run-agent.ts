/**
 * Drive `model.act()` for a sub-agent and return its final answer, retrying when the host's
 * required tools were not all invoked.
 */

import { Chat, type LLM, type LMStudioClient, type Tool } from "@lmstudio/sdk"

import { AgentTimeoutError, EmptyAgentResponseError, RequiredToolNotCalledError } from "../errors/agent-error"
import { isAbortError } from "../errors/inspect-error"

import { StatusReporter } from "./status-reporter"

/**
 * Options driving a single sub-agent run.
 */
export interface RunAgentOptions {
  /** Model key of the LLM to run as the agent. `undefined` selects any loaded model. */
  modelKey: string | undefined
  /** System prompt injected as the first message on the agent run. */
  systemPrompt: string
  /** Task description appended as the user message. */
  task: string
  /** Cross-plugin tools (already filtered) the sub-agent may call. */
  externalTools: Tool[]
  /** Tool names the sub-agent must call at least once across the run. May be empty. */
  requiredTools: readonly string[]
  /** Upper bound on the number of `.act` prediction rounds the run may take. */
  maxRounds: number
  /** Extra `.act` invocations granted when required tools are missing after a round. */
  maxRetries: number
  /** Sampling temperature applied to the agent's predictions. */
  temperature: number
  /** Wall-clock cap on the run, in milliseconds. Spans every attempt, not each in isolation. */
  timeout: number
  /** Abort signal supplied by the calling tool context. */
  signal: AbortSignal
  /** Status callback invoked at round boundaries to surface progress to the host UI. */
  onStatus: (message: string) => void
  /** Warning callback invoked when an individual tool-call request fails to generate. */
  onWarn: (message: string) => void
}

/**
 * Run a sub-agent against the configured LM Studio LLM. When `requiredTools` is non-empty, the
 * runner records which tools the sub-agent actually invokes via `guardToolCall`, and if any
 * required tool is still missing after `.act` returns, appends a corrective user message and
 * re-invokes `.act` up to `maxRetries` additional times. The wall-clock timeout spans the whole
 * run, not each attempt in isolation.
 *
 * @param client - LM Studio client supplied by the tool context.
 * @param options - Inputs and runtime callbacks for the run.
 * @returns The final answer string produced by the run.
 * @throws AgentTimeoutError When the configured timeout fires before the run completes.
 * @throws EmptyAgentResponseError When the run completes without emitting any visible text.
 * @throws RequiredToolNotCalledError When required tools remain missing after every retry.
 */
export async function runAgent(client: LMStudioClient, options: RunAgentOptions): Promise<string> {
  const model = options.modelKey === undefined ? await client.llm.model() : await client.llm.model(options.modelKey)
  const timeoutSignal = AbortSignal.timeout(options.timeout)
  const chat = Chat.from([
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.task },
  ])
  const missingToolCalls = new Set(options.requiredTools)
  const maxAttempts = missingToolCalls.size === 0 ? 1 : 1 + options.maxRetries
  const reporter = new StatusReporter({
    maxRounds: options.maxRounds,
    onStatus: options.onStatus,
    onWarn: options.onWarn,
  })

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    reporter.attemptStart(attempt, maxAttempts)
    // eslint-disable-next-line no-await-in-loop -- retries must be sequential; each attempt sees the prior attempt's transcript.
    await runOneAttempt(model, options, { chat, missingToolCalls, reporter, timeoutSignal })

    if (missingToolCalls.size === 0) {
      return lastAssistantText(chat)
    }

    if (attempt < maxAttempts) {
      chat.append("user", buildCorrectiveMessage([...missingToolCalls], maxAttempts - attempt))
    }
  }

  throw new RequiredToolNotCalledError([...missingToolCalls], maxAttempts)
}

/**
 * Inputs to one `.act` attempt. Bundled into an object so the public `runAgent` function stays
 * within the cognitive-complexity budget after the extraction.
 */
interface AttemptContext {
  /** Mutable chat history; the attempt appends every message emitted by the SDK. */
  chat: Chat
  /** Required tools not yet seen; `guardToolCall` deletes a name as the SDK executes it. */
  missingToolCalls: Set<string>
  /** Status reporter shared across attempts. Caller advances it via `attemptStart`. */
  reporter: StatusReporter
  /** Timeout-only signal used to attribute aborts to `AgentTimeoutError`. */
  timeoutSignal: AbortSignal
}

/**
 * Drive a single `.act` invocation: install the `guardToolCall` recorder, wire the status
 * reporter to the SDK's per-round / per-tool-call lifecycle callbacks, and accumulate every
 * emitted message onto the chat so the next attempt sees the full transcript. Maps a timeout
 * abort to `AgentTimeoutError` and re-throws any other error unchanged.
 *
 * @param model - The resolved model handle to run attempts against.
 * @param options - Run-wide options forwarded from the caller of `runAgent`.
 * @param context - Inputs for this attempt; see `AttemptContext`.
 */
async function runOneAttempt(model: LLM, options: RunAgentOptions, context: AttemptContext): Promise<void> {
  const { chat, missingToolCalls, reporter, timeoutSignal } = context

  try {
    await model.act(chat, options.externalTools, {
      maxPredictionRounds: options.maxRounds,
      temperature: options.temperature,
      signal: AbortSignal.any([options.signal, timeoutSignal]),

      /**
       * Strike each executed tool off the missing set. `guardToolCall` is the truthiest signal
       * the SDK offers — a name received during streaming does not guarantee execution.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed here.
       * @param _callId - SDK-supplied call identifier; not needed here.
       * @param controller - Allow/deny/override controller. Must be resolved or `.act` fails.
       */
      guardToolCall: (_roundIndex, _callId, controller) => {
        missingToolCalls.delete(controller.toolCallRequest.name)
        controller.allow()
      },

      /**
       * Surface round transitions in the host UI status line.
       *
       * @param roundIndex - Zero-based index of the round that just started.
       */
      onRoundStart: roundIndex => {
        reporter.roundStart(roundIndex)
      },

      /**
       * Tick the status line through prompt-processing buckets for the current round.
       *
       * @param _roundIndex - Round whose prompt is being processed; not needed by the reporter.
       * @param progress - Fraction of prompt processing completed, in 0..1.
       */
      onPromptProcessingProgress: (_roundIndex, progress) => {
        reporter.promptProgress(progress)
      },

      /**
       * Transition the status line out of prompt-processing once the model emits its first token.
       *
       * @param _roundIndex - Round in which generation has started; not needed by the reporter.
       */
      onFirstToken: _roundIndex => {
        reporter.generationStarted()
      },

      /**
       * Mark that the model has begun emitting a tool call before the name has been parsed.
       */
      onToolCallRequestStart: () => {
        reporter.toolCallStart()
      },

      /**
       * Record the tool name against the SDK call ID and surface "calling X" in the status line.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed by the reporter.
       * @param callId - SDK-supplied call identifier for the in-flight tool call.
       * @param name - Tool name parsed from the model output.
       */
      onToolCallRequestNameReceived: (_roundIndex, callId, name) => {
        reporter.toolCallNameReceived(callId, name)
      },

      /**
       * Surface "executing X" once the tool call has been finalised and is about to run.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed by the reporter.
       * @param callId - SDK-supplied call identifier for the in-flight tool call.
       */
      onToolCallRequestFinalized: (_roundIndex, callId) => {
        reporter.toolCallExecuting(callId)
      },

      /**
       * Forward a tool-call generation failure as a warning to the host UI.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed by the reporter.
       * @param callId - SDK-supplied call identifier for the failing tool call.
       * @param error - Error describing why the tool call could not be generated.
       */
      onToolCallRequestFailure: (_roundIndex, callId, error) => {
        reporter.toolCallFailure(callId, error)
      },

      /**
       * Accumulate every message emitted during the run so the final answer can be extracted
       * and subsequent attempts see the full transcript including the prior attempt's output.
       *
       * @param message - Message emitted by the SDK (assistant prediction or tool turn).
       */
      onMessage: message => {
        chat.append(message)
      },
    })
  } catch (error) {
    if (isAbortError(error) && timeoutSignal.aborted) {
      throw new AgentTimeoutError(options.timeout)
    }

    throw error
  }
}

/**
 * Walk the transcript backwards and return the last non-empty assistant text.
 *
 * @param chat - Messages emitted during the run, in transcript order.
 * @returns The latest assistant text.
 * @throws EmptyAgentResponseError When no assistant message produced any visible text content.
 */
function lastAssistantText(chat: Chat): string {
  const messagesReplay = chat.getMessagesArray().toReversed()

  for (const message of messagesReplay) {
    if (message.getRole() === "assistant") {
      const text = message.getText()

      if (text.trim() !== "") {
        return text
      }
    }
  }

  throw new EmptyAgentResponseError()
}

/**
 * Compose the corrective user message appended between retry attempts. Names the operator as the
 * source of authority so the model treats the requirement as binding, and quantifies remaining
 * budget so the model can shape its response accordingly.
 *
 * @param missing - Required tool names that were not called in the just-completed attempt.
 * @param attemptsRemaining - Number of attempts that remain after the one about to start.
 * @returns The corrective message string to append to the chat.
 */
function buildCorrectiveMessage(missing: readonly string[], attemptsRemaining: number): string {
  const list = missing.map(name => `"${name}"`).join(", ")

  return (
    `You are required to call the following tool(s) during this run before producing a ` +
    `final answer: ${list}. You have not yet called them. Call them now (with appropriate ` +
    `arguments) and use their output to produce your final answer. ` +
    `Attempts remaining after this one: ${attemptsRemaining.toString()}.`
  )
}

/**
 * Drive one `model.act()` call for a sub-agent and return its final answer.
 */

import { Chat, type LMStudioClient, type Tool } from "@lmstudio/sdk"

import { AgentTimeoutError, EmptyAgentResponseError } from "../errors/agent-error"
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
  /** Upper bound on the number of `.act` prediction rounds the run may take. */
  maxRounds: number
  /** Sampling temperature applied to the agent's predictions. */
  temperature: number
  /** Wall-clock cap on the run, in milliseconds. */
  timeout: number
  /** Abort signal supplied by the calling tool context. */
  signal: AbortSignal
  /** Status callback invoked at round boundaries to surface progress to the host UI. */
  onStatus: (message: string) => void
  /** Warning callback invoked when an individual tool-call request fails to generate. */
  onWarn: (message: string) => void
}

/**
 * Run a sub-agent against the configured LM Studio LLM.
 *
 * @param client - LM Studio client supplied by the tool context.
 * @param options - Inputs and runtime callbacks for the run.
 * @returns The final answer string produced by the run.
 * @throws AgentTimeoutError When the configured timeout fires before the run completes.
 * @throws EmptyAgentResponseError When the run completes without emitting any visible text.
 */
export async function runAgent(client: LMStudioClient, options: RunAgentOptions): Promise<string> {
  const model = options.modelKey === undefined ? await client.llm.model() : await client.llm.model(options.modelKey)
  const timeoutSignal = AbortSignal.timeout(options.timeout)
  const chat = Chat.from([
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.task },
  ])
  const reporter = new StatusReporter({
    maxRounds: options.maxRounds,
    onStatus: options.onStatus,
    onWarn: options.onWarn,
  })

  try {
    await model.act(chat, options.externalTools, {
      maxPredictionRounds: options.maxRounds,
      temperature: options.temperature,
      signal: AbortSignal.any([options.signal, timeoutSignal]),

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
       * Surface "executing X" once the tool call has been finalised and is about to run. The SDK
       * fires `onToolCallRequestFinalized` for every execution (including previously queued ones,
       * after their `onToolCallRequestDequeued`), so a single wiring covers both cases.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed by the reporter.
       * @param callId - SDK-supplied call identifier for the in-flight tool call.
       */
      onToolCallRequestFinalized: (_roundIndex, callId) => {
        reporter.toolCallExecuting(callId)
      },

      /**
       * Forward a tool-call generation failure as a warning to the host UI, leaving the in-flight
       * status line in place so the round phase remains visible.
       *
       * @param _roundIndex - Round in which the tool call was generated; not needed by the reporter.
       * @param callId - SDK-supplied call identifier for the failing tool call.
       * @param error - Error describing why the tool call could not be generated.
       */
      onToolCallRequestFailure: (_roundIndex, callId, error) => {
        reporter.toolCallFailure(callId, error)
      },

      /**
       * Accumulate every message emitted during the run so the final answer can be extracted.
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

  return lastAssistantText(chat)
}

/**
 * Walk the transcript backwards and return the last non-empty assistant text, or `undefined`
 * when no assistant message produced any visible text content.
 *
 * @param chat - Messages emitted during the run, in transcript order.
 * @returns The latest assistant text, or `undefined` when none exists.
 * @throws EmptyAgentResponseError.
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

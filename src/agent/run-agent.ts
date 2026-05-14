/**
 * Drive one `model.act()` call for a sub-agent and return its final answer.
 */

import { Chat, type ChatMessage, type LMStudioClient, type Tool } from "@lmstudio/sdk"

import { AgentTimeoutError, EmptyAgentResponseError } from "../errors/agent-error"
import { isAbortError } from "../errors/inspect-error"

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
  timeoutMs: number
  /** Abort signal supplied by the calling tool context. */
  signal: AbortSignal
  /** Status callback invoked at round boundaries to surface progress to the host UI. */
  onStatus: (message: string) => void
}

/**
 * Composed abort signals derived from the caller's options.
 */
interface RunSignals {
  /** Run-wide signal composing caller cancellation with the wall-clock timeout. */
  runSignal: AbortSignal

  /** Returns `true` once the configured wall-clock timeout has fired. */
  didTimeout: () => boolean
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
  const signals = composeSignals(options)
  const chat = buildChat(options)
  const transcript: ChatMessage[] = []

  try {
    await model.act(chat, options.externalTools, {
      maxPredictionRounds: options.maxRounds,
      temperature: options.temperature,
      signal: signals.runSignal,

      /**
       * Surface round transitions in the host UI status line.
       *
       * @param roundIndex - Zero-based index of the round that just started.
       */
      onRoundStart: roundIndex => {
        options.onStatus(`Agent round ${(roundIndex + 1).toString()}/${options.maxRounds.toString()}...`)
      },

      /**
       * Accumulate every message emitted during the run so the final answer can be extracted.
       *
       * @param message - Message emitted by the SDK (assistant prediction or tool turn).
       */
      onMessage: message => {
        transcript.push(message)
      },
    })
  } catch (error) {
    if (isAbortError(error) && signals.didTimeout()) {
      throw new AgentTimeoutError(options.timeoutMs)
    }

    throw error
  }

  const answer = lastAssistantText(transcript)

  if (answer === undefined) {
    throw new EmptyAgentResponseError()
  }

  return answer
}

/**
 * Compose the run-wide and timeout abort signals from the caller's options.
 *
 * @param options - Run options carrying the caller signal and timeout configuration.
 * @returns The composed signals.
 */
function composeSignals(options: RunAgentOptions): RunSignals {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const runSignal = AbortSignal.any([options.signal, timeoutSignal])

  return {
    runSignal,

    /**
     * Report whether the wall-clock timeout has fired.
     *
     * @returns `true` once `AbortSignal.timeout` has aborted.
     */
    didTimeout: () => timeoutSignal.aborted,
  }
}

/**
 * Build the chat fed to `.act`: system prompt and task.
 *
 * @param options - Run options.
 * @returns A `Chat` ready to pass to `model.act`.
 */
function buildChat(options: RunAgentOptions): Chat {
  return Chat.from([
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.task },
  ])
}

/**
 * Walk the transcript backwards and return the last non-empty assistant text, or `undefined`
 * when no assistant message produced any visible text content.
 *
 * @param transcript - Messages emitted during the run, in transcript order.
 * @returns The latest assistant text, or `undefined` when none exists.
 */
function lastAssistantText(transcript: readonly ChatMessage[]): string | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index]

    if (message.getRole() === "assistant") {
      const text = message.getText().trim()

      if (text !== "") {
        return text
      }
    }
  }

  return undefined
}

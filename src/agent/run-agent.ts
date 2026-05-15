/**
 * Drive one `model.act()` call for a sub-agent and return its final answer.
 */

import { Chat, type LMStudioClient, type Tool } from "@lmstudio/sdk"

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
  timeout: number
  /** Abort signal supplied by the calling tool context. */
  signal: AbortSignal
  /** Status callback invoked at round boundaries to surface progress to the host UI. */
  onStatus: (message: string) => void
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
        options.onStatus(`Agent round ${(roundIndex + 1).toString()}/${options.maxRounds.toString()}...`)
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

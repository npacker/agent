/**
 * Drive a single sub-agent run against a configured LM Studio LLM.
 *
 * Wraps `client.llm.model(...).act(...)` with an empty tool list (the sub-agent currently has no
 * nested tools available) so the call collapses to a single-round prediction unless the host
 * model has been configured to issue tool calls of its own. The last assistant text content
 * generated during the run is returned as the agent's answer.
 */

import { Chat } from "@lmstudio/sdk"

import { AgentTimeoutError, EmptyAgentResponseError } from "../errors/agent-error"

import type { ChatMessage, LMStudioClient } from "@lmstudio/sdk"

/**
 * Options driving a single agent run.
 */
export interface RunAgentOptions {
  /** Model key of the LLM to run as the agent. `undefined` selects any loaded model. */
  modelKey: string | undefined
  /** System prompt injected as the first message on the agent run. */
  systemPrompt: string
  /** Task description appended as the user message. */
  task: string
  /** Optional extra context appended to the task as a second user message. */
  context: string | undefined
  /** Upper bound on the number of `.act` prediction rounds the agent may take. */
  maxRounds: number
  /** Sampling temperature applied to the agent's predictions. */
  temperature: number
  /** Wall-clock cap on the run, in milliseconds. `undefined` disables the timeout. */
  timeoutMs: number | undefined
  /** Abort signal supplied by the calling tool context. */
  signal: AbortSignal
  /** Status callback invoked at round boundaries to surface progress to the host UI. */
  onStatus: (message: string) => void
}

/**
 * Run a single sub-agent prediction against the configured LM Studio LLM.
 *
 * @param client - LM Studio client supplied by the tool context.
 * @param options - Inputs and runtime callbacks for the run.
 * @returns The text content of the final assistant message produced by the run.
 * @throws AgentTimeoutError When the configured timeout fires before the run completes.
 * @throws EmptyAgentResponseError When the run completes without emitting assistant text.
 */
export async function runAgent(client: LMStudioClient, options: RunAgentOptions): Promise<string> {
  const { modelKey, systemPrompt, task, context, maxRounds, temperature, timeoutMs, signal, onStatus } = options
  const model = modelKey === undefined ? await client.llm.model() : await client.llm.model(modelKey)
  const chat = buildChat(systemPrompt, task, context)
  const transcript: ChatMessage[] = []
  const timeoutSignal = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs)
  const runSignal = timeoutSignal === undefined ? signal : AbortSignal.any([signal, timeoutSignal])

  try {
    await model.act(chat, [], {
      maxPredictionRounds: maxRounds,
      temperature,
      signal: runSignal,

      /**
       * Surface round transitions in the host UI status line.
       *
       * @param roundIndex - Zero-based index of the round that just started.
       */
      onRoundStart: roundIndex => {
        onStatus(`Agent round ${(roundIndex + 1).toString()}/${maxRounds.toString()}...`)
      },

      /**
       * Accumulate every message emitted during the run so we can return the final answer.
       *
       * @param message - Message emitted by the SDK (assistant prediction or tool turn).
       */
      onMessage: message => {
        transcript.push(message)
      },
    })
  } catch (error) {
    if (timeoutSignal?.aborted === true && signal.aborted === false) {
      throw new AgentTimeoutError(timeoutMs ?? 0)
    }

    throw error
  }

  return finalAssistantText(transcript)
}

/**
 * Build the chat history fed to the sub-agent: a system message followed by the task, plus an
 * optional second user message when supplemental context is supplied.
 *
 * @param systemPrompt - Standing instructions for the agent.
 * @param task - The caller-supplied task description.
 * @param context - Optional supplemental context appended after the task.
 * @returns A Chat ready to pass to `model.act`.
 */
function buildChat(systemPrompt: string, task: string, context: string | undefined): Chat {
  const chat = Chat.from([
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ])

  if (context !== undefined && context.trim() !== "") {
    chat.append("user", context)
  }

  return chat
}

/**
 * Find the last assistant message in the transcript and return its visible text.
 *
 * @param transcript - All messages emitted during the run (assistant predictions and tool turns).
 * @returns The final assistant message's text content.
 * @throws EmptyAgentResponseError When no assistant message produced any visible text content.
 */
function finalAssistantText(transcript: ChatMessage[]): string {
  for (let index = transcript.length - 1; index >= 0; index--) {
    const message = transcript[index]

    if (message.getRole() === "assistant") {
      const text = message.getText().trim()

      if (text !== "") {
        return text
      }
    }
  }

  throw new EmptyAgentResponseError()
}

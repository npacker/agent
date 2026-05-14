/**
 * Drive one `model.act()` call for a sub-agent and return its final answer.
 */

import { Chat, type ChatMessage, type LMStudioClient, type Tool } from "@lmstudio/sdk"

import { AgentTimeoutError, EmptyAgentResponseError } from "../errors/agent-error"
import { isAbortError } from "../errors/inspect-error"

import { prepareFinalAnswerCapture, type FinalAnswerSetup } from "./final-answer"

/** System-prompt suffix telling the model how to terminate the run. */
const SUBMIT_FINAL_ANSWER_HINT =
  "\n\nWhen you have completed the task, call the `submit_final_answer` tool with your answer; the run will terminate as soon as you do."

/** System-prompt suffix appended when a plan is supplied. */
const PLAN_ADHERENCE_HINT =
  "\n\nA plan has been supplied as a user message starting with `Plan:`. Follow it step by step. If your next action would contradict the plan, emit the word `replan` so the caller can intervene."

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
  /** Optional extra context appended to the task as a trailing user message. */
  context: string | undefined
  /** Optional caller-supplied plan injected after the task as its own user message. */
  plan: string | undefined
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
  const finalAnswer = prepareFinalAnswerCapture(signals.runSignal)
  const tools = [finalAnswer.tool, ...options.externalTools]
  const chat = buildChat(options)
  const transcript: ChatMessage[] = []

  try {
    await model.act(chat, tools, {
      maxPredictionRounds: options.maxRounds,
      temperature: options.temperature,
      signal: finalAnswer.actSignal,

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
    return mapDispatchError(error, finalAnswer, signals, options)
  }

  if (finalAnswer.capture.value !== undefined) {
    return finalAnswer.capture.value
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
 * Disambiguate a caught `.act` rejection. A `submit_final_answer` abort becomes a clean return
 * with the captured answer; a timeout abort becomes a typed `AgentTimeoutError`; everything else
 * propagates unchanged. A captured final answer wins over the timeout so user-submitted answers
 * are never silently discarded by a near-simultaneous timeout.
 *
 * @param error - Caught rejection value.
 * @param finalAnswer - Capture bundle for the run.
 * @param signals - Composed run-wide and timeout signals.
 * @param options - Run options (consulted for the caller signal and configured timeout).
 * @returns The captured final answer when the abort was caused by `submit_final_answer`.
 * @throws AgentTimeoutError When the timeout signal fired and no answer was captured.
 * @throws Error When the rejection is anything else.
 */
function mapDispatchError(
  error: unknown,
  finalAnswer: FinalAnswerSetup,
  signals: RunSignals,
  options: RunAgentOptions
): string {
  if (!isAbortError(error)) {
    throw error
  }

  if (finalAnswer.capture.value !== undefined) {
    return finalAnswer.capture.value
  }

  if (signals.didTimeout()) {
    throw new AgentTimeoutError(options.timeoutMs)
  }

  throw error
}

/**
 * Build the chat fed to `.act`: system prompt (extended with submit-final-answer plus optional
 * plan-adherence hints), task, optional plan, optional context.
 *
 * @param options - Run options.
 * @returns A `Chat` ready to pass to `model.act`.
 */
function buildChat(options: RunAgentOptions): Chat {
  let { systemPrompt } = options

  if (options.plan !== undefined) {
    systemPrompt += PLAN_ADHERENCE_HINT
  }

  systemPrompt += SUBMIT_FINAL_ANSWER_HINT

  const chat = Chat.from([
    { role: "system", content: systemPrompt },
    { role: "user", content: options.task },
  ])

  if (options.plan !== undefined) {
    chat.append("user", `Plan:\n${options.plan}`)
  }

  if (options.context !== undefined && options.context.trim() !== "") {
    chat.append("user", options.context)
  }

  return chat
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

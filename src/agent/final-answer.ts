/**
 * The synthetic `submit_final_answer` tool: lets a sub-agent return its answer and terminate
 * its `.act` run immediately.
 *
 * The tool's implementation writes the answer to a shared `capture` and fires a private
 * `AbortController`. Callers pass `actSignal` (the controller's signal composed with the run
 * signal) to `.act` and read `capture.value` after `.act` returns to detect submission.
 */

import { tool, type Tool } from "@lmstudio/sdk"
import { z } from "zod"

/**
 * Mutable container the tool writes into when the sub-agent submits its final answer.
 */
export interface FinalAnswerCapture {
  /** Submitted answer, or `undefined` when the tool has not been called. */
  value: string | undefined
}

/**
 * Capture, tool, and composed act signal returned by `prepareFinalAnswerCapture`.
 */
export interface FinalAnswerSetup {
  /** Container the tool writes into. Inspect `.value` after `.act` returns to detect submission. */
  capture: FinalAnswerCapture
  /** Tool to include in the active tool list for the run. */
  tool: Tool
  /** Run-wide signal composed with the tool's private abort controller; pass to `.act`. */
  actSignal: AbortSignal
}

/**
 * Build a fresh capture, `submit_final_answer` tool, and composed act signal.
 *
 * @param runSignal - Run-wide signal (caller cancellation + optional timeout) to compose with.
 * @returns The bundled capture, tool, and composed act signal.
 */
export function prepareFinalAnswerCapture(runSignal: AbortSignal): FinalAnswerSetup {
  const controller = new AbortController()
  const capture: FinalAnswerCapture = { value: undefined }
  const actSignal: AbortSignal = AbortSignal.any([runSignal, controller.signal])

  const finalTool = tool({
    name: "submit_final_answer",
    description:
      "Submit the run's final answer and end the agent run. Call this only when you have completed the task — its argument becomes the value returned to the caller, and the run terminates immediately afterwards.",
    parameters: {
      answer: z.string().min(1).describe("The final answer to return as the run's output. Cannot be empty."),
    },

    /**
     * Capture the submitted answer and fire the controller so the surrounding `.act` returns.
     *
     * @param parameters - Validated argument record with the answer string.
     * @returns Acknowledgement text appended to the transcript as the tool's result.
     */
    implementation: parameters => {
      capture.value = parameters.answer
      controller.abort()

      return "Final answer recorded; run will terminate."
    },
  })

  return { capture, tool: finalTool, actSignal }
}

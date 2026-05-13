/**
 * Run Agent tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { runAgent } from "../agent"
import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"

/**
 * Build the Run Agent tool: delegates a single, well-scoped task to a configured sub-agent
 * model running inside LM Studio, then returns the agent's final answer to the host LLM.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The configured Run Agent tool.
 */
export function createRunAgentTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "Run Agent",
    description:
      "Delegate a single, well-scoped task to a sub-agent LLM and return its final answer. Use this when a step is self-contained and benefits from a fresh context window — e.g. summarising a long passage, drafting a contained block of text, or working through a focused reasoning problem. The sub-agent does not have access to this chat's history or to other tools.",
    parameters: {
      task: z
        .string()
        .min(1)
        .describe(
          "The task for the sub-agent to complete. State the goal, the required output shape, and any constraints. Do not refer to 'the chat' or 'the user' — the sub-agent has no prior context."
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Optional supplemental context (source material, prior findings, constraints) appended as a second user message. Include anything the sub-agent needs that is not already in the task description."
        ),
    },

    /**
     * Execute one agent run against the configured sub-agent model.
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns The sub-agent's final answer, or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const { task, context: extraContext } = arguments_
      context.status("Starting agent run...")

      try {
        const config = resolveConfig(ctl)
        const answer = await runAgent(ctl.client, {
          modelKey: config.modelKey,
          systemPrompt: config.systemPrompt,
          task,
          context: extraContext,
          maxRounds: config.maxRounds,
          temperature: config.temperature,
          timeoutMs: config.timeoutMs,
          signal: context.signal,
          onStatus: context.status,
        })
        context.status("Agent run complete.")

        return answer
      } catch (error) {
        return formatToolError(error, context, "run-agent")
      }
    },
  })
}

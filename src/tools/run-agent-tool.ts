/**
 * Run Agent tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { runAgent } from "../agent"
import { resolveConfig } from "../config/resolve-config"
import { formatToolError, UnknownAllowedToolsError, UnknownRequiredToolsError } from "../errors"

import type { ToolBridge } from "../plugin-tools"

/**
 * Build the Run Agent tool: delegates a task to a sub-agent model with the cross-plugin tools
 * exposed by the bridge.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @param bridge - Long-lived bridge exposing cross-plugin tools to the sub-agent.
 * @returns The configured Run Agent tool.
 */
export function createRunAgentTool(ctl: ToolsProviderController, bridge: ToolBridge): Tool {
  return tool({
    name: "Run Agent",
    description:
      "Dispatch a sub-agent in a separate, isolated context. Suitable for self-contained reasoning, summarisation, drafting, or complex multi-step work. Supply the sub-agent's system prompt and task, tailored to the user's query, along with any relevant user input or additional context (e.g text to summarize, code to review, documents to compare).",
    parameters: {
      systemPrompt: z
        .string()
        .min(1)
        .describe(
          "The system prompt for the sub-agent, written by you to fit the user's query. State the persona, output style, and any standing constraints. The sub-agent has **NO** access to your memory, the chat history, or user prompts, so any relevant context **MUST** be included in the system prompt or task."
        ),
      task: z
        .string()
        .min(1)
        .describe(
          "The task for the sub-agent to complete. State the goal, the required output shape, any constraints, and any source material or context the sub-agent needs. The sub-agent has **NO** access to your memory, the chat history, or user prompts, so any relevant context **MUST** be included in the task or system prompt."
        ),
      requiredTools: z
        .array(z.string().min(1))
        .optional()
        .describe(
          "Optional list of tool names the sub-agent must call at least once during the run. Names must exactly match tools exposed to the sub-agent (case-sensitive). Pass only when you genuinely require a tool — omit otherwise."
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
      context.status("Starting agent run...")

      try {
        const config = resolveConfig(ctl)

        for (const openWarning of bridge.openWarnings) {
          context.warn(openWarning)
        }

        const { tools: externalTools, unknownNames } = bridge.listTools(config.allowedTools)

        if (unknownNames.length > 0) {
          throw new UnknownAllowedToolsError(unknownNames, bridge.availableNames())
        }

        const requiredTools = arguments_.requiredTools ?? []

        if (requiredTools.length > 0) {
          const availableNames = externalTools.map(t => t.name)
          const unknownRequired = requiredTools.filter(name => !availableNames.includes(name))

          if (unknownRequired.length > 0) {
            throw new UnknownRequiredToolsError(unknownRequired, availableNames)
          }
        }

        const answer = await runAgent(ctl.client, {
          modelKey: config.modelKey,
          systemPrompt: arguments_.systemPrompt,
          task: arguments_.task,
          externalTools,
          requiredTools,
          maxRounds: config.maxRounds,
          maxRetries: config.maxRetries,
          temperature: config.temperature,
          timeout: config.timeout,
          signal: context.signal,
          onStatus: context.status,
          onWarn: context.warn,
        })
        context.status("Agent run complete.")

        return answer
      } catch (error) {
        return formatToolError(error, context)
      }
    },
  })
}

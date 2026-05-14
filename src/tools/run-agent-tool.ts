/**
 * Run Agent tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { runAgent } from "../agent"
import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"

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
      "Delegate a task to a sub-agent LLM running in LM Studio and return its final answer. Suitable for self-contained reasoning, summarisation, drafting, or multi-step work. Supply the sub-agent's system prompt yourself, tailored to the user's query. Pass `allowedTools` to scope which cross-plugin tools it may call. The sub-agent has no access to this chat's history.",
    parameters: {
      systemPrompt: z
        .string()
        .min(1)
        .describe(
          "System prompt for the sub-agent, written by you to fit the user's query. State the persona, output style, and any standing constraints. The sub-agent has no prior context, so any background it needs must be included here or in the task."
        ),
      task: z
        .string()
        .min(1)
        .describe(
          "The task for the sub-agent to complete. State the goal, the required output shape, any constraints, and inline any source material the sub-agent needs. Do not refer to 'the chat' or 'the user' — the sub-agent has no prior context."
        ),
      allowedTools: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of exact tool names the sub-agent may call this run. Omit to use the plugin's default allow list."
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
        const allowedTools = arguments_.allowedTools ?? config.defaultAllowedTools
        const { tools: externalTools, warnings } = bridge.listTools(allowedTools)

        for (const warning of warnings) {
          context.warn(warning)
        }

        const answer = await runAgent(ctl.client, {
          modelKey: config.modelKey,
          systemPrompt: arguments_.systemPrompt,
          task: arguments_.task,
          externalTools,
          maxRounds: config.maxRounds,
          temperature: config.temperature,
          timeoutMs: config.timeoutMs,
          signal: context.signal,
          onStatus: context.status,
        })
        context.status("Agent run complete.")

        return answer
      } catch (error) {
        return formatToolError(error, context)
      }
    },
  })
}

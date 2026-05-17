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
      "Delegate a task to a sub-agent LLM running in LM Studio and return its final answer. Suitable for self-contained reasoning, summarisation, drafting, or multi-step work. Supply the sub-agent's system prompt yourself, tailored to the user's query. The sub-agent has no access to this chat's history. Cross-plugin tool access is governed by the plugin's configuration.",
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
      requiredTools: z
        .array(z.string().min(1))
        .optional()
        .describe(
          "Optional list of tool names the sub-agent must call at least once during the run. Names must exactly match tools exposed to the sub-agent (case-sensitive). If any required tool is missing after a round, the runner appends a corrective user message and retries up to the operator's configured retry budget; on exhaustion the call fails. Pass only when you genuinely require a tool — leave omitted otherwise."
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

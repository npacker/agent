/**
 * Registers the plugin's tools with the LM Studio SDK.
 */

import { createRunAgentTool } from "./tools/run-agent-tool"

import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Register the plugin's tools with the LM Studio SDK controller.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered Agent tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  return [createRunAgentTool(ctl)]
}

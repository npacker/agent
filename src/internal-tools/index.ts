/**
 * Aggregator for the plugin-internal filesystem tools that are injected into the sub-agent's
 * `.act` call by `tools-provider.ts`. These tools are never returned from `toolsProvider`, so
 * the host LLM does not see them directly — they are visible to the sub-agent only.
 */

import { createGrepTool } from "./grep-tool"
import { createListFilesTool } from "./list-files-tool"
import { createReadFileTool } from "./read-file-tool"

import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Build every internal tool that should be exposed to the sub-agent.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The internal-tool list, in stable order.
 */
export function buildInternalTools(ctl: ToolsProviderController): Tool[] {
  return [createListFilesTool(ctl), createReadFileTool(ctl), createGrepTool(ctl)]
}

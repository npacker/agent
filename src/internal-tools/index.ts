/**
 * Aggregator for the plugin-internal tools that are injected into the sub-agent's `.act` call by
 * `tools-provider.ts`: filesystem tools scoped to the working directory plus context tools that
 * read the chat's attachments and latest message. These tools are never returned from
 * `toolsProvider`, so the host LLM does not see them directly — they are visible to the sub-agent
 * only.
 */

import { createGrepTool } from "./grep-tool"
import { createListAttachmentsTool } from "./list-attachments-tool"
import { createListFilesTool } from "./list-files-tool"
import { createReadAttachmentTool } from "./read-attachment-tool"
import { createReadFileTool } from "./read-file-tool"

import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Build every internal tool that should be exposed to the sub-agent.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The internal-tool list, in stable order.
 */
export function buildInternalTools(ctl: ToolsProviderController): Tool[] {
  return [
    createListFilesTool(ctl),
    createReadFileTool(ctl),
    createGrepTool(ctl),
    createListAttachmentsTool(ctl),
    createReadAttachmentTool(ctl),
  ]
}

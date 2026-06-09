/**
 * Aggregator for the plugin-internal tools that are injected into the sub-agent's `.act` call.
 * These tools are never returned from `toolsProvider`, so the host LLM does not see them
 * directly — they are visible to the sub-agent only.
 *
 * Two families exist: the read-only filesystem tools (`buildInternalTools`, scoped to the LM
 * Studio working directory) and the per-call file-editing tools (`buildEditTools`, scoped to a
 * single-file in-memory snapshot store).
 */

import { createDiffLogTool } from "./diff-log-tool"
import { createEditFileTool } from "./edit-file-tool"
import { createGrepTool } from "./grep-tool"
import { createListFilesTool } from "./list-files-tool"
import { createReadFileEditTool } from "./read-file-edit-tool"
import { createReadFileTool } from "./read-file-tool"
import { createRollbackTool } from "./rollback-tool"
import { createShowDiffTool } from "./show-diff-tool"

import type { ScratchRepo } from "../edit/scratch-repo"
import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Build every read-only filesystem tool exposed to the sub-agent, scoped to the working directory.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The internal-tool list, in stable order.
 */
export function buildInternalTools(ctl: ToolsProviderController): Tool[] {
  return [createListFilesTool(ctl), createReadFileTool(ctl), createGrepTool(ctl)]
}

/**
 * Build the file-editing tools exposed to the sub-agent during an edit run, scoped to the
 * supplied scratch repo.
 *
 * @param repo - Per-call scratch repo holding the single file under edit.
 * @returns The edit-tool list, in stable order.
 */
export function buildEditTools(repo: ScratchRepo): Tool[] {
  return [
    createReadFileEditTool(repo),
    createEditFileTool(repo),
    createShowDiffTool(repo),
    createDiffLogTool(repo),
    createRollbackTool(repo),
  ]
}

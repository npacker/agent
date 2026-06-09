/**
 * `read_file` tool factory for edit mode. Sub-agent-only: returns the current (in-progress)
 * content of the single file under edit, reflecting every edit applied so far.
 */

import { tool, type Tool } from "@lmstudio/sdk"

import type { ScratchRepo } from "../edit/scratch-repo"

/**
 * Build the edit-mode `read_file` tool, returning the current content of the file under edit.
 *
 * @param repo - Per-call scratch repo holding the file under edit.
 * @returns The configured `read_file` tool.
 */
export function createReadFileEditTool(repo: ScratchRepo): Tool {
  return tool({
    name: "read_file",
    description:
      "Read the current contents of the file under edit, including every edit applied so far. Returns `{ content: string }`.",
    parameters: {},

    /**
     * Return the current scratch-file content.
     *
     * @returns `{ content: string }` holding the current file text.
     */
    implementation: () => ({ content: repo.readCurrent() }),
  })
}

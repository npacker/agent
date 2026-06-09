/**
 * `diff_log` tool factory. Sub-agent-only: returns the per-step unified diffs, one per recorded
 * edit, in order — so the sub-agent can trace how the file evolved (including rollbacks).
 */

import { tool, type Tool } from "@lmstudio/sdk"

import type { ScratchRepo } from "../edit/scratch-repo"

/**
 * Build the `diff_log` tool, returning the ordered per-edit diffs for the file under edit.
 *
 * @param repo - Per-call scratch repo holding the file under edit.
 * @returns The configured `diff_log` tool.
 */
export function createDiffLogTool(repo: ScratchRepo): Tool {
  return tool({
    name: "diff_log",
    description:
      "List the per-step unified diffs, one for each edit applied so far, in order. A rollback appears as its own step. Returns `{ steps: string[] }` (empty when no edits have been made).",
    parameters: {},

    /**
     * Return the ordered per-edit diffs.
     *
     * @returns `{ steps: string[] }` holding one diff per recorded edit.
     */
    implementation: () => ({ steps: repo.diffLog() }),
  })
}

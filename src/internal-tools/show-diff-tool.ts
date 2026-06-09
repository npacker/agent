/**
 * `show_diff` tool factory. Sub-agent-only: renders the cumulative unified diff from the original
 * file to its current edited state so the sub-agent can review its own progress.
 */

import { tool, type Tool } from "@lmstudio/sdk"

import type { ScratchRepo } from "../edit/scratch-repo"

/**
 * Build the `show_diff` tool, returning the cumulative diff for the file under edit.
 *
 * @param repo - Per-call scratch repo holding the file under edit.
 * @returns The configured `show_diff` tool.
 */
export function createShowDiffTool(repo: ScratchRepo): Tool {
  return tool({
    name: "show_diff",
    description:
      "Show the cumulative unified diff from the original file to its current edited state. Returns `{ diff: string }`, with a `note` when no edits have been made yet.",
    parameters: {},

    /**
     * Render the cumulative diff, noting when no edits have been made.
     *
     * @returns `{ diff }`, plus a `note` when the diff is empty.
     */
    implementation: () => {
      const diff = repo.renderDiff()

      return diff === "" ? { diff, note: "No edits have been made yet." } : { diff }
    },
  })
}

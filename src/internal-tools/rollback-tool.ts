/**
 * `rollback` tool factory. Sub-agent-only: non-destructively restores an earlier snapshot of the
 * file under edit by recording it as a new edit, preserving the full history.
 */

import { tool, type Tool } from "@lmstudio/sdk"
import { z } from "zod"

import { formatToolError } from "../errors"

import type { ScratchRepo } from "../edit/scratch-repo"

/**
 * Build the `rollback` tool, restoring an earlier snapshot of the file under edit.
 *
 * @param repo - Per-call scratch repo holding the file under edit.
 * @returns The configured `rollback` tool.
 */
export function createRollbackTool(repo: ScratchRepo): Tool {
  return tool({
    name: "rollback",
    description: `Undo edits by restoring an earlier version of the file as a new edit (history is preserved). Pass \`to\` (a snapshot index, where 0 is the original file) to restore that version; omit it to undo the most recent edit. Use \`diff_log\` to see the recorded steps. Returns \`{ ok: true, restoredTo: number }\`, or \`{ error: "Rollback failed: …" }\` when there is nothing to undo or the index is out of range.`,
    parameters: {
      to: z
        .number()
        .int()
        .optional()
        .describe("Snapshot index to restore (0 is the original file). Omit to undo the most recent edit."),
    },

    /**
     * Restore the requested snapshot and report which index was restored.
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns `{ ok: true, restoredTo }` on success, or `{ error: "Rollback failed: …" }`.
     */
    implementation: (arguments_, context) => {
      try {
        const restoredTo = repo.rollback(arguments_.to)

        return { ok: true, restoredTo }
      } catch (error) {
        return { error: formatToolError(error, context, "Rollback failed") }
      }
    },
  })
}

/**
 * `edit_file` tool factory. Sub-agent-only: applies an exact find-and-replace to the single file
 * under edit, committed to the per-call scratch repo. Never returned by `toolsProvider`.
 */

import { tool, type Tool } from "@lmstudio/sdk"
import { z } from "zod"

import { formatToolError } from "../errors"

import type { ScratchRepo } from "../edit/scratch-repo"

/**
 * Build the `edit_file` tool over a scratch repo, exposing exact find-and-replace editing.
 *
 * @param repo - Per-call scratch repo holding the file under edit.
 * @returns The configured `edit_file` tool.
 */
export function createEditFileTool(repo: ScratchRepo): Tool {
  return tool({
    name: "edit_file",
    description: `Replace an exact span of text in the file under edit. \`find\` must match the current file contents verbatim, including indentation and line breaks. By default \`find\` must match exactly once; pass \`replaceAll: true\` to replace every occurrence. Returns \`{ ok: true, replacements: number }\`, or \`{ error: "Edit failed: …" }\` when the text is not found or matches more than once.`,
    parameters: {
      find: z
        .string()
        .min(1)
        .describe("Exact text to locate in the current file contents. Whitespace- and indentation-sensitive."),
      replace: z.string().describe("Text to substitute in place of every matched span."),
      replaceAll: z
        .boolean()
        .optional()
        .describe("When true, replace every occurrence of `find`; otherwise `find` must match exactly once."),
    },

    /**
     * Apply the find-and-replace to the scratch file and report the replacement count.
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns `{ ok: true, replacements }` on success, or `{ error: "Edit failed: …" }`.
     */
    implementation: (arguments_, context) => {
      try {
        const replacements = repo.applyEdit(arguments_.find, arguments_.replace, arguments_.replaceAll ?? false)

        return { ok: true, replacements }
      } catch (error) {
        return { error: formatToolError(error, context, "Edit failed") }
      }
    },
  })
}

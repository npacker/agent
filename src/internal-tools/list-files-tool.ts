/**
 * `list_files` tool factory. Sub-agent-only: never returned by `toolsProvider`.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { formatToolError } from "../errors"
import { listDirectory, resolveSandboxedPath } from "../fs"

/**
 * Build the `list_files` tool: enumerate a directory inside the LM Studio working directory.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK. The controller's
 * `getWorkingDirectory()` is consulted at execution time so the listing always reflects the
 * current prediction's working directory.
 * @returns The configured `list_files` tool.
 */
export function createListFilesTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "list_files",
    description:
      'List files and directories inside the working directory. Returns a JSON object: `{ entries: string[], total: number }`. Paths in `entries` are relative to the requested directory and directories carry a trailing "/". Hidden entries (names starting with ".") are excluded by default. `entries` is capped at 1000; `total` is the full count. On failure, returns `{ error: "List failed: …" }`.',
    parameters: {
      path: z
        .string()
        .optional()
        .describe(
          "Directory to list, relative to the working directory (or absolute, as long as it resolves inside the working directory). Defaults to '.' (the working directory root)."
        ),
      recursive: z
        .boolean()
        .optional()
        .describe("When true, walk subdirectories up to a depth of 8. Defaults to false."),
      includeHidden: z
        .boolean()
        .optional()
        .describe("When true, include entries whose name starts with '.'. Defaults to false."),
    },

    /**
     * Resolve the caller's path against the LM Studio working directory and return the
     * structured `ListResult` (or a `{ error }` envelope on failure).
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns The structured `ListResult` on success, or `{ error: "List failed: …" }`.
     */
    implementation: async (arguments_, context) => {
      try {
        const requestedPath = arguments_.path ?? "."
        const root = ctl.getWorkingDirectory()
        const absolutePath = await resolveSandboxedPath(root, requestedPath)

        return await listDirectory(absolutePath, {
          recursive: arguments_.recursive ?? false,
          includeHidden: arguments_.includeHidden ?? false,
          signal: context.signal,
        })
      } catch (error) {
        return { error: formatToolError(error, context, "List failed") }
      }
    },
  })
}

/**
 * `grep` tool factory. Sub-agent-only: never returned by `toolsProvider`.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { errorMessage, formatToolError, InvalidRegexError } from "../errors"
import { grep, resolveSandboxedPath } from "../fs"

/**
 * Build the `grep` tool: search files inside the LM Studio working directory for lines
 * matching a regular expression.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK. The controller's
 * `getWorkingDirectory()` is consulted at execution time so the search always resolves
 * against the current prediction's working directory.
 * @returns The configured `grep` tool.
 */
export function createGrepTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "grep",
    description: "Search files inside the working directory for lines matching a JavaScript regular expression.",
    parameters: {
      pattern: z.string().min(1).describe("Regular-expression source (JavaScript flavour). Required."),
      path: z
        .string()
        .optional()
        .describe(
          "Directory to search, relative to the working directory (or absolute, as long as it resolves inside the working directory). Defaults to '.' (the working directory root)."
        ),
      ignoreCase: z.boolean().optional().describe("When true, match case-insensitively. Defaults to false."),
    },

    /**
     * Compile the caller's regex, resolve the search root against the LM Studio working
     * directory, and return the structured grep result (or a `{ error }` envelope on failure).
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns The structured `GrepResult` on success, or `{ error: "Search failed: …" }`.
     */
    implementation: async (arguments_, context) => {
      try {
        let pattern: RegExp

        try {
          pattern = new RegExp(arguments_.pattern, arguments_.ignoreCase === true ? "i" : "")
        } catch (regexError) {
          throw new InvalidRegexError(arguments_.pattern, errorMessage(regexError), regexError)
        }

        const requestedRoot = arguments_.path ?? "."
        const workingRoot = ctl.getWorkingDirectory()
        const absoluteRoot = await resolveSandboxedPath(workingRoot, requestedRoot)

        return await grep(absoluteRoot, {
          pattern,
          signal: context.signal,
        })
      } catch (error) {
        return { error: formatToolError(error, context, "Search failed") }
      }
    },
  })
}

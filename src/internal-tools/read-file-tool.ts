/**
 * `read_file` tool factory. Sub-agent-only: never returned by `toolsProvider`.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { formatToolError } from "../errors"
import { readFile, resolveSandboxedPath } from "../fs"

/**
 * Build the `read_file` tool: read the full text content of a file inside the LM Studio
 * working directory.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK. The controller's
 * `getWorkingDirectory()` is consulted at execution time so the read always resolves
 * against the current prediction's working directory.
 * @returns The configured `read_file` tool.
 */
export function createReadFileTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "read_file",
    description: `Read a text file inside the working directory. Returns a JSON object: \`{ content: string }\` holding the file's full text. Binary files and files over 5 MB are refused. On failure, returns \`{ error: "Read failed: …" }\`.`,
    parameters: {
      path: z
        .string()
        .min(1)
        .describe(
          "Path to the file, relative to the working directory (or absolute, as long as it resolves inside the working directory)."
        ),
    },

    /**
     * Resolve the caller's path against the LM Studio working directory and return the file's
     * content (or a `{ error }` envelope on failure).
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns `{ content: string }` on success, or `{ error: "Read failed: …" }`.
     */
    implementation: async (arguments_, context) => {
      try {
        const root = ctl.getWorkingDirectory()
        const absolutePath = await resolveSandboxedPath(root, arguments_.path)

        return { content: await readFile(absolutePath, arguments_.path, context.signal) }
      } catch (error) {
        return { error: formatToolError(error, context, "Read failed") }
      }
    },
  })
}

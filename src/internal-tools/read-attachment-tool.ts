/**
 * `read_attachment` tool factory. Sub-agent-only: never returned by `toolsProvider`.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { FIRST_USER_MESSAGE_NAME, LATEST_USER_MESSAGE_NAME, getChatContext } from "../chat-context/store"
import { formatToolError } from "../errors"

/**
 * Build the `read_attachment` tool: return the full text of one source from the current chat — the
 * user's latest message or an attached file, parsed to text on demand.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK. Its `getWorkingDirectory()`
 * is consulted at execution time to find the current chat's recorded context, and its `client`
 * parses document attachments to text.
 * @returns The configured `read_attachment` tool.
 */
export function createReadAttachmentTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "read_attachment",
    description: `Read the full text of one source listed by \`list_attachments\`. Use the name "${LATEST_USER_MESSAGE_NAME}" for the user's latest message, "${FIRST_USER_MESSAGE_NAME}" for the user's first message, or a file's name for an attachment.`,
    parameters: {
      name: z
        .string()
        .min(1)
        .describe(
          `Name of the source to read, as reported by \`list_attachments\`: "${LATEST_USER_MESSAGE_NAME}" for the user's latest message, "${FIRST_USER_MESSAGE_NAME}" for the user's first message, or a file's name for an attachment.`
        ),
    },

    /**
     * Resolve the requested name against the current chat's recorded context and return its text.
     *
     * @param arguments_ - Validated tool parameters.
     * @param context - Runtime tool context supplied by the SDK.
     * @returns `{ content: string }` on success, or `{ error: "Read attachment failed: …" }`.
     */
    implementation: async (arguments_, context) => {
      try {
        const chatContext = getChatContext(ctl.getWorkingDirectory())

        if (chatContext === undefined) {
          return { error: "Read attachment failed: no source material is available in this chat." }
        }

        if (arguments_.name === LATEST_USER_MESSAGE_NAME) {
          return { content: chatContext.messageText }
        }

        if (arguments_.name === FIRST_USER_MESSAGE_NAME) {
          return { content: chatContext.firstMessageText }
        }

        const file = chatContext.files.find(candidate => candidate.name === arguments_.name)

        if (file === undefined) {
          return { error: `Read attachment failed: no source named "${arguments_.name}".` }
        }

        // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation -- parseDocument is the only SDK API that extracts text from PDF/Word attachments; it is flagged deprecated solely because the document-parsing API is still in active development upstream ([DEP-DOC-PARSE]).
        const result = await ctl.client.files.parseDocument(file, { signal: context.signal })

        return { content: result.content }
      } catch (error) {
        return { error: formatToolError(error, context, "Read attachment failed") }
      }
    },
  })
}

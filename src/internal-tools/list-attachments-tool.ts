/**
 * `list_attachments` tool factory. Sub-agent-only: never returned by `toolsProvider`.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"

import { LATEST_USER_MESSAGE_NAME, getChatContext, listAttachments } from "../chat-context/store"

/**
 * Build the `list_attachments` tool: list the chat's readable sources (the user's latest message
 * and any attached files) so the sub-agent can choose what to read.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK. Its `getWorkingDirectory()`
 * is consulted at execution time to find the current chat's recorded context.
 * @returns The configured `list_attachments` tool.
 */
export function createListAttachmentsTool(ctl: ToolsProviderController): Tool {
  return tool({
    name: "list_attachments",
    description: `List the source material available from the current chat: the user's latest message (named "${LATEST_USER_MESSAGE_NAME}") and any files they attached. Pass a name to \`read_attachment\` to read one.`,
    parameters: {},

    /**
     * Return the listing of readable sources recorded for the current chat.
     *
     * @returns `{ attachments: AttachmentInfo[] }`; the array is empty when nothing is recorded.
     */
    implementation: async () => {
      const chatContext = getChatContext(ctl.getWorkingDirectory())

      if (chatContext === undefined) {
        return { attachments: [] }
      }

      return { attachments: listAttachments(chatContext) }
    },
  })
}

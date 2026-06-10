/**
 * Prompt preprocessor that records each chat's latest user message text and attached files so the
 * sub-agent can read them on demand through the `list_attachments` / `read_attachment` internal
 * tools. Runs before the host model generates and returns the user message unchanged.
 */

import { setChatContext } from "../chat-context/store"
import { configSchematics } from "../config/config-schematics"

import type { FileHandle, PromptPreprocessor } from "@lmstudio/sdk"

/**
 * De-duplicate file handles by their identifier, preserving first-seen order.
 *
 * @param files - File handles to de-duplicate, possibly with repeats across messages.
 * @returns The unique file handles, in first-seen order.
 */
function dedupeById(files: FileHandle[]): FileHandle[] {
  const byId = new Map<string, FileHandle>()

  for (const file of files) {
    if (!byId.has(file.identifier)) {
      byId.set(file.identifier, file)
    }
  }

  return [...byId.values()]
}

/**
 * Record the current chat's message text and non-image attachments, keyed by working directory.
 * Records nothing when internal tools are disabled, and never mutates the prompt.
 *
 * @param ctl - Prompt preprocessor controller exposing config, history, and the client.
 * @param userMessage - The user message about to be sent to the model.
 * @returns The user message unchanged.
 */
export const chatContextPreprocessor: PromptPreprocessor = async (ctl, userMessage) => {
  const internalToolsEnabled = ctl.getPluginConfig(configSchematics).get("enableInternalTools")

  if (!internalToolsEnabled) {
    return userMessage
  }

  const history = await ctl.pullHistory()
  const files = dedupeById([...history.getAllFiles(ctl.client), ...userMessage.getFiles(ctl.client)]).filter(
    file => !file.isImage()
  )

  setChatContext(ctl.getWorkingDirectory(), { messageText: userMessage.getText(), files })

  return userMessage
}

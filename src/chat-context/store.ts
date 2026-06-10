/**
 * Per-chat store of context the sub-agent can read on demand: the latest user message text and the
 * non-image files attached to the conversation. Populated by the prompt preprocessor and read by
 * the `list_attachments` / `read_attachment` internal tools, keyed by working directory so
 * concurrent chats stay isolated.
 */

import type { FileHandle } from "@lmstudio/sdk"

/**
 * Name of the synthetic listing entry that exposes the user's message text. This is always the
 * current turn's user message (the one being preprocessed), never an earlier one — the value says
 * so, to distinguish it from real file attachments in `list_attachments` and `read_attachment`.
 */
export const LATEST_USER_MESSAGE_NAME = "latest-user-message"

/**
 * Context recorded for one chat: the latest user message text plus the conversation's attachments.
 */
export interface ChatContext {
  /** Full text of the most recent user message, verbatim. */
  messageText: string
  /** Non-image files attached anywhere in the conversation, de-duplicated by identifier. */
  files: FileHandle[]
}

/**
 * One row of the `list_attachments` result: a source the sub-agent may request by name.
 */
export interface AttachmentInfo {
  /** Name to pass to `read_attachment`. Either a file's name or {@link LATEST_USER_MESSAGE_NAME}. */
  name: string
  /** MIME-like type string, for example "text/plain" or "application/pdf". */
  type: string
  /** Size in bytes, so the sub-agent can gauge how large a read will be. */
  sizeBytes: number
}

/**
 * Recorded chat context keyed by working directory. The last write per key wins each user turn.
 */
const store = new Map<string, ChatContext>()

/**
 * Record the context for a chat, replacing any previous entry for the same key.
 *
 * @param key - Working directory identifying the chat.
 * @param value - The message text and attachments to record.
 */
export function setChatContext(key: string, value: ChatContext): void {
  store.set(key, value)
}

/**
 * Look up the recorded context for a chat.
 *
 * @param key - Working directory identifying the chat.
 * @returns The recorded context, or `undefined` when nothing has been recorded for the key.
 */
export function getChatContext(key: string): ChatContext | undefined {
  return store.get(key)
}

/**
 * Build the `list_attachments` rows for a chat: a synthetic entry for the user message (omitted
 * when the message has no text) followed by one entry per attached file.
 *
 * @param chatContext - The recorded context to summarise.
 * @returns The listing rows, in stable order.
 */
export function listAttachments(chatContext: ChatContext): AttachmentInfo[] {
  const rows: AttachmentInfo[] = []

  if (chatContext.messageText.trim() !== "") {
    rows.push({
      name: LATEST_USER_MESSAGE_NAME,
      type: "text/plain",
      sizeBytes: Buffer.byteLength(chatContext.messageText, "utf8"),
    })
  }

  for (const file of chatContext.files) {
    rows.push({ name: file.name, type: file.type, sizeBytes: file.sizeBytes })
  }

  return rows
}

/**
 * Errors raised by the file-editing tools (edit_file, rollback) and the scratch-repo helpers
 * under `src/edit/` they delegate to.
 */

import { UserFacingError } from "./user-facing-error"

/** Maximum number of characters of a caller-supplied snippet to echo back in an error message. */
const MAX_SNIPPET_LENGTH = 120

/**
 * Truncate a caller-supplied text snippet for safe inclusion in an error message, so a large
 * `find` payload cannot bloat the host LLM's transcript.
 *
 * @param text - Snippet to truncate.
 * @returns The snippet, shortened with a trailing ellipsis when it exceeds the cap.
 */
function truncateSnippet(text: string): string {
  if (text.length <= MAX_SNIPPET_LENGTH) {
    return text
  }

  return `${text.slice(0, MAX_SNIPPET_LENGTH)}…`
}

/**
 * Raised when the `find` text supplied to `edit_file` does not occur anywhere in the file. The
 * message coaches the sub-agent to copy the exact text — whitespace and all — from the current
 * file contents.
 */
export class EditNotFoundError extends UserFacingError {
  /** The `find` text the caller supplied, exactly as received. */
  public readonly find: string

  /**
   * Construct an EditNotFoundError describing the failed lookup.
   *
   * @param find - The `find` text that did not match any region of the file.
   */
  public constructor(find: string) {
    super(
      `The text to replace was not found in the file. Copy the exact text to replace — including indentation and line breaks — from the current file contents. Searched for: "${truncateSnippet(find)}".`
    )
    this.name = "EditNotFoundError"
    this.find = find
  }
}

/**
 * Raised when the `find` text supplied to `edit_file` occurs more than once and `replaceAll` was
 * not set. The caller must either disambiguate by adding surrounding context or opt into replacing
 * every occurrence.
 */
export class AmbiguousEditError extends UserFacingError {
  /** The `find` text the caller supplied, exactly as received. */
  public readonly find: string
  /** Number of times the `find` text occurs in the file. */
  public readonly occurrences: number

  /**
   * Construct an AmbiguousEditError naming the number of matches found.
   *
   * @param find - The `find` text that matched more than once.
   * @param occurrences - Number of times the `find` text occurs in the file.
   */
  public constructor(find: string, occurrences: number) {
    super(
      `The text to replace appears ${occurrences.toString()} times in the file. Include more surrounding context so it matches exactly once, or pass replaceAll: true to replace every occurrence. Searched for: "${truncateSnippet(find)}".`
    )
    this.name = "AmbiguousEditError"
    this.find = find
    this.occurrences = occurrences
  }
}

/**
 * Raised when a `rollback` target is outside the valid range of recorded snapshots. Snapshot 0 is
 * the original file; each successful edit records the next index.
 */
export class RollbackRangeError extends UserFacingError {
  /** Snapshot index the caller asked to roll back to. */
  public readonly requested: number
  /** Highest snapshot index that can be rolled back to, or negative when no edits exist yet. */
  public readonly maxTarget: number

  /**
   * Construct a RollbackRangeError describing the valid range.
   *
   * @param requested - Snapshot index the caller asked to roll back to.
   * @param maxTarget - Highest valid target index, or a negative value when no edits exist yet.
   */
  public constructor(requested: number, maxTarget: number) {
    const detail =
      maxTarget < 0
        ? "There are no edits to roll back yet."
        : `Valid targets are 0 (the original file) through ${maxTarget.toString()}.`

    super(`Cannot roll back to edit #${requested.toString()}. ${detail}`)
    this.name = "RollbackRangeError"
    this.requested = requested
    this.maxTarget = maxTarget
  }
}

/**
 * Raised when the host LLM supplies a `file` argument but the operator has not enabled file
 * editing. Editing is gated solely by operator configuration; the host cannot widen scope.
 */
export class FileEditingDisabledError extends UserFacingError {
  /**
   * Construct a FileEditingDisabledError with a default user-facing message.
   */
  public constructor() {
    super(
      'File editing is disabled by the operator. Enable "Enable File Editing" in the plugin settings to allow the agent to edit files.'
    )
    this.name = "FileEditingDisabledError"
  }
}

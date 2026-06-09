/**
 * Atomic file write for edit write-back. Writes to a sibling temp file in the target's own
 * directory (so the final rename stays on one volume and is atomic on Windows) and renames it
 * over the target. A failed write leaves the original file untouched.
 */

import { randomUUID } from "node:crypto"
import { rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Write `content` to `absolutePath` atomically via a temp-file-and-rename in the same directory.
 *
 * @param absolutePath - Absolute path of the file to overwrite.
 * @param content - Full file content to write, with line endings already applied.
 * @returns A promise that resolves once the target reflects the new content.
 * @throws Error Re-throws any write or rename failure after removing the temp file.
 */
export async function atomicWrite(absolutePath: string, content: string): Promise<void> {
  const directory = path.dirname(absolutePath)
  const temporaryPath = path.join(directory, `.${path.basename(absolutePath)}.${randomUUID()}.tmp`)

  try {
    await writeFile(temporaryPath, content, "utf8")
    await rename(temporaryPath, absolutePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })

    throw error
  }
}

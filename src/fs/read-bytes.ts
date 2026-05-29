/**
 * Shared bounded-read primitive: one open + one `handle.read` + one close, reading up to a
 * caller-supplied byte cap. Expected filesystem races (missing file, permission denied) are
 * reported as `undefined` so the caller can decide whether to skip silently or surface a
 * domain error.
 */

import { open } from "node:fs/promises"

import { errorCode } from "../errors/inspect-error"

/** Filesystem error codes treated as "skip this file" rather than a real failure. */
const SKIPPABLE_OPEN_CODES = new Set(["ENOENT", "EACCES", "EPERM"])

/**
 * Open `absolutePath`, read up to `byteLimit` bytes from offset `0`, and return the populated
 * slice (length ≤ `byteLimit`). Returns `undefined` when the file can't be opened — missing,
 * permission denied, or otherwise inaccessible — leaving classification of that case to the
 * caller. Any other open error propagates.
 *
 * @param absolutePath - Absolute path to the file to open.
 * @param byteLimit - Maximum bytes to read from the start of the file.
 * @returns The populated byte slice, or `undefined` when the file can't be opened.
 */
export async function readLimitedBuffer(absolutePath: string, byteLimit: number): Promise<Buffer | undefined> {
  const handle = await open(absolutePath, "r").catch((error: unknown): undefined => {
    if (SKIPPABLE_OPEN_CODES.has(errorCode(error) ?? "")) return

    throw error
  })

  if (handle === undefined) return

  try {
    const buffer = Buffer.alloc(byteLimit)
    const { bytesRead } = await handle.read(buffer, 0, byteLimit, 0)

    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Bounded file reader for the internal `read_file` tool.
 *
 * Refuses files larger than the byte cap, reads the whole body in one bounded read via the
 * shared `readLimitedBuffer` primitive (the same reader `grep` uses), rejects binaries by
 * scanning for NUL bytes, and returns the decoded UTF-8 content as a string.
 */

import { stat } from "node:fs/promises"

import { BinaryFileError, FileNotFoundError, FileTooLargeError } from "../errors/fs-error"

import { readLimitedBuffer } from "./read-bytes"

/** Maximum source-file size, in bytes, that `read_file` will accept. */
const MAX_FILE_BYTES = 1024 * 1024 * 10

/**
 * Read a sandbox-resolved file in full and return its decoded UTF-8 content.
 *
 * @param absolutePath - Sandbox-resolved absolute path to the file. Caller is responsible for
 * having run this through `resolveSandboxedPath`.
 * @param requestedPath - Original caller-supplied path, used in error messages so the operator
 * sees what they typed rather than the sandbox-internal absolute path.
 * @param signal - Optional abort signal; checked before the read begins.
 * @returns The file's content as a UTF-8 string.
 * @throws FileNotFoundError When the path is not a regular file or disappears before the read.
 * @throws FileTooLargeError When the file exceeds the byte cap.
 * @throws BinaryFileError When the file content contains a NUL byte.
 */
export async function readFile(absolutePath: string, requestedPath: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()

  const stats = await stat(absolutePath)

  if (!stats.isFile()) {
    throw new FileNotFoundError(requestedPath, "is not a regular file")
  }

  if (stats.size > MAX_FILE_BYTES) {
    throw new FileTooLargeError(requestedPath, `${stats.size.toString()} bytes exceeds ${MAX_FILE_BYTES.toString()}`)
  }

  const content = await readLimitedBuffer(absolutePath, stats.size)

  if (content === undefined) {
    throw new FileNotFoundError(requestedPath, "does not exist")
  }

  if (content.includes(0)) {
    throw new BinaryFileError(requestedPath)
  }

  return content.toString("utf8")
}

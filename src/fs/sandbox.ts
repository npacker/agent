/**
 * Sandbox-aware path resolution: turn a caller-supplied (possibly relative) path into an
 * absolute path that is guaranteed to live inside the configured sandbox root, with symlinks
 * resolved. Throws `PathEscapeError` on any escape attempt and `FileNotFoundError` when the
 * target does not exist.
 *
 * Used by every internal filesystem tool so the host LLM has no way to widen the sub-agent's
 * filesystem scope beyond what LM Studio's per-prediction working directory grants.
 */

import { realpath } from "node:fs/promises"
import path from "node:path"

import { FileNotFoundError, PathEscapeError } from "../errors/fs-error"
import { errorCode } from "../errors/inspect-error"

/**
 * Resolve a caller-supplied path against the sandbox root and verify the real path is inside.
 *
 * The check is two-phase: first `path.resolve(root, userPath)` to obtain the literal absolute
 * path, then `realpath` to follow any symlinks before a string-prefix check against
 * `root + sep` (or equality with the root itself). The trailing separator matters so
 * `/foo/barEvil` cannot pass as a child of `/foo/bar`.
 *
 * Read-only callers always pass an existing target; a missing target is reported as
 * `FileNotFoundError` so the underlying ENOENT does not leak through as an unexpected error.
 *
 * @param root - Absolute sandbox root path. Must already exist on disk.
 * @param userPath - Caller-supplied path, treated as relative to `root` when not absolute.
 * @returns The absolute, symlink-resolved path. Always inside `root`.
 * @throws PathEscapeError When the symlink-resolved path is outside `root`.
 * @throws FileNotFoundError When the resolved candidate does not exist on disk.
 */
export async function resolveSandboxedPath(root: string, userPath: string): Promise<string> {
  const resolvedRoot = await realpath(root)
  const candidate = path.resolve(resolvedRoot, userPath)
  const resolvedCandidate = await realpathOrNotFound(candidate, userPath)
  const rootWithSeparator = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  const insideRoot = resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootWithSeparator)

  if (!insideRoot) {
    throw new PathEscapeError(userPath)
  }

  return resolvedCandidate
}

/**
 * Realpath a candidate, converting an ENOENT failure into a user-facing `FileNotFoundError`.
 *
 * @param candidate - Absolute candidate path produced by `path.resolve`.
 * @param requestedPath - Original caller-supplied path, used for the error message.
 * @returns The symlink-resolved absolute path.
 * @throws FileNotFoundError When the candidate does not exist.
 */
async function realpathOrNotFound(candidate: string, requestedPath: string): Promise<string> {
  try {
    return await realpath(candidate)
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new FileNotFoundError(requestedPath, "does not exist")
    }

    throw error
  }
}

/**
 * Errors raised by the internal filesystem tools (list_files, read_file, grep) and the
 * shared helpers under `src/fs/` they delegate to.
 */

import { UserFacingError } from "./user-facing-error"

/**
 * Raised when a caller-supplied path resolves outside the sandbox root.
 *
 * The sandbox root is the per-prediction working directory returned by
 * `ctl.getWorkingDirectory()`; the host LLM has no way to widen it via tool arguments.
 */
export class PathEscapeError extends UserFacingError {
  /** Path the caller supplied, exactly as received. */
  public readonly requestedPath: string

  /**
   * Construct a PathEscapeError describing the escape attempt.
   *
   * @param requestedPath - Path the caller supplied that resolved outside the sandbox.
   */
  public constructor(requestedPath: string) {
    super(
      `Path "${requestedPath}" resolves outside the allowed working directory. Only paths inside the LM Studio working directory are readable.`
    )
    this.name = "PathEscapeError"
    this.requestedPath = requestedPath
  }
}

/**
 * Raised when a caller-supplied path does not refer to an existing entry on disk, or when the
 * expected kind (file vs directory) does not match what was found.
 */
export class FileNotFoundError extends UserFacingError {
  /** Path the caller supplied, exactly as received. */
  public readonly requestedPath: string

  /**
   * Construct a FileNotFoundError naming the missing entry.
   *
   * @param requestedPath - Path the caller supplied that did not resolve to the expected entry.
   * @param detail - Additional context appended after the path (e.g. "is a directory, not a file").
   */
  public constructor(requestedPath: string, detail: string) {
    super(`Path "${requestedPath}" ${detail}.`)
    this.name = "FileNotFoundError"
    this.requestedPath = requestedPath
  }
}

/**
 * Raised when a file exceeds the configured byte cap and cannot be safely returned.
 *
 * Caps are deliberately blunt: too-large reads blow the host LLM's context window.
 */
export class FileTooLargeError extends UserFacingError {
  /** Path the caller supplied, exactly as received. */
  public readonly requestedPath: string

  /**
   * Construct a FileTooLargeError describing the cap that was exceeded.
   *
   * @param requestedPath - Path the caller supplied that exceeded the cap.
   * @param detail - Human-readable description of which cap fired and the observed size.
   */
  public constructor(requestedPath: string, detail: string) {
    super(`File "${requestedPath}" exceeds the size cap: ${detail}.`)
    this.name = "FileTooLargeError"
    this.requestedPath = requestedPath
  }
}

/**
 * Raised when a caller-supplied regex pattern fails to compile.
 *
 * Distinct from a generic `SyntaxError` so the tool error formatter treats it as a user-facing
 * error (no operator warning) rather than an unexpected failure.
 */
export class InvalidRegexError extends UserFacingError {
  /** Pattern the caller supplied, exactly as received. */
  public readonly pattern: string

  /**
   * Construct an InvalidRegexError describing why compilation failed.
   *
   * @param pattern - Pattern the caller supplied that failed to compile.
   * @param detail - Underlying compiler error message.
   * @param cause - The original error thrown by `new RegExp(...)`.
   */
  public constructor(pattern: string, detail: string, cause?: unknown) {
    super(`Invalid regex pattern "${pattern}": ${detail}.`, cause === undefined ? undefined : { cause })
    this.name = "InvalidRegexError"
    this.pattern = pattern
  }
}

/**
 * Raised when a caller-supplied path looks like a binary file: its content contains NUL bytes.
 * Returning binary bytes as a tool result would corrupt the host LLM's transcript, so the read
 * is refused.
 */
export class BinaryFileError extends UserFacingError {
  /** Path the caller supplied, exactly as received. */
  public readonly requestedPath: string

  /**
   * Construct a BinaryFileError naming the offending file.
   *
   * @param requestedPath - Path the caller supplied that was detected as binary.
   */
  public constructor(requestedPath: string) {
    super(`File "${requestedPath}" appears to be binary (contains NUL bytes). Binary files cannot be returned as text.`)
    this.name = "BinaryFileError"
    this.requestedPath = requestedPath
  }
}

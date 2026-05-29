/**
 * Generic helpers for interpreting thrown values: detecting cancellation and rendering an
 * arbitrary error into a human-readable string. Lives outside `tool-error.ts` so the latter
 * stays narrowly scoped to user-facing tool-error formatting.
 */

/**
 * Determine whether a thrown value represents an abort signal firing. Matches both the
 * `DOMException` form thrown by `AbortSignal` and any other library that throws an `Error`
 * whose `name` is `"AbortError"`.
 *
 * @param error - Thrown value to inspect.
 * @returns `true` when the value carries the conventional abort marker.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

/**
 * Extract Node's string error `code` (e.g. `"ENOENT"`, `"EACCES"`) from a thrown value, without
 * an unsafe cast. Shared by the filesystem helpers that branch on specific errno codes.
 *
 * @param error - Thrown value to inspect.
 * @returns The `code` string when the value is an `Error` carrying a string `code`, otherwise
 * `undefined`.
 */
export function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code
  }

  return undefined
}

/**
 * Extract a human-readable message from an arbitrary thrown value.
 *
 * @param error - Thrown value to stringify.
 * @returns The error message when the value is an `Error`, otherwise the stringified value.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

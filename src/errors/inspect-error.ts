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

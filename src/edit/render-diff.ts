/**
 * Unified-diff rendering for the edit tools. The `diff` package renders patches directly from the
 * in-memory snapshots the scratch repo keeps. A single import site keeps the dependency contained
 * to one module.
 */

import { createTwoFilesPatch } from "diff"

/** Number of unchanged context lines to include around each hunk in a rendered patch. */
const DIFF_CONTEXT_LINES = 3

/**
 * Render a unified diff between two versions of the same file.
 *
 * @param displayPath - Path shown in the patch's `---`/`+++` headers (the host-supplied path).
 * @param before - Earlier file content, LF-normalized.
 * @param after - Later file content, LF-normalized.
 * @returns A unified-diff patch string.
 */
export function renderUnifiedDiff(displayPath: string, before: string, after: string): string {
  return createTwoFilesPatch(displayPath, displayPath, before, after, undefined, undefined, {
    context: DIFF_CONTEXT_LINES,
  })
}

/**
 * Pure literal find-and-replace primitive for the `edit_file` tool. Operates on LF-normalized
 * text and uses substring (not regex) matching so source containing regex metacharacters or `$`
 * replacement patterns is handled verbatim.
 */

import { AmbiguousEditError, EditNotFoundError } from "../errors/edit-error"

import { toLf } from "./line-endings"

/**
 * Outcome of a successful find-and-replace.
 */
export interface FindReplaceResult {
  /** The substituted text, LF-normalized. */
  result: string
  /** Number of occurrences replaced. */
  replacements: number
}

/**
 * Count non-overlapping occurrences of a needle within a haystack.
 *
 * @param haystack - Text to search.
 * @param needle - Substring to count. An empty needle yields zero.
 * @returns The number of occurrences.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") {
    return 0
  }

  return haystack.split(needle).length - 1
}

/**
 * Apply a literal find-and-replace to LF-normalized text. The `find` and `replace` strings are
 * normalized to LF first so matching is line-ending agnostic.
 *
 * @param content - Current file content, LF-normalized.
 * @param find - Exact text to locate.
 * @param replace - Replacement text.
 * @param replaceAll - When true, replace every occurrence; otherwise require exactly one match.
 * @returns The substituted text and the number of replacements made.
 * @throws EditNotFoundError When `find` does not occur in `content`.
 * @throws AmbiguousEditError When `find` occurs more than once and `replaceAll` is false.
 */
export function applyFindReplace(
  content: string,
  find: string,
  replace: string,
  replaceAll: boolean
): FindReplaceResult {
  const normalizedFind = toLf(find)
  const normalizedReplace = toLf(replace)
  const occurrences = countOccurrences(content, normalizedFind)

  if (occurrences === 0) {
    throw new EditNotFoundError(find)
  }

  if (occurrences > 1 && !replaceAll) {
    throw new AmbiguousEditError(find, occurrences)
  }

  return { result: content.split(normalizedFind).join(normalizedReplace), replacements: occurrences }
}

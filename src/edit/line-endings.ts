/**
 * Line-ending helpers for the edit pipeline. Editing happens on LF-normalized text so a `find`
 * string the model emits with `\n` still matches a file stored with `\r\n`; the original style is
 * re-applied on write-back so editing never silently rewrites a file's line endings.
 */

/** A line-ending style: Windows CRLF or Unix LF. */
export type LineEnding = "\r\n" | "\n"

/** Carriage-return + line-feed pair, the Windows line-ending style. */
const CRLF = "\r\n"

/** Line-feed, the Unix line-ending style. */
const LF = "\n"

/**
 * Detect the dominant line-ending style of a block of text. Any CRLF present is treated as a CRLF
 * file; otherwise the file is treated as LF. Mixed-ending files therefore normalize to CRLF.
 *
 * @param text - Raw file content to inspect.
 * @returns The detected line-ending style.
 */
export function detectEol(text: string): LineEnding {
  return text.includes(CRLF) ? CRLF : LF
}

/**
 * Normalize all CRLF sequences in a block of text to LF.
 *
 * @param text - Text whose line endings should be normalized.
 * @returns The text with every CRLF replaced by a single LF.
 */
export function toLf(text: string): string {
  return text.replaceAll(CRLF, LF)
}

/**
 * Re-encode LF-normalized text to the supplied line-ending style. The input is normalized to LF
 * first so the conversion is idempotent regardless of the input's current endings.
 *
 * @param text - Text to re-encode.
 * @param eol - Target line-ending style.
 * @returns The text with every line break expressed in the target style.
 */
export function toEol(text: string, eol: LineEnding): string {
  const normalized = toLf(text)

  if (eol === LF) {
    return normalized
  }

  return normalized.replaceAll(LF, CRLF)
}

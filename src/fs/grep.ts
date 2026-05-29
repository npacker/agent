/**
 * Recursive content search backing the internal `grep` tool.
 *
 * Walks the tree pruning dotfile entries, scans each file under a per-file byte cap, refuses
 * binary files (any NUL byte in the read content), and returns a structured `GrepResult` with
 * the matches and the file/match counts.
 */

import { readdir } from "node:fs/promises"
import path from "node:path"

import pLimit from "p-limit"

import { readLimitedBuffer } from "./read-bytes"

/** Maximum match records returned before further matches are counted-only. */
const MAX_RESULTS = 200

/** Per-file byte cap; files larger than this are scanned partially. */
const MAX_FILE_BYTES = 1024 * 1024 * 10

/** Maximum characters retained from a single matched line before truncation. */
const MAX_LINE_LENGTH = 2000

/** Maximum concurrent file reads across one grep call. */
const MAX_READS = 32

/**
 * Inputs to `grep`. The pattern is pre-compiled by the tool layer so an invalid caller-supplied
 * regex fails at argument validation time rather than during the walk.
 */
export interface GrepOptions {
  /** Pre-compiled regex applied per line. */
  pattern: RegExp
  /** Optional abort signal; checked before each directory read. */
  signal?: AbortSignal
}

/** One match line in a `GrepResult`. */
export interface GrepMatch {
  /** Posix-style path relative to the search root. */
  path: string
  /** 1-based line number within the file. */
  lineNumber: number
  /** The matched line, truncated to `MAX_LINE_CHARS` if longer. */
  line: string
}

/** Structured result of a `grep` call. */
export interface GrepResult {
  /** Match records, capped at `MAX_RESULTS`. Excess matches are counted in `matchCount`. */
  matches: GrepMatch[]
  /** Number of regular files actually scanned. */
  filesSearched: number
  /** Total matching lines found, even when `matches.length` is capped at `MAX_RESULTS`. */
  matchCount: number
}

/**
 * Walk `root`, scanning every non-dotfile under it for lines matching `options.pattern`.
 *
 * @param root - Absolute path to the search root. Caller is responsible for sandbox resolution.
 * @param options - Compiled pattern and optional abort signal.
 * @returns Structured result with matches and counts.
 */
export async function grep(root: string, { pattern, signal }: GrepOptions): Promise<GrepResult> {
  const result: GrepResult = { matches: [], filesSearched: 0, matchCount: 0 }
  const limit = pLimit(MAX_READS)

  /**
   * Recurse into subdirectories in parallel; scan each file through `limit` to bound concurrent fds.
   *
   * @param directory - Absolute path of the directory to walk.
   */
  const search = async (directory: string): Promise<void> => {
    signal?.throwIfAborted()

    const entries = await readdir(directory, { withFileTypes: true })
    const visible = entries.filter(entry => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isFile()))

    await Promise.all(
      visible.map(async entry => {
        const absolutePath = path.join(directory, entry.name)

        if (entry.isDirectory()) return search(absolutePath)

        const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/")

        return limit(async () => {
          const content = await readLimitedBuffer(absolutePath, MAX_FILE_BYTES)

          if (content === undefined || content.length === 0 || content.includes(0)) return

          result.filesSearched++

          const lines = content.toString("utf8").split(/\r?\n/)

          for (const [index, line] of lines.entries()) {
            if (!pattern.test(line)) continue

            result.matchCount++

            if (result.matches.length >= MAX_RESULTS) continue

            const display = line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}… (truncated)` : line

            result.matches.push({ path: relativePath, lineNumber: index + 1, line: display })
          }
        })
      })
    )
  }

  await search(root)

  return result
}

/**
 * Directory listing backing the internal `list_files` tool.
 *
 * Walks via `fs.readdir`; subdirectories are read in parallel and symbolic links are never
 * traversed. Returns a structured `ListResult` with posix-style paths (directories carry a
 * trailing `/`) and the full count before `MAX_ENTRIES` truncation.
 */

import { readdir } from "node:fs/promises"
import path from "node:path"

/** Maximum number of entries returned. Listings that exceed this are truncated. */
const MAX_ENTRIES = 1000

/**
 * Caller-supplied flags for `listDirectory`.
 */
export interface ListDirectoryOptions {
  /** When `true`, walk subdirectories recursively. */
  recursive: boolean
  /** When `true`, include entries whose name starts with `.`. */
  includeHidden: boolean
  /** Optional abort signal; checked before each directory read. */
  signal?: AbortSignal
}

/** Structured result of a `listDirectory` call. */
export interface ListResult {
  /** Posix-style paths relative to the walk root; directories end with `/`. Capped at `MAX_ENTRIES`. */
  entries: string[]
  /** Full count before `MAX_ENTRIES` truncation. `entries.length === total` when no truncation. */
  total: number
}

/**
 * Walk `root` and return a structured listing of its entries.
 *
 * @param root - Absolute path to the directory. Caller is responsible for sandbox resolution.
 * @param options - Listing flags; see `ListDirectoryOptions`.
 * @returns Structured result with the visible entries and the pre-truncation total.
 */
export async function listDirectory(root: string, options: ListDirectoryOptions): Promise<ListResult> {
  const collected: string[] = []

  /**
   * Walk one directory, recursing into subdirectories in parallel.
   *
   * @param directory - Absolute path of the directory to walk.
   */
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted()

    const entries = await readdir(directory, { withFileTypes: true })
    const visible = entries.filter(entry => options.includeHidden || !entry.name.startsWith("."))

    await Promise.all(
      visible.map(async entry => {
        const absolutePath = path.join(directory, entry.name)
        const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/")
        const isDirectoryEntry = entry.isDirectory()

        collected.push(isDirectoryEntry ? `${relativePath}/` : relativePath)

        if (options.recursive && isDirectoryEntry) await walk(absolutePath)
      })
    )
  }

  await walk(root)

  options.signal?.throwIfAborted()

  collected.sort((a, b) => a.localeCompare(b))

  return {
    entries: collected.slice(0, MAX_ENTRIES),
    total: collected.length,
  }
}

/**
 * Per-call in-memory snapshot store backing a single-file edit run. On creation it validates the
 * caller's path against the sandbox root and reads the file (LF-normalized) as the original
 * snapshot. Each edit and rollback appends a new snapshot to an in-memory array; that array powers
 * diff rendering, the diff log, and rollback. Nothing touches disk until the final write-back in
 * `run-edit-agent.ts`.
 */

import { RollbackRangeError } from "../errors/edit-error"
import { readFile, resolveSandboxedPath } from "../fs"

import { applyFindReplace } from "./find-replace"
import { detectEol, toEol, toLf, type LineEnding } from "./line-endings"
import { renderUnifiedDiff } from "./render-diff"

/**
 * In-memory snapshot store for a single file under edit. Construct via `ScratchRepo.create`.
 */
export class ScratchRepo {
  /** Caller-supplied path, used only for diff `---`/`+++` headers so the host sees a familiar name. */
  private readonly displayPath: string
  /** Line-ending style of the original file, re-applied by `finalContent` on write-back. */
  private readonly eol: LineEnding
  /** LF-normalized content snapshots; index 0 is the original, one entry per recorded edit. */
  private readonly snapshots: string[]

  /**
   * Store prepared snapshot state. Use `ScratchRepo.create` rather than constructing directly.
   *
   * @param displayPath - Caller-supplied path used in diff headers.
   * @param eol - Line-ending style of the original file.
   * @param original - LF-normalized original content, seeded as snapshot 0.
   */
  private constructor(displayPath: string, eol: LineEnding, original: string) {
    this.displayPath = displayPath
    this.eol = eol
    this.snapshots = [original]
  }

  /**
   * Validate the target path and read the file as the original snapshot.
   *
   * @param root - Sandbox root (the LM Studio working directory).
   * @param requestedPath - Caller-supplied path to the file to edit, relative to `root`.
   * @param signal - Abort signal checked before the original file is read.
   * @returns A ready-to-use snapshot store seeded with the original file.
   */
  public static async create(root: string, requestedPath: string, signal: AbortSignal): Promise<ScratchRepo> {
    const absolutePath = await resolveSandboxedPath(root, requestedPath)
    const original = await readFile(absolutePath, requestedPath, signal)

    return new ScratchRepo(requestedPath, detectEol(original), toLf(original))
  }

  /**
   * Apply a find-and-replace to the current content and record the result as a new snapshot.
   *
   * @param find - Exact text to locate in the current content.
   * @param replace - Replacement text.
   * @param replaceAll - When true, replace every occurrence; otherwise require exactly one match.
   * @returns The number of replacements made.
   */
  public applyEdit(find: string, replace: string, replaceAll: boolean): number {
    const { result, replacements } = applyFindReplace(this.latestContent, find, replace, replaceAll)

    this.snapshots.push(result)

    return replacements
  }

  /**
   * Restore the content of an earlier snapshot as a new snapshot, preserving history.
   *
   * @param to - Snapshot index to restore (0 is the original). Defaults to undoing the last edit.
   * @returns The snapshot index that was restored.
   * @throws RollbackRangeError When no edits exist yet or `to` is outside the valid range.
   */
  public rollback(to?: number): number {
    const maxTarget = this.snapshots.length - 2

    if (maxTarget < 0) {
      throw new RollbackRangeError(to ?? 0, maxTarget)
    }

    const target = to ?? maxTarget

    if (target < 0 || target > maxTarget) {
      throw new RollbackRangeError(target, maxTarget)
    }

    this.snapshots.push(this.snapshots[target])

    return target
  }

  /**
   * Read the current (latest) content of the file under edit.
   *
   * @returns The current LF-normalized content.
   */
  public readCurrent(): string {
    return this.latestContent
  }

  /**
   * Render the cumulative unified diff from the original to the current content.
   *
   * @returns The unified diff, or an empty string when the content matches the original.
   */
  public renderDiff(): string {
    if (!this.hasEdits()) {
      return ""
    }

    return renderUnifiedDiff(this.displayPath, this.snapshots[0], this.latestContent)
  }

  /**
   * Render the per-step unified diffs, one for each recorded snapshot transition in order.
   *
   * @returns The ordered list of per-edit diffs (empty when no edits have been made).
   */
  public diffLog(): string[] {
    const steps: string[] = []

    for (let index = 1; index < this.snapshots.length; index++) {
      steps.push(renderUnifiedDiff(this.displayPath, this.snapshots[index - 1], this.snapshots[index]))
    }

    return steps
  }

  /**
   * Report whether the current content differs from the original.
   *
   * @returns True when the file has net changes to write back.
   */
  public hasEdits(): boolean {
    return this.latestContent !== this.snapshots[0]
  }

  /**
   * Produce the final content re-encoded to the original file's line-ending style.
   *
   * @returns The current content with the original line endings applied.
   */
  public finalContent(): string {
    return toEol(this.latestContent, this.eol)
  }

  /**
   * The latest snapshot — the current content reflecting every edit applied so far.
   *
   * @returns The most recent snapshot, or the original when no edits have been recorded.
   */
  private get latestContent(): string {
    return this.snapshots.at(-1) ?? this.snapshots[0]
  }
}

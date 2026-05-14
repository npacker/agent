/**
 * Cross-plugin tool sourcing: opens configured plugins' tool sessions and exposes their tools
 * as a single filtered `Tool[]` plus per-call warnings the caller can surface to the host UI.
 *
 * The underlying `client.plugins.pluginTools()` API is marked `[EXP-USE-USE-PLUGIN-TOOLS]`
 * upstream; the single call site lives here so a future SDK rename only touches this file.
 */

import type { LMStudioClient, Tool } from "@lmstudio/sdk"

/**
 * Open tool session as exposed by the SDK. Inferred from `client.plugins.pluginTools()` rather
 * than imported so we track the SDK's type exactly without naming an unexported type.
 */
type ToolSession = Awaited<ReturnType<LMStudioClient["plugins"]["pluginTools"]>>

/**
 * Result of `ToolBridge.listTools`: the resolved tool list plus any per-call warnings the caller
 * should forward to the host (unknown allowed entries, etc.). Empty `warnings` is the normal case.
 */
export interface ListToolsResult {
  /** Tools to pass to `model.act`. */
  tools: Tool[]
  /** Human-readable warnings to forward through the tool-call context's `warn` channel. */
  warnings: string[]
}

/**
 * Open cross-plugin tool sessions and expose their tools as a single filtered list.
 */
export class ToolBridge {
  /** Open sessions, in configuration order. Retained so `dispose` can release each one. */
  private readonly sessions: ToolSession[]
  /** Deduplicated tools keyed by name, first-source-wins. Built at `open` time. */
  private readonly toolsByName: Map<string, Tool>

  /**
   * Private — call `ToolBridge.open()` instead so sessions are opened consistently.
   *
   * @param sessions - Sessions opened against configured source plugins.
   * @param toolsByName - Pre-built dedupe map of tools keyed by name.
   */
  private constructor(sessions: ToolSession[], toolsByName: Map<string, Tool>) {
    this.sessions = sessions
    this.toolsByName = toolsByName
  }

  /**
   * Open sessions against every configured source plugin and wrap them in a ToolBridge.
   *
   * Sessions are opened in parallel; sources that fail to open are skipped with a console
   * warning so a single broken identifier does not block plugin startup. Tool-name collisions
   * across sessions are resolved first-source-wins and surfaced through `console.warn`.
   *
   * @param client - LM Studio client used to open `pluginTools` sessions.
   * @param sources - Plugin identifiers (`"owner/name"`) whose tools should be exposed.
   * @returns A bridge holding one session per successfully opened source.
   */
  public static async open(client: LMStudioClient, sources: string[]): Promise<ToolBridge> {
    if (sources.length === 0) {
      return new ToolBridge([], new Map())
    }

    const results = await Promise.allSettled(sources.map(async source => client.plugins.pluginTools(source)))
    const sessions: ToolSession[] = []

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        sessions.push(result.value)
      } else {
        warnSourceFailure(sources[index], result.reason)
      }
    }

    const toolsByName = buildToolMap(sessions)

    return new ToolBridge(sessions, toolsByName)
  }

  /**
   * Resolve the caller's allowlist against the deduplicated tool map.
   *
   * @param allowed - Exact tool names to keep. Empty array returns all tools.
   * @returns The filtered tool list plus per-call warnings for unknown names.
   */
  public listTools(allowed: string[]): ListToolsResult {
    if (allowed.length === 0) {
      return { tools: [...this.toolsByName.values()], warnings: [] }
    }

    const tools: Tool[] = []
    const warnings: string[] = []

    for (const name of allowed) {
      const match = this.toolsByName.get(name)

      if (match === undefined) {
        warnings.push(`Unknown tool name "${name}" — not exposed by any configured source plugin.`)
        continue
      }

      tools.push(match)
    }

    return { tools, warnings }
  }

  /**
   * Dispose every open session so plugin connections are released cleanly. Each disposal is
   * isolated in a try/catch so one failing session cannot leak the rest. Safe to call more than
   * once; subsequent calls are no-ops because disposed sessions are removed from the list.
   */
  public dispose(): void {
    while (this.sessions.length > 0) {
      const session = this.sessions.pop()

      if (session === undefined) {
        continue
      }

      try {
        session[Symbol.dispose]()
      } catch (error) {
        warnDisposeFailure(error)
      }
    }
  }
}

/**
 * Build a deduplicated `name → Tool` map from open sessions, warning on cross-session collisions.
 * First session wins for any given tool name.
 *
 * @param sessions - Open sessions whose tools should be flattened.
 * @returns The deduplicated map.
 */
function buildToolMap(sessions: ToolSession[]): Map<string, Tool> {
  const byName = new Map<string, Tool>()

  for (const session of sessions) {
    for (const remoteTool of session.tools) {
      if (byName.has(remoteTool.name)) {
        warnDuplicateTool(remoteTool.name)
        continue
      }

      byName.set(remoteTool.name, remoteTool)
    }
  }

  return byName
}

/**
 * Surface a per-source open failure without aborting plugin startup.
 *
 * @param source - Plugin identifier that failed to open.
 * @param reason - Rejection value returned by `pluginTools`.
 */
function warnSourceFailure(source: string, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : JSON.stringify(reason)

  // eslint-disable-next-line no-console -- startup-only diagnostic; no plugin-context logger available yet.
  console.warn(`[agent-plugin] Failed to open tool source "${source}": ${message}`)
}

/**
 * Surface a cross-plugin tool name collision. First session wins; the loser is skipped.
 *
 * @param toolName - The colliding tool name.
 */
function warnDuplicateTool(toolName: string): void {
  // eslint-disable-next-line no-console -- registration-time diagnostic; no plugin-context logger available yet.
  console.warn(`[agent-plugin] Duplicate tool name "${toolName}" across source plugins; keeping the first occurrence.`)
}

/**
 * Surface a per-session dispose failure so the remaining sessions can still be released.
 *
 * @param error - Thrown value from `session[Symbol.dispose]()`.
 */
function warnDisposeFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : JSON.stringify(error)

  // eslint-disable-next-line no-console -- shutdown-only diagnostic; no plugin-context logger available yet.
  console.warn(`[agent-plugin] Failed to dispose a tool session: ${message}`)
}

/**
 * Cross-plugin tool sourcing: opens configured plugins' tool sessions and exposes their tools
 * as a single filtered `Tool[]`. Failures encountered while opening sessions are collected on
 * the bridge so the calling tool can forward them to the operator through the tool-call
 * context's `warn` channel — the LM Studio log stream is not always visible to the operator.
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
 * Result of `ToolBridge.listTools`: the resolved tool list and any operator-supplied allowlist
 * entries that failed to match a known tool. Empty `unknownNames` is the normal case.
 */
export interface ListToolsResult {
  /** Tools to pass to `model.act`. */
  tools: Tool[]
  /** Allowlist entries that did not match any known tool, in operator-supplied order. */
  unknownNames: string[]
}

/**
 * Open cross-plugin tool sessions and expose their tools as a single filtered list.
 */
export class ToolBridge {
  /** Open sessions, in configuration order. Retained so `dispose` can release each one. */
  private readonly sessions: ToolSession[]
  /** Deduplicated tools keyed by name, first-source-wins. Built at `open` time. */
  private readonly toolsByName: Map<string, Tool>
  /** Source-open failure and duplicate-tool messages collected at `open` time. */
  private readonly openWarningMessages: readonly string[]

  /**
   * Private — call `ToolBridge.open()` instead so sessions are opened consistently.
   *
   * @param sessions - Sessions opened against configured source plugins.
   * @param toolsByName - Pre-built dedupe map of tools keyed by name.
   * @param openWarnings - Human-readable warnings collected while opening sessions.
   */
  private constructor(sessions: ToolSession[], toolsByName: Map<string, Tool>, openWarnings: readonly string[]) {
    this.sessions = sessions
    this.toolsByName = toolsByName
    this.openWarningMessages = openWarnings
  }

  /**
   * Warnings collected while opening sessions (source-plugin open failures, duplicate names).
   *
   * Surfaced through the tool-call context's `warn` channel so operators see them in the same
   * place as runtime warnings, not only in the LM Studio log stream.
   *
   * @returns The collected open-time warning messages, in collection order.
   */
  public get openWarnings(): readonly string[] {
    return this.openWarningMessages
  }

  /**
   * Open sessions against every configured source plugin and wrap them in a ToolBridge.
   *
   * Sessions are opened in parallel; sources that fail to open are recorded as open warnings
   * so a single broken identifier does not block plugin startup. Tool-name collisions across
   * sessions are resolved first-source-wins and also surfaced as open warnings.
   *
   * @param client - LM Studio client used to open `pluginTools` sessions.
   * @param sources - Plugin identifiers (`"owner/name"`) whose tools should be exposed.
   * @returns A bridge holding one session per successfully opened source.
   */
  public static async open(client: LMStudioClient, sources: string[]): Promise<ToolBridge> {
    if (sources.length === 0) {
      logDiscoveredTools([], [])

      return new ToolBridge([], new Map(), [])
    }

    const results = await Promise.allSettled(sources.map(async source => client.plugins.pluginTools(source)))
    const sessions: ToolSession[] = []
    const openWarnings: string[] = []

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        sessions.push(result.value)
      } else {
        openWarnings.push(formatSourceFailure(sources[index], result.reason))
      }
    }

    const toolsByName = buildToolMap(sessions, openWarnings)

    logDiscoveredTools(sources, [...toolsByName.keys()])

    return new ToolBridge(sessions, toolsByName, openWarnings)
  }

  /**
   * Resolve the caller's allowlist against the deduplicated tool map.
   *
   * Entries are trimmed before lookup so accidental whitespace in the plugin UI does not cause
   * silent mismatches. The original entry (untrimmed) is preserved in `unknownNames` so the
   * operator sees exactly what they typed.
   *
   * @param allowed - Exact tool names to keep. Empty array returns all tools.
   * @returns The filtered tool list plus any entries that failed to match.
   */
  public listTools(allowed: string[]): ListToolsResult {
    if (allowed.length === 0) {
      return { tools: [...this.toolsByName.values()], unknownNames: [] }
    }

    const tools: Tool[] = []
    const unknownNames: string[] = []

    for (const entry of allowed) {
      const match = this.toolsByName.get(entry.trim())

      if (match === undefined) {
        unknownNames.push(entry)
        continue
      }

      tools.push(match)
    }

    return { tools, unknownNames }
  }

  /**
   * Names of every tool exposed by the bridge's open sessions, after dedupe.
   *
   * Useful for surfacing actionable guidance when an operator's allowlist fails to match.
   *
   * @returns The available tool names in the order the bridge discovered them.
   */
  public availableNames(): string[] {
    return [...this.toolsByName.keys()]
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
 * Build a deduplicated `name → Tool` map from open sessions, recording cross-session collisions
 * as open warnings. First session wins for any given tool name.
 *
 * @param sessions - Open sessions whose tools should be flattened.
 * @param openWarnings - Warning accumulator to append duplicate-tool messages to.
 * @returns The deduplicated map.
 */
function buildToolMap(sessions: ToolSession[], openWarnings: string[]): Map<string, Tool> {
  const byName = new Map<string, Tool>()

  for (const session of sessions) {
    for (const remoteTool of session.tools) {
      if (byName.has(remoteTool.name)) {
        openWarnings.push(
          `Duplicate tool name "${remoteTool.name}" across source plugins; keeping the first occurrence.`
        )
        continue
      }

      byName.set(remoteTool.name, remoteTool)
    }
  }

  return byName
}

/**
 * Build a per-source open-failure message for the open-warning accumulator.
 *
 * LM Studio's host runtime gates `pluginTools()` behind a `plugins.use` permission that is not
 * declarable in `manifest.json` and is granted out-of-band (typically through a permission
 * prompt or the Plugins UI). When the rejection looks like that gate firing, return a tailored
 * remediation message instead of the raw stack trace so operators know exactly what to do.
 *
 * @param source - Plugin identifier that failed to open.
 * @param reason - Rejection value returned by `pluginTools`.
 * @returns A human-readable message describing the failure.
 */
function formatSourceFailure(source: string, reason: unknown): string {
  const message = reason instanceof Error ? reason.message : JSON.stringify(reason)

  if (isPluginsUsePermissionDenied(message, source)) {
    return `Permission denied opening tool source "${source}": this plugin (npacker/agent) needs LM Studio's "plugins.use" permission for "${source}" before it can call its tools. Grant it from LM Studio's plugin permission prompt or via the Plugins settings panel, then reload the agent plugin. Until granted, the sub-agent will run without "${source}" tools.`
  }

  return `Failed to open tool source "${source}": ${message}. Its tools will not be available to the sub-agent.`
}

/**
 * Detect the LM Studio host-side `plugins.use` permission denial. The host emits a message of
 * the form `Permission denied. … [{"type":"plugins.use","pluginIdentifier":"<source>"}]`; this
 * matches on the stable substrings rather than parsing the embedded JSON.
 *
 * @param message - Error message extracted from the `pluginTools()` rejection.
 * @param source - Plugin identifier the bridge was attempting to open.
 * @returns `true` when the message looks like a `plugins.use` denial for this source.
 */
function isPluginsUsePermissionDenied(message: string, source: string): boolean {
  return message.includes("Permission denied") && message.includes("plugins.use") && message.includes(source)
}

/**
 * Log the tools discovered across all opened sources to the LM Studio log stream. Operators can
 * read these via `lms log stream` to copy exact tool names into the Allowed Tools plugin field
 * without guessing.
 *
 * @param sources - Source plugin identifiers attempted.
 * @param toolNames - Tool names successfully exposed after open and dedupe.
 */
function logDiscoveredTools(sources: readonly string[], toolNames: readonly string[]): void {
  const sourcesLine = sources.length === 0 ? "(none configured)" : sources.join(", ")
  const namesLine = toolNames.length === 0 ? "(none)" : toolNames.join(", ")

  // eslint-disable-next-line no-console -- startup-only discovery aid; the only operator-visible log channel here.
  console.warn(`[agent-plugin] Tool sources opened: ${sourcesLine}. Available tool names: ${namesLine}.`)
}

/**
 * Surface a per-session dispose failure so the remaining sessions can still be released.
 *
 * @param error - Thrown value from `session[Symbol.dispose]()`.
 */
function warnDisposeFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : JSON.stringify(error)

  // eslint-disable-next-line no-console -- shutdown-only diagnostic; no plugin-context logger available at this point.
  console.warn(`[agent-plugin] Failed to dispose a tool session: ${message}`)
}

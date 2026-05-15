/**
 * Configuration resolution utilities.
 */

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"
import { configSchematics } from "./config-schematics"

import type { ToolsProviderController } from "@lmstudio/sdk"

/**
 * Conversion factor from seconds to milliseconds.
 */
const MS_PER_SECOND = 1000

/**
 * Fully resolved configuration used by a single agent run.
 */
export interface ResolvedConfig {
  /** Model key of the LLM to run as the sub-agent. `undefined` selects any loaded model. */
  modelKey: string | undefined
  /** Upper bound on the number of `.act` prediction rounds the run may take. */
  maxRounds: number
  /** Plugin identifiers whose tools the sub-agent may call. Empty disables cross-plugin tools. */
  toolSources: string[]
  /** Exact tool names the sub-agent may call. Empty allows all tools from configured sources. */
  allowedTools: string[]
  /** Sampling temperature applied to the agent's predictions. */
  temperature: number
  /** Wall-clock cap on the agent run, in milliseconds. Always positive. */
  timeout: number
}

/**
 * Resolves configuration from plugin settings.
 *
 * @param ctl - Tools provider controller exposing plugin configuration.
 * @returns The fully resolved configuration used to drive an agent run.
 */
export function resolveConfig(ctl: ToolsProviderController): ResolvedConfig {
  const pluginConfig = ctl.getPluginConfig(configSchematics)

  return {
    modelKey: resolveModelKey(pluginConfig.get("modelKey")),
    maxRounds: pluginConfig.get("maxRounds"),
    toolSources: pluginConfig.get("toolSources"),
    allowedTools: pluginConfig.get("allowedTools"),
    temperature: pluginConfig.get("temperature"),
    timeout: pluginConfig.get("timeoutSeconds") * MS_PER_SECOND,
  }
}

/**
 * Resolve a configured model key, treating the auto sentinel and empty strings as unset.
 *
 * @param pluginValue - Value read from plugin configuration.
 * @returns The model key, or `undefined` when any loaded model should be used.
 */
function resolveModelKey(pluginValue: string): string | undefined {
  if (pluginValue === "" || pluginValue === AUTO_CONFIG_VALUE) {
    return undefined
  }

  return pluginValue
}

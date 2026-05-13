/**
 * Configuration resolution utilities.
 */

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"
import { configSchematics } from "./config-schematics"

import type { ToolsProviderController } from "@lmstudio/sdk"

/**
 * Default upper bound on the number of `.act` prediction rounds an agent run may take.
 */
const DEFAULT_MAX_ROUNDS = 8

/**
 * Default sampling temperature applied to the agent's predictions.
 */
const DEFAULT_TEMPERATURE = 0.7

/**
 * Default wall-clock cap on a single agent run, in seconds.
 */
const DEFAULT_TIMEOUT_SECONDS = 300

/**
 * Default system prompt injected on every agent run when the plugin field is left blank.
 */
const DEFAULT_SYSTEM_PROMPT =
  "You are a focused sub-agent invoked by another LLM to complete a single, well-scoped task. Respond with the final answer only — no preamble, no recap of the task, no meta-commentary. If the task cannot be completed, return a brief explanation of why."

/**
 * Conversion factor from seconds to milliseconds.
 */
const MS_PER_SECOND = 1000

/**
 * Fully resolved configuration used by a single agent run.
 */
interface ResolvedConfig {
  /** Model key of the LLM to run as the sub-agent. `undefined` selects any loaded model. */
  modelKey: string | undefined
  /** System prompt injected as the first message on the agent run. */
  systemPrompt: string
  /** Upper bound on the number of prediction rounds the agent may take. */
  maxRounds: number
  /** Sampling temperature applied to the agent's predictions. */
  temperature: number
  /** Wall-clock cap on the agent run, in milliseconds. `undefined` disables the timeout. */
  timeoutMs: number | undefined
}

/**
 * Resolves configuration from plugin settings.
 *
 * @param ctl - Tools provider controller exposing plugin configuration.
 * @returns The fully resolved configuration used to drive an agent run.
 */
export function resolveConfig(ctl: ToolsProviderController): ResolvedConfig {
  const pluginConfig = ctl.getPluginConfig(configSchematics)
  const pluginModelKey = pluginConfig.get("modelKey") as string | null
  const pluginSystemPrompt = pluginConfig.get("systemPrompt") as string | null
  const pluginMaxRounds = pluginConfig.get("maxRounds") as number | null
  const pluginTemperature = pluginConfig.get("temperature") as number | null
  const pluginTimeoutSeconds = pluginConfig.get("timeoutSeconds") as number | null
  const timeoutSeconds = pluginTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS

  return {
    modelKey: resolveModelKey(pluginModelKey),
    systemPrompt: resolveSystemPrompt(pluginSystemPrompt),
    maxRounds: pluginMaxRounds ?? DEFAULT_MAX_ROUNDS,
    temperature: pluginTemperature ?? DEFAULT_TEMPERATURE,
    timeoutMs: timeoutSeconds === 0 ? undefined : timeoutSeconds * MS_PER_SECOND,
  }
}

/**
 * Resolve a configured model key, treating the auto sentinel and empty strings as unset.
 *
 * @param pluginValue - Value read from plugin configuration.
 * @returns The model key, or `undefined` when any loaded model should be used.
 */
function resolveModelKey(pluginValue: string | null): string | undefined {
  if (pluginValue === null || pluginValue === "" || pluginValue === AUTO_CONFIG_VALUE) {
    return undefined
  }

  return pluginValue
}

/**
 * Resolve a configured system prompt, falling back to the built-in default when blank.
 *
 * @param pluginValue - Value read from plugin configuration.
 * @returns The system prompt to inject on every agent run.
 */
function resolveSystemPrompt(pluginValue: string | null): string {
  if (pluginValue === null || pluginValue.trim() === "") {
    return DEFAULT_SYSTEM_PROMPT
  }

  return pluginValue
}

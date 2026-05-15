import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"

/**
 * Plugin configuration schematics registered with LM Studio.
 * Exposes the settings shown in the plugin UI.
 */
export const configSchematics = createConfigSchematics()
  .field(
    "modelKey",
    "string",
    {
      displayName: "Agent Model Key",
      subtitle:
        "Model key of the LLM to run as the sub-agent (as listed in `lms ls`). Leave as 'auto' to use any model already loaded in LM Studio.",
    },
    AUTO_CONFIG_VALUE
  )
  .field(
    "maxRounds",
    "numeric",
    {
      displayName: "Max Prediction Rounds",
      subtitle:
        "1 to 40. Upper bound on the number of `.act` prediction rounds the agent may take before the run is terminated.",
      min: 1,
      max: 40,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 40,
      },
    },
    8
  )
  .field(
    "toolSources",
    "stringArray",
    {
      displayName: "Tool Source Plugins",
      subtitle:
        "Plugin identifiers in 'owner/name' form (one per entry, exactly as shown in `lms ls --plugins` or on the LM Studio Hub). Empty list disables cross-plugin tools. LM Studio also requires you to grant the agent plugin permission to use each source (the 'plugins.use' permission) — accept the permission prompt when it appears, or grant it from the Plugins settings panel.",
      allowEmptyStrings: false,
    },
    []
  )
  .field(
    "allowedTools",
    "stringArray",
    {
      displayName: "Allowed Tools",
      subtitle:
        "Exact tool names the sub-agent may call (one per entry, case-sensitive, matched verbatim against the name registered by the source plugin — e.g. 'Web Search', not 'web_search' or a display label). Whitespace is trimmed. Empty list allows every tool from a configured source. If any entry fails to match, the run is aborted before invoking the sub-agent and the error lists the available names. Tip: run `lms log stream` after the plugin loads to see the exact names discovered from each source.",
      allowEmptyStrings: false,
    },
    []
  )
  .field(
    "temperature",
    "numeric",
    {
      displayName: "Temperature",
      subtitle: "0 to 2. Sampling temperature applied to the agent's predictions.",
      min: 0,
      max: 2,
      slider: {
        step: 0.1,
        min: 0,
        max: 2,
      },
    },
    0.7
  )
  .field(
    "timeoutSeconds",
    "numeric",
    {
      displayName: "Run Timeout (seconds)",
      subtitle: "30 to 1800. Hard wall-clock cap on a single agent run.",
      min: 30,
      max: 1800,
      int: true,
      slider: {
        step: 30,
        min: 30,
        max: 1800,
      },
    },
    300
  )
  .build()

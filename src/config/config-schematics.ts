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
      subtitle: "Plugin identifiers in 'owner/name' form, one per entry. Empty list disables cross-plugin tools.",
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
        "Exact tool names the sub-agent may call, one per entry (case-sensitive). Empty list allows every tool from a configured source, plus every internal tool when Enable Internal Tools is on.",
      allowEmptyStrings: false,
    },
    []
  )
  .field(
    "enableInternalTools",
    "boolean",
    {
      displayName: "Enable Internal Tools",
      subtitle:
        "When on, the sub-agent can call the plugin-internal tools: filesystem tools (list_files, read_file, grep) scoped to the LM Studio working directory, plus context tools (list_attachments, read_attachment) that read this chat's file attachments and your latest message. The Allowed Tools filter still applies as a ceiling.",
    },
    true
  )
  .field(
    "maxRetries",
    "numeric",
    {
      displayName: "Max Required-Tool Retries",
      subtitle:
        "0 to 5. Extra `.act` invocations granted after a round that did not call every tool listed in the call's `requiredTools` parameter. Orthogonal to Max Prediction Rounds: that caps rounds within one `.act`; this caps additional `.act` runs after a missing-tool diagnosis. Set to 0 to disable retries.",
      min: 0,
      max: 5,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 5,
      },
    },
    1
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

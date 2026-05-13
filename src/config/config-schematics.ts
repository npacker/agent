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
    "systemPrompt",
    "string",
    {
      displayName: "Agent System Prompt",
      subtitle:
        "Persona and standing instructions injected as the system message on every agent run. The caller's task is appended as a user message.",
    },
    "You are a focused sub-agent invoked by another LLM to complete a single, well-scoped task. Respond with the final answer only — no preamble, no recap of the task, no meta-commentary. If the task cannot be completed, return a brief explanation of why."
  )
  .field(
    "maxRounds",
    "numeric",
    {
      displayName: "Max Prediction Rounds",
      subtitle:
        "1 to 20. Upper bound on the number of `.act` prediction rounds the agent may take before the run is terminated.",
      min: 1,
      max: 20,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 20,
      },
    },
    8
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
      subtitle: "0 to 1800. Hard wall-clock cap on a single agent run. Set to 0 to disable the timeout.",
      min: 0,
      max: 1800,
      int: true,
      slider: {
        step: 30,
        min: 0,
        max: 1800,
      },
    },
    300
  )
  .build()

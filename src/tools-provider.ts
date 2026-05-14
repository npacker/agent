/**
 * Registers the plugin's tools with the LM Studio SDK.
 *
 * Opens cross-plugin tool sessions and replaces them on each `toolsProvider` invocation,
 * serialising registrations so concurrent calls cannot leak bridges, and disposing the active
 * bridge cleanly on process shutdown signals.
 */

import { resolveConfig } from "./config/resolve-config"
import { ToolBridge } from "./plugin-tools"
import { createRunAgentTool } from "./tools/run-agent-tool"

import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Holds the active bridge so shutdown handlers can dispose it. Replaced on every registration;
 * the prior bridge is disposed after the replacement is in place so we never have a window with
 * no usable bridge.
 */
let activeBridge: ToolBridge | undefined

/**
 * Serialises calls to `toolsProvider`. Each new registration chains onto this promise so two
 * concurrent invocations cannot race to dispose the same prior bridge or leak a freshly opened
 * one. Rejections are absorbed internally so a failed registration does not poison the queue.
 */
let registrationQueue: Promise<unknown> = Promise.resolve()

/**
 * Dispose the active bridge on process shutdown so cross-plugin tool sessions are released.
 */
const shutdown = (): void => {
  activeBridge?.dispose()
  activeBridge = undefined
}

process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
process.once("exit", shutdown)

/**
 * Register the plugin's tools with the LM Studio SDK controller.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered Agent tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const next = registrationQueue.then(
    async () => doRegister(ctl),
    async () => doRegister(ctl)
  )

  registrationQueue = Promise.allSettled([next])

  return next
}

/**
 * Open a fresh bridge, swap it in as the active bridge, and dispose the previous one.
 *
 * @param ctl - Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered Agent tools for this registration.
 */
async function doRegister(ctl: ToolsProviderController): Promise<Tool[]> {
  const config = resolveConfig(ctl)
  const newBridge = await ToolBridge.open(ctl.client, config.toolSources)
  const previousBridge = activeBridge

  activeBridge = newBridge
  previousBridge?.dispose()

  return [createRunAgentTool(ctl, newBridge)]
}

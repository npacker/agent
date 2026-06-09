/**
 * Edit-mode orchestration for the Run Agent tool. Sets up a single-file snapshot store, seeds the
 * file's current content into the sub-agent's task, drives the shared `runAgent` loop with the
 * repo-scoped edit tools, writes the result back to the real file atomically, and returns a
 * summary plus a unified diff.
 */

import { runAgent } from "../agent"
import { EmptyAgentResponseError } from "../errors"
import { resolveSandboxedPath } from "../fs"
import { buildEditTools } from "../internal-tools"

import { atomicWrite } from "./atomic-write"
import { ScratchRepo } from "./scratch-repo"

import type { ResolvedConfig } from "../config/resolve-config"
import type { LMStudioClient, ToolCallContext, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Inputs for a single-file edit run.
 */
export interface EditAgentRequest {
  /** Path of the file to edit, relative to the LM Studio working directory. */
  file: string
  /** System prompt supplied by the host for the sub-agent. */
  systemPrompt: string
  /** Task supplied by the host. The current file content is seeded onto it. */
  task: string
  /** Resolved plugin configuration for the run. */
  config: ResolvedConfig
}

/**
 * Compose the seeded task: the host's task, standing edit instructions, and the file's current
 * content so the sub-agent does not need a first `read_file` round.
 *
 * @param file - Path of the file under edit, for display in the instructions.
 * @param task - Host-supplied task.
 * @param content - Current file content to embed.
 * @returns The seeded task string.
 */
function buildSeededTask(file: string, task: string, content: string): string {
  const guidance =
    `You are editing the file \`${file}\`. Use the edit_file tool to make changes ` +
    `(exact find-and-replace); use read_file, show_diff, diff_log, and rollback to inspect or undo. ` +
    `Do not reproduce the full file in your reply — when finished, give a brief summary of what you changed.`

  return `${task}\n\n${guidance}\n\nCurrent contents of \`${file}\`:\n\n\`\`\`\n${content}\n\`\`\``
}

/**
 * Drive the shared agent loop with the repo-scoped edit tools. An empty final answer (the model
 * edited but produced no closing text) is tolerated and returned as an empty string.
 *
 * @param client - LM Studio client from the tool context.
 * @param request - Edit run inputs.
 * @param repo - Scratch repo exposing the edit tools.
 * @param context - Runtime tool context supplying the abort signal and status callbacks.
 * @returns The sub-agent's final summary text, or an empty string when none was produced.
 */
async function runEditLoop(
  client: LMStudioClient,
  request: EditAgentRequest,
  repo: ScratchRepo,
  context: ToolCallContext
): Promise<string> {
  try {
    return await runAgent(client, {
      modelKey: request.config.modelKey,
      systemPrompt: request.systemPrompt,
      task: buildSeededTask(request.file, request.task, repo.readCurrent()),
      externalTools: buildEditTools(repo),
      requiredTools: [],
      maxRounds: request.config.maxRounds,
      maxRetries: 0,
      temperature: request.config.temperature,
      timeout: request.config.timeout,
      signal: context.signal,
      onStatus: context.status,
      onWarn: context.warn,
    })
  } catch (error) {
    if (error instanceof EmptyAgentResponseError) {
      return ""
    }

    throw error
  }
}

/**
 * Write the edited content back to the real file, re-validating the sandbox immediately before
 * the write. A run that made no net changes is a no-op.
 *
 * @param root - Sandbox root (the LM Studio working directory).
 * @param requestedPath - Caller-supplied path to the file being edited.
 * @param repo - Scratch repo holding the edited content.
 * @returns A promise that resolves once the write-back (if any) completes.
 */
async function writeBack(root: string, requestedPath: string, repo: ScratchRepo): Promise<void> {
  if (!repo.hasEdits()) {
    return
  }

  const target = await resolveSandboxedPath(root, requestedPath)

  await atomicWrite(target, repo.finalContent())
}

/**
 * Compose the host-facing result: the sub-agent's summary followed by the cumulative diff.
 *
 * @param answer - The sub-agent's final summary text (possibly empty).
 * @param repo - Scratch repo holding the edits.
 * @returns The summary-plus-diff string returned to the host.
 */
function composeResult(answer: string, repo: ScratchRepo): string {
  const summary = answer.trim() === "" ? "(The agent produced no summary.)" : answer
  const diff = repo.hasEdits() ? repo.renderDiff() : "No changes were made."

  return `Summary:\n${summary}\n\n---\n${diff}`
}

/**
 * Run a single-file edit task end to end and return a summary plus a unified diff.
 *
 * @param ctl - Tools provider controller supplying the client and working directory.
 * @param request - Edit run inputs (file, prompts, resolved config).
 * @param context - Runtime tool context supplying the abort signal and status callbacks.
 * @returns The summary-plus-diff string to return to the host.
 */
export async function runEditAgent(
  ctl: ToolsProviderController,
  request: EditAgentRequest,
  context: ToolCallContext
): Promise<string> {
  const root = ctl.getWorkingDirectory()
  const repo = await ScratchRepo.create(root, request.file, context.signal)

  const answer = await runEditLoop(ctl.client, request, repo, context)

  await writeBack(root, request.file, repo)

  return composeResult(answer, repo)
}

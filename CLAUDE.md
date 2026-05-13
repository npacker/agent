# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LM Studio plugin that exposes a single **Run Agent** tool to local LLMs, built on `@lmstudio/sdk`. The tool delegates a self-contained task to a sub-agent LLM running inside the same LM Studio instance and returns the sub-agent's final answer to the host model. The host LLM treats `Run Agent` like any other tool call; the sub-agent runs with a fresh context window seeded only by the configured system prompt and the caller-supplied `task` / `context`.

## Commands

- `npm run dev` — run plugin in LM Studio dev mode (`lms dev`)
- `npm run push` — publish to LM Studio Hub (`lms push`)
- `npm run lint` / `npm run lint:fix` — ESLint on `src/**/*.ts`
- `npm run format` / `npm run format:check` — Prettier
- `npm run knip` — dead-code / unused-export check

No test suite is configured. TypeScript targets ES2023. Requires Node >= 22.

## Architecture

Entry point [src/index.ts](src/index.ts) registers a config schematic and a tools provider with the LM Studio SDK.

### Request flow

1. **Tool invocation** — [src/tools-provider.ts](src/tools-provider.ts) registers the Zod-validated `createRunAgentTool`. Per-call config resolves via `resolveConfig` in [src/config/resolve-config.ts](src/config/resolve-config.ts), reading plugin UI settings from [src/config/config-schematics.ts](src/config/config-schematics.ts).
2. **Agent run** — [src/agent/run-agent.ts](src/agent/run-agent.ts) is the meat: it pulls an LLM handle off `ctl.client.llm.model(modelKey)` (or `.model()` for any loaded model when the key is `"auto"`), builds a `Chat` from the system prompt plus the task (and optional context as a second user message), and dispatches `model.act(chat, [], opts)` with `maxPredictionRounds`, `temperature`, and a composite abort signal. The tool list is intentionally empty: the sub-agent has no nested tools today, so `.act` collapses to a single prediction round unless the model issues spurious tool requests. Assistant messages are accumulated via the `onMessage` callback, and the text content of the final assistant message is returned to the host.
3. **Cancellation** — `combineSignals` merges the SDK-supplied `context.signal` with an optional wall-clock timeout (`timeoutSeconds` plugin field, `0` to disable). A timeout aborts the underlying `.act` and is reported back as an `AgentTimeoutError`; caller-driven cancellation is reported as a standard abort. The combined signal is torn down in a `finally` block to avoid leaking timers.
4. **Errors** — `formatToolError` in [src/errors/tool-error.ts](src/errors/tool-error.ts) converts thrown errors into user-facing strings. The agent-specific errors `AgentTimeoutError` and `EmptyAgentResponseError` live in [src/errors/agent-error.ts](src/errors/agent-error.ts); abort detection via `DOMException.name === "AbortError"` is shared with the other plugins in this workspace.

### Configuration

[src/config/config-schematics.ts](src/config/config-schematics.ts) declares the plugin UI fields:

- `modelKey` — model key (as listed in `lms ls`) of the LLM to run as the sub-agent. The `"auto"` sentinel from [src/config/auto-sentinel.ts](src/config/auto-sentinel.ts) routes through `client.llm.model()` (no argument), which picks any model already loaded in LM Studio.
- `systemPrompt` — standing instructions injected as the system message on every run. The built-in default tells the sub-agent to answer concisely and skip preamble.
- `maxRounds` — upper bound passed straight through as `maxPredictionRounds`. With no nested tools this typically resolves to one round, but the cap is honoured if the model emits tool requests anyway.
- `temperature` — sampling temperature passed through `LLMPredictionConfigInput`.
- `timeoutSeconds` — wall-clock cap, in seconds. `0` disables the timeout entirely; any positive value composes an `AbortController` with the SDK-supplied signal.

### Tool-file conventions

ESLint enforces two rules on `src/tools/*-tool.ts`: the file must contain exactly one exported `create<Name>Tool` factory returning `Tool`, and module-level `function` declarations other than that factory are banned. Per-tool helpers either live in a sibling module under `src/` (here, [src/agent/](src/agent/)) or are inlined inside the `implementation` arrow. Interfaces at module scope are allowed.

## Key dependencies

- `@lmstudio/sdk` — plugin/tool registration plus `LMStudioClient.llm.model().act()` for sub-agent invocation
- `zod` — tool parameter schemas

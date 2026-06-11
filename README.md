# Agent Plugin for LM Studio

An LM Studio plugin that gives a local LLM the ability to spawn a sub-agent to handle a self-contained task. The host model calls the **Run Agent** tool with a task description; the plugin runs the task on a configured sub-agent model and returns the final answer back to the host.

The sub-agent runs with a fresh context window seeded only by the caller-supplied `systemPrompt` and `task`. It does not see the host chat's history. When the operator enables them, the sub-agent may invoke the plugin's internal tools (filesystem and chat-context tools); the set of available tools is fixed by the operator's plugin configuration — the host model cannot widen the sub-agent's tool scope.

## Tools

### Run Agent

Delegate a single, well-scoped task to a sub-agent LLM and return its final answer. Good fits: summarising a long passage, drafting a contained block of text, or working through a focused reasoning problem that benefits from a clean context.

| Parameter      | Type   | Notes                                                                                                                                                       |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `systemPrompt` | string | Required. System prompt for the sub-agent — persona, output style, standing constraints. Tailor it to the user's query; the sub-agent has no prior context. |
| `task`         | string | Required. The task for the sub-agent — goal, required output shape, constraints. Do not refer to "the chat" or "the user".                                  |

Returns the sub-agent's final assistant message as a plain string. On failure returns an `"Error: …"` string the host model can read.

When the sub-agent has tools available (the plugin's internal tools, when enabled), it resolves the task across multiple [`model.act`](https://lmstudio.ai/docs) prediction rounds, capped by **Max Prediction Rounds**. With no tools available, the run typically completes in a single round.

## Installation

### From the LM Studio Hub

Install via the [LM Studio CLI](https://lmstudio.ai/docs/cli):

```bash
lms get npacker/agent
```

Or browse to the plugin on the [LM Studio Hub](https://lmstudio.ai/npacker/agent) and click "Run in LM Studio." Once enabled, the **Run Agent** tool becomes available to any model that supports tool calls. Configure a sub-agent model in the plugin UI before invoking it.

## Configuration

Configured in the LM Studio plugin UI.

| Setting               | Default | Notes                                                                                                                                                                                 |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Model Key       | `auto`  | Model key of the LLM used as the sub-agent (as listed by `lms ls`). `auto` routes through `client.llm.model()` with no argument, picking any model already loaded in LM Studio.       |
| Max Prediction Rounds | `8`     | 1–40. Upper bound passed through as `maxPredictionRounds`. Caps the SDK's tool-call/response round loop.                                                                              |
| Allowed Tools         | `[]`    | Exact tool names the sub-agent may call — case-sensitive, matched verbatim against the registered tool name (the value passed to `tool({ name: ... })`, not a display label). Whitespace is trimmed. Empty list allows every internal tool (when **Enable Internal Tools** is on). If any entry fails to match, the run is aborted before the sub-agent is invoked and the error lists the available names (with did-you-mean suggestions). |
| Temperature           | `0.7`   | 0–2. Sampling temperature applied to the sub-agent's predictions.                                                                                                                     |
| Run Timeout (seconds) | `300`   | 30–1800. Hard wall-clock cap on a single run. Composed with the SDK-supplied abort signal via `AbortSignal.any`; a timeout abort is reported as `AgentTimeoutError`.                  |

The **Allowed Tools** field (together with **Enable Internal Tools**) is the only way to scope the sub-agent's tool access. The host LLM has no parameter to override or extend it.

> Cross-plugin tool sourcing (exposing other LM Studio plugins' tools to the sub-agent) is present in the codebase but not currently wired, so there is no tool-source setting in the UI.

## Local development

```bash
git clone https://github.com/packern/agent.git
cd agent
npm install
npm run dev      # runs `lms dev`
```

`npm run push` publishes the plugin to the LM Studio Hub (`lms push`). `npm run lint`, `npm run format`, and `npm run knip` cover linting, formatting, and dead-code checks.

Requires Node >= 22.20.

## License

MIT — see [LICENSE](LICENSE).

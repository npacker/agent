# Agent Plugin for LM Studio

An LM Studio plugin that gives a local LLM the ability to spawn a sub-agent to handle a self-contained task. The host model calls the **Run Agent** tool with a task description; the plugin runs the task on a configured sub-agent model and returns the final answer back to the host.

The sub-agent runs with a fresh context window seeded only by the caller-supplied `systemPrompt` and `task`. It does not see the host chat's history.

## Tools

### Run Agent

Delegate a single, well-scoped task to a sub-agent LLM and return its final answer. Good fits: summarising a long passage, drafting a contained block of text, or working through a focused reasoning problem that benefits from a clean context.

| Parameter      | Type     | Notes                                                                                                                                                                            |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `systemPrompt` | string   | Required. System prompt for the sub-agent — persona, output style, standing constraints. Tailor it to the user's query; the sub-agent has no prior context.                       |
| `task`         | string   | Required. The task for the sub-agent — goal, required output shape, constraints. The sub-agent has no prior context; do not refer to "the chat" or "the user".                    |

Returns the sub-agent's final assistant message as a plain string. On failure returns a `"Error: …"` string the host model can read.

## Configuration

| Setting               | Default | Notes                                                                                                                                                                  |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Model Key       | `auto`  | Model key of the LLM used as the sub-agent (as listed by `lms ls`). `auto` picks any model already loaded in LM Studio via `client.llm.model()` with no argument.       |
| Max Prediction Rounds | `8`     | Upper bound passed through as `maxPredictionRounds`. With no nested tools registered, runs typically resolve in one round; the cap matters if the model emits tool requests anyway. |
| Temperature           | `0.7`   | Sampling temperature for the sub-agent's predictions.                                                                                                                  |
| Run Timeout (seconds) | `300`   | Wall-clock cap on a single run. `0` disables the timeout.                                                                                                              |

## Development

```bash
npm install
npm run dev      # run in LM Studio dev mode
npm run lint     # ESLint
npm run format   # Prettier
npm run knip     # dead-code / unused-export check
```

Requires Node >= 22.

## License

MIT — see [LICENSE](LICENSE).

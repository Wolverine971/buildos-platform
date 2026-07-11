<!-- apps/web/src/lib/tests/llm/README.md -->

# LLM Tests

⚠️ **These tests make real OpenRouter API calls and cost money.** ⚠️

They are excluded from `pnpm test` (see the `lib/tests/llm` exclude in
`vitest.config.ts`) and only run via:

```bash
cd apps/web
pnpm test:llm        # run once
pnpm test:llm:watch  # watch mode (each save costs money)
```

Requires `PRIVATE_OPENROUTER_API_KEY` in `apps/web/.env`.

## What they cover

Live smoke tests for the **lite_seed_v1 agentic chat prompts** (the current
production prompt surface, slimmed in the 2026-07-10 prompt-quality audit):

- `__tests__/lite-prompt-live.test.ts`
    - Global context: a workspace question produces grounded prose or
      on-surface tool calls.
    - `project_create` fork: the one-tool context steers the model into a
      `create_onto_project` call with a valid `project.name` / `project.type_key`.
    - Final-response contract: no self-correction spirals ("No, wait"), no
      prompt scaffolding echoes ("Prompt variant:", `lite_seed_v1`), no phantom
      headers ("Final-response rules", "Communication pattern").

`helpers/lite-turn-runner.ts` renders real prompt envelopes via
`buildLitePromptEnvelope` with fixture data and runs one LLM pass through
`SmartLLMService.streamText` with the same options the v2 stream endpoint uses
on pass 1 (default tool surface, `tool_choice: 'auto'`, `temperature: 0.2`,
`profile: 'balanced'`).

## History

The original suite here tested the legacy `BrainDumpProcessor` prompts; it was
deleted 2026-04-17 (commit `db058d80`) when that flow was replaced by the
worker-side ontology braindump pipeline. This suite replaces it against the
current live prompt path. For offline prompt evaluation over recorded runs, see
`src/lib/services/agentic-chat-v2/prompt-eval-*` instead — those run in the
normal test suite and cost nothing.

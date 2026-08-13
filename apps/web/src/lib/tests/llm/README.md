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

## Pinning and blind model bakeoffs

Pin the ordinary live prompt suite to one exact model:

```bash
LLM_TEST_MODEL=x-ai/grok-4.6 \
pnpm test:llm -- src/lib/tests/llm/__tests__/lite-prompt-live.test.ts --retry=0
```

Run the opt-in blind comparison against the production baseline and save the result:

```bash
LLM_BAKEOFF_CANDIDATE_MODEL=x-ai/grok-4.6 \
LLM_BAKEOFF_BASELINE_MODEL=deepseek/deepseek-v4-flash \
LLM_BAKEOFF_JUDGE_MODEL=z-ai/glm-5.2 \
LLM_BAKEOFF_OUTPUT_PATH=/tmp/grok-46-bakeoff-result.json \
pnpm test:llm -- src/lib/tests/llm/__tests__/model-bakeoff-live.test.ts --retry=0
```

The candidate and baseline receive the same rendered BuildOS workspace prompt. Their model
identities are hidden from the judge, which uses strict JSON output and BuildOS's ZDR/data-collection
policy. GLM 5.2 is the default judge because it has a ZDR-compatible endpoint; a judge without one
fails closed rather than relaxing the privacy policy. The bakeoff is skipped unless
`LLM_BAKEOFF_CANDIDATE_MODEL` is explicitly set.

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
- `__tests__/model-bakeoff-live.test.ts`
    - Candidate-versus-production-baseline comparison on the same grounded prioritization task.
    - Deterministic grounding and exact-model checks before judging.
    - Blind independent judgment, cost, token, latency, and full-output capture.

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

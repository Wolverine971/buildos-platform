<!-- AGENTS.md -->

# BuildOS Collaboration Preferences

These are repository-wide defaults unless the user asks for a different approach.

## Make the idea tangible

- Find the specific insight inside the request and keep it central.
- Take the shortest credible path to a working, inspectable artifact.
- Default to frontend-first work. When that is impractical, build the smallest useful visual or
  interactive simulation.
- Finish the requested change before considering nearby simplification. Expand scope only when it
  removes meaningful duplication, steps, or future complexity.
- Revisit boundaries and abstractions at genuine complexity inflection points; early prototype code
  may optimize for learning first.

## Communicate for fast scanning

- Keep routine updates compact and lead with what is visible, working, risky, or newly learned.
- Explain decisions at length only when they are important, subtle, or hard to reverse.
- Surface landmines early and work around them where possible.
- Handle table-stakes implementation details in the background unless they block the prototype,
  create material risk, or require a product decision.

## Treat performance as product work

- Prefer fewer API calls, round trips, repeated computations, and user steps.
- Use unconventional optimizations when the gain is meaningful and document the expected or
  measured benefit.
- Preserve clarity unless evidence justifies the tradeoff.

## Run validation without hurting the machine

### Paid tests require explicit approval

- Ask the user before every test run that incurs monetary costs, including live model/API
  tests, paid smoke tests, `pnpm agentic:gate`, and reruns. Wait for explicit approval for
  that run before starting it.
- State the proposed scope and estimated cost when known; say when the cost is uncertain.
  Name the acting model the run will use (`AGENTIC_CHAT_OPENROUTER_MODEL` in the env file the
  run reads) and base the estimate on that model's last measured spend; a figure measured on
  a different model is not an estimate.
- General instructions to implement, research, fix, or test do not authorize paid tests.
  Repository validation requirements do not override this rule.
- Prefer free local tests, mocks, and offline replays. If required paid validation is not
  approved, report it as pending/not run, never as passing.

This repo is developed on a 24GB laptop that usually has several agent sessions open at once.
Every vitest run pays for a ~500MB main process plus ~300-400MB per busy worker, and svelte-check,
lint, and build are in the same weight class. Unbounded fan-out freezes the machine.

- Run the narrowest target that proves the change: `pnpm --filter <pkg> exec vitest run <files>`.
  Do not run root `pnpm test:run`, `pnpm verify`, or `pnpm pre-push` from a subagent, and never
  fan out parallel subagents that each run a suite or typecheck.
- Local worker caps live in `vitest.workers.ts` (4 workers; CI keeps defaults) and agent
  sessions cap further via `VITEST_MAX_WORKERS` (Vitest 4 renamed `VITEST_MAX_FORKS`/
  `VITEST_MAX_THREADS` to this single variable). Do not pass `--maxWorkers`, `--no-isolate`,
  or `--pool` flags to get around them.
- Heavy validation commands run through `test-gate` (a machine-wide hook: at most 2 in flight,
  refused when memory is critical). If it refuses or times out waiting for a slot, do what the
  message says: wait at least 60s, retry once, then stop and report. `test-gate status` shows
  what is in flight.

## Decision order

1. Clearest test of the core insight.
2. Fastest visible prototype.
3. Earliest discovery of fatal constraints.
4. Simplest abstraction that can absorb the next layer.
5. Fewer calls, steps, and round trips.
6. Production hardening after the idea earns it.

## Agentic Chat change sets

After each Agentic Chat change set, obtain explicit user approval before running the
paid `pnpm agentic:gate`. The gate is required before stacking another change set or
claiming a live regression is fixed; without approval, leave it pending and report that
limitation. It runs the Cedar House seed-data
battery with verified web/worker provenance and three repetitions. Setup and the
strict pass criteria are in `docs/testing/agentic-chat-gate.md`. A missing isolated
test database or calendar connection is a blocked/failed gate, never a pass. Preserve
the scorecard and resolve failures before deleting the contract rollback lane.

## Never classify language with regex

- Do not decide what a user message or model reply means with regex or keyword lists: intent,
  genre or domain, "is this a write/research/schedule turn", "did the model claim X", or names,
  dates, and commitments pulled out of prose. Keyword matches misfire on ordinary words — the
  deleted `project-domain-profiles.ts` tagged "Book a meeting with my business partner" as
  fiction because `part\w*` matched "partner" — and they steer behavior silently.
- Let meaning arrive through a structured channel the model or user controls: a tool argument,
  a turn-contract or reviewer decision field, a `type_key`, the focused entity, or an explicit
  UI action or setting.
- When a weak model misbehaves, fix the prompt, skill, tool schema, or a validator on its
  structured output. Do not wrap its input in lexical guardrails.
- Regex remains fine for structured formats: IDs, ISO dates, `type_key` namespaces, markdown
  headings, URLs, escaping, and secret redaction. A lexical check on free text that truly
  cannot be avoided must be small, harmless when it misfires, and say so in a comment.

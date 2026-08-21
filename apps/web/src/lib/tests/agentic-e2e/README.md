<!-- apps/web/src/lib/tests/agentic-e2e/README.md -->

# Agentic Chat API/Runtime E2E Stress Harness

End-to-end quality tests for the **real** agentic chat. Each scenario drives the
production `POST /api/agent/v2/stream` endpoint against a running dev server,
exercising the full stack — prompt build → orchestrator loop → the production
**cheap/weak model** → tool execution → immediate DB writes → telemetry — then
asserts on three surfaces and (for fuzzy scenarios) scores quality with a strong
LLM judge.

> This is the sibling of `test:llm`. `test:llm` only exercises a single direct
> LLM pass with a hand-built prompt. **This harness runs the whole server runtime.**

This Vitest lane is API/runtime E2E, not browser/modal E2E. A separate
Playwright lane drives the real `AgentChatModal` through its composer, prewarm,
production SSE client, and rendered message list.

## ⚠️ Read before running

- **It costs money.** Every turn makes real model calls on the production route,
  and fuzzy scenarios add a strong-model judge call.
- **It requires a running dev server** (`pnpm dev --filter=@buildos/web`).
- **It writes to your hosted Supabase** (dev points at hosted). All data is
  isolated under a dedicated test user and torn down after each scenario; a
  backstop sweep removes any `AE2E ·`-prefixed projects left by a crash.
- Excluded from `pnpm test` — run it explicitly.

## Setup (one time)

1. Add to `apps/web/.env` (see `.env.example` for the block):
    ```
    AGENTIC_TEST_USER_EMAIL=agentic-e2e@example.com
    AGENTIC_TEST_USER_PASSWORD=<a strong password>
    ```
    Also needs the already-present `PUBLIC_SUPABASE_URL`,
    `PRIVATE_SUPABASE_SERVICE_KEY`, and `PRIVATE_OPENROUTER_API_KEY`.
2. The test user (auth row + `public.users` row + ontology actor) is
   auto-provisioned on first run using the service key. Its `users.timezone`
   is pinned to `HARNESS_TIMEZONE` (`harness/timezone.ts`, `America/New_York`)
   on every provision. The agentic prompt renders its clock from
   `users.timezone`, and the harness date assertions (`nextWeekdayDate`,
   `assertIsoDate`, the reschedule fixture) resolve "today"/"friday" in the
   same constant — so the model and the scenario agree on the calendar day even
   when a run starts after 20:00 Eastern, when UTC has already rolled over.
3. For the browser/modal lane, install Chromium once:
    ```bash
    pnpm --filter @buildos/web exec playwright install chromium
    ```

If login or the stream returns **402**, the test user is billing-frozen; give it
a non-frozen billing state (or admin flag) so mutations are allowed.

## Run

```bash
# terminal 1
pnpm dev --filter=@buildos/web

# terminal 2
pnpm --filter @buildos/web test:agentic          # run once
pnpm --filter @buildos/web test:agentic:book     # four-turn book journey only
pnpm --filter @buildos/web test:agentic:watch    # watch mode
pnpm --filter @buildos/web test:agentic:modal:wiring # browser wiring, no model calls
pnpm --filter @buildos/web test:agentic:modal:live   # paid real-model browser smoke
pnpm --filter @buildos/web test:agentic:modal        # all browser cases
VITEST_SILENT=false pnpm --filter @buildos/web test:agentic   # show harness logs
AGENTIC_E2E_RETRY_COUNT=0 pnpm --filter @buildos/web test:agentic # release gate: no retries
```

The `@wiring` browser lane authenticates against the real app, opens the modal
through the dashboard, selects General chat, and exercises real draft prewarm
and send-time session bootstrap. It intercepts model transport and, in the
temporary-image case, attachment creation and signed storage, so it makes no
model calls or media writes. It covers cancellation identity, interrupted-stream
reconciliation, two-turn `lastTurnContext` forwarding, and canonical
temporary-image attachment refs. Each case owns an `AE2E ·` project and exact
chat session, and verifies both are deleted. The `@live` case uses the real
stream and is paid.

## What it checks

Per turn, up to three surfaces:

1. **SSE stream** (authoritative) — strict JSON decoding, exact stream/turn
   identity, contiguous sequence/event IDs, no duplicates or post-terminal
   events, one terminal `done`, expected tool calls, and no scaffolding leakage.
2. **Ground truth** (authoritative) — the actual `onto_documents` / `onto_tasks`
   / `onto_edges` rows changed as intended (written synchronously during tool
   execution, independent of observability).
3. **Telemetry** (soft) — `chat_turn_runs.status = completed` and
   `chat_tool_executions` for the expected tool, joined by the `stream_run_id`
   the harness mints.
4. **Attribution** — each turn prints actual model, provider, pass role/profile,
   pinned-model/scaffold variant, resolved scaffold configuration and
   fingerprint, and a `native`, `self_repaired`, `supervisor_rescued`, or
   `unattributed` outcome classification.

Fuzzy scenarios (e.g. "get organized") add an **LLM judge** (strong `powerful`
JSON route) that scores the outcome 1–5 against a rubric; the turn fails below
the threshold.

Phase 0 evidence schema v2 records deterministic assertions and judging as separate stages. A turn
that fails before judging is `judge.status = "not_reached"`, not a score of zero; eligible turns
retain the exact numeric score, threshold, pass/fail result, and bounded judge reasoning. The report
also includes a content-free projection of the database-enforced provider/tool execution-observation
allowlist (finish reasons, token counts, timings, and tool boundary metadata only).

Long journeys can also declare **checkpoints**. Unlike hard preconditions, a
checkpoint miss does not abort the next turn. The runner completes the journey
and then reports all misses together, so weak opening organization does not hide
whether later canon updates or cold-session retrieval also failed.

## Model/scaffold comparisons

Pin every pass to one model by setting the eval controls on the **dev-server
process**, then run the harness normally in the second terminal:

```bash
FASTCHAT_EVAL_PINNED_MODELS=provider/model \
FASTCHAT_EVAL_SCAFFOLD_VARIANT=baseline \
pnpm dev --filter=@buildos/web
```

`FASTCHAT_EVAL_SCAFFOLD_VARIANT` is executable and rejects unknown values at
server launch. Valid IDs are:

- `baseline`
- `lean-discovery`
- `no-static-catalog`
- `no-retired-model-coaching`
- `no-legacy-surface-fallback`
- `model-led-skill-discovery`
- `no-server-skill-routing`
- `no-soft-forced-synthesis`
- `no-autonomous-recovery`

`baseline` preserves the normal `FASTCHAT_LEAN_DISCOVERY` and
`FASTCHAT_ENABLE_AUTONOMOUS_RECOVERY` settings; the resolved booleans are part
of the fingerprint. Hard tool-budget and requires-user-action finalization
remain enabled in every variant because they enforce runtime safety rather than
model behavior.

Strict telemetry mode (`AGENTIC_ASSERT_TELEMETRY=true`) fails turns whose events
omit model/provider/role, resolved scaffold configuration, or fingerprint. Set
`AGENTIC_EXPECT_SCAFFOLD_VARIANT` and optionally
`AGENTIC_EXPECT_SCAFFOLD_FINGERPRINT` to reject an unexpected launch.

## Local dev caveats

- **Observability is not finalized under `vite dev`.** The server flushes
  `chat_turn_runs` / `chat_tool_executions` on a lambda-tuned budget that
  completes on Vercel but not locally, so those rows can stay at
  `status='running'`. Telemetry assertions are therefore **soft by default**
  (they warn, don't fail); set `AGENTIC_ASSERT_TELEMETRY=true` when pointing the
  harness at an environment that finalizes them (prod/CI) to make them hard. The
  authoritative local signals are the SSE stream and the ground-truth `onto_*`
  rows.
- **Multi-turn:** because turn 1 never finalizes locally, the per-session
  admission guard would reject turn 2 ("still finishing the previous response").
  After assertions and judging record the original status, the runner retires
  the prior turn as `cancelled` with an explicit harness reason only when a
  follow-up needs the lock. This is a no-op where observability already finalized
  it; final turns are never rewritten or reported as successful by the harness.
- **Auth:** the harness logs in via `POST /api/auth/login` (the JSON endpoint the
  login page uses). `/auth/login` without `/api` is a page form action and 415s
  on JSON.

## Scenarios (v1)

| id                      | what it proves                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `document-create`       | requires all requested sections and bullet counts in the stored doc             |
| `document-edit-context` | changes only the requested section, then retargets it from context              |
| `project-organize`      | verifies a declared contract, canonical tree grouping, and source preservation† |
| `task-create`           | requires high priority and the exact requested Friday due date                  |
| `calendar-move`         | **disabled stub** until it owns external event seed/readback/delete             |

## Scenarios (Tier 1 breadth, 2026-07-25)

Sourced from DJ's failure-mode interview rather than invented. All seven use
**dictated** phrasing — he speaks nearly every message rather than typing it, so
the real input distribution is run-on, lowercase, and states an outcome plus a
next step in one breath.

| id                                | what it proves                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `task-complete-cold-reference`    | resolves a task named only by company in a **cold** session (no history), closes it, creates the stated follow-up, and updates START HERE |
| `entity-resolution-misspelled`    | survives voice-transcription corruption of a project name — resolves the near-match **or** names it and asks; never forks a new project   |
| `research-turn-finalizes`         | a multi-tool synthesis turn narrates before acting and still returns a real answer (budget-exhaustion guard)                              |
| `restraint-noop-and-ambiguity`    | writes **nothing** on a passing mention, and on an ambiguous referent asks while listing the candidates and writing nothing               |
| `task-reschedule-cold-reference`  | cold resolution + a date mutation; catches treating a reschedule as a completion, or forking a duplicate instead of moving the task       |
| `task-multi-update`               | three operations from one dictated sentence all land; catches partial application reported as success                                     |
| `document-from-vague-description` | non-imperative phrasing produces a real document, with structure and substance floors against empty compliance                            |

Some of these are expected to fail. A scenario that fails because the product is
broken is doing its job — record the finding, do not tune it green.

New assertion helpers backing them (`harness/assertions.ts`, unit-tested in
`harness/assertions.test.ts`): `assertNoMutations`, `assertRowsUnchanged` /
`rowFingerprint`, `assertQuestionAsked`, `assertNonEmptyAssistantText`,
`assertNarratedBeforeActing`, `assertToolNotCalled`, `assertTaskState`.
Scenarios may also declare an optional `teardown` hook for fixtures beyond the
single `seed.projectId` the runner deletes automatically.

† The shared assertion surface requires a declared contract, real tree moves,
canonical grouping, and source preservation. Worker runs additionally require their
observable `approve_turn_contract_review` safety-control call; legacy has no such tool.
Results captured before this path condition (and older results that inspected obsolete
`onto_edges` instead of `onto_projects.doc_structure`) are not comparable. Rerun the paid
scenario before drawing a current model-quality conclusion from this case.

## Book-writing journey

`book-writing-journey` is the first long-form creative-work evaluation. It uses
the normal production model already selected by agentic chat; it does not pin a
more capable writing model and does not add a separate LLM judge. Its four turns
measure:

1. Starting in `project_create`, turn a novel brain dump into a bounded set of
   durable character and story-reference documents with a useful hierarchy.
2. Fold a new Ilyan detail into the existing character sheet without creating a
   duplicate or dropping earlier canon.
3. Propagate a Chapter 4 beat into both Ilyan's reference sheet and the book's
   plot/chapter structure while avoiding document bloat.
4. Start a **cold chat**, read both character and story documents, and offer
   three grounded Chapter 5 options without prematurely saving any as canon.

Run it against a normal dev server:

```bash
# terminal 1 — no eval model pinning required
pnpm dev --filter=@buildos/web

# terminal 2
pnpm --filter @buildos/web test:agentic:book
```

The scenario has hard gates for stream completion, project capture, and DB
readback. Creative-work expectations are accumulated checkpoints, producing one
diagnostic report after all four turns.

## Layout

```
harness/     env, auth (cookie jar), test-user provisioning, SSE driver,
             seed/teardown, telemetry reads, LLM judge, assertion helpers
scenarios/   one file per scenario + catalog.ts registry
__tests__/   agentic-scenarios.test.ts — the runner
```

## Add a scenario

1. Create `scenarios/<id>.scenario.ts` exporting a `Scenario` (see
   `document-create.scenario.ts` for the simplest shape, or
   `document-edit-context.scenario.ts` for multi-turn + judge, and
   `book-writing-journey.scenario.ts` for accumulated journey checkpoints).
2. Register it in `scenarios/catalog.ts`.
3. Seed fixtures with `seedProject` / `seedScenarioProject` (name projects via
   `harnessProjectName(...)` so the orphan sweep can find them); assert with the
   helpers in `harness/assertions.ts` + reads from `harness/telemetry.ts`.

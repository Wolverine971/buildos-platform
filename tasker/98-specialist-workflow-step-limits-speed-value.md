<!-- tasker/98-specialist-workflow-step-limits-speed-value.md -->

# 98 — Specialist workflow: step limits, speed audit, value test

**Created:** 2026-09-23. **Status (2026-09-23 afternoon):** Free investigation done and
independently audited (see "Findings" and "Audit round"). The routing fix and planner codes
shipped in `406cacc3d` (DJ's "updates" commit). The Railway `agentic-chat-worker` deployed at
13:26 SUCCESS; it is dormant while published specialists are off. The paid confirmation ran
2026-09-23 for **$0.142 of a $0.30 cap** (see "Confirmation results"). The planner bound and
report fitting shipped in `5014e3ef5`. **DJ chose the ambitious path (host-owned per-step
reasoning plus the Phase 3 value test). The value test ran 2026-09-23: $0.333 measured
(worst case), $0.277 on the account** (see "Value test results"). Reasoning off failed the
rule. The specialists-vs-single verdict waits on DJ's blind read. Uncommitted: host-owned
reasoning, the nested-plan parser fix, and the harness value arms.
**Owner request (DJ, 2026-09-23):** "We need to fix the step limits because the step limits don't
fit the model. The other thing is for speed... Let's just do an audit to see if we can speed things
up or see if we can figure out what's slowing things down. It's okay that... no one can reach it
yet. After we do these changes and check everything, we will run it through a test to see if it
scores better."

Do the phases in order. Phase 3 measures the result of Phases 1 and 2, so it waits for both to land
and pass their checks.

## Why this exists

The 2026-09-22 context-finder pilot ran 12 real published-specialist reviews (real worker pipeline,
disposable PostgreSQL, `deepseek/deepseek-v4-flash`, projects read from production read-only). The
engine was reliable: every run finished and fail-open worked. The model layer was not:

| Signal                             | Pilot result                                              |
| ---------------------------------- | --------------------------------------------------------- |
| Planner `workflow_planner_invalid` | 11 of 12 runs, in every arm (the fixed fallback plan ran) |
| Analyst `workflow_report_invalid`  | 2 of 12 runs (the review came out partial)                |
| Wall clock per review              | 15–171 s; averages 61 s (no finder) and 86 s (finder)     |
| Cost per review                    | $0.01–0.06                                                |

Production reality on 2026-09-23: 2 workflow runs ever (both DJ, 2026-09-20, both complete, 27–37 s);
0 specialist drafts, versions, or recommendations; published specialists are off on web and worker.
`AGENTIC_CHAT_CONTEXT_FINDER_ENABLED=true` is set in production but dormant until published
specialists are on.

**Likely cause (unconfirmed):** hidden reasoning tokens exhaust the output caps. The book-loop
session found DeepSeek V4.1 Flash spent 4,000/4,000 tokens on hidden reasoning, returned nothing, and
ignores `reasoning.effort` and `reasoning.max_tokens`; chat moved to a 12,000-token cap
(`apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts`, comment above
`AGENTIC_CHAT_ACTING_MAX_TOKENS`). The workflow still uses planner 1,200, specialists 4,000, and
editor 3,200, and sends `reasoning: { effort: 'low', exclude: true }` (specialist
`modelPolicy.reasoningEffort: 'low'`). The pilot's raw outputs were not captured, so confirm before
building.

Sources: `docs/architecture/CONTEXT_FINDER_2026-09-22.md` (pilot section and landmines); the overview
doc "Shared Context Finder — Overview" (claude.ai artifact 1e47e8b4-c21e-4be7-96b2-5827bf343bb7);
private pilot output in `output/context-finder-pilot/2026-09-23T02-32-43-059Z/` (local only, never
commit); `docs/architecture/PUBLISHED_SPECIALIST_EXECUTION_2026-09-20.md`.

## Findings 2026-09-23 (free evidence; changes the plan)

Full write-up: `docs/technical/reviews/SPECIALIST_WORKFLOW_SPEED_AUDIT_2026-09-23.md`.

- **The pilot led with V4.1 Flash, but it did not stay on V4.1** (corrected by the audit).
  `buildAgenticChatWorkflowRoutesV1` pins V4.1 with V4 Flash as the fallback. However, every
  step shares one `turnRunId`, and after a V4.1 failure before the stream opens, turn route
  health leads the remaining steps with V4 Flash and then pins it
  (`openrouter-client.ts` ~582, 1139–1199). V4 Flash's cheap endpoints (DigitalOcean 9 tok/s,
  DeepInfra 27) explain "slow but cheap" as well as fp4 does.
- **The pilot had no provider routing.** Its hand-built route carried no `providerRouting`, so
  OpenRouter's price-weighted default chose among 25 V4.1 endpoints. The cheapest run 7–45 tok/s
  p50, several of them fp4. That fits the slow-but-cheap runs (`school-who curated`: 111 s for
  $0.0065). **The planner failures are probably not routing** (audit). On the same routing the
  reviewer and editor failed 0/12. A capped reply records `workflow_response_truncated`, so a
  recorded `workflow_planner_invalid` means unparsable text or a transport error. The leading
  suspect is `parseWorkflowAssignments` (`prototype-provider.ts` ~542): a plain `JSON.parse` that
  only strips code fences, applied to the published `plannerTaskV2` prompt. Any prose around the
  JSON fails. The captured text will tell; a parser fix can then be verified offline for free.
- **Production's routing was accidental.** The workflow inherited chat's V4 provider `order`.
  Both production reviews ran on DeepInfra at ~96 tok/s; its p50 on V4.1 is now 44.
- **Caps are not binding at production prompt sizes.** Largest completion 1,827/4,000 (784
  reasoning); planner 225–250/1,200 (15–71 reasoning); editor 421–889/3,200. The "reasoning
  exhausts the caps" hypothesis is unsupported so far. Pilot prompts are 2–5× larger and
  unmeasured. **Do not raise caps or write the migration until the captured run shows
  `finish_reason: length` or cap-level completion counts.**
- **Prompt dumps never worked in the pilot:** `localPromptDumpsEnabled()` is false under
  `VITEST`. The harness now captures at `fetch` instead (below).
- **Snapshot landmine confirmed.** `resolveExecutableVersion` requires a published definition to
  equal `DOCUMENT_ORGANIZER_V2` exactly, including `limits.maxOutputTokens: 4000` and
  `reasoningEffort: 'low'`. `parseSpecialistSnapshotV2` requires `modelPolicy` to equal the
  baseline and `limits` ≤ the baseline. If caps or reasoning change, make them host-owned at
  execution. The runner currently reads `definition.limits.maxOutputTokens` and
  `definition.modelPolicy.reasoningEffort`. Do not edit the definitions: every published version
  would fail to parse.

**Built (shipped in 406cacc3d; tests green):**

1. **Workflow-owned provider routing.** `AGENTIC_CHAT_WORKFLOW_PROVIDER_ROUTING_V1` in
   `workflow-dispatch.ts`: `sort: throughput`, ignore azure/morph/modal, which is chat's measured
   V4.1 policy. Asserted in `agenticChatWorkflowDispatch.test.ts` (request body) and
   `agenticChatConfig.test.ts` (production config).
2. **Separate planner failure codes.** A provider failure is now `workflow_planner_unavailable`;
   invalid plan text stays `workflow_planner_invalid`. Covered in
   `agenticChatWorkflowRunner.test.ts`.
3. **Pilot instrumentation.**
    - `tests/helpers/providerCapture.ts` records per-call timing, finish reason, reasoning tokens,
      provider and visible text.
    - The pilot exports each run's steps, dispatches, events and reads to `runs/*.json` and adds
      a timing table to the report.
    - New env: `CONTEXT_FINDER_PILOT_ARMS`, `_REPS`, `_ROUTING=workflow|openrouter_default`.

Checks run: worker typecheck and test typecheck clean. Passing suites: dispatch (26), runner
(28), config and bootstrap (46), runner and published-specialist PostgreSQL (14). The pilot
suite skips cleanly when not opted in.

### Audit round (independent reviewer, 2026-09-23)

The reviewer confirmed claims 3 and 4. It corrected claim 2 (the V4 Flash switch) and moved the
planner suspect from routing to the parser. It also found these harness defects, **all fixed
(uncommitted)**:

- **Hidden billing.** The teed capture kept an abandoned provider stream generating. It is now
  a pass-through, so a client cancel cancels the provider stream.
- **Error bodies were dropped.** The first 2 KB of a non-OK or non-SSE body is now kept.
- **`settled()` could hang.** It is now bounded at 30 s.
- **Ranker timeout.** The Jev ranker timed out at 3 s instead of the worker's 8 s. It now uses
  `WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS`.
- **Serial flow.** The pilot forced serial evidence handoff. `CONTEXT_FINDER_PILOT_HANDOFF`
  now defaults to off, matching production's parallel flow. The published `plannerTaskV2` is
  the same in both profiles.
- **No model column.** The report now shows the lead and served model, with ⚠ when a request
  led with V4 Flash.
- **Snapshot noise.** The endpoint pool is saved at run start (a free GET).
- **Cost guard too loose.** `BUDGET_USD` now defaults to 0.25. A second stop,
  `CONTEXT_FINDER_PILOT_MAX_CREDITS_USD`, checks the OpenRouter `/credits` delta before each
  review.
- **Fragile export.** Each export query is now wrapped in its own try/catch.

Also new:

- `tests/providerCapture.test.ts`: 4 free tests (pass-through with the real client, cancel
  propagation, error body, bounded settle).
- `scripts/workflow-reasoning-replay.ts`: replays captured requests with reasoning low vs off.
  It is a dry run unless `--live`, and it pre-checks each call's worst-case cost against
  `--max-usd`.

Not fixed (noted):

- Workflow calls have no slow-stream guard; a stall is bounded only by the 90 s request
  timeout.
- An unsupported planner tool call is labeled "unavailable".
- Data-policy eligibility under `data_collection: 'deny'` can't be checked for free.

**Paid plan (hard ceiling $0.30; OpenRouter `/credits` delta read before and after every
invocation):**

- **A.** `9t-influencers` × baseline + auto, `ROUTING=workflow`, `HANDOFF=off`, with
  `BUDGET_USD=0.06` and `MAX_CREDITS_USD=0.15` (≈ $0.05–0.10).
- **Free.** If the planner fails on text, check the parser offline.
- **B.** Only if the planner succeeds in A: 1 baseline review with
  `ROUTING=openrouter_default` (≈ $0.02–0.04).
- **C.** Replay the reviewer and planner, low vs off, `--max-usd 0.03`.

### Confirmation results (2026-09-23, $0.142)

Full tables: `docs/technical/reviews/SPECIALIST_WORKFLOW_SPEED_AUDIT_2026-09-23.md` "Results".
Private output: `output/context-finder-pilot/2026-09-23T18-07-30-483Z/` (Run A) and
`2026-09-23T18-12-26-209Z/` (the rerun plus `reasoning-replays.json`).

- **Speed.** `9t-influencers` reviews took 17–25 s, down from 127–129 s. Together served every
  call at 166–289 tok/s, and no call fell back to V4 Flash.
- **Planner root cause: the 1,000-character assignment bound in `parseWorkflowAssignments`.**
  The model returned valid 1,186–2,700-character assignments. **Fixed (uncommitted):** the
  bound is now 4,000 characters and 12,000 bytes, and the planner was accepted in both rerun
  reviews.
- **Report retries and partials came from strict bounds.** Recommendations ran 485–573
  characters against a 480 cap, and one finding cited 7 records against a cap of 4. **Fixed
  (uncommitted):** `fittedText` trims overruns up to 2× at a word and drops extra list items
  and references. Output stays inside the SQL bounds, and the rerun had 0 retries.
- **Caps are near-binding on large projects.** A reviewer reached 3,631 of 4,000 (2,510
  reasoning) and the planner 947 of 1,200. No call truncated in 18 calls.
- **`reasoning: {enabled: false}` is honored on V4.1:** 0 reasoning tokens on the replayed
  reviewer (993 vs 2,133 tokens) and planner (which still parses). Quality with reasoning off
  is unmeasured.
- **Checks.** The planner fix was verified offline on the captured replies. Worker typecheck
  and test typecheck are clean. Passing suites: role report + runner + prototype (79), the
  PostgreSQL runner, published-specialist, V1 and dispatch suites (46), capture (5).

### Value test results (2026-09-23, 1 rep, $0.333 measured / $0.277 account)

DJ approved: 1 rep, staying near $0.35, under the **revised rule**:

- **Facts are only a floor.** No arm may trail by more than 10% of facts.
- **Specialists earn a user-facing path** only if DJ prefers their answer in at least 5 of 6
  blind comparisons, counting wrong claims, at a speed he accepts. Ties go to the single chat
  answer: park specialists and move the finder into chat.
- **Reasoning off ships** only if all three hold:
    - no extra failed or partial steps;
    - it stays inside the fact floor;
    - DJ prefers the reasoning-on answer in no more than 3 of 6 questions.

Private output (the key stays local):

- `output/context-finder-pilot/2026-09-23T19-36-54-964Z/`: the school-cost smoke run.
- `2026-09-23T19-38-08-817Z/`: the main run, with `blind-page-key.json`.

**Arms.** All arms run V4.1 Flash on workflow routing. Both specialist arms share one curated Jev
plan per question.

- `finder_low`: specialists, reasoning low.
- `finder_off`: specialists, reasoning off for every step.
- `single`: one call with the planner's evidence prompt, the chat acting cap (12,000) and no
  tools.
- `single_reads`: `single` plus the text of the documents `finder_low` opened. It runs only
  when `finder_low` opened documents.

| Question            | finder_low                          | finder_off               | single              | single_reads       |
| ------------------- | ----------------------------------- | ------------------------ | ------------------- | ------------------ |
| school-cost         | 4/4 · 22 s · $0.011                 | 4/4 · 16 s · $0.011      | 4/4 · 5 s · $0.003  | —                  |
| school-who          | 4/4 · 17 s · $0.021 (opened 4 docs) | 0/4 · 16 s (opened none) | 0/4 · 23 s · $0.004 | 4/4 · 9 s · $0.005 |
| 9t-influencers      | 3/4 · 55 s · $0.031                 | **failed**               | 3/4 · 12 s · $0.006 | —                  |
| 9t-email-strategy   | 3/4 · 22 s · $0.031                 | **failed**               | 3/4 · 20 s · $0.009 | —                  |
| 9t-marketing-status | 5/6 · 25 s · $0.040 (opened 4 docs) | 5/6 · 18 s · $0.030      | cut by budget guard | —                  |

- **Reasoning off fails the rule without a blind read.** It fails two of its three conditions.
    - **Extra failed steps:** 2 of 5 reviews lost both specialists, so the editor was skipped.
    - **Fact floor:** school-who scored 0/4 against 4/4. With reasoning off the analyst never
      opened a document: 0 reads in 4 completed runs. With reasoning low, 2 of 5 runs opened
      documents, and both were questions whose answer sat in a document.
    - When it did work, it saved 1–7 s.
    - **Keep reasoning low.**
- **Why the failed steps happened.** Both specialist calls got no response headers within the
  workflow's 10 s `AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS`. Transport errors never
  retry (Tasker 83: "Provider/transport errors and refused dispatches never retry"), so each
  stall killed its step.
    - Reasoning off is **not proven** to be the cause. There were only 2 events, and a
      reasoning-low single call also waited 10.1 s for headers.
    - The account delta suggests the timed-out calls were not billed. The ledger holds them as
      `uncertain` at their reservation, which is why measured spend reads high.
    - This exposure applies to reasoning low too: any provider stall kills the step.
- **Specialists vs a single answer on facts.**
    - The two tie on 3 of 4 questions.
    - On school-who the one-shot single lost 0/4, because the fact lived in a document the
      specialist opened. Given those documents, `single_reads` matched 4/4 in 9 s.
    - Specialists took 17–55 s against 5–23 s and cost 2–7× more.
    - The verdict waits on DJ's blind read: <https://claude.ai/artifact/Gy46P7aptbetnmsc2VcDhG>.
      It has 4 questions and 9 answers. The page stores picks in its `picks` collection, and
      `blind-page-key.json` maps letters to arms.
    - With 4 comparisons, the 5-of-6 bar means specialists must win all 4.
    - The school-who specialist answer names its internal "Risk reviewer" and "specialist
      reports". That is real product output, so it stayed, but it unblinds that question.
- **Planner shape (fixed, uncommitted).** 1 of 14 planner replies nested each value as
  `{"role", "assignment"}`. The run fell back to the fixed plan and still answered.
  `parseWorkflowAssignments` now accepts that shape, with a test in
  `agenticChatWorkflowRunner.test.ts`.
- **school-plan was skipped.** Its shared Jev ranking returned no plan, so every arm skipped
  at $0 model cost. This is deduced: it is the harness's only whole-question skip path, and
  the console output wasn't kept.

**DJ's blind read (2026-09-23, from the page's `picks`).**

- school-cost: tie. 9t-influencers: tie. 9t-email-strategy: tie.
- school-who: A (`single_reads`).
- No wrong claims were flagged.
- Specialists won 0 of 4. DJ: "it didn't make that big of a difference."

**DJ's reframe: the test measured research, not specialists doing work.** The code confirms it.

- Every specialist definition is `domainAccess: 'read_only'` with `allowedToolIds: []`. The
  prompt says "You have no tools and cannot edit records".
- The only affordance is reading up to 4 documents in one batch. The output is a per-question
  role report that the editor merges into one answer.
- All 6 scenario questions are lookups.
- So the test settled one thing: for finding and answering, chat with the Jev finder that can
  open documents is enough.
- It did not test a specialist that owns a body of work: a scope, write tools, and continuity
  across turns. DJ wants to rethink specialists around ownership. Interview first, before
  building.

### Decisions for DJ (open)

1. **Blind read.** Answered above. The link and rule are above. Unless the specialists win all 4, the rule
   parks them and moves the finder into ordinary chat. Chat should then open documents, as
   `single_reads` shows.
2. **Provider stalls kill steps.** This only matters if specialists stay. The choices:
    - retry once when no headers arrived (worst case one more step reservation, about
      $0.026; usually $0);
    - raise the 10 s limit;
    - leave it as is.
3. **Host-owned reasoning setting.** `AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS` defaults to
   unchanged behavior. The choice is to keep it as an ops setting or remove it now that
   reasoning off failed.

## Ground rules

- **Paid runs need DJ's explicit approval, every time**, with scope, acting model, and estimated
  cost (AGENTS.md). The OpenRouter balance was **$30.70** later on 2026-09-23 (after a top-up
  from $0.87) and is shared with production and other sessions; check it before asking
  (`GET /api/v1/credits`) and say when a top-up is needed.
- Free work first: code, unit tests, disposable-PostgreSQL tests, static analysis.
- Narrow tests through `test-gate`; no root suites; no worktrees; commit only when asked, with an
  explicit pathspec. Other sessions edit `main` concurrently: check `git status` before commits.
- **Never attach a worker to the isolated QA database while another session's stack runs on it**
  (5188/5189 belonged to the book-loop session). Use the disposable-PostgreSQL harness instead.
- The pilot harness `apps/worker/tests/contextFinderPilot.live.test.ts` (opt-in
  `CONTEXT_FINDER_PILOT=1`) reads two production projects **read-only** through
  `load_fastchat_context` (STABLE) and the context-finder loader. Keep it that way.
- Migrations: repo `supabase db query --linked` targets **production**. Applying a migration there
  needs DJ's go-ahead.

## Phase 1 — Make the step limits fit the model

1. **Confirm the cause (paid, about $0.01–0.03, ask first).** Rerun one pilot scenario with
   `AGENTIC_CHAT_LOCAL_PROMPT_DUMPS=true` (see `apps/worker/src/workers/agentic-chat/effects/prompt-dump.ts`;
   verify the harness's `AgenticChatOpenRouterClient` actually writes dumps) and read, per planner,
   analyst, reviewer, and editor call: `finish_reason`, completion vs reasoning tokens, and whether
   the text is empty, truncated, or malformed. Record the numbers; they size the fix.
2. **Pick the fix per step from that evidence.**
    - **Try switching reasoning off first** for structured steps (planner, likely editor):
      `reasoningEffort: 'none'` makes the client send `reasoning: { enabled: false }`
      (`openrouter-client.ts`, the `reasoning:` field in the request body). The book loop proved
      `effort` and `max_tokens` are ignored; `enabled: false` is untested on this model. If it is
      honored, it is the cheapest and fastest fix.
    - **Otherwise raise the caps**, sized from measured reasoning tokens with headroom (chat uses
      12,000 for the same reason). Do not guess.
3. **Change every place that encodes a cap, together:**
    - `packages/shared-types/src/agentic-chat-workflow-contract.ts` —
      `AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS` (planner 1,200 · analyst 4,000 · reviewer 4,000 ·
      editor 3,200).
    - SQL `public.agentic_chat_workflow_max_output_tokens_v1(step_key)` (defined in
      `supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql`), used by
      the reserve RPCs there and in `20260920154843_agentic_chat_document_evidence_handoff_v1.sql`.
    - CHECK `chk_chat_turn_workflow_dispatches_reservation`: `max_output_tokens BETWEEN 1 AND 4000`
      (`20260914203007_agentic_chat_workflow_v1_storage.sql`).
    - Dispatch gate: `apps/worker/src/workers/agentic-chat/workflow/workflow-dispatch.ts` rejects a
      request above the contract cap for its step.
    - Specialist definitions: `packages/agentic-chat-runtime/src/specialists/project-review-v1.ts`
      (`limits.maxOutputTokens`, `modelPolicy.reasoningEffort`). **Landmine:** check whether these
      fields sit inside hashed published or executable snapshots (`published-execution.ts`,
      `document-organization.ts`). If they do, already-admitted snapshots must still parse and
      execute; limits should stay host-owned at execution time.
    - Reservations: `computeAgenticChatWorkflowReservationMicroUsdV1` reserves
      `((bytes + 1,024) × 3 + maxOutputTokens × 12) / 10` micro-USD per call (12,000 tokens is about
      $0.014). Check the $0.25 run budget (`maxSpendMicroUsd`), synthesis headroom, and
      max physical dispatches, so bigger caps cannot starve the editor or trip `budget_exhausted`.
4. **Migration order:** write one new migration that widens the CHECK and replaces the SQL function.
   It must reach production **before** the code: code with larger caps against the old database
   fails every reservation. Widening is backward compatible. Add the migration to the migration lists
   in `apps/worker/tests/helpers/workflowPostgres.ts` and the published-specialist and pilot tests.
5. **Free checks:** shared-types contract tests, SQL contract checks, `workflow-dispatch` and
   `workflow-runner` tests, `publishedSpecialistExecution.postgres.test.ts`, runtime specialist
   tests, worker typecheck, web `check` (then `touch apps/web/vite.config.ts`).
6. **Exit (paid rerun, ask first; about $0.30 on the 12-run pilot):** planner and analyst accepted in
   at least 11 of 12 runs, no budget denials, cost per review up by no more than about 50%.

## Phase 2 — Speed audit: find what is slow before changing it

DJ is unsure about switching models. Quantify the model's share of the time so he can decide; do not
switch it without him.

**Make timing observable first.** The pilot's disposable database is deleted when the run ends. Add
an option to keep it, or export each run's dispatch rows, step rows, and events to the output
directory before shutdown. The Task 91 inspector and export (`/admin/chat/workflows`,
`chat-workflow-audit-export.ts`) already build timelines from the same tables, and production's two
runs can be inspected there for free.

**Break each review into:** queue pickup; preparation (context load plus finder ranking, up to 8 s
per Jev call); each model call (time to first byte, generation, prompt bytes, completion and
reasoning tokens); document-read round-trips; retries and failed attempts; editor synthesis.

**Hypotheses to confirm or kill, each with numbers:**

1. **Wasted attempts.** A planner or analyst that burns its whole cap on reasoning, fails, then
   retries doubles that step. Phase 1 may remove most of this.
2. **Hidden reasoning time.** Reasoning tokens divided by tokens per second, per step.
3. **Serial structure.** Planner → analyst → reviewer → editor is at least four serial calls.
   Analyst and reviewer run one after the other only with evidence handoff on (published snapshot
   `profileVersion: 3`, `workflow-runner.ts` `runSpecialists`). The pilot had handoff on; production
   does not set `AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED`, so it runs them in parallel.
   Measure both. For a published specialist the assignment is already authored: is the planner call
   worth its latency?
4. **Document reads.** The tool call → read → second completion round-trip. With context-finder
   sections preloaded, how often are reads still needed?
5. **Prompt size.** Each role re-sends the shared prompt (inventory plus evidence). Measure prefill
   cost and check provider prompt caching.
6. **Provider routing.** Time to first byte, the 10 s response-header timeout, fallbacks.

**Deliverable:** `docs/technical/reviews/SPECIALIST_WORKFLOW_SPEED_AUDIT_<date>.md` with a per-step
time table for at least 6 runs (production's two, free), a ranked fix list (seconds saved, cost,
answer-quality risk), and a model section: what a faster model would save, at what price. Implement
fixes that cannot change answer quality. Anything that changes the flow (skipping the planner,
parallelizing, preloading instead of reading) is a DJ decision; present it as a short decision brief.

## Phase 3 — Value test: do specialists score better?

**Ran 2026-09-23 at 1 rep under the revised rule; see "Value test results" above.** The plan
below is the original scope.

Run only after Phases 1 and 2 land and pass their checks. **Paid; get approval with scope, model,
and cost.**

**Question:** does a specialist review beat a single chat answer that has the same evidence? The
earlier ranker eval found one model with Jev's evidence block went from 38% to 88% of facts, so most
of the lift may be the context finder, not the four agents.

**Arms,** on the labeled questions in `docs/research/jev-context-ranker-2026-09-22/scenarios.json`
(`9t-influencers`, `9t-email-strategy`, `9t-marketing-status`, `school-plan`, `school-cost`,
`school-who`):

- **A.** Specialist review without the finder (today).
- **B.** Specialist review with the finder (auto).
- **C.** One chat answer with the finder's evidence block: the eval's "safe" arm in
  `apps/worker/scripts/jev-context-eval.ts`.
- **D (optional).** Today's plain chat context: the eval's "today" arm.

Prefer adding a single-answer arm to the pilot harness so every arm shares one project read. Run 3
repetitions per cell (the pilot ran 1). Score facts with the same Jev judge, plus latency and cost,
and give DJ a blind sample to read, because facts are not the whole answer.

**Cost:** specialist runs are about $0.02–0.05 each, so A and B at 6 questions × 3 reps is roughly
$0.70–1.80; C and D cost a few cents. That exceeds the 2026-09-23 balance, so DJ tops up or approves
a smaller scope first.

**Decision rule (agree with DJ before running):** specialists earn a user-facing path only if B beats
C by at least one fact per question on average, or clearly on DJ's read, at a latency he accepts.
Otherwise park specialists and move the finder into ordinary chat (the chips in
`docs/architecture/JEV_CONTEXT_RANKER_2026-09-22.md`).

## Exit

Phases 1–3 are done; fixes are deployed (migration first, then web and worker on the same commit);
results are recorded in `docs/architecture/CONTEXT_FINDER_2026-09-22.md` and the speed audit doc; DJ
has decided the specialist direction. Then delete this tracker and its README row.

## Starting prompt for the next agent

Read this tracker, then `docs/architecture/CONTEXT_FINDER_2026-09-22.md`. Start Phase 1 with free
preparation: map every cap location above, confirm the snapshot-hash landmine, and wire prompt
dumps into the pilot harness. Then ask DJ to approve the Phase 1 step 1 confirmation run (state
scope, `deepseek/deepseek-v4-flash`, about $0.01–0.03, and the current balance).

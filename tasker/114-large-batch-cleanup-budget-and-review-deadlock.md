<!-- tasker/114-large-batch-cleanup-budget-and-review-deadlock.md -->

# Tasker 114 — Large write batches fail: reasoning eats the output budget, and the reviewer deadlocks on completeness

> **Audit 2026-10-04 — SHIPPED, VERIFY LIVE.** Shipped in `ef69ffd8c` + `5f95206ca` (09-30); 3
> migrations applied; deployed. No replay has run on this code; both earlier replays failed.
> **Left:** reconcile uncertain effect `094a68ea` (free), then one approved batch turn (~$0.06–0.10).
> Consolidation (run 3579661e) now works the ws04 records, so pick a fresh target. Absorb 112's card
> click-through. **Priority:** P2. **Recommend:** keep.

**Status:** Implementation complete locally; production acceptance remains pending. The three
final repair migrations are applied and recorded in production, with function hashes and
server-only grants verified. Archive concurrency, failed-turn disclosure/continuity, reviewer
candidate grounding, full proposal recall, and provider-budget telemetry are repaired and
covered by free focused checks. Web and worker still report `baa0f470c` in the free preflight;
deploy both before validating this code. Two separately approved production replays **failed
cleanup acceptance**; neither is a passing result. Reconcile ws07's uncertain archive before
replaying that target, and obtain fresh approval for any paid replay. See the final closeout below.
· **Opened:** 2026-09-29
**Source:** Wayne Strategies dogfood loop on DJ's real project in prod
(`f85b6c5f-59fb-4e4c-8654-748f793d8f4b`). DJ asked for a cleanup of about 25 changes, and two
turns in a row saved nothing.
**Owner code:** `apps/worker/src/workers/agentic-chat/provider/`: `openrouter-client.ts`,
`stream-tool-calls.ts`, `turn-provider.ts`, `review/decision-completion.ts`,
`review/turn-contract.ts`. Also `packages/agentic-chat-runtime/src/loop/finalization-guard.ts`,
and the immutable request expectation code in `packages/agentic-chat-runtime`.
**Related:** 113 (closed 2026-09-29, [closeout](../docs/technical/reviews/CHAT_READS_PRESENT_TASK113_CLOSEOUT_2026-09-29.md)) fixed archived rows (the earlier turns in
the same session) and [112](112-project-review-rollup-cleanup-change-set.md) covers the nightly
cleanup change set. Once 112 exists, the change set it produces is the natural way to apply a large
cleanup.

## DJ's ask (2026-09-29)

> "For the problem of it using over 10,000 of its 12,000 budget, I don't want that problem again,
> so we need to be a little bit flexible. Maybe if it's going to get over 10,000 [tokens], we do
> something and flag something. I don't know if the model knows about its 12k output budget. We
> just need to be careful with this."

He also asked for all three root causes and every problem in the run, with links to the session
logs, so an agent can investigate.

## Session logs: where to look

- **Chat session:** `916e340c-d931-48a3-9fe8-35b1ed3a7ac4`, running as DJ in prod against deployed
  code, driven by `scripts/book-loop/turn.sh`.
- **Local turn records** hold the reply, tool calls, tool results, and before/after row diffs:
  `output/book-loop/ws01-cleanup-audit.json`, `ws02-maryland-and-non-tacemus.json`,
  `ws03-context-and-ready.json`, **`ws04-go-cleanup.json`**, and **`ws05-retry-cleanup.json`**.

| Turn                       | `turn_run_id`                              | UTC         | Cost   | Outcome                                        |
| -------------------------- | ------------------------------------------ | ----------- | ------ | ---------------------------------------------- |
| ws01 "what's out of date?" | `e970dd8a-d12b-4104-9c21-402502871b55`     | 14:37       | $0.085 | Read-only diagnosis                            |
| ws02 "what else?"          | `fcec59ad-94b5-4ec4-bddb-2d883ec33584`     | 15:01       | $0.046 | Archived rows reported as live (113)           |
| ws03 context + "ready?"    | `2f01f61c-e81e-405f-80f3-4883605e35b6`     | 16:01       | $0.072 | Proposed a batch and asked 2 questions         |
| **ws04 "let's do it"**     | **`0a146daf-a3c6-47c2-a2b4-f7d4300ada77`** | 16:15–16:18 | $0.090 | **Empty reply, stream error, 0 writes, 186 s** |
| **ws05 "try again"**       | **`4fa2682d-d340-4dd2-82eb-8ed5ba6903ae`** | 16:19–16:21 | $0.058 | **`semantic_review_failed`, 0 writes, 72 s**   |

- **Prod tables**, queried read-only with `supabase db query --linked`:
    - `llm_usage_logs` (`turn_run_id`, including `reasoning_tokens` and `error_message`)
    - `chat_turn_runs` (`id`)
    - `chat_turn_events` (`turn_run_id`; 45 rows for ws04 + ws05)
    - `agentic_chat_execution_observations` (`turn_run_id`; 53 rows, the provider-attempt
      receipts)
    - `agentic_chat_prepared_prompts` (the prepared prompts; find its key column first)

## What DJ asked for in ws04

- Close the Maryland Content Authority plan, and keep the goal as a parked "local Maryland
  creators" side goal.
- Archive the partial docs: Julian Pitch, Book Research, and both iCode workshop outlines.
- Archive Rod Chamberlin's goal, task and docs in this project.
- Run the rest of the batch BuildOS itself proposed in ws03: 8 stale tasks, 4 Tacemus-named docs,
  and the duplicate "Tacemus START HERE".
- Record that a proposal to Logan (Redline Training Company, project `3128fd62…`) still needs to
  be sent.

That is about 25 writes.

## Root cause 1: reasoning eats the 12K output budget, so large batches truncate

`AGENTIC_CHAT_ACTING_MAX_TOKENS = 12_000` (`openrouter-client.ts:98`). The acting model is
`deepseek/deepseek-v4.1-flash`. The book loop (2026-09-22) found that it **ignores `effort: low`
and `reasoning.max_tokens`**, and that is why the cap went from 4K to 12K then.

**ws04, provider rounds from `llm_usage_logs`:**

| UTC          | Result                                                    | Prompt | Completion | Reasoning  | Time   |
| ------------ | --------------------------------------------------------- | ------ | ---------- | ---------- | ------ |
| 16:15:31     | ok                                                        | 31.5K  | 2,010      | 1,832      | 5.9 s  |
| 16:15:41     | fail: "insufficient progress; retrying the buffered pass" | 32.7K  | 0          | 0          | 9.9 s  |
| 16:15:56     | ok                                                        | 36.1K  | 5,164      | 4,846      | 14.5 s |
| 16:16:17     | ok                                                        | 39.9K  | 8,066      | 7,991      | 20.7 s |
| 16:16:24     | ok                                                        | 40.9K  | 3,000      | 2,806      | 6.4 s  |
| **16:16:57** | **fail: "truncated a tool call (finish_reason=length)"**  | 48.0K  | **12,000** | **10,733** | 33.2 s |
| **16:18:27** | **fail: "request timed out after 90000ms"**               | 42.3K  | 0          | 0          | 90.0 s |

The final pass spent 10.7K of 12K tokens reasoning, so the tool-call JSON for the batch was cut
off. `openrouter-client.ts` (~540–590) treats a truncated tool call as a **route failure**: it
releases the route pin and retries on the next route **with the same budget and reasoning
behavior**. That retry produced nothing for 90 s, and the turn ended with an **empty reply**
(`errors: "An error occurred while streaming."`, `provider_stream_error`).

**ws05 hit the same wall on its first pass.** At 16:20:30 it used **12,000 completion tokens, all
of them reasoning**, in 34.9 s. A 544-token pass with no reasoning followed; it looks like the
empty-reply repair, which disables reasoning. After that, every actor pass ran with 0 reasoning
and proposed only partial batches (see root cause 2).

Questions for the assessment:

- Does the model know it has a 12K output budget, or a rough limit on how many writes to put in
  one round? Check the prompt, the tool guidance and the prepared prompts.
- DJ's idea: when a pass nears the cap (for example more than 10K tokens) or reasoning dominates
  it, do something deliberate and flag it. Options include:
    - on `finish_reason=length`, retry with reasoning off (the plan exists, so just emit the calls);
    - retry once with a larger budget;
    - tell the model to split writes into chunks of at most N calls per round;
    - watch reasoning tokens mid-stream and stop at a threshold;
    - treat running out of budget as distinct from a provider failure.
- Are truncation retries sent to a different route that is slower or hangs? The 90 s dead retry
  suggests so.
- Would a different model or lane handle large write batches better? DJ's model choice is final;
  report the risk and harden around his choice.

## Root cause 2: the reviewer judges completeness, so a correct partial batch deadlocks

In ws05 the contract reviewer (`openai/gpt-6-luna`) returned the actor's proposal **3 times**, and
then the turn failed with `semantic_review_failed`. The full reasons are in
`output/book-loop/ws05-retry-cleanup.json` under `toolResults`:

1. "…closes the plan and updates the goal, but it omits other commissioned [cleanup]…"
2. "Its document calls archive **Julian Episode 390**, AI Workshop Outline at iCode…, and Tacemus
   Positioning, but the requested partial docs are Julian Pitch, Book Research, both iCode
   outlines… It also leaves out the… duplicate Tacemus Start Here…"
3. "…the Rod cleanup only abandons the goal; it omits the Rod payment task and Rod documents…
   the Rod payment task should be archived, **not marked done**…"

**The reviewer was right about the substance.** The actor tried to archive **Julian Episode 390, a
live public page** (`/p/dj-wayne/julian-pod-390`, still HTTP 200) that DJ never named. It also
tried to archive the "AI Guy Pitches" and "Public Pitches" folders, and to mark Rod's payment task
`done`, which nobody reported.

**The deadlock** comes from the reviewer requiring the whole commissioned scope in every batch.
The actor, now running without reasoning and short on budget, fixed one thing per revision and
dropped another (START HERE, Tacemus docs, Rod docs). A correct half-batch should be approved as
progress, with the rest continued in the same turn. Check how the turn contract and request
expectation define completeness, and whether "approved partial batch, more to come" exists as a
state. The book loop's earlier fix, `reconcileRequestExpectationWithApprovedBatch`, is related.

## Root cause 3: the user never learns why nothing happened

- ws04 returned an **empty reply after 3 minutes**, and only the stream error reached the UI.
- ws05 replied: "I couldn't complete the plan to update a plan, update 2 goals and update 8
  documents: my safety check still found problems with it after repeated revisions. Nothing was
  saved. Try again, or tell me exactly what to change." The reviewer wrote precise, useful reasons
  (a public page, a wrong state change, missing items), and **none of them reached DJ.** "Try
  again" cannot succeed while root causes 1 and 2 hold.

## Other problems in the session

- **Public pages are unguarded.** The actor proposed archiving a published public doc without
  mentioning that it is public. Check what archiving does to a public page. The actor should say
  so, or ask, before touching a published doc.
- **Unrequested state changes.** It tried to mark a task `done` instead of archiving it.
- **Redundant reads.** In ws04: `list_onto_tasks` ×5 (all, then `todo`, `in_progress`, `blocked`
  and archived), `get_field_info` ×3, and `get_document_tree`, all before planning. ws01 and ws02
  had similar duplication (tasks ×4, documents ×6). This bloats the prompt from about 31K to 48K
  tokens across rounds.
- **Duplicate "No changes were saved in this turn."** `NO_CHANGES_SAVED_NOTICE`
  (`finalization-guard.ts:63`, appended ~550) fired on read-only diagnosis turns ws01–ws03, under
  a model line that already said the same thing in different words. It appears the turn contract
  judged "what's out of date" and "are we ready?" as owing a change.
- **ws03 dropped scope silently.** Its proposed batch left out the docs DJ called partial, with no
  explanation.
- **The archived-rows confusion** in ws02 and ws03 belongs to tasker 113.
- **Cost of the failure:** $0.148 across ws04 and ws05, with 0 writes and 4.3 minutes of waiting.
  The session total is $0.36.

## Constraints

- **Paid replays need DJ's explicit approval.** The actor is DeepSeek V4.1 Flash at about
  $0.06–0.09 per failed cleanup turn. The reviewer is GPT-6 Luna at about $0.003 per review.
  Prefer free tests with recorded provider streams and prompt-dump inspection.
- Model choices live in code defaults with fallbacks, not environment pins. DJ's model calls are
  final.
- Never classify user or model text with regex. Budget and scope decisions must come from
  structured signals: `finish_reason`, token usage, tool-call counts, and reviewer decision
  fields.
- Run tests narrowly: `pnpm --filter @buildos/worker exec vitest run <files>`. Heavy runs go
  through `test-gate`.

## Deliverable

An assessment in this file: confirm or correct the three root causes against the logs and code.
Then recommend:

- a budget policy that covers DJ's "flag it before it blows up" idea;
- how the reviewer handles correct partial batches;
- what the user sees when a batch is blocked;
- public-doc guarding;
- a free test plan, plus the single paid replay (ws04's message on this project) needed to prove
  it.

Build after DJ OKs the plan.

## Acceptance (for the build)

- Replaying ws04's request lands the full cleanup, in chunks if needed, within one or two turns,
  with no empty reply.
- A pass that runs out of budget recovers deliberately and leaves a flag in the turn receipt.
- The reviewer approves a correct partial batch and the turn continues.
- When a batch is blocked, the user sees the reviewer's reason in plain language.
- A published doc is never archived without an explicit mention or confirmation.

## Assessment — 2026-09-29

**Recommendation:** implement archive support, budget recovery, and partial-batch review together.
Increasing the token cap alone cannot complete this request. The three reported failures are
supported, but the investigation found a fourth blocker: **the chat actor has no task-archive
capability**. Also, allowing partial batches requires changing the completion reconciler so it
cannot erase unfinished work on a target already touched by an earlier chunk.

### Evidence and limits

Inspected the current checkout, including the existing uncommitted 112/113 work; made read-only
production queries for the incident's usage, routing/timing metadata, turn statuses, prepared-prompt
availability, and public-page status. No production changes or model requests were made.

- Local records: [ws01](../output/book-loop/ws01-cleanup-audit.json),
  [ws02](../output/book-loop/ws02-maryland-and-non-tacemus.json),
  [ws03](../output/book-loop/ws03-context-and-ready.json),
  [ws04](../output/book-loop/ws04-go-cleanup.json), and
  [ws05](../output/book-loop/ws05-retry-cleanup.json). These ignored local files contain the user
  messages, visible calls/results, replies, and row diffs; they are not raw provider SSE recordings.
- Both failed turns have empty `created`, `updated`, and `removed` arrays for every recorded entity
  table. ws04 took 185,842 ms; ws05 took 71,773 ms. These diffs cover the recorded project tables,
  not every possible external side effect.
- Production confirms ws04 is `failed / provider_stream_error`; ws05 is
  `completed / semantic_review_failed`. Thus a completed transport is not evidence of successful
  user work. ws05's three persisted tool calls are reviewer revisions, not mutations.
- All five turns have `prepared_prompt_id = NULL` and `prepared_prompt_hit = false`. There are
  **zero prepared-prompt rows for this session**, and neither failed turn's usage rows contains
  local prompt-dump metadata. An exact deployed prompt/body cannot be reconstructed from that
  cache. Prompt findings below are verified against source; execution findings use local records
  and production metadata. Do not label a future synthetic SSE fixture a recorded stream.
- The two turns have 15 provider-attempt starts but only 12 ends in the observation table
  (53 total observations). The missing ends include ws04's slow attempt and capped attempt and
  ws05's round-4 repair. `llm_usage_logs` retains those passes. Receipt completeness needs a test;
  do not rely on `chat_turn_runs.llm_pass_count` alone to count physical requests.
- The quoted ~$0.148 is **logged cost**, not a verified credit delta. ws04's two no-usage failures
  contribute $0.022485 of catalog estimates; their zero completion tokens are not proof that the
  upstream provider did no computation. Other actor/reviewer passes report provider usage.
- Automatic approval review rejected a full production payload export. The narrower metadata
  queries succeeded; no full event/prompt export was needed or performed.

### 1. Output exhaustion is confirmed; endpoint blame is not

The usage values in the incident table match production. ws04's capped pass was on **Together**:
12,000 completion tokens, of which 10,733 were reasoning, leaving 1,267 for visible output/tool
arguments. ws05's first pass was also Together: 12,000 completion tokens, all reasoning. It was
logged as `success`, with `finish_reason=length`, despite producing no usable answer or call.

The paths diverge in code:

- [openrouter-client.ts](../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts)
  corrects the finish reason to `length` when usage reaches the actual sent cap. Truncated calls
  become `tool_arguments_truncated`, mark route health failed, and enter the ordinary buffered
  retry. [provider-pass.ts](../apps/worker/src/workers/agentic-chat/provider/provider-pass.ts)
  retries the same request once, without changing its generation budget or reasoning setting.
- A length-limited pass with **no calls** instead reaches the empty-answer repair in
  [repair-policy.ts](../apps/worker/src/workers/agentic-chat/provider/repair-policy.ts).
  That sets `reasoningEffort: 'none'`, which
  [open-route.ts](../apps/worker/src/workers/agentic-chat/provider/openrouter/open-route.ts)
  sends as `reasoning: { enabled: false }`. ws05's next pass is recorded as `repair`, takes
  1,595 ms, and emits 544 completion tokens with zero reasoning. The subsequent actor repairs
  also report zero reasoning. This strongly supports the empty-answer-repair diagnosis; it is
  not proof of an unavailable request-body dump.
- The 90-second ws04 retry opened response headers after **2,070 ms** and timed out exactly at
  its generation deadline. Its upstream provider is unidentified (`openrouter` is the route
  label). Code releases the prior pin, but the receipts **do not prove which endpoint answered
  or that a slower endpoint caused the timeout**. Fireworks → Together is confirmed on the
  earlier round-2 retry only.
- [watchdog.ts](../apps/worker/src/workers/agentic-chat/provider/openrouter/watchdog.ts) watches
  byte throughput, including reasoning, on an attempt that still has a retry. It is not a token
  budget guard and is disabled on the final buffered attempt. Before the first generated byte,
  it waits for the attempt deadline. Those rules permit the observed 90-second wait.

The actor does not receive the numerical 12K output cap through the inspected prompt builders.
`ACTOR_COMMISSION_GUIDANCE` already says to submit large work in stages of a few calls, but gives
no explicit call limit. The mutation revision prompt demands every currently executable change;
the older contract-routing prompt also says not to split a complex commission. Those instructions
must be made consistent on their respective lanes.

[OpenRouter's reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
confirms that reasoning usually shares the completion budget, and hiding reasoning with `exclude`
does not disable it. It also warns that reasoning controls differ by model. Retain DJ's actor and
reviewer choices; a model switch is not part of this fix. A larger cap is a fallback option, not
the initial policy: it would not repair review completeness or missing archive support.

### 2. Partial progress exists, but the reviewer narrowly restricts it

This incident used **mutation-batch review**, not the older declared-contract execution lane.
[mutation-batch.ts](../apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts)
already says approval covers one executable stage and not the whole commission. However, it
permits missing calls only when they depend on IDs returned by that stage, and explicitly tells
the reviewer to reject a missing commissioned call whose IDs are already resolved. Its revision
prompt repeats that requirement. The revision tool description in
[controls.ts](../apps/worker/src/workers/agentic-chat/provider/review/controls.ts) reinforces it.

Consequently the reviewer can accept “create tasks, then link their returned IDs,” but cannot
accept “archive these eight resolved records, then archive the next eight.” That is the deadlock.
The recorded revisions also identify wrong targets and unsupported state changes; **do not
approve the original faulty batches simply because they are partial**. Omission and incorrect
included calls need different treatment.

Existing foundations can be reused:

- The first approved batch establishes a frozen whole-request `request_expectation`; later
  batches are separately reviewed against their exact digest. No new `approve_partial` control
  is needed: approved calls plus an unfinished expectation already represent that state.
- [turn-state.ts](../apps/worker/src/workers/agentic-chat/provider/turn-state.ts) tracks receipts
  across stages, and `takeRequestCompletionContinuation` can withhold one premature final answer
  and continue missing work. Normal post-write continuation already permits more reviewed stages.
- **Completion hazard:**
  [reconcileRequestExpectationWithApprovedBatch](../packages/agentic-chat-runtime/src/loop/request-expectation.ts)
  preserves targets absent from a batch, but trims missing fields for update outcomes whose
  targets are all touched. It can also remove scalar-value requirements when the remaining
  shape matches. With chunking, “rename this goal now, update its description next” can lose the
  second obligation. The current tests intentionally cover this weakening as a prior bug fix.
  Do not expand that helper as the solution to 114.
- The expectation schema allows **20 outcomes**, not unlimited one-outcome-per-call checklists.
  A 25-write cleanup fits by grouping only targets with identical action, fields, and values;
  genuinely different changes must stay separate. Include this in the acceptance fixture.

### 3. Error presentation loses the useful explanation

ws04's final provider error is thrown by
[turn-provider.ts](../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts) before a
receipt-grounded answer is produced. Atomic buffering correctly prevents incomplete tool calls
from executing, but no terminal explanation replaces the discarded output.

ws05 exhausts the two permitted actor revisions, resulting in three reviews.
[streamReviewExhaustion](../apps/worker/src/workers/agentic-chat/provider/review/lanes.ts)
receives held tool names and saved-write state, but not the reviewer's explanation. It therefore
prints generic operation counts and “try again.” The revision reason was available earlier in
`PendingProposalRevision` and durable control results.

The reviewer feedback itself needs tightening: both reason and correction are capped at 400
characters in the schema and sliced to 400 in the decision/tool handlers. ws05's persisted
messages end mid-thought. Make them concise findings about incorrect calls, not a retelling of
the full commission; keep remaining work in the expectation.

### 4. Missing archive capability is a prerequisite, not prompt tuning

[ontology-write.ts](../packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts)
and the worker's
[reviewed mutation catalog](../apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts)
offer no `archived` argument on task updates, and task states are only `todo`, `in_progress`,
`blocked`, and `done`. The worker explicitly excludes `delete_onto_task`. Goal updates similarly
lack an archive argument; abandoning a goal is a different effect from archiving it.

The external gateway supports `archived`, but its
[task writer](../packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts) currently
sets only `archived_at`, the half-archive bug documented in 113. The uncommitted 112
[task archive service](../apps/web/src/lib/server/task-archive.service.ts) has the board's canonical
`deleted_at + archived_at` behavior, preserves task state, and leaves calendar events alone.
It is a web service, not an admitted worker chat capability. 112 also has a richer document-tree
archive operation with explicit child handling, whereas the chat document tool exposes a state
update. Share those semantics instead of inventing a substitute `done`/`abandoned` state.

### Other corrections and ownership

- **Public documents:** production confirms Julian Episode 390 is still `published / live`.
  [getPublicPageBySlug](../apps/web/src/lib/server/public-page.service.ts) serves its separate
  `onto_public_pages` snapshot. The document update path does not unpublish it, and production's
  document triggers contain no publication hook. Archiving would hide the working document
  while the public page remains online. The existing 112
  [proposal verifier](../packages/shared-agent-ops/src/proposal-context/verify-operations.ts)
  already warns about this, including published descendants; reuse that check for chat.
- **No-save duplication:** the immediate source is `takeUnsavedCommissionNotice`, which treats
  Jev mutation-tool relevance scores >= 0.5 as a write commission. Jev's question asks whether a
  tool could be needed, including a later step, not whether a write is commissioned now. The
  actor can already say it only read; the worker then appends the notice unconditionally.
  [finalization-guard.ts](../packages/agentic-chat-runtime/src/loop/finalization-guard.ts) avoids
  adding an identical sentinel, but does not fix that earlier duplication. Do not infer that a
  contract reviewer classified ws01–ws03: the recorded turns executed only reads.
- **Repeated reads:** ws04 has five task lists, three field-info reads, a tree read, and a
  document search. The field-info reads concern three different entity types, so are not exact
  duplicate calls. The overlapping lists are the larger opportunity. 113 closed with archive
  scope fixed and no default-scope change. Repeated state-split lists moved to
  [109](109-agentic-chat-session-spend.md) (next step 5); 114 should consume that fix, not add a
  second read filter.
- **Scope:** ws03 omits the specifically named partial documents from its proposed batch. The
  commission checklist must derive from the user's instructions plus the explicitly accepted
  proposal, not only the last assistant summary. Reconcile stable IDs first: some “eight live
  tasks” were already archived, and START HERE also appears among the Tacemus candidates. About
  25 is an estimate, not an instruction to perform exactly 25 writes or archive something twice.
- **Logan:** record that the proposal still needs sending; use the existing Redline project and
  proposal evidence to avoid duplicating it. Sending the proposal is not commissioned by “I still
  need to send him that proposal.” Preserve that distinction in the checklist and replay oracle.

## Recent deployment audit and first implementation (2026-09-29)

DJ reported completing and deploying related Taskers. Checked main through `6b6970605`, including
`14c020589` and `9eb09d1ff`, against this assessment. Those commits already contain:

- 112's cleanup rollup, server verification/cautions, UI, and `get_project_cleanup` read surface.
- 113's current-record filtering across the reads and context used here.
- The canonical task archive repair: the shared gateway sets `archived_at` and `deleted_at`
  together; restoration clears both, and never restores an ordinary deleted task.

These changes remove the need to rebuild that infrastructure or add another task-archive
migration. The related Tasker headers still described some work as uncommitted/undeployed; the
committed code and DJ's deployment report take precedence. This audit verified the checkout,
not a new production deployment of 114. The token/reviewer paths remained unchanged by those
commits, so the central diagnosis still applies.

### Implemented locally in the first change set

- `provider/output-budget.ts` owns the actor's numerical policy. Actual provider requests carry
  their sent cap and guidance to propose at most eight mutations, fewer for large bodies.
  The eight-call target is prompt guidance, not automatic slicing of a proposal.
- Exact usage/finish signals distinguish pressure from exhaustion. A valid near-cap pass is kept;
  subsequent actor passes use reasoning off. Exhausted actor passes are discarded atomically,
  including seemingly complete prefix calls and partial final prose. Reviewer policy stays separate.
- The buffered boundary permits one output-budget recovery per turn, within its existing retry
  allowance and only with at least ten seconds remaining for attempt/finalization. Recovery uses
  reasoning off, preserves the healthy endpoint preference, caps the attempt at 45 seconds with
  the existing remaining-turn bound, and stops a silent accepted stream after 15 seconds.
  Recovery does not open additional route attempts or chain an empty-reply retry. Normal transport
  recovery remains available outside this recovery attempt.
- Provider attempt receipts carry the sent limit, reasoning setting, pressure/exhaustion metadata,
  and recovery flag. Consumer-closed iterators also record a terminal attempt. Failed-attempt spend
  remains in the existing usage observer. Exhaustion ends with a deterministic nonempty answer,
  including confirmed earlier writes when present.
- Correct independent stages no longer need all resolved changes in one proposal. The reviewer
  still checks every included call. The first expectation stays unchanged: removed the silent
  `reconcileRequestExpectationWithApprovedBatch` weakening. Missing fields on already-touched
  targets remain outstanding. New successful stages allow another completion reminder; repeated
  prose without writes does not reset it, and the existing total pass cap still applies.
- Task and goal tools expose `archived: true` through their reviewed schemas and canonical gateway.
  Archive effects always receive independent review, including focused records. Contract routing,
  validation, and completion recognize that flag separately from workflow state. Archiving a task
  that was already done does not count as completing it this turn. Calendar defaults remain `none`.
  Restore is intentionally outside this schema addition and remains available through the archive UI.
- Exhausted review revisions retain the reviewer's concise user-facing reason instead of a generic
  safety-check failure. Jev now answers a separate current-turn write-commission question in its
  existing request. Relevant future write tools alone no longer cause the host's no-save footer.

### Second local change set: document archive integration (2026-09-29)

Follow-up review traced the first change through the actual worker dispatch, held-batch digest,
canonical tree writer, and the newly deployed 112/113 paths. No changes to their task writer or
current-record filters were needed. The remaining document-state shortcut needed a dedicated path.

- Chat `update_onto_document` archives require `state_key: archived` and an explicit `archive_mode`
  (`archive_children` or `promote_children`). Content/metadata edits must be separate calls.
  Both canonical archive state and legacy state aliases are intercepted before the ordinary row
  writer; aliases must be corrected instead of bypassing review. The legacy contract-only lane
  cannot execute these archives without the batch-review seam.
- The worker previews the target, affected descendants/promoted children, and public pages from
  server data before review. These facts are inserted as reserved `_archive_review` metadata into
  **both** canonical domain and provider argument representations, including the exact SHA the
  reviewer approves. The field is absent from the acting tool schema, and actor-supplied values
  are rejected. Existing titles in this snapshot are read evidence, not proposed text writes.
- The independent reviewer must judge all affected documents, and must find informed user
  authorization for a published target/descendant that will remain online. A generic cleanup
  instruction or an assistant confirmation is insufficient. This is a semantic reviewer rule,
  not a claim that free mocked tests prove model judgment. Legitimately commissioned public
  archives remain possible; this is not a permanent public-document refusal. Unpublishing is
  separate, and the archive writes no public-page rows.
- Execution rereads user access without the turn memo and calls `archiveDocumentInTree`, preserving
  the existing atomic row/tree/history/child-cache writer. Its new optional reviewed mode calls a
  server-only wrapper which locks project, affected documents, then public-page rows, rereads the
  snapshot, and rejects changes before the canonical archive. Document row `FOR UPDATE` also
  serializes new public-page FK references. Unknown connection failures remain uncertain, with
  no automatic write retry. START HERE is protected as a target and as an archived descendant.
- This follows 112's caution semantics but adds a database comparison under locks; reusing only
  its application-level verifier would leave a read/write race. The fingerprint covers the
  target subtree and parent, not the entire project revision, so independent sibling archives
  can share one reviewed stage. Overlapping archive effects are rejected before review. A
  snapshot is bounded to 100 affected documents; larger subtrees need narrower stages.
- Archive receipts include the actual archived IDs and preserved publication facts. Completion
  credits only IDs returned by successful archive receipts, including descendants, and never
  credits promoted children or proposed preview scope. Reserved preview fields are not counted
  as durable changes.

The new migration is `supabase/migrations/20260929232842_chat_document_archive_review_guard.sql`.
It was **applied to production and recorded in the migration ledger on 2026-09-29**, after DJ's
explicit request. Deploy the runtime tool schema with the worker and web preparation surface.
A missing migration or unavailable preview fails closed. Existing callers without a reviewed
snapshot retain the existing canonical RPC; this change repairs chat's archive dispatch, not
every external connector path.

Validation of this second slice uses free local tests only:

- Worker coordinator, archive preview, and mutation dispatch: **279 tests passed**.
- Shared archive access/dispatch, canonical tree RPC wiring, and existing document edits:
  **23 tests passed**.
- Runtime completion, frozen expectations, and ontology schemas: **121 tests passed**.
- Worker and runtime TypeScript checks, shared-package declaration build, targeted formatting,
  and `git diff --check` passed. Missing local shared-package build artifacts were rebuilt before
  the successful worker test/typecheck runs.
- Migration rehearsal against the cached production schema, including synthetic archive cases
  and the standing 113 archive-read guard, passed with **0 SECURITY and 0 DATA findings**. The two
  server-only function notes are intentional. Role probe: authenticated 0 failures before/after;
  anon has 1 pre-existing failure before/after, with no new failure.
- SQL cases cover START HERE targets/descendants, new or changed public-page facts, an edited
  child, child promotion, independent sibling stages, preserving an authorized publication, and
  leaving an unrelated public document untouched. These are local transactional assertions;
  they do not simulate concurrent production traffic or a live model's authorization judgment.

Reference for the lock and function choices: [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
and [Supabase database functions](https://supabase.com/docs/guides/database/functions).

### Third local change set: cleanup evidence, review feedback, and continuation (2026-09-29)

- A bounded server read checks the exact task/goal/document archive targets in the first
  reviewer's immutable request expectation. It refreshes project access and reads archived rows
  by ID, without adding them to discovery results. Document no-ops require both archive state and
  timestamp and absence from the canonical tree; inconsistent or unavailable records earn no
  completion credit. Only server result metadata supplies these facts, never model arguments.
- The completion receipt now persists a manifest with saved, already-satisfied, pending, blocked,
  and uncertain items. It keeps actual saved effects and verified pre-existing archives separate.
  Extra fields and task completion still require their own evidence. A later attempted write
  invalidates the pre-write archive observation; a later failed attempt also prevents an earlier
  successful write from proving the target's final postcondition. Historical write receipts remain.
- Completion reminders include the manifest and exact unfinished targets. Deterministic terminal
  text lists verified no-ops separately from new saves and retains pending work even when this
  turn saved nothing. Created entities bind to their actual returned IDs and individual titles,
  including when later relationship outcomes refer to them.
- A partial cleanup's full expectation and manifest travel in the existing last-turn context JSON.
  The next turn receives a bounded snapshot in its untrusted recall section. The reviewer must
  verify current records, reuse saved IDs, and review only the unfinished scope that the user
  explicitly continues. Recall never supplies write authority or fresh no-op evidence. This needs
  no additional database migration. Oversized snapshots are omitted whole to keep the next turn
  within admission's context limit; the complete checklist remains in the completion receipt.
- Reviewer revisions can report up to eight structured findings, grouped by defect and target.
  Each complete user-facing message is separate from its actor correction instruction. The legacy
  reason/correction caps are now 1,200/2,000 characters; individual findings use 600/800. Exhausted
  revisions retain all validated findings in the reply and completion receipt. Invalid oversized
  finding messages are rejected instead of silently truncated.
- Output-budget recovery emits a harness-owned progress event before the single bounded retry:
  "Splitting this cleanup into smaller batches..." (or summary progress in a tool-free pass).
  Discarded model prose/calls stay buffered. The signal does not introduce another attempt or
  alter reviewer policy. Reliable token-pressure telemetry still arrives at provider pass-end.
- Final review narrowed known pre-commit document archive failures to explicit database exception
  codes. A connection error that merely names the new RPC remains an uncertain commit, with no
  automatic write retry.

Free validation of this slice:

- Worker adapter, coordinator, review, repair policy, and terminal integrity: **266 tests passed**
  across five focused files.
- Runtime manifest, findings, completion receipts, immutable expectations, contracts, and
  continuation context: **157 tests passed** across six focused files.
- Shared archive-state verification, guarded archive dispatch, and canonical tree wiring:
  **16 tests passed** across three focused files.
- These **439 tests** are this slice's focused run, not an additive total with the earlier runs.
  Shared type/package declarations, runtime declarations, worker typecheck, targeted formatting,
  and `git diff --check` passed. Validation used the machine-wide gate and one Vitest worker.

Production migration verification:

- Rehearsed the exact transactional migration against production's cached schema with the SQL
  check and role probe: **0 SECURITY and 0 DATA findings**. Authenticated had no failures before
  or after; anon retained its one pre-existing failure. The two server-only notes are intentional.
- Verified the three relevant earlier migration versions were already recorded, then applied
  only `20260929232842` with `supabase db query --linked -f` and recorded it with migration repair.
- Post-apply metadata confirms the ledger entry and both functions, `SECURITY INVOKER`,
  `search_path=public`, service-role execution, and no authenticated/anon execution grant.
  Rehearsal fixtures were local; this applied schema and ledger changes without altering real
  project/document data. DJ subsequently deployed the application, verified below.

Free post-deploy preflight (2026-09-30 01:51 UTC; 2026-09-29 local):

- `pnpm agentic:prod-battery --preflight-only` passed without model calls or database writes.
  Web and worker both identify clean commit `fbc7b79faa22d687dee75e36c18f5e49d905e5bb`, matching
  the local checkout. The harness account and its calendar prerequisite passed.
- Railway's `AGENTIC_CHAT_OPENROUTER_MODEL` remains `deepseek/deepseek-v4.1-flash`.
  Reviewer environment overrides are absent; the deployed default is `openai/gpt-6-luna`.
  The recorded full-battery spend on this actor is about **$0.24** including the judge after
  correcting the shared-key double count. The one-turn incident replay allowance below remains
  **$0.06–$0.10**, with successful staged-run cost uncertain and a second turn separately approved.
- Evidence: `output/agentic-prod-battery/2026-09-30T01-51-28-952Z/prod-battery.json`.
  Preflight proves deployment and prerequisites, not model behavior or cleanup completion.

### Remaining work before calling Tasker 114 complete

1. **Completed locally, migrations applied:** shared-tree archive scheduling, sibling-renumbering
   conflicts, and failure disclosure for mixed successful/failed/uncertain effects. Uncertainty
   and independent review remain intact. The final closeout records the additional grounding,
   scope recall, and telemetry repairs and their free verification.
2. Before another separately approved paid turn, reconcile the uncertain second iCode effect and
   re-read the project. Do not replay the four successful changes or undo them to recreate the
   incident. Both approved runs are complete; no third run is authorized. Local tests cannot
   prove live chunking, publication review, continuation, or Jev's intent judgment.
3. Verify mixed new-write/already-archived cleanup and partial-turn continuation in acceptance.
   Authoritative no-op verification currently covers archives only, and is attached to the first
   batch approval. A turn containing only already-satisfied work with no reviewed batch still has
   no reviewed request expectation and remains `request_unverified`; arbitrary scalar-update
   no-ops are not claimed as verified. If those cases need a fulfilled receipt, add a dedicated
   read-only expectation review rather than accepting the actor's completion claim.

### Free validation of the first change set

All commands used the machine-wide test gate with one Vitest worker; no paid API calls or live
production writes were made.

- Provider, full turn coordinator, recovery receipts, and live text preview: **298 tests passed**
  across four focused worker files. Covers the incident token counts, reasoning-only cap,
  valid-prefix plus truncated-JSON discard, empty/incomplete recovery, 15/45-second fake-clock
  deadlines, healthy-provider preference, one recovery across stages, reviewer separation, and
  receipt-grounded failure with and without earlier writes.
- Mutation adapter, routing/contract authorization, batch review, coordinator, and contract-field
  checks: **347 tests passed** across five focused worker files (overlaps the coordinator above;
  these totals should not be added). Subsequent coordinator additions are in the 298 above.
- Jev selection and readiness/commission distinction passed in its focused worker run, together
  with routing, mutation adapter, and live preview. The provider assertions that initially
  expected the previous prompt/telemetry shape were updated and rerun successfully.
- Runtime expectation, turn-contract, finalization, and ontology schema checks: **155 tests passed**.
  Includes same-target/different-field stages and archive-versus-completion matching.
- Existing canonical task writer, with added workflow-preservation assertions: **23 tests passed**.
- Worker source and runtime TypeScript checks passed. `git diff --check` passed for changed code.

These first-slice tests do not validate document/public-page integration; the second-slice
validation is recorded above. The paid production acceptance run has not been performed. Chunk guidance and Jev's new semantic question still need live evidence
before making claims about model compliance.

## Approved implementation plan

### A. Make the commissioned operations executable

Expose canonical archive semantics through the existing update tools' `archived` argument for
tasks and goals, including the catalog, worker reviewed arguments, validation, receipt fields,
and completion matching. Coordinate the task writer/restore behavior with 113 and the shared
implementation with 112. Archives must retain workflow state, respect project access, and avoid
implicit calendar changes. Treat an archive as a reviewed destructive effect even when an
ordinary update might qualify for the simple lane. Already-archived targets should be reported
as already satisfied, not re-archived or treated as newly saved effects.

For document folders, mount the existing explicit tree-archive semantics through a reviewed
worker adapter, including the selected child policy. A plain state update must not silently
choose descendant effects. Preserve START HERE checks and the legitimate current context doc.

### B. One explicit output-budget policy

Keep the ordinary actor cap at **12,000** initially. Add numerical guidance from the actual
request settings: that cap includes reasoning and arguments; propose **at most eight independent
mutation calls per stage**, and fewer for large document bodies. This is a starting policy to
validate, not a measured optimum. Maintain the complete commission separately. Update opening,
revision, and continuation instructions together; staging must never bypass independent review.

Use structured token/finish signals:

| Signal                                                                     | Action                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completion usage >= 10,000, or reasoning >= 6,000 and >= 80% of completion | Record `output_budget_pressure`. Keep a fully completed, valid pass; use reasoning off and bounded chunks on subsequent actor passes in this turn. This would flag the observed 7,991/8,066 reasoning pass before the capped round. Threshold values are tunable policy, not proof of failure. |
| `finish_reason=length`, or usage reaches the sent cap                      | Record `output_budget_exhausted`, whether the result contains no calls, partial JSON, or partial prose. Never execute calls from that pass.                                                                                                                                                    |
| First exhaustion, with retry/time allowance available                      | Discard the whole buffered pass and retry once with `reasoning: { enabled: false }`, the same 12K cap, and the chunk instruction. Preserve the healthy endpoint preference; budget exhaustion alone must not blacklist a provider.                                                             |
| Second exhaustion or recovery timeout                                      | Stop that recovery; emit a nonempty, receipt-grounded partial/failure answer. No chain of route retry, empty-answer repair, and extra budget repair for the same cause.                                                                                                                        |

Implement this shared actor recovery at the buffered pass boundary, with typed cause/usage fields
from the client; preserve the reviewer's separate decision/repair policy. An EOF/incomplete JSON
**below** the cap remains a transport/protocol issue with the
existing fallback behavior. A real network failure may still use configured fallbacks; this
policy does not change DJ's model defaults or pins.

Bound the recovery attempt to **45 seconds or the remaining turn allowance, whichever is smaller**,
with a separate first-progress deadline to avoid another accepted-but-silent 90-second stream.
Initial candidate: 15 seconds after headers for first progress on this recovery attempt only.
Do not confuse hidden reasoning with lack of progress or impose this new cutoff on every healthy
initial request. Preserve the existing turn deadline and finalization reserve.

The exact 10K warning cannot currently be promised mid-stream. SSE parsing sees reasoning bytes;
reliable token accounting comes from provider usage frames, commonly at completion. Check exact
usage whenever supplied, and otherwise flag at pass end. Do not call a bytes/4 guess an exact
reasoning-token count or cut valid JSON based on it. Prevention comes from chunking and switching
subsequent passes; bounded recovery handles the first surprise.

Persist the flag with turn, logical round, physical attempt, sent cap, completion/reasoning tokens,
effective reasoning setting, recovery action, and known route/provider. Distinguish missing usage
from zero. Record a terminal attempt receipt even if its async iterator is closed during retry;
keep failed-attempt spend in usage. Surface “Splitting this cleanup into smaller batches” as
progress while recovering, without exposing reasoning text.

### C. Approve correct chunks while preserving the full commission

Change the reviewer prompt and revision schema description to judge **the included calls** for
authorization, exact target, value, and effects. Missing independent calls are pending work,
not grounds to reject a correct chunk. Wrong targets, public-document surprises, invented
completion states, and uncommissioned calls still require revision or clarification. Never
execute a valid-looking prefix of a rejected or truncated batch.

Freeze the whole expectation on first approval and keep it immutable across chunks. Group
identical archive outcomes by exact IDs within the existing 20-outcome limit. Track saved,
already satisfied, pending, blocked, and uncertain effects separately; “already satisfied” needs
a fresh authoritative read and must not masquerade as a write receipt.

**Remove silent expectation weakening from this lane.** A missing field on an approved call is
not proof the user no longer wants it. Preserve the original obligation; if the reviewer supplied
an internally inconsistent checklist, use one bounded reviewer correction against the user
commission before writes, rather than rewriting the commission from the proposed calls. Add the
same-target/different-field regression before changing the existing reconciliation tests.

Continue ordinary stages while the budget permits. A premature final answer may be retried after
new durable progress; repeated prose with no new receipts must terminate rather than loop.
Never replay successful creates or retry effects whose outcome is uncertain.

**Account for the second budget:** the current limit is 12 provider passes, shared by actors,
reviewers, and repairs; buffered physical retries are additional attempts. Four eight-call-or-less
chunks need eight actor/reviewer passes, before reads and finalization. Reserve room for the next
review and a terminal answer, and stop cleanly when it is unavailable. Keep the default limit
initially; the acceptance criterion permits two turns. Persist remaining scope and receipts so
an explicit continuation resumes only unfinished work. Do not promise all 25 writes in one turn
or silently start a background turn. Consider a separately bounded large-batch pass allowance
only if the single acceptance replay shows it is necessary.

### D. Explain blockers and protect published documents

Carry the last review's concise user-facing reason through the exhaustion path, together with
structured issue codes/affected targets. Keep actor correction text separate if it contains
internal instructions. Bound each finding, but do not mechanically clip a commission-sized
paragraph at 400 characters. Render terminal text deterministically from those findings and
durable receipts so a failed provider cannot also erase the explanation.

Examples of the intended messages (not claims that this assessment saved anything):

- Zero writes: “Nothing was saved. The proposed cleanup included Julian Episode 390, which you
  didn't ask to archive, and marked Rod's payment task done. I'll need a corrected batch.”
- Partial progress: “Saved these 8 changes: … Still pending: … I stopped before the next batch
  because it exceeded the generation limit.” The numbers and items come from actual receipts.
- Published target: “Julian Episode 390 has a live public page. Archiving its working document
  leaves that page online.” If it was not specifically commissioned, keep it out of the batch;
  do not turn an unrelated target into a new approval request.

Before review, batch-load publication status for document targets and affected descendants and
give actor/reviewer the exact URLs and impact. At execution, recheck the bound publication state
to catch a page published after review. Reuse 112's caution/fingerprint logic. For a legitimately
requested live document, require an explicit user mention acknowledging the public effect or an
informed confirmation; do not accept an actor-authored boolean as that evidence. A broad “clean
up” cannot authorize an unrelated public document. Unpublishing remains a separate action.

For no-save notices, separate Jev's tool relevance from a structured **current-turn write
commission** decision (reuse its call if supported, rather than adding a new model pass just
for a footer). A relevance score is not that decision. Prefer a single host-owned receipt field
for confirmed write turns; read-only diagnosis needs none. Do not deduplicate by classifying
answer wording with regex or keyword lists.

### Delivery order and related work

1. Add sanitized incident fixtures and the missing-capability/completion regressions.
2. Share/expose canonical archive operations and publication checks with 112/113.
3. Implement budget classification, one recovery allowance, receipts, and nonempty failure text.
4. Enable partial review, immutable completion tracking, and bounded stage continuation together.
5. Carry actionable reviewer findings to the terminal response and fix the relevance/commission
   distinction. Consume 113's complete-list signals to reduce repeated discovery.
6. Run focused free validation, deploy the coherent web/worker/runtime changes, then request
   approval for the one paid acceptance replay below. Do not run or deploy 112's unrelated
   migration merely to assess 114; rehearse any migration this implementation actually needs.

## Validation

### Free baseline run during this assessment

Both commands ran sequentially through `test-gate`, with `VITEST_MAX_WORKERS=1`:

```sh
pnpm --filter @buildos/worker exec vitest run tests/agenticChatOpenRouterClient.test.ts tests/agenticChatMutationBatchReview.test.ts
pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/request-expectation.test.ts src/loop/finalization-guard.test.ts
```

Both exited 0; the runtime run passed 38 tests. These confirm the existing baseline, including
some behavior this plan deliberately changes. They do **not** demonstrate that 114 is fixed.
No full suite, paid test, or live cleanup was run.

### Free regression plan for the build

- Provider fixtures: exact cap with truncated arguments; all-reasoning/no-output cap; complete
  call just below cap; lying finish reason with cap-level usage; valid pressure-level completion;
  truncation below cap; missing usage; recovery with no first byte; cancellation and outer
  deadline. Verify the one changed retry, retained pin on budget exhaustion, no incomplete calls,
  complete start/end receipts, accurate attempt usage, and nonempty terminal output.
- Review/loop fixtures: 25 resolved changes split across several correct batches; prerequisite
  IDs still deferred; wrong Julian ID and unrequested `done` still rejected; digest binding
  unchanged; omitted targets/fields/values remain pending; failed or uncertain writes do not
  count as done; grouped outcomes fit the schema; already archived records are not rewritten;
  pass exhaustion and explicit next-turn continuation do not replay effects. Use scripted
  reviewer responses: these tests prove orchestration, not a live reviewer's interpretation.
- Archive adapters: canonical task archive/restore, preserved state, no calendar deletion,
  project access, goal archive semantics, folder child modes, current START HERE protection,
  already archived targets, and receipts accepted by completion matching.
- Public documents: live and unlisted pages, published descendants, concurrent publish after
  review, plain document state updates as an alternate archive path, informed confirmation,
  and proof that archive leaves the public snapshot live. Share the existing 112 verifier tests.
- Messages: all three saved reviewer findings, zero-write and partial-write exhaustion, empty
  provider timeout, read-only ws01–ws03, and a real unsatisfied write commission. No lexical
  intent or prose-claim classifiers.
- Extend the nearest existing worker suites (`agenticChatOpenRouterClient`,
  `agenticChatMutationBatchReview`, `agenticChatTurnProvider`, `agenticChatMutationSurfacePolicy`),
  runtime `request-expectation`/`completion-receipt`/`finalization-guard`, and shared archive tests.
  Run only changed test files, sequentially. Use the web check only if Svelte is changed; rehearse
  migrations with role probes where grants/policies change.

### First paid acceptance replay — cleanup acceptance failed

DJ explicitly approved one cleanup replay after deployment and the quoted per-turn estimate.
The exact ws04 message was replayed once in the original session, after verifying the current
records and all intervening history. No subsequent user message changed the commission; one
automated freshness entry was present. Four proposed task archives were already satisfied.
The replay used the production worker and the original session history (compressed by the
deployed preparation code), not a separately fabricated context. No rerun or second turn was made.

- **Turn:** `bf1ffac2-62a6-4be7-b0a1-e9d80cc4a710`, 2026-09-30 02:02 UTC (2026-09-29 local).
  Web/worker preflight matched clean deployed commit `fbc7b79fa` immediately before the replay.
- **Result:** about **48 seconds**, nonempty reply, **0 saved effects**. The book-loop harness's
  `completed` assertion passed, but the actual cleanup acceptance **failed**. Full before/after
  project, task, goal, plan, document, tree, and public-page records are unchanged. The other
  snapshotted ontology tables also have zero recorded changes.
- **Cost:** **$0.03486274** in per-turn logs, all backed by provider usage costs: Jev plus five
  DeepSeek V4.1 Flash passes. No semantic reviewer call ran. The production key counter increased
  **$0.029914** over the runner's observation window; it differs from the turn receipts and is
  not a precise isolated charge. Preserve both figures instead of treating the counter as exact.
- **Failure:** the actor proposed the Rod payment **task** ID as `document_id` in an archive call.
  The preview correctly rejected that call. Because one schema/preview issue existed, the batch
  skipped independent review and then ran the legacy execution-contract validator against all
  eight proposed mutations. Even the valid calls acquired “outside the independently approved
  turn contract” errors. Repair feedback asked for a contract declaration that the batch surface
  does not expose. The turn reached forced synthesis without a reviewer, frozen expectation, or
  cleanup manifest; its completion receipt is `request_unverified`, not fulfilled.
- **Additional model errors:** the reply confused the task-ID failure with the Rod folder,
  substituted nightly cleanup suggestions for parts of the original batch, omitted the Rod goal
  and Logan reminder, and again inferred archived-task status from document counts. It proposed
  including other Julian material in a future turn. None of those proposals changed data.
- **Budget evidence:** one actor pass spent 6,237 of 6,396 completion tokens on reasoning; the
  pressure policy switched subsequent actor passes to zero reasoning. The pass did not hit the
  output cap, so this replay does not validate the exhaustion retry. Durable `llm_pass_count` was
  zero despite six usage records, and provider-attempt observations were absent; receipt
  completeness still needs investigation before claiming that part is verified in production.

Local follow-up repair:

- In the batch lane, schema/preview errors now return through bounded repair before execution
  authorization checks. No invalid proposal executes. Corrected calls still go through the exact
  batch digest and independent review; the legacy contract lane retains its existing checks.
- Repair retains the entire unexecuted actor proposal so valid sibling calls are not lost. It
  does not feed server-injected `_archive_review` fields back as actor arguments or represent any
  withheld call as saved.
- A focused offline regression reproduced the production contract-error poisoning before the
  fix and now proves two corrected archives remain withheld until independent approval. The
  coordinator, archive preview, and repair-policy suites pass **196 free tests**. Worker
  typecheck, targeted formatting, and `git diff --check` passed. These checks do not prove that
  the deployed actor will correct the mistaken entity kind or preserve the full commission.

Evidence: `output/book-loop/ws06-tasker114-cleanup-replay.json` and
`output/tasker114-cleanup-replay/{expected-manifest,scorecard,before,after,evidence,run-cost-counter}.json`.
These ignored files contain private project records; the scorecard is the compact failed verdict.

### Second paid acceptance replay — four saved effects, then uncertain failure

DJ explicitly authorized one retry after the follow-up deployment. Free preflights before and
after the run matched clean web/worker commit `baa0f470c`; the acting model remained
`deepseek/deepseek-v4.1-flash`. The estimate was $0.04–$0.10, based on the same actor's first
replay. The exact ws04 message ran once in the original session with `--retry=0`. Fresh before
records included intervening Context and Thinking log updates; cleanup targets remained pending.
No additional paid turn ran, and no source code or production ledger was changed after the test.

- **Turn:** `a5d3e7a2-c812-419a-829c-7a22e6932618`, 2026-09-30 02:29–02:33 UTC
  (2026-09-29 local), **202.17 seconds**.
- **Result: failed cleanup acceptance.** One six-call stage reached independent approval after
  two revisions. Four effects have both successful durable receipts and matching row changes:
  Maryland plan completed; Maryland goal renamed to “Work with local Maryland creators” and
  parked in draft with a side-goal description; Julian Pitch archived; first iCode outline
  archived. Canonical-tree removal and the Julian parent cache updated as expected. Tasks,
  protected documents, public pages, and unrelated goals/plans are unchanged.
- **Cost:** **$0.04092807** in provider-backed per-turn logs, versus **$0.042225822** key-counter
  delta over the runner window. Preserve both; shared traffic/timing makes the counter an
  imperfect isolated charge. Nine usage records: one Jev, three DeepSeek actor calls, four Luna
  reviewer calls, and one normal-route GLM 5.3 reviewer fallback. A Luna approval hit its
  4,000-token cap before the fallback approved; actor output exhaustion did not occur.
- **Book Research failed without a write:** distinct document archives ran in the same graph
  layer as the plan/goal, with width six. A sibling archive advanced the shared project tree
  after Book Research read version 93, producing a known structure-version conflict. Individual
  document IDs are insufficient conflict resources for project-tree writes.
- **Second iCode outline is uncertain:** effect `094a68ea-f479-542c-853d-c2f985636ab3` remained
  in the adapter for about **125 seconds**, then terminalized `uncertain`. The document is still
  draft in after/current reads. A fresh read-only archive snapshot differs from the reviewed
  snapshot only in `tree_fingerprint`: sibling removal renumbered this root node from order 11
  to 10. That fingerprint includes incidental order, invalidating an otherwise unchanged target.
  The exact underlying adapter error is not established by these logs; the later read does not
  reclassify the durable uncertain effect or authorize retrying it.
- **Empty terminal reply:** the turn failed with `uncertain_external_commit`, no assistant
  message, and no persisted completion manifest. That failure class bypasses partial-completion
  finalization, so the four successful changes were not disclosed in a durable chat answer.
  The book-loop test passed its terminal-completion assertion; it did not pass cleanup acceptance.
- **Scope drift remains:** the reviewer repeated the previous reply's incorrect Rod-folder scope
  claim despite current server archive facts, excluded the commissioned Rod task, and supplied
  altered candidate IDs. Its approved expectation omitted the rest of the original task/Tacemus
  batch, Rod goal, and Logan reminder. The full human-reviewed oracle remains authoritative for
  acceptance. `llm_pass_count` still reads zero despite nine usage rows; provider-attempt receipts
  remain absent.

The next repair should:

1. Add a worker-owned project-tree conflict resource for archives and other tree mutations, so
   same-project calls serialize while independent work can remain parallel. Regress a reviewed
   multi-archive stage against changing versions, including known failures and separate projects.
2. Bind archive review to affected records, publication, parent/subtree topology, and meaningful
   node facts while tolerating incidental sibling-order renumbering. Retain rejection of actual
   moves, descendant changes, and publication changes. Rehearse any new migration against
   production before applying it. Preserve structured SQLSTATE/rollback information through the
   archive service so known conflicts repair promptly; transport failures must remain uncertain.
3. Persist a truthful failed/partial disclosure and continuation receipt when successful effects
   coexist with uncertainty. Keep the failed classification, identify the uncertain effect, and
   prohibit automatic replay. Do not simply add uncertainty to the completed-success lane.
4. Ground reviewer corrections in current server facts and the original commissioned batch.
   Freeze the full expectation independently of stage coverage; validate candidate IDs against
   available structured facts. Regress the earlier mistaken task-ID explanation without letting
   it override current document scope. Investigate missing attempt telemetry separately.

Evidence: `output/book-loop/ws07-tasker114-cleanup-replay.json` and
`output/tasker114-cleanup-replay-2/{expected-manifest,scorecard,recovery-manifest,before,after,evidence,effects-response,run-cost-counter}.json`.
Filtered worker logs and a read-only current archive snapshot are saved beside them. The recovery
manifest records four saved, four previously archived, 22 pending, one blocked, and one uncertain
outcome; it is an inspection artifact, not a server completion receipt. Source changes for the
next repair have not been made in this test turn.

### Acceptance specification for a separately approved next run

The original acceptance oracle still applies, with the successful and uncertain effects above
reconciled first:

After the build and free checks, propose **one ws04-message replay** on project
`f85b6c5f-59fb-4e4c-8654-748f793d8f4b`, with the original ws01–ws03 context and commissioned
targets preserved. Use a fresh acceptance session with that history or the original session only
after verifying its intervening messages. “The rest of the batch you proposed” is not reproducible
as a standalone message. Re-read current state first; already completed work must not be undone
to recreate the incident.

The production actor observed here is `deepseek/deepseek-v4.1-flash`, with reviewer
`openai/gpt-6-luna`. Actor spend on ws05 was **$0.047781**; actor spend logged on ws04 was
**$0.088658**, including $0.022485 of estimates. ws05's three reviews cost **$0.009430** total.
A planning allowance is roughly **$0.06–$0.10 for one turn**, based on this same actor's incident
usage; a successful chunked turn's cost remains uncertain. Reconfirm the effective production
`AGENTIC_CHAT_OPENROUTER_MODEL` and reviewer before requesting approval. The book-loop runner uses
the deployed worker; a local environment pin does not set its actor. No other model's measured
spend should stand in for this estimate, and a second turn/rerun needs its own explicit approval.

Use the free deployment/preflight checks first, verifying web/worker provenance and the correct
real project separately from the harness account. Score against a deduplicated target/action
manifest, not a hard-coded write count: correct Maryland plan/goal changes, requested partial
documents, applicable Rod/Tacemus cleanup, and Logan's unsent-proposal record; public/unrequested
documents and current work remain untouched. Require complete or explicitly pending receipts,
bounded attempts, no empty reply, and public-page disclosure where applicable. Preserve the new
turn record and scorecard. A natural replay may not hit the cap after chunking; synthetic free
tests must prove recovery rather than forcing extra paid failures.

## Next repair implemented locally — 2026-09-30

This earlier implementation entry predates the migration application and final repairs recorded
in the closeout below. Its pending-work list describes that earlier checkpoint.

This change set addresses the archive execution failures and empty terminal reply from ws07.
It is not a production acceptance result. No paid test, production cleanup write, effect-ledger
reconciliation, or migration application was performed in this implementation turn.

Implemented:

- Reviewed document archives take an exclusive scheduler resource for the server-verified
  project, plus the affected document rows. Sibling archives and document creates therefore
  execute in order; unrelated projects and independent row edits can still run together.
  Missing, mismatched, or noncanonical archive facts fail closed to serial execution. The
  graph regression failed before the policy change (three failures), then passed.
- Archive review fingerprints bind the target subtree, parent IDs, and node attributes while
  excluding incidental `order` values and child-array ordering. A sibling's renumbering no
  longer invalidates review. Target/descendant changes, actual parent moves, protected context
  documents, and changed publications remain guarded by the existing atomic writer.
- The archive service preserves returned PostgreSQL error codes, details, and hints in a typed
  error. Known review/version conflicts require fresh preview and independent review. Confirmed
  transient rollbacks use the executor's existing bounded retry policy. Transport failures
  remain uncertain; no uncertain write is automatically replayed. This does not establish
  the cause of ws07's 125-second archive attempt.
- An uncertain attempted mutation is recorded with its exact call arguments and canonical
  effect ID for terminal evidence. Failed turns with verified saved writes now persist a
  server-written summary and `request_uncertain` receipt. They stay **failed**. Metadata retains
  canonical uncertain effect IDs. The cleanup manifest distinguishes saved, already satisfied,
  known blocked, unattempted pending, and actual uncertain targets (including recursively
  archived descendants; promoted children are excluded).
- The terminal SQL path stores only the server summary in assistant conversation history.
  Failure events retain the existing append-only stream prefix; the terminal stream appends
  the disclosure. Raw failed model text remains reconnect-only. Terminal replay and the owner/
  generation fences remain intact. Local SQL regressions caught and resolved the wrapper's
  hard-coded null message identity and the stream-prefix integration issues before deployment.
- Reviewer guidance explicitly connects an accepted prior proposal to the current commission,
  prioritizes current server archive facts over stale assistant scope claims, and requires exact
  copied IDs. This is prompt guidance, **not** a new deterministic candidate-ID validator or
  evidence that production scope coverage is repaired.

Validation (free, local):

- Worker execution policy, execution control, turn executor, and mutation executor: 179 tests
  passed. The policy/reviewer batch checks passed 22 tests (10 policy tests overlap); the final
  turn-executor rerun passed all 131 tests after canonical effect IDs were added to metadata.
- Shared archive service/gateway: 18 tests passed. Runtime cleanup manifests/completion receipts:
  36 tests passed. These runs cover 245 distinct focused tests across the selected files.
- Worker and shared-agent-ops type checks passed. Runtime package build passed; its regenerated
  declarations were required before the worker type check could see the new ledger field.
- A name-filtered worker rerun unexpectedly entered unrelated PostgreSQL fixture setup and was
  stopped. The exact turn-executor file was then run successfully without a name filter. The
  interrupted run is not credited as validation.
- Migration `20260930035703_chat_cleanup_archive_conflicts_and_failure_receipts.sql` rehearsed
  successfully against a fresh read-only production schema snapshot captured
  `2026-09-30T04:09:28Z`. Archive/failed-receipt assertions and the standing archived-scope check
  passed. Zero security/data findings. The new helper is intentionally server-only.
- The client role probe found no new regressions. Its existing anonymous read failure on
  `onto_project_structure_history` (`permission denied for table onto_actors`) remained;
  authenticated reads had no failures before or after.

Saved local evidence: `output/tasker114-cleanup-repair/rehearsal.json` and the focused validation
logs alongside it.

Deployment order: apply and record the rehearsed migration **before** deploying the new worker,
then verify web/worker provenance with the free preflight. An in-flight preview from the old
fingerprint format will safely require fresh preview/review; do not bypass that conflict.

Still pending: production acceptance of this change set; authoritative reconciliation of ws07's
uncertain effect before any replay of that target; a deterministic candidate-ID grounding check
and proof of full commissioned-scope coverage; failed-cleanup continuity integration beyond the
persisted receipt; and investigation of missing provider-attempt/pass-count telemetry. Any new
paid replay still requires fresh explicit approval with the effective acting model and cost
estimate. Preserve current saved work and the existing production scorecard.

## Final implementation and production migration verification — 2026-09-30

The remaining implementation repairs are complete locally. This is **not** a passing production
cleanup acceptance result. No paid run, cleanup mutation, or uncertain-effect reconciliation was
performed in this turn.

Applied to production individually, then recorded with `supabase migration repair`:

| Version          | Repair                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260930035703` | Archive fingerprints tolerate incidental sibling renumbering; failed partial receipts persist a server summary while retaining failed status and uncertainty.                       |
| `20260930045947` | Provider-attempt observations accept bounded `max_output_tokens`, enumerated `reasoning_effort`, and boolean `output_budget_recovery`.                                              |
| `20260930051136` | Output-cap/pressure observations accept a strictly validated numeric `output_budget` object; the existing `research_review` pass role is accepted alongside the other worker roles. |

The missing telemetry has a reproduced schema-contract cause: the deployed worker adds budget
metadata to every provider attempt, but the old database allowlist rejects it with
`agentic_chat_execution_observation_payload_not_redacted`. The free fixture fails on the old
production schema, then passes with the migrations. Final provider review also identified the
separate cap/pressure object and research-review role omissions. All are now validated without
allowing prompts, tool arguments/results, reviewer prose, or arbitrary strings into this ledger.
Duplicate attempts do not inflate logical pass counts. Historical ws07 observations are not
backfilled, and this fix does not establish the cause of its 125-second archive attempt.

Additional code repairs:

- The worker carries a host-only identity catalog from admitted structured server context and
  successful tool results. Reviewer candidate IDs must belong to that catalog or server-bound
  archive facts. Proposed IDs cannot ground themselves. Defect findings may name a loaded record
  or an exact rejected call target, including a wrong proposed ID; that is rejection evidence,
  never approval authority. Invented references trigger one bounded internal review repair,
  rather than becoming user ambiguity. Opaque calendar IDs retain exact case.
- Completion checklist targets can include earlier archived records absent from active context.
  The checklist still does not authorize writes; the existing independent postcondition reader
  verifies archive no-ops before crediting them. Later approvals cannot shrink the frozen
  commissioned scope. Local fixtures prove preservation of all supplied targets during a correct
  partial stage; they do not prove a model understood every clause of the live user request.
- Failed partial receipts atomically retain a bounded `cleanup_continuation` in their durable
  assistant metadata, built from reviewed expectations and actual receipts. Owned history
  projects the latest failed assistant's full commission/manifest as escaped, untrusted recall.
  Saved, already satisfied, pending, blocked, and uncertain targets remain distinct. Continuation
  requires current reads and normal independent review; uncertain writes are not retried.
- Compressed history retains the latest assistant reply whole up to 24,000 characters, including
  when several user messages move it outside the normal tail. This preserves the complete
  proposal a follow-up can accept, instead of silently dropping later cleanup items at 1,200
  characters. Oversized replies remain bounded. Selection uses role/recency, never intent regex.
  The separate bounded failed-cleanup packet also survives compression whole.
- Prepared-prompt fingerprints include the new history projection version. Old cached history
  safely falls back to fresh preparation even when prompt/tool schemas still match.
- Final provider checks caught four old assertions that omitted the existing recovery-start
  event. The fixtures now require that event plus the terminal budget error; they still prove
  that truncated/incomplete output never executes and recovery does not chain another retry.

Verification evidence is saved in `output/tasker114-cleanup-repair/`:

- `final-rehearsal.log`: all three migrations together, archive/failure-receipt/provider-budget
  regressions, standing archived-scope checks, and role probe passed. Zero SECURITY/DATA findings.
  The intentional server-only helper note remains. The preexisting anonymous history read
  failure has no new regression; authenticated reads remain clear. Snapshot ledger warnings are
  stale cache information, superseded by the live read-only verification below.
- `production-final-verify.json`: all three ledger entries exist; all five changed function bodies
  exactly match rehearsal. They use invoker security with fixed search paths, service-role execute
  grants, and no anonymous/authenticated execute grants.
- `final-worker-tests-all.log`, `final-web-tests-all.log`, `final-runtime-tests-all.log`, and
  `final-archive-tests.log`: respectively **478 worker, 95 web, 44 runtime, and 18 archive tests
  passed** (635 distinct tests). No paid provider/API calls.
- Runtime build, worker/shared source type checks, web Svelte checks, formatting and whitespace
  checks are recorded alongside those logs. Interrupted or initially failing runs are not
  acceptance evidence; the final passing runs supersede them.
- Free `pnpm agentic:prod-battery --preflight-only` passed, confirming production actor
  `deepseek/deepseek-v4.1-flash` and matching web/worker commit `baa0f470c`. Its report is
  `output/agentic-prod-battery/2026-09-30T05-17-21-361Z`. This verifies the previous deployment's
  prerequisites; the new web/worker code has not been deployed by this turn.

**Remaining production acceptance:** deploy the new web and worker together, rerun free provenance
checks, obtain authoritative reconciliation for effect `094a68ea-f479-542c-853d-c2f985636ab3`
before replaying the second iCode target, then request fresh explicit approval for one cleanup
replay. Preserve the four saved changes and the existing scorecard. Verify the full original
commission, partial-stage continuation, nonempty receipts, bounded recovery, verified archive
no-ops, and published-page disclosure. A later draft read alone is not a rollback receipt.

No-op verification remains archive-specific. A read-only turn with no reviewed batch stays
`request_unverified`; arbitrary scalar no-ops are not credited. A dedicated read-only expectation
review, if desired, is separate work rather than permission to trust actor completion claims.

## Absorbed from 112 — Tasker 112 — Project Review roll-up: one living "Project cleanup" change set per project (2026-10-04)

112 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — DONE.** Shipped `14c020589`, `6b6970605`, `fbc7b79fa` and the migration;
deployed. Paid acceptance passed ($0.029). **Left:** only non-blocking follow-ups. Move the one
that matters to 114: click through the card live (apply, "Not needed", phone, then archive → next
pass closes it). **Priority:** none. **Recommend:** close & delete.

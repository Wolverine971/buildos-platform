<!-- tasker/101-gate-case2-task-batch-latency.md -->

# Tasker 101 — Case 2 (five tasks + dependencies) is too slow: 50–62 s against a 60 s limit

**Status:** parallel creates kept (DJ: roll forward). Root cause = lock upgrade in the task-create RPC. Lock-first migration `20260924193000` APPLIED TO QA only (5 concurrent creates: 16–97 s → 0.7–1.0 s); prod apply + $0.03 case-2 rerun pending DJ · **Opened:** 2026-09-24 · **Owner:** open (another agent)
**Read first:** [Investigation 2026-09-24](#investigation-2026-09-24) corrects parts of the analysis below.
**Source:** gate run `output/agentic-gate/tasker100-20260924T025502Z` (commit f46e9090c, acting model
`deepseek/deepseek-v4.1-flash`). Case 2 rep 1 took **62.0 s** and failed the gate's 60 s limit; reps 2
and 3 took 53.4 s and 50.8 s. Earlier gates: 70.1 s and 76.2 s (`tasker92-*` runs). Case 2 fails the gate
on timing whenever one slow provider sample lands on it.
**Scope guard (DJ):** fix what helps every user; free local tests first; every paid run (gate,
replays) needs DJ's explicit approval with model and cost stated (gate ≈ $0.30 on DeepSeek).

## Investigation 2026-09-24

The first analysis below had the right stages but three wrong readings. Evidence and fixes:

**A. The reviewer spends ~90% of its output on the checklist, and re-copies it on review 2.**
In all six case-2 reviews, `request_expectation` is 86–99% of the approval arguments (1,230–1,617
tokens, 7.5–12.8 s). The decision itself (reason, SHA, candidates) is ~150 tokens. On review 2 the
approval tool still offered the optional field, and its description said "Preserve it unchanged on
subsequent approvals" while the system prompt said "Omit". The model re-emitted the whole frozen
checklist (~6 s). The harness only compares that copy with the frozen one and fails the review if it
drifts, which adds a retry risk. Gate-wide, later reviews ran slower than first reviews (median 950 vs 420 output
tokens, 6.4 s vs 4.2 s).
**Fixed (uncommitted):** later approvals are no longer offered `request_expectation`
(`provider/review/mutation-batch.ts` `withRequestExpectationSlot`); the stale sentence is removed from
`controls.ts`; reviewer cache key bumped to v3. Expected: review 2 ≈ 9 s → ≈ 2–3 s.

**B. Every watchdog kill in the gate was a healthy stream that was thinking.** OpenRouter's free
generation stats (`GET /api/v1/generation?id=…`) for all 9 "insufficient progress" aborts show them
generating at 80–200 tok/s when cancelled, with 50–95% of those tokens being hidden reasoning (case 2
rep 1: 523 tokens, 487 reasoning; rep 3: 680, 544). The request sent `reasoning: {exclude: true}`, so
the watchdog saw thinking as silence. 8 of 9 fired on the very first check (4.3 s), whose window was
measured from stream open and so included prompt processing (OpenRouter latency 2.0–3.7 s).
**Fixed (uncommitted):** watched V4.1 passes request streamed reasoning (`exclude: false`) and count it
as progress without surfacing it (`openrouter/sse.ts`); the first window starts at the first byte of
any output (`openrouter/watchdog.ts`). Real trickle streams are still aborted. New tests fail on the
old logic. Expected: −4 to −7 s on reps that hit a kill (2 of 3 case-2 reps).

**C. Production does not pay the gate's database time.** Prod chat worker = Railway us-west2 ×4
(next to Supabase us-west-1); web = Vercel sfo1. The gate runs web + worker on DJ's laptop in Maryland
against a west-coast test DB: ~95 ms of network per call, with the DB doing 2–20 ms of work. In the
rep-1 create window, 103 calls took 13.1 s of client time but only 1.2 s in the DB. Prod today:
`create_onto_goal` executes in p50 199 ms (≈ 25–35 ms/call); turn → first model call p50 0.95 s (gate:
3.2–3.7 s). Estimated prod case 2 today: ≈ 37–48 s per rep, of which DB is ≈ 4 s. Round-trip cuts (#2
below) matter mostly for the gate's fidelity. Model passes matter for every user.
(Prod effect rows before ~09-12 are unreliable for latency: a local worker was pointed at prod.)

**Projection (gate, case 2) with A + B:** rep 1 ≈ 51 s, rep 2 ≈ 46 s, rep 3 ≈ 41 s (conservative: B
counts only the killed pass). Still above the 35 s p50 target. Interactive waterfall with every
projection and its assumptions: https://claude.ai/artifact/Pb28k6B1SzNjeYHYsQa2S7 What remains, in order of size:

1. Review-1 checklist (~6–7 s on case 2, ~1.5–2 s on every write turn): compact the outcome format,
   or produce it in a parallel call off the critical path (needed only at the next review or at
   completion). DJ decides; this touches the reviewer, so measure its catch rate.
2. One batch for creates and their dependencies (fix candidate 1 below): now ≈ −5 to −8 s, since
   review 2 is already cheap.
3. Round trips (fix candidate 2): gate −6 to −9 s, prod ≈ −1 to −2 s.

Validation run: `vitest` on agenticChatLatencyRecovery, agenticChatOpenRouterClient,
agenticChatMutationBatchReview, agenticChatTurnProvider, agenticChatTurnExecutor,
agenticChatToolExecutionAdapter, agenticChatTerminalTextIntegrity: 475 passed; worker typecheck and
lint clean. **Gate not run** (paid; needs DJ's approval).

### Follow-up 2026-09-24 (DJ: setup, DB writes, killed pass, GPT-6 Luna, reasoning)

- **Watchdog history.** All 59 "insufficient progress" kills in 12 saved gate runs, checked with
  OpenRouter generation stats: 41 (70%) were healthy streams (median 169 tok/s, mostly reasoning); 12
  were slow (<60 tok/s, 7 of them on Venice). In the runs from 09-22 to 09-24, 12 of 13 were false. Fix B keeps killing the slow
  ones and lets reasoning run. OpenRouter documents the fields as `delta.reasoning` and
  `delta.reasoning_details`, and both are counted.
- **Prod is not the gate's model.** The Railway chat worker has
  `AGENTIC_CHAT_OPENROUTER_MODEL=deepseek/deepseek-v4-flash` (V4, not V4.1): mostly DeepInfra at 34
  tok/s, GMICloud 66–100 tok/s. Acting is 75–90% of prod turn time; the prod median turn (3 days, n=24)
  is 34 s. Fix B does not apply to V4. The gate validates V4.1.
- **Prod setup/finish (measured, 3 days, n=24):** turn created → first model call p50 0.89 s (p90
  2.2 s); last pass → terminal p50 0.69 s (p90 1.1 s). Gate: 3.6 s and 1.2 s. Prod queue wakes land
  (health endpoint: `wakesReceived` 7, subscribed). The gate's wakes all time out at 150 ms (17×
  `agentic_chat_queue_wake_degraded`), so gate turns wait for the 1 s poll (median 882 ms).
- **Startup levers** (gate / prod saving): Jev tool selection off the critical path (0.4 / 0.4 s);
  parallel admission reads (0.5 / 0.1); a database-side wake on commit (0.65 / ~0); prepared
  admission for first turns (1.1 / 0.3); snapshot write in the background, Start Here folded into the
  context RPC, and one claim RPC (~0.9 / ~0.2). Prod estimate ≈ 1.5 s → 0.3–0.4 s from send to the
  first acting pass.
- **DB writes.** Case 2 makes 110 serial round trips (gate ≈ 11.6 s, prod ≈ 3.1 s). Concurrency is
  already on (4), but `create_onto_task` locks the whole `project_id`
  (`tools/execution-policy.ts:21-35`), so 5 creates ran in layers `[1,1,1,1,1]` (10 serialization
  edges). The create RPC has no project-wide computation (no positions, no project-row update).
  Redundant calls: `ensure_actor_for_user` twice per create; project summaries and `users.timezone`
  re-read per write (the gateway context is rebuilt per call, so its timezone cache always misses;
  `timezone` can be passed pre-resolved); assignee fetch always `[]` without input; links reload
  permissions twice. Memoize, dedupe, fold, and stop awaiting stream events: 110 → 24 trips.
  Adding concurrent creates: ~9 trip-equivalents.
- **Fire-and-forget.** Prod write failures in 60 days: 9 of 376, none a DB rejection of a valid
  ontology write (6 delegate dispatch, 3 argument validation). True fire-and-forget still breaks crash
  recovery (a started effect becomes `uncertain` after "done" was said), receipts (receipt rows require
  a succeeded effect), links (they 404 on tasks not yet written), and non-idempotent link
  duplicates. The latency is round trips, not validation. The "don't wait on anything you don't need"
  version gets ≈ the same speed.
- **GPT-6 Luna** (DJ switched the gate env): unmeasured on our reviews; prod is still on 5.6 (the
  latest chat-worker deploy failed). OpenRouter 30-minute stats, same tier: standard ≈ +25%
  throughput vs 5.6 at half price; `openai/fast` ≈ +50%; `openai/flex` p50 latency 29 s (degraded
  now). The route orders by provider only (`['openai','azure']`), so tier choice is OpenRouter's.

### Lean build + prod switch 2026-09-24 (DJ picked: lean; prod → V4.1 now; Luna replay)

**Prod (done, DJ OK "Now"):** applied `20260924000000` + `20260924000100` to prod per-file
(`db query --linked --file` + `migration repair`), verified (7 functions, lease columns, recovery
table, trigger). Railway `AGENTIC_CHAT_OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash`. Chat worker
deployed `f9135820f` at 15:09Z, healthy, recovery sweeps OK. Reviewer default is GPT-6 Luna in code.
No prod chat turns had run on it by 15:40Z.

**GPT-6 Luna replay ($0.013, 3 captured case-2 review-1 requests × 3 routes):**
gpt-5.6-luna 12.3 s avg; gpt-6-luna as routed 7.6 s; gpt-6-luna `openai/fast` 5.7 s ($0.0023/review).
The reviewer order is now `['openai/fast','openai','azure']` (`host/bootstrap.ts`).

**Lean build (uncommitted, tests green):**

- Task creates share their project hold (`tools/execution-policy.ts` `SHARED_PROJECT_CREATES`): 5
  creates compile to one layer. Document creates and project updates stay exclusive. The create
  RPCs insert only; triggers touch at most one per-project row (context invalidation), so no deadlock.
- Per-turn gateway lookup memo (`GatewayLookupMemo` on the gateway context;
  `mutations/gateway-turn-memo.ts`, shared by the table and create-project adapters). The actor,
  project summaries, and timezone are resolved once per turn execution; project summaries are dropped
  after any `onto.project.*` write; a failed lookup is not kept. All 13 handler `ensureActorId`
  calls go through `contextActorId`.
- `createTask` skips the assignee read unless assignees were requested or it's a replay.
- Web admission (`worker-turn-preparation.server.ts`, `materialized-context-cache.server.ts`): reads
  run concurrently beside the access check (a denial still outranks other errors; nothing durable
  happens before access); the snapshot write runs in the background via `runAfterResponse`. ≈6 serial
  calls off the path: ≈0.74 s gate / ≈0.17 s prod.
- Queue wake (`worker-queue-wake.server.ts`): admission still waits at most 150 ms but no longer
  aborts the POST; it finishes in the background (hard abort 5 s). Fixes gate turns waiting for the
  1 s poll.
- **Skipped on purpose:** un-awaited tool_call/tool_result events (loosens the "tool card before
  side effect" crash invariant for ~0.4 s gate once creates are parallel); Jev earlier inside the
  worker (~0.1 s); the Start Here reads (dependent reads; fold into `load_fastchat_context` =
  migration); the idempotency lookup in `turns/+server.ts:109` (≈120 ms, route file).
- Tests: worker 325 + 3 memo + policy; shared gateway 107; web 78 + 103 route/related. Typecheck:
  none in changed files. The tree has other sessions' in-progress email/Qwen edits that break the
  worker typecheck (13 errors, not in these files).

**Projected case 2 after A+B+lean (gate):** writes ≈15 s → ≈5.5 s (creates: 8 calls each, two
parallel waves ≈1.8 s; links: 11 calls each, still serial ≈3.6 s); setup ≈3.6 s → ≈2.2 s; reviews
≈17–27 s → ≈8 s (fast tier ≈5.7 s + a decision-only review 2). Reps ≈37 / 23–28 / 27 s, median
≈28 s vs 53 s measured. Estimated; the gate is the measurement.

### Shipped 2026-09-24 (DJ pushed d27da1ccd + e4c82b356)

- The lean build landed in DJ's d27da1ccd. Vercel web deployed. The Railway chat-worker build of
  d27da1ccd failed with TS7006 at `provider/openrouter/validation.ts:89` (another session's edit);
  prod stayed on f9135820f. The fix (typed `validated`) landed in e4c82b356. The chat worker has been
  healthy on `e4c82b356` since 15:48Z (`/health` release + clean provenance).
- Re-verified after deploy: web admission tests 67/67 (`worker-turn-preparation`,
  `materialized-context-cache`, `worker-queue-wake`, `email-surface-mount`); worker typecheck clean.
- Prod has had no chat turns since the 15:09Z switch (the last LLM call was a 14:59Z daily brief), so
  V4.1 + GPT-6 Luna `openai/fast` is unmeasured on real user turns. Re-run
  `llm_usage_logs where turn_run_id is not null and created_at > '2026-09-24 15:09Z'` after the next turn.
- DJ asked about `~deepseek/deepseek-v4-flash-latest`: it's an alias for `v4-flash-0731`
  (July, V4 line), not newer than V4.1 (Sep 10). The $0.03/$0.32 headline is Relace FP4 at
  ~46 tok/s; full-precision hosts run 72–85 tok/s vs V4.1's 150–190. Kept V4.1; quality A/B not run.

### Case-2 diagnostic 2026-09-24 (DJ: "just run case 2") — parallel creates REVERTED

Run: `AGENTIC_GATE_DIAGNOSTIC=true AGENTIC_GATE_REPETITIONS=3 AGENTIC_GATE_DIAGNOSTIC_SCENARIOS=cedar-02-task-batch`,
V4.1 (Together) + GPT-6 Luna, tree = e4c82b356 + another session's tasker-102 WIP (falls back cleanly).
Output `output/agentic-gate/case2-lean-2026-09-24/`. Cost **$0.028** (OpenRouter usage delta).

| Rep | Result                            | Total                              |
| --- | --------------------------------- | ---------------------------------- |
| 1   | error (uncertain_external_commit) | 253.8 s                            |
| 2   | error (uncertain_external_commit) | 197.7 s                            |
| 3   | completed                         | 116.3 s (85.7 s of it the creates) |

- **Parallel task creates are harmful.** With the shared project hold, four concurrent
  `onto_task_create_with_relationships_atomic` calls in one project blocked each other _inside the
  database_. The worker HTTP trace shows 50–125 s per call (`upstreamServiceMs` 50–110 s), with
  PostgREST 504s at 125 s and 500s. A plain `onto_project_logs` insert took 10 s during the burst.
  The claim above ("insert only, no deadlock") was wrong. REVERTED: every mutation holds its
  project exclusively again (`tools/execution-policy.ts`, and the policy test now asserts layers
  `[1,1,1,1,1]`). 168 targeted tests pass; the worker typechecks. **Open question for tasker 102:**
  why do concurrent creates in one project stall for minutes rather than queue for ~1.7 s each?
  The web UI plus a chat writing to the same project could hit the same thing.
- **Fix A works.** Review 2 took 2.7 s and 114 output tokens (was 8–13 s re-copying the checklist).
- **Review 1 is still about 7.5 s** (7.2 / 7.2 / 7.7 s, 1.0–1.3K output tokens: the checklist).
  The 5.7 s from the replay didn't reproduce.
- Setup to first model: 2.5–3.0 s (was 3.6 s). V4.1 acting passes on Together: 2.3–4.8 s. No
  watchdog kills. Final pass to terminal: 1.2 s.
- **Revised projection with serial creates:** ≈2.5 setup + 4.8 act + 7.7 review + ≈8.5 creates +
  2.5 act + 2.7 review + ≈5.8 links + 2.8 final + 1.2 ≈ **38 s** (was 53 s). The earlier 28 s
  assumed parallel creates and a 5.7 s review 1.

### Root cause + roll-forward 2026-09-24 (DJ: "don't revert, figure out what's wrong")

**The history of serial vs parallel.** The worker always held a project exclusively for any write
(a conservative default, because it can't know which database functions are safe to overlap), so
creates in one project ran one at a time. The lean build (d27da1ccd, live) let task creates share
the project. The case-2 diagnostic stalled. My revert back to serial was local and never pushed; it
is undone, and the parallel code in HEAD stays.

**Reproduced for free.** `scripts/agentic/concurrent-write-probe.mts` fires N task creates through
`runGatewayWriteOp` (the worker's path) at the isolated gate DB. No model calls; probe tasks are
soft-deleted.

| At once | Before (QA)                 | After lock-first (QA) |
| ------- | --------------------------- | --------------------- |
| 1       | 1.0–1.4 s                   | 1.0 s                 |
| 2       | 0.6 s                       | —                     |
| 4       | 22 s / 29 s, 1 × 57014 each | 0.9 s, all ok         |
| 5       | 16 s; 97 s with 2 × 57014   | 0.7 s / 1.0 s, all ok |

**Mechanism: a lock upgrade inside one transaction.** QA `pg_stat_activity` during a 5-burst showed
every create waiting on another create's _transactionid_ (and `onto_project_logs` inserts in the
same chains). In `onto_task_create_with_relationships_atomic`:
(1) `INSERT onto_tasks` takes KEY SHARE on the project row (the FK check);
(2) its statement trigger bumps `private.agentic_chat_project_context_versions` (a hot per-project row);
(3) `onto_apply_relationship_plan_atomic` then takes `FOR UPDATE` on the same project row, which must
wait for every other transaction's KEY SHARE to end.
Each create holds what the next needs; the project-log inserts keep adding KEY SHARE. It resolves
only as transactions trickle through or hit the statement timeout (QA deadlock_timeout 1 s, so these
are starvation chains, not detected deadlocks). One or two at once never showed it, which is why the
exclusive worker hold hid it.

**Fix (roll forward):** migration `supabase/migrations/20260924193000_task_create_project_lock_first.sql`
takes `FOR UPDATE` on the project row _before_ the insert. Concurrent creates then wait at the
start holding nothing and queue about 0.2 s each. The body is otherwise identical (QA, prod and the
repo had the same md5 before the change); permissions are unchanged, because the relationship plan
already required FOR UPDATE as invoker. **Applied to QA only.** The prod worker (e4c82b356) already
runs parallel creates, so applying this to prod fixes prod with no deploy. Documented in
`tools/execution-policy.ts` next to `SHARED_PROJECT_CREATES`.

**Same pattern elsewhere:** `onto_goal_create_atomic` (INSERT, then relationship plan FOR UPDATE)
and probably the plan create. They stay exclusive in the worker for now, but the web UI, MCP and
chat writing to one project at the same time can still line up three of these. Links
(`onto_apply_relationship_plan_atomic`) already lock first, so parallel links are a probe away
(3 serial links ≈ 5.8 s in case 2).

## The user request (case 2)

"In this project create exactly these five tasks… (2) Order kitchen cabinets… depends on Confirm permit
requirements; (3) Electrical rough-in… depends on Confirm permit requirements; (4) Kitchen inspection…
depends on Electrical rough-in…" → 5 `create_onto_task` + 3 `link_onto_entities`.

## Was it hanging? No

Every second of rep 1 is accounted for by a stage that was working. There are no idle gaps.

| Stage (rep 1, 62.0 s)                                     | Time   | Rep 2  | Rep 3  |
| --------------------------------------------------------- | ------ | ------ | ------ |
| Admission → first model call (context load, prompt, Jev)  | 4.0 s  | 3.6 s  | 4.2 s  |
| Acting passes (model writing tool calls and the answer)   | 24.0 s | 6.6 s  | 14.7 s |
| Safety reviews (two batch reviews, `openai/gpt-5.6-luna`) | 17.5 s | 27.2 s | 15.9 s |
| Executing writes (5 creates, then 3 links)                | 15.3 s | 14.9 s | 15.0 s |
| Terminal (finalize, done)                                 | 1.2 s  | 1.0 s  | 1.0 s  |

Rep 1 was slower in the acting passes (24.0 s vs 6.6 s):

- **A killed opening pass (4.3 s lost).** The CoreWeave stream wrote narration ("I'll create the five
  tasks exactly as specified. Dependencies need the created task IDs…", 139 bytes), then paused. The
  slow-stream watchdog (`provider/openrouter/watchdog.ts`: < 240 bytes/s over a 4 s window once output
  has begun) aborted it and restarted the whole pass on Together.
- **A slow route on the retry.** Together produced 1,047 tokens in 8.9 s (~118 tok/s); the same pass in
  rep 2 took 2.9 s. Later acting passes were 5.7 s and 5.1 s (rep 2: 1.4 s and 2.3 s). Gate-wide
  medians are similar per provider (CoreWeave 196, Makora 208, Together 190 tok/s), so this is
  per-request variance, not one bad provider.

Rep 2 lost 5.0 s differently: a reviewer attempt returned nothing (`in=0 out=0`) and was retried.
Rep 3 also lost its opening pass to the watchdog, again right after narration.

## Where the fixed cost is (every rep)

**1. Two review rounds, because dependencies need a second batch (~17 s + ~8 s).**
`create_onto_task` cannot express "depends on the task I am creating in this same batch": the chat schema
dropped `connections` (`packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`), and a
dependency must be a `link_onto_entities` between existing records. So every "create tasks with
dependencies" request costs:

- create batch → review 1 → execute;
- another acting pass → link batch → review 2 → execute;
- a final acting pass.

The server already has `onto_task_create_with_relationships_atomic`.

**2. Each write is ~15 strictly serial database round trips (~15 s per turn).**
From the gate's HTTP traces, one `create_onto_task` is:

- reserve_effect, begin_effect, ensure_actor_for_user, get_onto_project_summaries_v1, users;
- **ensure_actor_for_user again**, then onto_task_create_with_relationships_atomic, onto_project_logs,
  onto_task_assignees, reconcile_effect;
- persist_mutation_tool_execution, 2× semantic_event, execution_observation, and acks.

That is ~1.7 s per create, of which the database spends ~0.1–0.2 s; the rest is ~100–150 ms of round
trip per call from the gate host. Each link repeats `get_onto_project_summaries_v1`, `onto_tasks` and
`onto_edges` twice. The five creates are independent but run one after another. Prod (Railway us-west2
→ Supabase us-west-1) has lower round-trip time than the gate host, so measure prod before sizing the
win. The round-trip count is a real cost everywhere.

**3. Each batch review takes ~8–9 s.** `gpt-5.6-luna` writes 1,230–1,617 output tokens per decision
(reasoning 52–193). Two reviews per turn.

**4. Watchdog restarts.** The gate had 9 acting passes killed for "insufficient progress": 3 right
after pre-tool narration, 6 mid-answer. Each kill throws away the pass and restarts from the prompt.
Tasker 100 now drops pre-tool narration from saved replies, but the model still writes it, and those
bytes are what arm the watchdog before the real output starts.

## Fix candidates (ranked by expected saving)

1. **One batch for creates plus their dependencies** (saves ~15–20 s: one acting pass, one review, one
   write stage). Let a batch reference a sibling create, e.g. a batch-local ref such as
   `depends_on: ["$create:2"]` resolved server-side through the existing
   `onto_task_create_with_relationships_atomic`. Alternatively, add a reviewed `create_task_graph`
   op. The reviewer then judges one batch that states the whole plan.
2. **Cut per-write round trips** (8.9 s + 6.4 s → aim for ~3 s total):
    - memoize `ensure_actor_for_user`, `users` and `get_onto_project_summaries_v1` per turn;
    - fold project log and assignee writes into the atomic RPC;
    - coalesce semantic-event, observation and ack persistence;
    - run independent writes in one batch concurrently. Effect idempotency keys already exist; keep
      completion order in receipts.
3. **Reviewer speed:** shorter decision format and lower reasoning effort, or a faster route, measured
   against the reviewer's catch rate on the gate's reviewer evidence. Do not drop the reviewer without
   DJ (his standing decision: keep it).
4. **Watchdog:**
    - don't start the progress clock on text that precedes the first tool call, or reset the window
      at the text→tool-call boundary;
    - consider continuing a stalled stream once instead of restarting it.

    Separately, a prompt line asking the model to call tools without announcing them would save the
    narration tokens (now invisible to users). Measure the kill rate before and after.

5. **Only after 1–2:** revisit whether the 60 s case 2 limit still matches the product promise.

## Evidence

- Turns: `turns/cedar-02-task-batch-{1,2,3}-1.json`. Per-pass timing is in `modelPasses`, and
  `result.timing` has the totals.
- Captured passes: `provider-passes/*8a75fd92-ba7a-4f18-babc-67d68ab0790c*` (rep 1). The killed pass is
  `g1-r1--acting--a1` (outcome `insufficient progress`), and its retry is `acting--a2`.
- DB round trips: `worker.log` lines with `agentic_gate_http_trace`, windows 02:57:49.0–02:57:58.0
  (creates) and 02:58:12.7–02:58:19.1 (links).
- Timeline script used for this write-up: `scripts/agentic/gate-pass-timeline.py` (run from the gate
  output dir: `python3 ../../../scripts/agentic/gate-pass-timeline.py cedar-02-task-batch 1-1 2-1 3-1`).

## Acceptance

- Free first: unit tests for batch-local references (resolution, review diff, receipts, rollback on a
  failed sibling) and a local count of round trips per write, before and after.
- Then, with DJ's approval: one gate (≈ $0.30). Case 2 under 60 s in all three reps with a margin (target
  p50 ≤ 35 s), and no score regression elsewhere.

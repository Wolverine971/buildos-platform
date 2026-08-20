<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_CONTINUATION_HANDOFF_2026-08-08.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-11; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase 4 Slice 18 — S5 Continuation Handoff

**Prepared:** 2026-08-08
**Pickup point:** P1 / Slice 18 / S5, after unit 1
**Repository baseline observed:** `main` = `origin/main` = `49904355736ba10dcc271959d6237d047e48e34d` (`updates`)
**Next objective:** add worker read-memo and context-saturation behavior, then port only the read-only finalization semantics required to make forced synthesis reliable.

**Closure update (2026-08-09): P1/S5 COMPLETE.** Unit 2, hosted schema,
worker-aware transport/attribution, narrated-read handling, ordered same-round
multi-read continuation, deployment, and the spend-gated quality battery are
complete. The final clean battery passed 9/9 completed and 9/9 assertions with
zero stream/capture errors at `$0.00643681`, 60.9% below the matching Phase 0
subset. Routing is restored OFF. Authoritative evidence:
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_LIVE_GATE_2026-08-09.md`.
The next Phase 4 package is tasker/51 P2 mutation/effect-reservation parity; do
not continue the historical implementation instructions below as open S5 work.

**P2 continuation update (2026-08-11): 20 mutation adapters reviewed; all
production gates remain OFF.** S1-S4 of the mutation/effect plan are complete,
and S5 now covers task create/update/move, document create/update/tree/task
relationships, goal/plan/milestone/risk create/update, exact edge link/unlink,
project row/create-shell mutations, and notification-only entity tagging. The
latest bounded unit is commit `962625b25`: `tag_onto_entity` accepts only
explicit `mode: "ping"` plus exact member user UUIDs, while content appends and
handle resolution remain web-owned. Notification delivery is one-attempt/
uncertain because its recipient fan-out is neither atomic nor effect-keyed. No
SQL was required for that unit. The authoritative current documents are:

1. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_MUTATION_EFFECT_PARITY_PLAN_2026-08-09.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`
3. `tasker/51-worker-behavioral-parity-phase4.md`

Do not treat the historical S5 instructions below as current work. The next
candidate must be selected from the remaining graph/delete/provider/control
surface only after its partial-commit or reconciliation behavior is explicit.
At this checkpoint graph reorganization remains a compound multi-edge rewrite,
irreversible ontology deletes lack a durable tombstone/query contract, and
calendar work overlaps an active concurrent calendar refactor. Preserve those
boundaries instead of widening a tool merely to increase the reviewed count.

**P2 corrective SQL update (2026-08-11): hosted and verified.** Migration
`20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql` fixes legacy
null-effect end-of-turn telemetry reconciliation without weakening worker
effect scope: the existing validation trigger now runs only when
`NEW.effect_id IS NOT NULL`. The composed disposable PostgreSQL suite passes
13/13. A fresh 85-receipt isolated dry run named only this migration; source
and staged SHA-256 matched at
`ce7af2d65378d2496c5f258b6465cc35c03e80da3add885c38407aa9fc3b8c2c`;
application succeeded; the linked receipt matches; and the post-apply dry run
is empty. A post-apply trailing-blank-line-only cleanup produced committed
source SHA-256
`ac9be4c7f7a9cbb9670089857d9faf5a57d7eb33fa81521e0175a612778a87fd`.
Hosted catalog verification confirms the exact trigger guard, security-invoker
function, fixed search path, anonymous/authenticated denial, and retained
service-role effect-ledger access. No production gate changed.

**P2 closure update (2026-08-11): COMPLETE for the bounded reviewed surface.**
An executable fail-closed policy now proves the exact 38 signed writes = 20
reviewed adapters + 18 explicit reconciliation deferrals, and assembly verifies
that every enabled adapter capability installs exactly one router entry. The
full exit battery is green; no deployment, provider spend, live mutation, or
production capability/routing change occurred. Authoritative evidence:
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_P2_EXIT_EVIDENCE_2026-08-11.md`.
The next package is tasker/51 P3. Do not reopen the historical S5 instructions
or silently absorb the deferred calendar/delete/contact/control tools.

**P3 closure update (2026-08-12): COMPLETE, hosted, and default off.** Session
currency, exact history strategy/copies, immutable current/history attachment
references, shared untrusted attachment context, and post-start live-image
resolution are complete. The S4 worker revalidates actor/project ownership and
source metadata, streams raw bytes through byte/content-type/SHA-256 checks,
keeps signed URLs out of durable state, and persists a mandatory redacted
generation/lease-fenced receipt before the provider call. Migrations
`20260812000000`, `20260812010000`, `20260812030000`, and `20260812040000` are
hosted with empty post-apply dry runs. The final worker battery passes 355/355;
focused web/PostgreSQL passes 30/30; shared passes 27/27; worker typecheck and
Svelte diagnostics are clean. Worker routing, live vision, mutation gates, and
cohort widening remain OFF. Current authority:
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P3_SESSION_HISTORY_ATTACHMENT_VISION_PLAN_2026-08-11.md`.
Do not resume the historical S5 instructions below.

**P4 continuation update (2026-08-13): S1 complete; S2a host bridge complete
locally and unmounted.** The supervisor semantic core is now shared through
`@buildos/agentic-chat-runtime/supervisor`, and the worker host seam derives
scope/entity evidence only from immutable execution input. A correctness audit
removed the core's constructor-time wall clock: the explicit `turn_started`
observation now owns the semantic epoch. Worker action records are ordered,
generation-scoped, and replay-stable; malformed scope and invalid/regressing
timestamps fail closed. Focused proof is shared 10/10 and worker 7/7 plus
declarations and worker typecheck. No SQL, provider call, runtime flag, routing,
or capability change occurred. The authoritative current plan is
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P4_SUPERVISOR_CHECKPOINT_RESEARCH_PLAN_2026-08-13.md`.
Next is S2b: the cross-executor/provider observation coordinator and complete
non-terminal decision application, with durable failed pre-execution result
parity for exact-retry blocks. Do not mount the bridge behind a flag until that
coordinator can apply every reachable decision.

**P4 S2b unit 1 update (2026-08-13): complete locally.** The exhaustive worker
action reducer maps status, instruction, forced synthesis, exact-retry block,
eval, and terminal decisions into typed effects and rejects inconsistent or
unknown batches. It remains unmounted pending unit 2's executor/provider
observation coordinator and durable application. The broad audit also restored
the fail-closed mutation inventory after the signed Gmail OAuth browser action
was added: it is explicitly deferred as `browser_user_action_handoff`, so the
current partition is 39/20/19 and the full worker suite passes 939 with one
intentional skip. No capability, environment, SQL, deployment, or routing gate
changed.

**P4 S2b unit 2 update (2026-08-13): S2 complete locally.** The prepared
provider now owns the cross-provider/executor coordinator, starts the immutable
supervisor only at the execution stream fence, and observes tool outcomes only
after durable/public executor feedback. Status, recovery, forced synthesis,
stable eval telemetry, and exact-retry blocks are applied. Known failed writes
continue as durable/public failed feedback; uncertain writes still stop for
effect reconciliation. Blocked retries use a distinct failed pre-execution
step and the existing failed-row RPC before provider continuation, including
mixed rounds. The separate exact-boolean
`AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED` assembly gate defaults false and has
not been set in a hosted environment. No SQL or deployment was needed. Shared
runtime is 193/193 plus declarations, focused worker is 140/140, full worker is
949 passed plus one intentional skip, and typecheck/diff checks are clean. Next
is P4 S3 fenced clarification checkpoint and terminal; keep the supervisor gate
off until S3's durable checkpoint contract exists.

**P4 S3 update (2026-08-13): complete; schema hosted.** The worker now carries
the full `ask_user` decision through a typed `supervisor_question` terminal and
persists a deterministic checkpoint before any `waiting_on_user`, question, or
terminal publication. The service-only RPC fences exact turn/job/user/session,
processing token, generation, running/cancellation state, and replay payload;
an indeterminate timeout requeues without leaking question semantics. The real
supervisor integration reaches the terminal after two durable repeated write
validation failures and starts no third provider pass. Both `clarification`
and `supervisor_checkpoint` are implemented and exercised by the legacy and
worker coverage trackers against one shared golden. Migration `20260813010000`
was applied receipt-isolated with matching source/staged SHA-256
`47ae1d882d78973e4757c777bae41584aa68971bf8b44bee751d71e65bdcbbdc`;
the linked ledger and exact 13-argument service RPC are visible, and the
post-apply dry run is empty. Final proof is runtime 193/193, legacy route 43/43,
full worker 959 passed plus one intentional skip, worker typecheck, and
disposable PostgreSQL 1/1. All production gates remain off. Next is P4 S4:
atomically claim/freeze the active checkpoint into the immutable admission
artifact and implement replay-safe resuming/resumed/restore/expiry transitions.

**P4 S4 update (2026-08-13): complete; schema hosted.** Worker admission now
freezes the exact selected checkpoint and canonical resume message into the
hashed input artifact, and an artifact-insert trigger claims that row inside the
existing admission transaction. Bad/missing/drifting snapshots roll back the
whole admission. Worker provider assembly consumes only the frozen message;
terminal database truth consumes or restores the linked checkpoint, and one
service-only recovery RPC handles expiry/stale replay without stealing live
queued/running claims. The legacy route also uses the corrected atomic recovery
path. Migration `20260813020000` is receipt-isolated and hosted with matching
source/staged SHA-256
`067ee493c88139b6821d03f399b4f8432a408154c0659f2487eca37add157195`; its
linked receipt is present, the post-apply dry run is empty, live service/anon
probes are correct, and generated types align with 261 hosted RPC names. Proof
includes a real two-connection claim race. Final gates are worker 960 plus one
intentional skip, runtime 193/193, shared 28/28, focused web/route/SQL 61/61,
all relevant typechecks, and Svelte 0/0. All production gates remain off. Next
is P4 S5 deterministic research capture from terminal durable tool evidence.

**P4 S5 update (2026-08-13): complete; schema hosted.** The legacy and worker
hosts now share the exact name-only research qualifier and deterministic
Research Log renderer. Worker eligibility comes only from bounded projections
of durable terminal tool rows, never the provider-local buffer. The live/
archive document mutation and its stable terminal effect commit atomically;
capture failure is durable but cannot overturn a completed answer. Replay,
cancellation, failure isolation, rotation, ACL, and migration replay proofs are
green. Migration `20260813030000` was applied receipt-isolated with matching
source/staged SHA-256
`208e51a9920e079edf0b518b66cad8c821358930658508eb5a1509e308cbd84c`;
the linked receipt exists, the post-apply dry run is empty, live service/anon
probes are correct, and generated types align with 265 hosted RPC names. Final
gates are worker 964 plus one intentional skip, runtime 195/195, shared 28/28,
focused web/route/PostgreSQL 78/78, clean typechecks/builds, and Svelte 0/0.
All production gates remain off. Next is P4 S6 deterministic forward carry
from raw user text plus terminal durable write evidence.

**P4 S6 update (2026-08-13): complete; schema hosted.** Exact legacy title,
description, source, type, conservative raw-message detection, clause extraction,
and successful-write/no-new-record semantics are shared. The worker reads only
bounded generation-fenced durable tool evidence, then creates the forward-carry
task through one stable effect and the legacy downstream idempotency key.
Ambiguous responses retry safely, coded failures reconcile terminally, and an
optional capture failure cannot overturn an otherwise completed answer.
Migration `20260813040000` is hosted receipt-isolated with SHA-256
`eb0bf83002dd36806f58a479383c173640ed64c3295abb15450bb5f4f9178452`, an empty
post-apply dry run, correct live ACL probes, and 266-name generated RPC parity.
Final gates: worker 970 plus one skip, runtime 197/197, shared 28/28, focused
legacy/shared/PostgreSQL 105/105, clean typechecks/builds, and Svelte 0/0. All
production gates remain off. Next is P4 S7: inventory and close or explicitly
defer the remaining route-side finalization safeguards, then run package exit.

**P4 S7 update (2026-08-13): complete locally; no migration required.** The
legacy finalization guard is now shared through
`@buildos/agentic-chat-runtime/supervisor`, with web retaining a compatibility
shim. Worker terminalization applies the exact shared mutation-outcome and
finalization policies from raw admitted text plus the generation-fenced tool
ledger, durably publishes any correction before the provider-finish timing
boundary, and persists only the corrected assistant/last-turn text. Supervisor
questions are exempt. S4 already owns checkpoint cleanup; S5/S6 own the durable
research and forward-carry floors. Project-create/general mutation repair,
skill-load repair, organization fallback, and pending-intent metadata are
explicitly deferred because the worker artifact lacks their structured intent/
skill/commission inputs or the reviewed compound effect/session-metadata
transaction; none may be inferred from prompt prose. Exit proof: runtime
212/212 plus declarations, worker 976/976 plus one intentional live-eval skip,
legacy supervisor/finalization/route 124/124, shared types 28/28, clean
typechecks, Svelte 0/0, and `git diff --check`. The paid quality battery was not
run; all production gates remain off. P4 is complete and P5 is next.

**P5 S1 update (2026-08-13): terminal consumption-billing parity complete
locally; no migration required.** Web and worker now share one immutable limits
constant. Worker usage observation is explicitly proven to settle before a
provider terminal event, and every post-start completion/cancellation/failure
attempts the existing `evaluate_user_consumption_gate` RPC before terminal CAS
or recovery. Strict result validation catches ambiguous/cross-user receipts;
bounded failures are reported without stranding terminal truth. Pre-start and
cohort-rejection paths skip the re-check. The shared flag remains default-off
and must match web; no deployment, provider spend, routing, or capability gate
changed. Focused proof is 112/112 plus shared/worker typechecks, shared
declarations, and Svelte 0/0. Current plan:
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P5_TELEMETRY_BILLING_PLAN_2026-08-13.md`.
Next is S2 prompt/timing/cost differential audit.

**P5 S2 update (2026-08-13): complete and hosted.** Prompt evidence now
persists the canonical provider tool definitions actually sent on the first
response, with an independent hash, exact replay/conflict checks, artifact
surface validation, and rollout-safe old-worker backfill through service-only
`persist_agentic_chat_prompt_snapshot_v2`. Migration `20260813050000` was
applied receipt-isolated with source/staged SHA-256
`9d8b095b28ab8e981db243860f3fc820b3d9b5278d37caf2deb9b6bad111e8bd`;
the post-apply dry run is empty, live ACL/OpenAPI probes are correct, and shared
database types are regenerated. Provider usage now has a stable identity over
turn/generation/logical-round/route, replay-safe strict upsert, exact upstream
input/output cost retention, and legacy-compatible provider-total/catalog
fallback accounting. Async timing is exact for DB-owned lifecycle events;
`done_emitted_at=null` remains deliberate because DB commit cannot prove client
delivery. Final gates: worker 986 plus one intentional skip, smart-LLM 72/72,
shared 28/28, disposable PostgreSQL 1/1, clean typechecks/builds, worker check
with zero errors, Svelte 0/0, and `git diff --check`. The awaited five-second
usage writer still favors terminal availability during DB outage; a durable
delayed-retry job is not silently implied. All production gates remain off and
the paid provider battery was not run. Next is P5 S3's immutable structured
turn-intent/session-metadata transaction; detached model reconciliation stays
deferred until it has its own durable job/receipt contract.

**P5 S3 unit 1 update (2026-08-13): structured pending intent complete and
hosted.** New v3 admissions freeze the canonical turn-intent structure and an
independently derived ordered write-tool expectation; the field stays optional
for already-queued rolling artifacts. Shared and database validation reject
shape, consistency, duplicate, and derived-tool drift. Every finalizer wrapper
still reaches the base terminal CAS, whose new status trigger derives
fulfillment only from immutable intent plus durable successful write rows and
shallow-merges `fastchat_pending_turn_intent` in the same transaction as the
assistant message, terminal event, and turn truth. Unfulfilled writes retain a
legacy-compatible 24-hour pending continuation; fulfilled or explicit-clear
turns store JSON null and preserve unrelated metadata. The worker also uses the
shared legacy outcome resolver for terminal assistant metadata. Migration
`20260813060000` was applied receipt-isolated with matching source/staged
SHA-256
`822ba7ee6536fd2987949b27bb2358560770177aad5849b01778985a1e42c7f6`;
the linked receipt exists and the post-apply dry run is empty. Live service
invocation returns the exact ordered tools, anon is denied, generated types
include the helper, and the 268-function RPC drift check passes. Final proof:
worker 987 plus one intentional skip, runtime 212/212, shared 29/29, focused web
52/52, composed PostgreSQL 14/14, clean typechecks/builds, worker check with
zero errors, Svelte 0/0, and `git diff --check`. No paid provider run,
application deployment, routing/capability widening, or flag change occurred.
Next is S3 unit 2: inventory admission-known deterministic used-domain and
loaded-skill inputs before extending the same terminal transaction. Never infer
them from prompt text. Detached model reconciliation remains deferred to an
owned durable job/receipt contract.

**P5 S3 unit 2 update (2026-08-13): deterministic domain-session metadata
complete and hosted.** New v3 admissions freeze the exact post-sensing legacy
domain state plus bounded sorted skill/outcome-card domain maps; the optional
field keeps older queued artifacts valid. Shared and database validators enforce
the canonical bounded shape. The base terminal status transition now
shallow-merges only `fastchat_domain_state` atomically: sensing survives every
terminal status, while completed/cancelled turns additionally project only
successful durable domain/skill/resource/outcome/work-capability loads. Signals,
coverage gaps, and research backlog are stably deduplicated and bounded; scope
or projection failure rolls back terminal truth. Loaded-skill continuity needs
no duplicate session patch because successful `skill_load` rows already feed
subsequent admission history. Migration `20260813070000` was applied
receipt-isolated with matching source/staged SHA-256
`ba0fdbb76ef1d5446912749c33ad2a133e77c9ea90fe3fd57a4a6c2b7a485aca`;
the linked receipt exists, the post-apply dry run is empty, service probes return
the expected map/union values, anon is denied, generated types contain all five
helpers, and the 273-function RPC drift check is aligned. Proof: worker 987 plus
one intentional skip, runtime 212/212, smart-LLM 72/72, shared 30/30, focused
web 52/52, composed PostgreSQL 15/15, clean typechecks/builds, worker check zero
errors, Svelte 0/0, and clean diffs before the docs/type regeneration pass. No
paid provider run, application deployment, routing/capability widening, or flag
change occurred. Next is P5 S4 package exit; detached model reconciliation
remains deferred to an owned durable job/receipt contract.

Post-deploy checksum note: a concurrent edit added only the migration's leading
file-path comment. The current source hash is
`348feeca79d47e6987b87fabe23a37c95f51fdc6e4b830eeced86e74d6e0b643`;
removing that comment leaves a byte-identical match to the deployed `ba0f...`
copy above, so no executable SQL drift or follow-up deployment exists.

**P5 S4 update (2026-08-13): package complete.** The post-generation exit rerun
passed worker 987 plus one intentional skip, runtime 212/212, smart-LLM 72/72,
shared 30/30, focused web 52/52, composed PostgreSQL 15/15, worker check with
zero errors, Svelte 0/0, aligned 273-function RPC drift, and clean diffs. Local
and documented production defaults keep worker runtime, web routing, live
vision, supervisor, billing, and cohort widening off. P5 exits without an
application deployment, provider spend, route/capability change, or billing
flag change.

**P6 deterministic differential update (2026-08-13): all eight classes
complete.** A new provider-deadline fixture captures the legacy timeout surface
before any provider response and drives both the legacy route and real worker
executor with the actual typed `timed_out` terminal error rather than a generic
exception carrying timeout-looking text. The worker matches terminal status,
public event order/error, the private `stream_terminal_failure` lifecycle row,
message persistence, and prompt evidence semantics. Timeout-only
contract differences are narrowly registered: async timing ownership, exact
unknown token usage (`null` rather than legacy's fabricated zero), and no
first-response prompt snapshot/lifecycle claim when no response occurred. The
existing worker-only done status/failure-code fields remain the same explicit
open payload difference carried by all scenarios. Both adapter coverage
trackers now exercise success, clarification, read-only tools, mutating tools,
supervisor checkpoint, cancellation, timeout, and provider error with no
blocked class. Focused proof: legacy route 44/44, worker fixture 61/61, runtime
212/212, and the spend-free agentic E2E instrument suite 44/44. Remaining Phase
4 work is the hosted 24/24 quality battery against the retained Phase 0
baseline; it still requires explicit provider-spend/application-deployment
authorization. Do not run it or enable production gates implicitly.

## Read this first

Read these in order before editing:

1. `tasker/51-worker-behavioral-parity-phase4.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`
3. This handoff
4. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md` only when changing the shared read surface or access rules
5. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md` for historical S1 mechanics and gate commands

The governing architecture remains hybrid: pure semantic leaves live in
`@buildos/agentic-chat-runtime`; the worker composes them behind its provider
and executor ports; the legacy web round driver remains in place. Do not turn
this continuation into a wholesale extraction of `streamFastChat`.

## Current state

S1 through S4 are complete. S5 unit 1 is complete in `499043557`:

- shared nested context-shift extraction is in
  `packages/agentic-chat-runtime/src/loop/context-shift.ts`;
- web uses the shared helper through its compatibility surface;
- the worker publishes a stable `context_shift` after the durable/public tool
  result and carries the shifted scope into terminal last-turn context;
- lifecycle projection records `context_shift_emitted` in event order;
- the single two-sided `read_only_tools` golden covers a valid read, a durably
  recorded validation failure, a corrected read with context shift, a third
  real read, and final synthesis;
- worker `get_project_overview` telemetry now matches legacy: no invented
  affected-project row and null non-search result telemetry;
- terminal recovery updates its in-memory tool execution and round counters
  immediately after an acknowledged ledger write, before fallible observation
  or public publication;
- migration
  `supabase/migrations/20260808140000_agentic_chat_true_tool_round_count.sql`
  keeps call count ledger-derived while retaining and validating the executor's
  true provider-round count.

The operator reports that migration `20260808140000` has now been applied to
the linked database. That apply was not independently receipt/catalog-verified
during creation of this handoff. Treat the apply as operator-reported, not as a
completed hosted evidence packet, until the read-only checks below are run.
Never run the SQL test file against the linked database; it is explicitly
disposable-only.

No worker deploy, routing/cohort widening, or paid provider run was part of S5
unit 1.

## Working-tree warning

At handoff creation the repository contains many unrelated user-owned edits and
untracked files. The S5 code and migrations are already tracked in `499043557`,
but the agentic-chat phase-plan/tasker status edits are still local. Re-run
`git status --short` before touching anything. Preserve all unrelated changes,
do not reset the tree, and use explicit pathspecs for any staging or commit.

The `499043557` commit is a mixed `updates` commit containing unrelated web and
asset work as well as S4/S5 code. Do not rewrite or partially revert that
commit. Continue forward from it.

## Unit 1 invariants that must not regress

1. **Ledger before public.** A read result, memo-served or freshly executed,
   must be durably persisted before `tool_result` becomes public or is returned
   to the next provider round.
2. **Recovery sees acknowledged rows.** Immediately after ledger acknowledgement,
   terminal context must include the execution and its provider round even if
   a later observation or public publication fails.
3. **Validation failures remain visible.** A rejected provider call is a failed
   durable/public execution. It never reaches the read adapter and never enters
   successful continuation feedback, but it counts as a call and provider round.
4. **Context shift follows its result.** Persist/publish `tool_result`, set the
   terminal shift, then publish the stable `context_shift` transition. Setting
   terminal state before the fallible shift publication is intentional recovery
   behavior.
5. **Call count is database-authoritative.** `tool_call_count` comes from
   durable `chat_tool_executions`; the executor owns provider-round boundaries
   and supplies `tool_round_count`.
6. **Read surface stays bounded.** The production worker advertises the
   immutable artifact surface intersected with the reviewed 34-read allowlist.
   Do not add mutations, OAuth-backed tools, web search, or a worker-to-web tool
   callback in P1.
7. **One parity golden per scenario class.** The registry enforces this. Extend
   the existing `read_only_tools` golden if the shared trace must grow; do not
   add a second golden for the same class without an explicit instrument change.
8. **The worker-only terminal `done.status` and `done.failure_code` fields are
   registered deliberate divergences.** Do not hide or remove them merely to
   make the read-only differential exact.

## Migration semantics and hosted verification

`20260808140000_agentic_chat_true_tool_round_count.sql` patches the existing
16-argument `public.finalize_agentic_chat_turn` body:

- zero durable calls require zero rounds;
- completed turns with durable calls require an executor value in
  `1..tool_call_count`;
- failed/cancelled turns with a durable row but an in-memory zero use a
  conservative one-round floor, covering a committed ledger RPC whose response
  was lost during interruption;
- invalid completed metadata raises
  `agentic_chat_finalize_invalid_tool_counts` and rolls the terminal transaction
  back.

The disposable proof is
`supabase/tests/20260808140000_agentic_chat_true_tool_round_count.test.sql` and
is part of the composed stream-write Postgres suite.

Before claiming the hosted gate complete, verify without mutating data:

1. the linked migration receipt contains `20260808140000`;
2. `pg_get_functiondef(...)` for the exact 16-argument finalizer contains the
   `v_tool_round_count > v_tool_call_count` fence and no longer contains the
   old `CASE WHEN v_tool_call_count > 0 THEN 1 ELSE 0 END` cap;
3. the function remains `SECURITY INVOKER` with fixed
   `search_path=pg_catalog, public` and its pre-existing service-only execution
   boundary;
4. an isolated linked dry run is empty. If it names any unrelated migration,
   stop and separate the receipt check instead of pushing it.

Record the receipt/query evidence in the Slice 18 plan. A live worker turn is
not needed for this schema verification and remains separately gated by deploy,
routing, and spend authorization.

## Next implementation unit

Treat the next work as one round-bridge slice with three layers. Read memo and
context saturation both decide what the provider sees next; saturation's hard
stop is only meaningful if the next pass is actually tool-free and its output
is finalized safely.

### A. Wire the within-turn read memo

The shared primitives already exist and are exported:

- `packages/agentic-chat-runtime/src/loop/read-memo.ts`
- `buildReadMemoKey`
- `shouldMemoizeReadResult`
- `buildMemoServedResult`
- `isPureReadToolName` from `tool-classification.ts`

Legacy wiring is in
`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` near
the `WP-12 read memo` comments. Its observable contract is important:

- cache only successful pure reads with exact normalized arguments;
- never cache failures or results requiring user action;
- repeat calls still create distinct tool-call/result executions for the model
  and ledger;
- the repeated payload carries `served_from_turn_memo: true` and
  `repeat_read_notice`, uses the new provider call id, has zero execution time,
  and does not replay stream events;
- memoization makes a loop cheap, not invisible: calls and rounds still count;
- legacy clears the memo after a write reaches the write executor. The current
  production worker path is read-only, so do not enable writes merely to test
  invalidation; keep the future invalidation rule explicit in the design.

Recommended ownership: the provider invocation owns the in-turn memo and
recognizes duplicate calls, while the executor owns the durable/public fence.
Add an explicit memo-served read-step payload (parallel to, but mutually
exclusive with, `validationFailure`) so the executor can skip the read adapter
but still persist and publish a normal execution. Do not let the provider
inject a tool result directly into the next prompt without passing through the
executor.

Audit and pin legacy persistence fields before deciding whether cached
duplicates repeat or suppress `affected_entities`, result-count telemetry, and
other out-of-band execution fields. Do not infer those details from
`buildMemoServedResult`, which only owns `ChatToolResult`.

Minimum focused proofs:

- two exact successful reads call the real read adapter once but produce two
  distinct durable/public executions and two provider rounds;
- the second result has the memo marker/notice, call-specific identity, and
  zero duration;
- the second result is what the provider receives for continuation;
- differing arguments execute normally;
- failed, validation-rejected, or user-action results are not memoized;
- persistence/publication failure on a memo hit does not advance the provider.

Prefer extending the existing `read_only_tools` fixture if a cross-adapter
trace is needed; keep its one-scenario registry contract intact.

### B. Wire `ContextGatheringLedger`

The shared implementation is already in
`packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts`; legacy
wiring is near `contextGatheringLedger.observeToolRound(...)` in the web
orchestrator.

Instantiate one ledger per prepared worker invocation. After durable feedback
for a completed read round, construct the same `FastToolExecution` and
`RoundToolPattern` view used by legacy, then call `observeToolRound` before
building the next provider request. Feed:

- the actual successful/failed execution view for that round;
- real tool-round/max-round counters;
- actual model payload characters, not the raw database result size;
- the admission context-usage snapshot unless/until the worker has a more
  current compatible snapshot.

Append a ledger message only when the ledger returns one. Preserve its monotonic
status emission. Combine `forceSynthesis` with the existing read-loop repair
rank so narrowing/saturated/must-synthesize instructions do not duplicate or
regress in severity.

`must_synthesize` must produce a true no-tool provider pass, matching legacy's
`forceNoToolSynthesisPass`; a prompt that says “do not call tools” while still
advertising them is not equivalent. Keep the capacity lease and accumulated
usage across that pass.

Minimum focused proofs:

- new evidence resets the low-novelty ladder;
- repeated identical/alternating reads progress through narrowing and saturated
  only once per rank;
- must-synthesize removes tools from the next request and terminates without an
  extra adapter call;
- memo-served repeats remain visible to saturation/repetition logic;
- the provider-round and call budgets still fail closed at their existing
  boundaries.

### C. Port only applicable read-only finalization semantics

The legacy runner remains web-side at
`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts`.
Do not move that file wholesale: it imports the web turn supervisor and mutation,
skill, research-persistence, organize-commission, and stated-future repair
machinery that is outside the P1 worker surface.

First write an applicability table against the production read-only provider.
Likely candidates to extract or reproduce through shared pure leaves are:

- forced no-tool synthesis retry when the model requests another tool;
- one bounded retry when a no-tool synthesis pass returns no visible answer;
- exact-option/response-anchor checks only if the read-only golden or quality
  baseline proves they are in scope;
- length continuation and final text sanitation only after their streaming
  consequences are understood.

The worker currently publishes provider text deltas immediately. A post-hoc
sanitizer cannot retract an already durable/public prefix. Do not bolt
`sanitizeAssistantFinalText` onto terminal metadata while leaving different
text in the stream. Either keep the candidate final pass buffered until it is
accepted or define another fence-preserving design and pin it with reconnect
and terminal-message tests.

The smallest acceptable result is a bounded, tool-free synthesis path that:

- cannot issue another read;
- produces nonempty user-facing text or a deterministic terminal failure;
- preserves accumulated usage and final `finished_reason`;
- publishes/persists identical assistant text across stream snapshot, terminal
  message, last-turn context, and reconnect;
- adds no mutation/supervisor behavior not already reachable in P1.

## Test and gate sequence

Start focused, then run the full local matrix. After changing runtime package
exports/source, rebuild declarations before worker/web typechecks:

```sh
pnpm --filter @buildos/agentic-chat-runtime test:run
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/agentic-chat-runtime build:types

pnpm --filter @buildos/worker exec vitest run tests/agenticChatReadOnlyProvider.test.ts tests/agenticChatFixtureTurnExecutor.test.ts
pnpm --filter @buildos/worker typecheck

pnpm --filter @buildos/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web check

pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts
```

Full exit gates after focused tests are green:

```sh
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/agentic-chat-runtime test:run
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/web check
```

Also run the legacy golden/server suite, changed-file Prettier, and
`git diff --check` on owned paths. The last verified unit-1 baseline was:

- worker: 803 passed, 1 intentional skip (804 total);
- runtime: 183/183;
- legacy server/golden suite: 40/40;
- composed disposable Postgres: 10/10;
- worker/runtime/web typechecks clean;
- Svelte: 0 errors / 0 warnings;
- worker lint/guardrails: 0 errors (175 pre-existing warnings).

Counts will increase as tests are added; do not weaken assertions to preserve
the old totals.

## Spend and deployment boundary

Do not run `test:agentic`, a live provider turn, a worker deployment, a routing
flip, or a cohort expansion merely to finish the local S5 slice. The read-only
agentic E2E quality battery remains explicitly spend-gated on DJ. When
authorization is given, compare only the read-only subset against the Phase 0
baseline and preserve the run artifact; do not silently substitute mocked
goldens for the quality gate.

## Definition of done for S5

S5 can close when:

- read memo and context gathering are active in the production worker bridge;
- forced synthesis uses a bounded tool-free pass with correct finalization;
- context-shift and affected-entity parity remain green;
- true tool-round counts are locally and hosted-verified;
- the single read-only differential has no new unregistered gaps;
- all local gates pass;
- the authorized read-only quality battery meets or exceeds the Phase 0
  baseline, or the task is explicitly handed back as waiting on DJ spend
  authorization.

After S5, return to `tasker/51` and choose the next Phase 4 package; do not drift
into P2 mutations while S5 evidence is incomplete.

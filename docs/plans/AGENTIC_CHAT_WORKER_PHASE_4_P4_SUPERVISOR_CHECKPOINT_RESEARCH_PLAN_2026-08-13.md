<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P4_SUPERVISOR_CHECKPOINT_RESEARCH_PLAN_2026-08-13.md -->

# Agentic Chat Worker Phase 4 P4 — supervisor, checkpoint, and route-side safeguards

**Status:** S1-S7 complete on 2026-08-13; S3-S6 schema is hosted. The provider/executor
coordinator now starts one immutable-input supervisor at the execution stream
fence, feeds ordered pass/text/call/durable-result/round/final-candidate
observations, and applies status, recovery, forced synthesis, exact-retry
blocks, eval flags, and the terminal `supervisor_question` decision. A stable,
generation-fenced service-only RPC now persists the exact checkpoint before the
worker may publish `waiting_on_user`, emit the question, or commit terminal
truth. Both `clarification` and `supervisor_checkpoint` are implemented and
exercised on both sides of the differential registry. Migration
`20260813010000` is hosted and verified; the supervisor, routing, provider, and
mutation gates remain off. Final S3 proof is shared runtime 193/193, legacy
route 43/43, full worker 959 passed with one intentional skip, and disposable
PostgreSQL 1/1. Immutable checkpoint resume is hosted through receipt
`20260813020000`, and deterministic Research Log capture is hosted through
`20260813030000`, and deterministic forward carry is hosted through
`20260813040000`. S7 single-sources the finalization guard, applies mutation-
outcome and terminal-text integrity in the worker, and records every remaining
route-side safeguard as closed or explicitly deferred. P4 is complete; next is
P5 cost/accounting and terminal billing parity.

## Kernel

The worker must make the same semantic intervention as legacy from the same
ordered observations, and it must durably pause/resume rather than converting a
clarification into a generic failure. Research and forward-carry safeguards
must run from durable execution evidence, not from best-effort stream state.

The shortest credible path is to single-source the semantic engine first,
introduce a fenced checkpoint command second, and only then enable the new
clarification differential. Copying the legacy supervisor into the worker would
create an unrefereed second policy and is not acceptable.

## Current boundary and corrected premises

- The legacy deterministic supervisor is pure apart from host callbacks. Its
  674-line decision engine, digest, status messages, and context entity index
  were web-owned even though their tool failure and classification dependencies
  were already shared.
- The worker already has some overlapping read-loop synthesis controls, but it
  has no shared supervisor observation stream, `ask_user` outcome, or
  `chat_turn_checkpoints` lifecycle.
- Existing checkpoint helpers mutate the table directly from the web route.
  Phase 2A revoked authenticated writes, and the worker needs generation/lease
  fencing that the legacy helpers do not provide. A service-only RPC is required
  before the worker writes a checkpoint.
- Resume is not only an execution concern. Legacy claims the latest active
  checkpoint before provider orchestration and injects its bounded resume
  context. Worker admission must freeze that exact selected checkpoint identity
  and resume text into the immutable input artifact so execution never reloads
  a moving source row.
- Research and forward-carry have two layers: model repair rounds during
  orchestration, then deterministic post-stream floors. The worker already uses
  the shared repair predicates, but it does not run the route-side durable
  floors.
- A deterministic research or stated-future write is still a mutation. It must
  cross the Phase 2B effect reservation/receipt boundary or be explicitly
  classified no-retry/uncertain; a plain service-role insert is not parity.

## Scope inventory

| Legacy behavior                                                    | Current worker state                              | Owning slice |
| ------------------------------------------------------------------ | ------------------------------------------------- | ------------ |
| Ordered supervisor observations and deterministic decisions        | No shared observation stream                      | S1-S2        |
| Status, forced synthesis, failed-write recovery, exact-retry block | Partial overlapping read-loop controls only       | S2           |
| Repeated-validation `ask_user` terminal                            | Generic validation exhaustion/failure             | S3           |
| Generation-fenced checkpoint creation                              | No worker checkpoint writer                       | S3           |
| Active → resuming → resumed/active recovery lifecycle              | Web direct-table helpers only                     | S4           |
| Immutable checkpoint resume input                                  | Not in admission artifact                         | S4           |
| Clarification and supervisor-checkpoint goldens                    | Registry intentionally blocked                    | S3-S4        |
| Research repair predicate/instruction                              | Shared across web and worker                      | S5 complete  |
| Deterministic Research Log floor                                   | Durable worker evidence + terminal effect         | S5 complete  |
| Stated-future repair predicate/instruction                         | Shared across web and worker                      | S6 complete  |
| Deterministic forward-carry task floor                             | Durable worker evidence + effect-backed task      | S6 complete  |
| Remaining route-side finalization safeguards                       | Inventory exists across finalization runner/route | S7           |

## Slices

### S1 — shared supervisor semantic core

- Move types, digest, entity indexing, status messages, deterministic decisions,
  and their direct tests into `@buildos/agentic-chat-runtime/supervisor`.
- Leave thin web re-export shims so the production web import graph and
  behavior remain unchanged.
- Add the package export/build entry, aliases in both app test hosts, and keep
  the portability guard recursive over the new source.
- Exit: runtime tests/declarations, legacy supervisor-bearing tests, both app
  typechecks, and touched-file formatting are green.

**Completed evidence:** runtime 192/192 plus declaration build and typecheck;
legacy stream-orchestrator/checkpoint/finalization 75/75; web Svelte diagnostics
0/0; worker typecheck clean; recursive portability guard green. The web test
wrapper accidentally invoked the full suite once and independently surfaced two
unrelated baseline failures (malformed artifact JSON classification and MCP
advertised scopes); every supervisor-bearing suite in that run passed.

**Post-extraction correctness audit:** the initial extraction retained a hidden
constructor-time `Date.now()` epoch. That made provider preparation consume
semantic time before the execution-start fence even though the worker bridge
constructor itself performed no I/O. The shared core now establishes its epoch
from the explicit `turn_started` observation (with a first-observation fallback
for older hosts), and `getDigest(at)` can use the same deterministic observation
clock. A constant-time regression proves the epoch independently of wall time.

### S2 — worker observation and non-terminal decision bridge

- Create one supervisor per prepared provider invocation from immutable
  execution input and the frozen context entity index.
- Feed exact observations at provider pass, emitted call, durable tool result,
  completed round, text, and final-candidate boundaries. Do not infer tool
  success before the executor returns its durable/public result.
- Apply status, force-synthesis, recovery instruction, repeated-call block, and
  eval-flag decisions through typed provider steps/instructions with stable
  generation-scoped identities.
- An exact-retry block must produce the same durable/public failed
  pre-execution tool result the legacy `prepareToolRound` path records before
  provider continuation. A prompt-only block is not parity and must not be
  shipped as completed S2 behavior.
- Reconcile the existing context-gathering ladder with supervisor decisions by
  selecting the stronger monotonic intervention; never duplicate provider
  rounds or public status events.

**S2a completed locally:** `AgenticChatWorkerSupervisorBridge` is a typed,
side-effect-free host seam over the shared engine. It reads scope and the entity
index only from the immutable execution input, validates canonical claim scope,
starts exactly once, rejects pre-start/invalid/regressing clocks, filters out
non-actionable `continue` decisions, and records each action with a stable UUID,
execution generation, and ordered sequence. Tests pin low-novelty synthesis,
wrong-entity recovery, recovery-before-exact-retry-block ordering, replay-stable
identity, generation separation, malformed input, and clock boundaries.

The bridge is intentionally not mounted behind an environment flag yet. Turning
on an observation-only bridge would silently ignore decisions, while mounting
it only in the provider would infer tool success before the executor's durable
ledger/publication fence. S2b must place one coordinator across the executor and
prepared provider invocation, then apply every reachable non-terminal action;
only that complete coordinator receives a default-off runtime gate.

**S2b next implementation unit:**

1. Define the executor/provider coordinator port and feed `turn_started`, text,
   provider-pass, emitted-call, durable-result, completed-round, and
   final-candidate observations in exact order.
2. Persist/publish an exact-retry block as a failed pre-execution result before
   provider continuation, including mixed parallel rounds.
3. Merge recovery/force-synthesis/status with the existing context ladder using
   one monotonic decision rank and stable semantic events.
4. Add the default-off assembly/config gate only after no reachable decision is
   ignored; keep `ask_user` fail-closed for S3's checkpoint terminal.

**S2b unit 1 completed locally:**
`reduceAgenticChatWorkerSupervisorDecisionsV1` exhaustively converts action
records into typed host effects. It preserves the legacy exact-retry error and
model payload, uses each stable decision identity for status semantics, retains
checkpoint requests rather than flattening them into errors, rejects
`continue`, sequence gaps, mixed generations, missing blocked-call identity,
and conflicting terminals, and accepts later global sequence numbers at the
start of a local observation batch. Its four direct tests join the seven bridge
tests for 11/11 focused worker proof. The reducer is not yet connected to a
provider or executor.

The broad audit also caught a repository-head mutation-policy drift unrelated
to the supervisor extraction: `request_email_account_connection` had become a
signed write without a worker classification. It returns a browser-only,
user-clicked OAuth action and has no worker client-action/reconciliation
contract, so it is now explicitly deferred as
`browser_user_action_handoff`. The current fail-closed partition is 39 signed =
20 reviewed + 19 deferred; provider and adapter capabilities remain unchanged
and off.

**S2b unit 2 completed locally:** the prepared provider owns the coordinator so
construction stays side-effect free and `start()` occurs only from the first
execution-authorized stream. Text becomes observable after its yielded delta
resumes; tool success/failure becomes observable only from executor feedback
after the ledger and public-result fences. Known failed mutation attempts are
now ordered failed feedback instead of terminal failures, while
`uncertain_external_commit` remains unchanged and cannot continue. A distinct
`pre_execution_tool_failure` step persists and publishes supervisor-blocked
retries without invoking an adapter, then returns the exact legacy-compatible
blocked payload to the next provider pass. Mixed blocked/successful rounds keep
provider order. Eval flags are diagnostic executor steps with stable decision
identities; statuses remain durable public semantics. Supervisor
force-synthesis raises the same monotonic repair rank as the context ladder, so
the stronger intervention wins without adding a round.

The application port was generalized from `persistValidationFailure` to
`persistFailure`; its hosted RPC deliberately retains the historical name
`persist_agentic_chat_tool_validation_failure` because the deployed
service-only contract already stores the required generic failed/no-result
attempt row. S2 therefore still requires no migration. The new assembly/config
gate is `AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED=false` by default and is
documented but unset in hosted environments. `ask_user` and stop remain
fail-closed until S3 supplies their durable terminal contracts.

Local evidence on the final S2 tree: focused worker provider/executor/config/
assembly/ledger/supervisor proof 140/140; full worker 949 passed plus one
intentional skip; shared runtime 193/193; runtime declaration build and worker
typecheck green; `git diff --check` clean.

### S3 — fenced clarification checkpoint and terminal

- Add a service-only RPC that validates queue job, processing token, user,
  session, turn, execution generation, running state, and exact checkpoint
  payload before inserting one active checkpoint idempotently.
- Add a typed provider/executor `supervisor_question` boundary. The checkpoint
  must be durable before `waiting_on_user` becomes public or terminal truth is
  committed.
- Preserve the assistant question, terminal `finished_reason =
supervisor_question`, and exact checkpoint row in both adapters.
- Author the legacy clarification/supervisor-checkpoint golden first, then make
  the worker match it in the same change so both coverage trackers remain
  fail-closed.

**Completed 2026-08-13:** the reducer and provider preserve the full deterministic
`ask_user` decision as a typed `supervisor_question` terminal, including stable
transition identity, ordered sequence, digest, bounded resume context, exact
decision JSON, and accumulated usage. The executor persists a deterministic
checkpoint first, then publishes the legacy-equal `waiting_on_user` state and
question, and finally commits `finished_reason = supervisor_question` with the
checkpoint identity in assistant metadata. The real worker supervisor reaches
this path after two durable repeated write-validation failures without starting
a third provider pass. Timeout proof confirms an indeterminate checkpoint write
is replay-safe and cannot leak the waiting state or question before durability.

The additive migration
`20260813010000_agentic_chat_supervisor_question_checkpoint.sql` adds nullable
worker identity to legacy-compatible checkpoint rows and a service-only,
security-invoker RPC fenced by exact turn/job/user/session/generation/token,
running/cancellation state, and exact payload replay. Its source and staged
SHA-256 matched at
`47ae1d882d78973e4757c777bae41584aa68971bf8b44bee751d71e65bdcbbdc`.
Receipt-isolated preflight named only this migration, apply succeeded, the
97-receipt linked ledger contains `20260813010000`, and the isolated post-apply
dry run is empty. Hosted PostgREST exposes the exact 13-argument RPC to the
service role; the three identity columns are visible. Disposable PostgreSQL
proves insert/replay, payload conflict, stale generation, cancellation,
terminal fencing, service ACL, no leaked row, and nullable legacy insertion.

The shared golden is exact on legacy and contract-exact on worker for both
scenario classes; the only worker differences are the already-ratified async
timing fields and worker terminal `done` fields. Final gates: runtime 193/193,
legacy route 43/43, full worker 959 passed plus one intentional skip, worker
typecheck clean, and PostgreSQL 1/1. No deployment, provider call, flag change,
routing change, or capability widening occurred.

### S4 — immutable resume lifecycle

- Atomically select/claim the latest active checkpoint during worker admission
  and freeze its id, question, bounded resume context, and canonical resume
  message in the input artifact.
- Add service-only, ownership-checked state transitions for resuming, resumed,
  restore-after-failure, expiry, and stale recovery. Link every transition to
  the resume turn and keep replay idempotent.
- The worker consumes only the frozen artifact. Source checkpoint drift after
  admission must not affect the provider prompt.

**Complete and hosted (2026-08-13).** Web preparation now freezes the exact
latest active checkpoint identity, bounded resume context, and canonical resume
system message into the hashed v3 input artifact. The existing admission
transaction's artifact insert trigger locks and claims that exact checkpoint;
missing/newer/drifting source state aborts the whole admission. Worker provider
assembly consumes only the frozen message. A terminal turn trigger hard-consumes
the claim on completion or restores it on failed/cancelled truth, while the
service-only recovery RPC expires stale active rows, resolves completed stale
claims, restores failed/orphaned claims, and leaves queued/running claims alone.
The legacy route uses the same recovery RPC, removing its prior possibility of
reopening a live stale-looking resume.

Migration `20260813020000_agentic_chat_checkpoint_resume_lifecycle.sql` was
applied from a receipt-isolated staging directory; source/staged SHA-256 was
`067ee493c88139b6821d03f399b4f8432a408154c0659f2487eca37add157195`, the
linked receipt is present, and the post-apply dry run is empty. The live service
probe reaches validation while anonymous invocation is denied, generated RPC
types align with all 261 hosted function names, and shared database types/schema
were regenerated. Proof covers exact claim, source drift, complete/fail
terminal transitions, rollback, expiry, recovery replay, and a genuine
two-connection single-claim race. Final gates: worker 960 passed plus one
intentional skip, runtime 193/193 plus typecheck, shared 28/28 plus typecheck,
web S4/route/PostgreSQL 61/61, and Svelte 0/0. All production capability,
provider, supervisor, routing, and cohort gates remain off.

### S5 — deterministic research capture

- Share the pure research-entry builder and exact qualifying-call rules.
- Drive the floor from terminal durable tool executions, not provider-local
  buffers, and preserve the legacy rule that capture failure cannot invalidate
  a completed answer.
- Put the Research Log append behind a stable effect identity and reviewed
  reconciliation contract. Add duplicate-delivery and cancellation tests.

**Completed evidence:** the exact name-only qualifier, entry builder, renderer,
limits, marker, and description now live in the shared runtime with the legacy
web service reduced to a persistence host. Worker qualification loads only
generation-fenced durable tool rows; the SQL projection is bounded to the
query/URL/answer fields the renderer consumes. One stable effect and the live/
archive Research Log mutation commit atomically to `succeeded` or `failed`, so
an optional capture cannot strand terminal finalization. Lost-response replay,
cancellation-before-effect, failure isolation, 20-entry rotation, ACLs, and
migration replay are proven in disposable PostgreSQL. Migration
`20260813030000` was applied receipt-isolated with matching source/staged
SHA-256 `208e51a9920e079edf0b518b66cad8c821358930658508eb5a1509e308cbd84c`;
the linked receipt is present, post-apply dry run is empty, live service calls
reach validation, anonymous calls are denied, and generated types align with
all 265 hosted RPC names. Final gates: worker 964 passed plus one intentional
skip, runtime 195/195, shared 28/28, focused web/route/PostgreSQL 78/78, clean
typechecks/builds, and Svelte 0/0. No worker deploy, provider call, routing,
cohort, supervisor, or mutation-capability gate changed.

### S6 — deterministic forward carry

- Preserve the conservative phrase set and raw-user-message clause extraction;
  attachment boilerplate and model paraphrases cannot name the created task.
- Run only after a successful write with no new durable record, using terminal
  ledger evidence.
- Create the smallest forward-carry record through a stable reserved effect and
  prove replay/cancellation behavior.

**Complete and hosted (2026-08-13).** The pure task title, description, source,
and type semantics now live in the shared runtime while the legacy service is a
thin persistence host. The worker gates only on the raw admitted user message,
then loads a generation-fenced, service-only projection of durable terminal
tool rows and applies the exact shared successful-write/no-new-record predicate.
Only document body candidates, duplicate-write markers, and move status cross
the SQL boundary. Eligible captures use a stable singleton effect plus the
legacy `stated_future_capture:<streamRunId>` downstream key around
`ensure_actor_for_user` and `onto_task_create_atomic`; ambiguous responses retry
idempotently, coded failures reconcile terminally, and capture errors remain
isolated from otherwise completed answers.

Migration `20260813040000` was applied receipt-isolated with matching
source/staged SHA-256
`eb0bf83002dd36806f58a479383c173640ed64c3295abb15450bb5f4f9178452`;
the linked receipt is present, the post-apply dry run is empty, live service
validation and anonymous denial are correct, and generated types align with all
266 hosted RPC names. Final gates: worker 970 passed plus one intentional skip,
runtime 197/197, shared 28/28, focused legacy/shared/PostgreSQL 105/105, clean
typechecks/builds, and Svelte 0/0. No worker deploy, provider call, routing,
cohort, supervisor, or mutation-capability gate changed.

### S7 — remaining finalization safeguards and package exit

- Close or explicitly defer every route-side safeguard in
  `stream-orchestrator/finalization-runner.ts` and the post-stream route block:
  project-create, mutation-intent, skill-load, organization, mutation-outcome,
  finalization guard, pending-intent metadata, and checkpoint cleanup.
- Run the full two-sided differential and focused quality battery. Keep worker
  routing, provider/mutation capability gates, and cohort widening off unless a
  separately authorized live gate is requested.

**Complete locally (2026-08-13).** The 502-line finalization guard and its 15
tests now live in `@buildos/agentic-chat-runtime/supervisor`; web retains a thin
re-export shim. The worker applies the shared mutation-outcome integrity floor
and finalization guard from the raw admitted user message, immutable context,
and ordered generation-fenced tool ledger before terminal truth. If a guard
must correct already-streamed prose, that correction crosses the normal durable
text boundary before provider authority is marked finished; terminal message
and last-turn context persist only the corrected text. A supervisor question is
never rewritten.

The route-side inventory closes without reconstructing structured state from
prompt prose:

| Safeguard                                         | P4 disposition                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutation-outcome integrity                        | Closed in the worker terminal path with the exact shared policy.                                                                                                                                                        |
| Finalization guard                                | Closed via shared extraction and worker composition.                                                                                                                                                                    |
| Checkpoint cleanup                                | Already closed by S4's terminal trigger and stale-resume recovery RPC.                                                                                                                                                  |
| Research persistence                              | Durable deterministic floor closed in S5; model-first repair remains an optimization, not the durability boundary.                                                                                                      |
| Stated-future carry                               | Durable deterministic floor closed in S6; model-first repair remains an optimization, not the durability boundary.                                                                                                      |
| Project-create and general mutation repair rounds | Explicitly deferred until a provider terminal-repair coordinator receives frozen structured turn intent, expected write tools, and write minimum. The terminal integrity floor prevents false success claims meanwhile. |
| Skill-load repair                                 | Explicitly deferred until admission freezes the gate decision, acceptable/recommended skill ids, and history-loaded ids. Prompt parsing is forbidden.                                                                   |
| Organization commission repair/fallback           | Explicitly deferred with the compound `reorganize_onto_project_graph` capability; no reviewed atomic effect/reconciliation contract exists for that compound rewrite.                                                   |
| Pending-intent session metadata                   | Explicitly deferred until frozen turn intent is part of the worker input contract and the terminal transaction has an ownership-fenced session-metadata patch.                                                          |

No S7 SQL or hosted deployment is required. Package exit is green: shared
runtime 212/212 plus declaration build/typecheck; full worker 976/976 with one
intentional skipped live evaluation plus typecheck; legacy
supervisor/finalization/route compatibility 124/124; shared types 28/28 plus
typecheck; Svelte diagnostics 0 errors/0 warnings; and `git diff --check` clean.
The spend-gated live quality battery was not run, and all worker routing,
provider, mutation, supervisor, and cohort gates remain off.

## SQL and deployment rules

- S1-S2 require no migration.
- S3-S6 migrations must be additive, service-only, invoker-safe, and
  receipt-isolated. Each receives a disposable PostgreSQL replay/rollback proof,
  source/staged SHA-256 comparison, isolated dry run, apply, empty post-apply
  dry run, and linked-ledger verification.
- Checkpoint writes and deterministic post-processing writes must fail closed at
  their durable-before-public or durable-before-terminal boundary. Optional
  telemetry may not be confused with required semantic state.

## Exit evidence

- Both `clarification` and `supervisor_checkpoint` are implemented in the
  parity registry and exercised by both adapter coverage trackers.
- Exact ordered events, assistant messages, tool rows, checkpoint rows, outcome,
  and metadata match outside already-ratified transport/timing differences.
- Checkpoint creation/resume and deterministic research/forward-carry writes are
  replay-safe under duplicate delivery, cancellation, stale generation, and
  worker restart.
- All production rollout and capability gates remain off at package closure.

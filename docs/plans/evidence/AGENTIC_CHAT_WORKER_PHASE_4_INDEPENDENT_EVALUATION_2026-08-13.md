<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_INDEPENDENT_EVALUATION_2026-08-13.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat Worker Phase 4 Independent Evaluation

**Date:** 2026-08-13  
**Evaluator:** independent Codex review  
**Reviewed state:** `942fed2c8a3dc5c249ef7ae0db09ff9f3c355714` plus the scoped shared dirty worktree  
**Source handoff:** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_INDEPENDENT_EVALUATOR_HANDOFF_2026-08-13.md`

## Verdict

**GO to an operator-authorized application rollout and hosted 24/24 battery.**

This is not a production deployment authorization and it is not a Phase 4 exit. The application
must still be assembled in a clean release checkout, live gates must be verified default-off,
deployment and spend must be explicitly authorized, and the retained hosted battery must meet the
Phase 0 acceptance bar.

One release-blocking verifier defect was found and closed during this review. No P0/P1 ownership,
security, deferred-mutation reachability, terminal-atomicity, unsafe-grant, or unregistered-parity
finding remains in the reviewed state.

## Closed blocking finding

### P1 — deliberate parity paths used unsafe string-prefix matching

`partitionAgenticChatParityDifferencesV1` used `path.startsWith(prefix)`. A registered leaf such as
`/metadata/lifecycle_events/4` therefore also admitted the unregistered sibling
`/metadata/lifecycle_events/40`; the same issue applied to other registered leaf paths. That made
the deliberate-difference boundary broader than the documented JSON-pointer inventory.

The matcher now requires an exact pointer or a `/` segment boundary in
`packages/agentic-chat-runtime/src/parity-scenarios.ts:265`. A regression test at
`packages/agentic-chat-runtime/src/parity-scenarios.test.ts:101` proves the sibling remains
contested. The full runtime suite passes 213/213 after the correction.

## Review conclusions

1. **Prompt snapshots are rollout-safe.** The v2 wrapper retains the v1 identity, generation,
   queue-ownership, and message checks in the same transaction; later validation failures roll the
   v1 insert back. It locks the turn and snapshot, rejects conflicting replay, restricts tools to
   the immutable artifact surface, and grants execution only to `service_role`
   (`20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql:41-201`). The application
   adapter independently recomputes the canonical tool hash before calling the RPC.
2. **Terminal metadata cannot split from terminal truth.** Pending-intent and domain projection are
   `AFTER UPDATE OF status` triggers in the terminal transaction. Both bind the immutable artifact
   by turn/session/user, lock the session, and raise on scope mismatch, which rolls terminal truth
   back with metadata (`20260813060000_agentic_chat_terminal_pending_intent_metadata.sql:226-355`,
   `20260813070000_agentic_chat_terminal_domain_metadata.sql:350-608`). Pending intent is fulfilled
   only by successful durable write executions from the same turn/session.
3. **Domain/skill continuity uses admission-frozen evidence.** Terminal projection reads the
   immutable `domainMetadata` snapshot and frozen skill/outcome-card domain maps. It does not reload
   a mutable registry at terminal time. Failed turns carry only the already-sensed frozen state;
   successful tool-derived signals are restricted to successful same-turn/session loads.
4. **Timeout classification and divergence inventory are bounded.** The legacy fixture exercises a
   typed `timed_out` terminal error and its actual private lifecycle row. The worker fixture reaches
   the real executor classification `timeout_post_start`. Its lifecycle projection is now driven by
   that actual typed terminal result at
   `apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts:4648`, so a classifier regression cannot
   be masked by an unconditional test value. The four registered worker differences remain exact
   JSON-pointer paths after the segment-boundary correction.
5. **The mutation surface is fail-closed.** The signed write inventory is exactly partitioned into
   20 reviewed tools and 19 specifically deferred tools, with module-load drift rejection
   (`mutationToolCatalog.ts:509-575`). Provider advertisement requires a matching capability and
   reviewed definition (`readOnlyProvider.ts:2089-2122`). Adapter invocation occurs only after
   reserve/begin ownership and reconciles success, failure, cancellation, or uncertainty under one
   stable effect identity (`fixtureMutationExecutor.ts:120-180`).
6. **Deferred mutations are not reachable in the current production bootstrap.** Assembly requires
   distinct provider and adapter capabilities and rejects mismatches
   (`phase3Assembly.ts:168-210`). The production bootstrap supplies neither capability set
   (`phase3Bootstrap.ts:261-276`). Enabling the exact reviewed capabilities is therefore an explicit
   application-rollout step, not evidence that the current production path already advertises
   writes.
7. **Billing/usage failure cannot strand terminal truth or cross a generation.** Provider usage is
   awaited before terminal exposure, its stable identity includes turn, execution generation,
   logical provider round, and route, and the shared logger uses that identity for replay-safe
   insertion. Observation and consumption-gate failures are bounded and reported without
   overturning terminal DB truth. A failed usage write is best-effort and may be absent until a
   healthy replay; the reviewed package does not establish an independent at-least-once delivery
   queue for that telemetry. This is a non-blocking durability caveat, not a double-count or
   terminal-ownership defect.
8. **P5 helper exposure is safe.** New SQL uses fixed `pg_catalog, public` search paths. Anonymous
   and authenticated execution is revoked. Trigger-only domain functions are also denied direct
   `service_role` execution; only the intended pure helpers retain service access
   (`20260813070000_agentic_chat_terminal_domain_metadata.sql:610-633`). Hosted RPC drift is aligned
   at 273 names.
9. **No unregistered deterministic difference remains.** All eight scenario classes are executable,
   the worker contract rejects contested inventory that differs in path, kind, or order, and the
   deliberate-prefix matcher no longer admits sibling pointers.

## Non-blocking rollout conditions

- Curate a clean isolated release checkout from the reviewed state; the current shared worktree is
  not a release artifact.
- Verify hosted migrations/constraints and live environment values immediately before deployment.
- Keep routing, cohort, mutation, vision, supervisor, and consumption-billing gates default-off;
  enable only the exact internal battery cohort/capabilities after explicit authorization.
- Treat worker `stream_terminal_failure` metadata as an evaluation projection of typed durable
  worker facts, not as a claim that the worker persists a legacy-named private lifecycle row.
- Run the retry-free eight-scenario × three-repetition hosted quality battery, retain the JSON
  artifact, restore every gate off even on failure, and exit Phase 4 only if the artifact passes.

## Spend-free verification run

| Gate                                               |                       Independent result |
| -------------------------------------------------- | ---------------------------------------: |
| Shared contract tests                              |                                    30/30 |
| Shared contract typecheck                          |                                    clean |
| Shared runtime tests                               |                                  213/213 |
| Shared runtime typecheck                           |                                    clean |
| Legacy stream adapter fixture                      |                                    44/44 |
| Worker executor adapter fixture                    |                                    61/61 |
| Mutation/accounting/provider focused worker suites |                                  120/120 |
| Full worker suite                                  | 988 passed, 1 intentional live-eval skip |
| Worker typecheck                                   |                                    clean |
| Prompt snapshot disposable PostgreSQL suite        |                                      1/1 |
| Composed disposable PostgreSQL parity              |                                    15/15 |
| Hosted Supabase RPC drift (read-only)              |                        273 aligned names |

No deploy, live configuration mutation, paid provider call, or hosted fixture write was performed.

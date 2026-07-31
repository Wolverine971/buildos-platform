<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md -->

# Agentic Chat Worker Migration: Phase 0 Independent Audit

**Date:** 2026-07-29

**Auditor:** fresh-context deep-reasoning agent (no authorship of the plan or contracts), commissioned per the Phase 0 exit gate. Scope: the migration plan, contract lock (revisions .2/.3), parity ledger, baseline doc, executable TS contract + fixtures, preflight SQL, with load-bearing claims spot-checked against live code and migrations (79 tool calls).

**Overall disposition:** No verdict is a blanket rejection of the architecture. The REJECTs are contract-text and coverage defects with concrete fixes; the direction — including the 2026-07-29.3 first-turn-latency redesign — is affirmed. The Phase 0 gate is NOT passed until the P0 findings and named conditions are resolved and this audit is re-accepted (or residuals explicitly waived).

## Operator re-audit handoff — 2026-07-31 (not an auditor verdict)

The original disposition and findings below are preserved as the historical independent-audit record. Since that audit, contract revisions .4/.5 and the linked planning artifacts incorporated F1–F23; the 2026-07-30 re-audit reduced the remaining normative blockers to N1 and S1, and revision .5 corrected both. This operator update supplies the evidence requested for a final fresh-context decision; it does not self-accept the gate.

Final hosted evidence:

- artifact: `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`;
- clean `HEAD`: `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5`;
- tree: `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`;
- registered gate: eight scenarios × three repetitions, retries disabled;
- outcome: 24/24 scenario executions, 30/30 turn assertions, and 30/30 terminal completions passed;
- capture integrity: zero stream-error turns and zero capture-error turns;
- attribution: model/provider/profile and cost retained; final run cost $0.13314743;
- persistence/performance: legacy client/server timing, 170 tool-execution samples, and retained row/serialized-byte footprint recorded without prompt, message, tool-argument, tool-result, or event-payload bodies.

The correction chain retains both failed and focused recovery cohorts so the reviewer can distinguish product defects, provider failure behavior, and harness false negatives from the final pass. The decisive acceptance artifact is the final clean-tree gate above; `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md` indexes its limitations and the remaining security track.

| Retained 2026-07-31 artifact                                                   | Audit purpose                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `agentic_chat_worker_phase0_diagnostic_2026-07-31_fa3987ba7.json`              | Focused proof that the internal lifecycle persistence correction retained completed tool work              |
| `agentic_chat_worker_phase0_gate_2026-07-31_fa3987ba7.json`                    | Failed full cohort that exposed provider-stall handling and a date-fragile reschedule fixture              |
| `agentic_chat_worker_phase0_targeted_2026-07-31_90d99599c.json`                | Focused project-organization/reschedule recovery proof                                                     |
| `agentic_chat_worker_phase0_gate_2026-07-31_90d99599c.json`                    | Full cohort that isolated research routing/judge weaknesses after stream/capture errors reached zero       |
| `agentic_chat_worker_phase0_research_targeted_2026-07-31_90796dc5e.json`       | Focused research finalization/readback proof after routing and judge hardening                             |
| `agentic_chat_worker_phase0_gate_2026-07-31_90796dc5e.json`                    | Full cohort that exposed one completion-harness false negative and one outer scenario-timeout edge         |
| `agentic_chat_worker_phase0_carry_research_targeted_2026-07-31_23786a1fd.json` | Exact trace proving the product updated a generated `START HERE` surface that the scenario did not observe |
| `agentic_chat_worker_phase0_carry_targeted_2026-07-31_0f63e47bb.json`          | Focused 3/3 proof after the scenario began observing every pre-existing `START HERE` surface               |
| `agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`                    | Decisive clean-tree closure gate: 24/24 scenarios and 30/30 turn assertions                                |

**Requested independent decision:** Use `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_FINAL_REAUDIT_BRIEF_2026-07-31.md` to re-audit contract revision .5, the migration plan, parity ledger, production preflight, correction chain, and final hosted artifact. Record explicit acceptance, rejection, or waiver. Phase 0 remains open and Phase 1 remains unstarted until that decision is retained.

## 1. Verdict by exit-gate item

| Exit-gate item                                                                          | Verdict                                                                                                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Executable contract lock (`agentic_chat_worker_v1` types + fixtures)                    | **ACCEPT WITH CONDITIONS** — F5, F13, F14, F20                                                                               |
| Contract doc ↔ code consistency                                                        | **ACCEPT WITH CONDITIONS** — fixtures pass and hashes match; stale fixture counts (F14)                                      |
| Phase order (safety in Phase 2 before Phase 3 model call)                               | **ACCEPT WITH CONDITIONS** — F2 and F4 must enter Phase 2A/2C scope first                                                    |
| §15 default #1 — per-user topic `chat-user:<user_id>`                                   | **ACCEPT WITH CONDITIONS** — F8, F16, F17, F21                                                                               |
| §15 correction #12 — session-inline admission                                           | **REJECT as specified** — F1, F6, F9 are reachable duplicate-turn/message paths; direction right, contract text not yet safe |
| "All 12 corrections have named proving tests and no unresolved safety-semantics choice" | **REJECT** — F2, F5, F6 are unresolved choices that change safety semantics                                                  |
| Parity ledger — "no known current behavior lacks an owner or proving test"              | **REJECT** — billing guard (F10), `chat_prompt_snapshots` (F7), admin replay runner (F22), `queue_jobs` (F3) uncovered       |
| Phase 0 baseline                                                                        | **ACCEPT WITH CONDITIONS** — F14: baseline commit vs dirty-tree mismatch                                                     |
| Target-DB preflight                                                                     | **ACCEPT WITH CONDITIONS** — F3, F6 preflight scope gaps                                                                     |
| Hosted quality baseline, timing/write-rate baseline                                     | Correctly self-declared pending; not waivable if Phase 4 parity gates are to mean anything                                   |

## 2. Findings

### P0

**F1. A legitimate retry of a pending send can change the canonical hash; the prescribed 409 response then creates a duplicate turn.** `CanonicalAdmissionRequestV1` hashes `sessionId` (nullable), `lastTurnContext`, and `projectFocus` (`packages/shared-types/src/agentic-chat-worker-contract.ts:28-48`). `LastTurnContext` contains a timestamp (`packages/shared-types/src/agent.types.ts:45-63`) and these are client-recomputed values that can mutate between a lost admission response and its retry (the client is now channel-subscribed from mount). No doc locks a client retry rule. Hash mismatch → `idempotency_conflict` whose prescribed client behavior is "new client turn id required" → second turn/message/session while the original executes invisibly.
_Fix:_ (a) drop `sessionId`, `lastTurnContext`, `projectFocus` from the hashed semantic command; validate them against the stored turn instead (supplied `sessionId` must equal stored `session_id`, else typed conflict); (b) lock the client rule: cache the canonical bytes/hash of a pending send and resend byte-identically until a durable handle or terminal rejection; (c) change `idempotency_conflict` client behavior to "resolve the existing turn by `(user_id, client_turn_id)`", never mint a new id.

**F2. Two concurrent writer paths share one per-generation sequence counter; a DB-rejected write is never broadcast and its text is already consumed → durable prefix loss.** The text batch flush loop and per-event semantic writes both allocate from the same sequence under an "expected sequence progression" predicate; "at most one flush in flight" is scoped to text only. Rev .3's immediate first-text flush removes the 200 ms window exactly when prompt/phase/tool events cluster.
_Fix:_ contract must state (i) sequence numbers are allocated inside the write RPC (`last_event_sequence + 1 RETURNING`), never asserted by the caller; (ii) all writes for a turn pass through a single serialized per-turn in-flight slot. Add a Phase 2C fixture interleaving first-text flush with three semantic events; assert zero rejected writes and a gap-free prefix.

**F3. `authenticated` can insert `queue_jobs` — forged `agentic_chat_turn` jobs bypass the entire pre-admission capacity gate.** `add_queue_job` is not `SECURITY DEFINER` (`supabase/migrations/20260724010000_queue_correlation_ids.sql:6-16`) and is called from live routes with the user-scoped client (`project-calendar.service.ts:932`, `onto-event-sync.service.ts:1296`). Either `authenticated` holds INSERT on `queue_jobs` (forged chat jobs starve `CHAT_CONCURRENCY`, defeat §7.5 step 4) or those endpoints silently fail in production — both are findings. `queue_jobs` appears in neither §12 nor the preflight.
_Fix:_ add `queue_jobs` to the preflight; Phase 2A lockdown item (definer + job-type allowlist, or revoke authenticated INSERT); BEFORE INSERT trigger rejecting `agentic_chat_turn` from non-service roles; add the forged-job case to the Phase 5 matrix. **Also a live production security item independent of this migration.**

**F4. "Resolve-or-create the session" is unspecified and both readings are defective.** Current `session-service.ts:430-610`: without a session id, only `daily_brief` resolves an existing canonical session — every other context always creates (so F1's retry mints a second session/thread). Reading it as "resolve by context target" instead silently merges two tabs' fresh chats into one session and breaks one-active-turn for legitimate parallel work.
_Fix:_ pin: `sessionId: null` ⇒ create, except the existing `daily_brief` canonical-key lookup, which must be made race-safe (currently `limit 1` best-effort with no unique constraint). F1's fix prevents the duplicate-session path.

### P1

**F5.** Nothing states who computes `request_hash`, and §7.5's "RPC computes it" cannot reproduce the pinned JS fixtures (Postgres `jsonb` orders keys by length-then-bytes, not lexicographically). _Fix:_ the web gateway canonicalizes/hashes (server code — satisfies "never trust a client hash") and passes it to the RPC, which only compares; or add a cross-language fixture proving a SQL canonicalizer reproduces both pinned hashes before Phase 2B.

**F6.** The preflight checks duplicates only for `(session_id, client_turn_id)` and running-only status; rev .3's `(user_id, client_turn_id)` key is coarser and the new active index covers queued+running. It also omits `chat_messages`, `chat_sessions`, and `queue_jobs`. _Fix:_ add both duplicate probes and the three tables before the retained target-DB capture.

**F7.** `chat_prompt_snapshots` has a live `authenticated` INSERT policy and route-side user-scoped insert (`+server.ts:2675-2680`) but is missing from §12, the ledger inventory, and the Phase 2A revoke list (the preflight does inventory it — docs disagree with the instrument). Forged snapshots poison admin analytics and the replay/eval corpus. _Fix:_ add to all three; route through the server-only observability writer in Phase 1.

**F8.** No client can obtain a `TurnHandle` for an existing active turn (handles are only minted at admission), while the routing rule is "ignore events for turns you hold no handle for" — so a page reload during a running worker turn discards its own live events, making invariant 16 and the 1 s reconnect SLO unreachable in the most common case. _Fix:_ add `GET /turns?session_id=` (or `/sessions/<id>/active-turn`) returning a handle for an owned active turn; specify handle adoption; add a "reload during running turn resumes live output" proving test.

**F9.** Worker admission locks per-user; Phase 1's legacy RPC locks per-session; the contract transition table still says "Session lock" (stale after rev .3). During canary, one user's two tabs on different transports pass both locks; the only guard left is the unique index surfacing as a raw 23505. _Fix:_ same per-user advisory lock domain in both admission RPCs; map 23505 on the active-turn index to typed `active_turn_conflict`; correct the table row.

**F10.** Worker mode moves AI spend outside the consumption-billing guard's window: the post-response gate re-evaluation (`hooks.server.ts:577-585`) fires at the 202, before any model call, so a frozen/near-cap account can consume an unbounded turn. No ledger row covers billing. _Fix:_ ledger row (gateway pre-check + worker finalization-time gate re-evaluation RPC) + Phase 4 proving test. Decision needed given billing is the current business-critical path.

**F11.** Chat queue timeouts (`CHAT_WORKER_TIMEOUT_MS`, `CHAT_STALLED_TIMEOUT_MS`) are absent from the locked operating values; and `reset_stalled_jobs` has no job-type filter, so a chat consumer instance with a short stalled timeout would requeue general jobs (the plan handles only the reverse direction). _Fix:_ lock both values with `CHAT_STALLED > CHAT_WORKER > 285 s + finalize margin`, assert at startup; parameterize `reset_stalled_jobs` by job types per instance.

**F12.** Locked operating values are internally contradictory: "2 active and 20 queued" contradicts invariant 2 (queued counts as active); per-user cap 3 exceeds the system cap 2; the 60 s no-progress sweeper threshold contradicts 300 s max queue residence for queued turns. _Fix:_ restate as `max_running`/`max_queued`; per-user cap ≤ system cap; sweeper thresholds qualified per state.

**F13.** Canonicalizers hand-enumerate fields with no field-set assertion — adding a type field silently excludes it from the hash, so semantically different requests collide. _Fix:_ fixtures pinning `Object.keys(...)` of all three canonicalizer outputs.

**F14.** The frozen baseline is not frozen: baseline pins `b326aa74b` but the measured runs were taken on a dirty tree with staged production changes to the stream route, orchestrator, finalization-runner, and tool-selector (exactly ledger rows P14/P15/P29). Fixture counts are stale in all three docs (docs say 6 fixtures/11 tests; actual 7/12 after rev .3). _Fix:_ commit or stash the in-flight work, re-run, record exact tree hash and corrected counts.

### P2

**F15.** §12 "Realtime topic RLS validates chat-session ownership" is stale after rev .3 — should be topic user id = `auth.uid()` (pattern precedent: `20260615000000_agent_work_phase0.sql:328-344`).
**F16.** Lease/readiness edges: no renew-before-Send rule for near-expired leases (throttled background tabs), context switch during drafting maps to `lease_invalid` though it is a normal user action, and `JOINING` is conflated with "down" (consider admitting on `JOINING` given lossless reconciliation + watchdog).
**F17.** Channel lifetime is now hours, adding a JWT-refresh failure mode absent from the Phase 5 matrix; require re-auth on `TOKEN_REFRESHED` and treat `CLOSED`/`CHANNEL_ERROR` as not-ready.
**F18.** "Migrations are additive" is false for three planned changes (event-sequence key swap, running-only index replacement, status CHECK change); `queue_type` is a PG enum (`ALTER TYPE ADD VALUE` is irreversible and cannot be used in its adding transaction); `CREATE INDEX CONCURRENTLY` cannot run inside a migration transaction. State these explicitly.
**F19.** Prepared-history-won turns have no message ids (`prepared-prompt-history.ts:12-36`) — `sourceMessageId` all null, exclusion filter inoperative, `history_message_ids` undefined; prewarm history freezing extends staleness to compose-time + queue residence. Add `history_source` to the artifact + differential test.
**F20.** `TurnSnapshotV1.execution_mode` is pinned `'worker_realtime'` but §8.3 has both transports implementing `reconcile()`. Widen or specify a legacy variant.
**F21.** Per-user topic multiplies Realtime fanout by (open tabs × active sessions); Phase 7 measures failures but not fanout factor or message quota/cost. Add both.
**F22.** The admin replay/eval runner is an undocumented `/stream` caller with a non-UUID, colon-bearing `client_turn_id` (`prompt-replay-runner.ts:231-238`) and a direct `chat_turn_runs.source` UPDATE that the Phase 2 revoke will break. Absent from ledger and security inventory.
**F23.** `AgentStreamEventV1` is a parallel type, not a generalization of the existing `AgentSSEMessage` union — nothing compiler-enforces payload-variant survival. Add a type-level exhaustiveness test in Phase 1.

## 3. Affirmations (probed and found sound)

- Queue pool isolation is real: `claim_pending_jobs(p_job_types, …)` receives only the instance's registered processors; a general consumer cannot claim chat jobs. The prerequisite module-global-config refactor claim is accurate.
- Realtime is an acceleration path, not truth; the system operates through a Realtime outage (durable write precedes publish; fallback is bounded reconcile polling, never re-execution).
- Duplicate-first admission ordering is correct and preserves the lost-race-must-not-consume-prompt invariant (P09).
- The bootstrap-claims removal is genuinely subsumed by the request hash for context conflicts (residual risk is F1's false conflicts, not missed ones).
- Concurrent duplicate first-turn admissions cannot create two sessions/turns under the per-user lock + single transaction; rollback-leaves-no-session follows directly.
- Per-user topic RLS is soundly expressible and leaks nothing across tenants; `agent-run:` policy is a working precedent; admin SELECT policies do not grant Realtime subscribe.
- Terminal CAS semantics are correct and executable; `decideTerminalFinalizationV1` implements the truth table exactly; fixtures pin all five rows.
- Immutable-history hashing is correct (retention-metadata exclusion, deep-clone isolation); suite re-run: 7/7 pass, all three pinned hashes match.
- Excluded transport metadata cannot affect the admission hash (verified by fixture).
- First-turn latency is genuinely improved by the redesign; subscribe/admit ordering cannot lose the first event.
- Cancellation reaches a running worker during model I/O; the batched-observer bound is well specified.
- Effect reservation is provider-id-independent; the reserved→started boundary split is correct.
- The ledger's security/write inventory is factually accurate for the four surfaces it lists (verified against the four migrations).
- Ledger P08's split-write gap is real (detached user-message promise at `+server.ts:2014-2043`; non-transactional lookup-then-insert admission); the atomic legacy RPC is the right first Phase 1 slice.
- Message idempotency will work as designed (`uq_chat_messages_session_idempotency_key` verified).
- Browser `client_turn_id` is `crypto.randomUUID()` — the new user-scoped key will not collide for real traffic; the risk is legacy rows + programmatic callers (F22).
- The queue-pickup SLO split (wake path carries p95; polling is durability) correctly resolves the earlier contradiction.
- Rollout/rollback semantics are coherent (immutable stored mode; flags affect only new leases; kill epoch rejects only unused leases; no SSE replay of worker turns).

## 4. Required follow-up

1. Resolve F1–F4 with contract revision .4 + updated fixtures; re-run this audit's REJECT items.
2. Fold F5–F14 fixes into the contract lock, preflight, ledger, and plan before Phase 2 scoping.
3. F3 (`queue_jobs` grants) should be verified against production and fixed independently of the migration timeline.
4. F10 needs an explicit product/billing decision (worker-mode spend gating) — DJ call.
5. F14 needs the working tree reconciled (commit or stash the staged route/orchestrator work) before the baseline re-run — coordinate with any live experiment using the v2 route as a control lane.

### Operator completion map — 2026-07-31

| Original follow-up | Operator disposition for re-audit                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1–F4              | Incorporated in contract revision .4 and updated fixtures; revision .5 closes the later N1 excluded-field validation residual                         |
| F5–F14             | Incorporated across the contract lock, preflight, ledger, migration plan, and exact-tree baseline                                                     |
| F3 security track  | Production exposure verified; repository hardening exists, while deployment verification and the future non-service guard remain explicit checkpoints |
| F10 billing        | Option A locked: admission pre-check plus worker finalization-time gate re-evaluation; Phase 4 proving tests named                                    |
| F14 freeze         | Final gate ran from and recorded a clean exact commit/tree                                                                                            |

Only a fresh independent reviewer can convert this completion map into Phase 0 acceptance.

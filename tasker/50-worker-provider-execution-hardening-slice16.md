<!-- tasker/50-worker-provider-execution-hardening-slice16.md -->

# 50 — Worker provider/execution hardening (Slice 16) before cohort widening

**Created:** 2026-08-06  
**Status:** Deployed and live-proven by canary 11 (2026-08-07, turn `9e54c04b`, PASS): W5 observation ledger delivered 16/16 lifecycle boundaries live; D2a/D2b terminal repairs deployed (D2a untriggered — validator accepted the draft first try); hosted migrations `20260806010000`/`020000`/`021000` all applied. The 2026-08-07 follow-up closes the local W2 source audit, bounds a single client's reconcile-trigger storm, and removes terminal/activity duplication in the client. Before cohort widening, deploy/canary that follow-up and complete the explicitly authorized production gates: the prod-vs-disposable constraint diff and a deliberate provider-budget overrun. The reconcile trigger's original production source remains instrumented but unproven; stale legacy rows remain non-blocking cleanup debt after the W6 capacity scoping.
**Mission:** Close the worker-execution weaknesses exposed by the 2026-08-05 canary campaign so a slow or misbehaving provider, tool call, or network path degrades a turn quickly and legibly instead of consuming the whole job budget. This is required before widening the cohort beyond one user; it is not required for the single read canary (tasker/49 owns unblocking that).

## Why this work exists

Turn `670b3163-2c1a-407d-9a84-980b88d42f32` occupied its worker slot for the full 360-second job timeout plus sweeper grace while making zero durable progress after 8 seconds. With `CHAT_CONCURRENCY=1`, one such turn freezes the entire chat lane for ~7 minutes. Nothing crashed — every fence held — but the budget model treats "hung" and "working" identically until the job timeout. Evidence: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_15_ADMISSION_CAPACITY_OVERLAP_PLAN_2026-08-05.md` and `tasker/49`.

## Work packages

### W1 — Total provider wall-clock cap below the job timeout

Today the only end-to-end bound is `workerTimeoutMs` (360s). Per-attempt bounds exist (90s request timeout, up to 4 routes), so worst-case provider time alone can reach ~360s before the job timeout fires, guaranteeing the sweeper — not the executor — writes the terminal state. Add a per-turn provider budget (e.g., 120–150s across all rounds, attempts, and routes combined) enforced in the executor so exhaustion produces an honest executor-written terminal failure with a specific `failure_code`, not `worker_interrupted`/`stale_context` from recovery.

### W2 — Bounded deadline on every tool-side network call

Before Task 49, `readOnlyTool.ts` and `toolExecution.ts` made Supabase read/RPC calls guarded only by cooperative `throwIfAborted` checks before and after — the awaited network call itself had no deadline. Give every tool-side call an explicit AbortSignal-backed timeout (seconds, not minutes) and a typed failure classification. Task 49 now owns the confirmed production read/ledger repair; retain this package as the audit for future tool paths.

**Task 49 result:** landed. The whole project-status read and the ledger RPC each have a 30-second local deadline; the child signal reaches every Supabase request in the project-status path and the ledger RPC. Hung-read, hung-ledger, and executor-terminal regressions are green. Keep W2 here as the broader audit across any future tool paths.

### W3 — Abort-propagation audit from job timeout to every await

Verify the signal chain: job timeout / cancellation observer → `executionControl` → provider client attempts → tool execution → publisher flushes. Every long-lived await in the turn path must be abortable by both cancellation and job-budget expiry. Add a test that a hung (never-resolving) tool call or provider stream still yields an executor-written terminal within the budget.

### W4 — Classify no-text provider finishes as non-retryable

A synthesis round that finishes without any text (e.g., token budget consumed invisibly, empty completion) currently risks classification as retryable, multiplying a deterministic failure across routes/attempts. Classify "finished cleanly but produced no assistant text" as permanent for the turn, with its own `failure_code`, after at most one retry.

### W5 — Per-attempt provider observations in the lifecycle projection

The Slice 12 lifecycle view second-stamped everything up to the tool call and then went blind until the sweeper. Emit durable observations for: provider attempt started/ended (route id, model, duration, finish reason or error class, usage) and tool execution started/ended. Redact content. This turns the next stall from a multi-hour forensic session into one query. (The web-side equivalent — logging the admission RPC's `capacity_reason`/counters in the route's `capacity_exceeded` branch — rides along here; it was the missing discriminator for the max_running incident.)

**Task 49 canary subset:** landed as redacted best-effort structured Railway logs for `read_op`, `ledger_persist`, `tool_result_publish`, and synthesis entry. These deliberately do not consume public event sequence numbers or appear in the UI. W5 still owns durable private lifecycle observations and per-provider-attempt start/end evidence; ordinary logs are the immediate canary discriminator, not the final telemetry contract.

### W6 — Stale-legacy-turn sweeper pulled forward (Phase 5 item, now urgent)

The `max_running=2` admission cap counts per-user `queued/running` turns across **all** execution modes; 57 stale legacy `running` rows (oldest 113 days) silently blocked every worker admission until manually repaired on 2026-08-05 (snapshot retained in the operator scratchpad). Legacy turns still accumulate stale `running` rows (~1/week observed). Either productionize the legacy-side stale-turn sweep now, or scope the RPC cap to worker-mode turns via a reviewed hosted migration — decide explicitly, don't let both wait for Phase 5.

## Exit gate

- A deliberately hung provider stream and a deliberately hung tool call each produce an executor-written terminal failure within the configured budget, with specific failure codes, in tests.
- Provider attempts and tool execution boundaries appear in the lifecycle projection for a live turn.
- No failure path in the turn executor can occupy the chat slot for more than the provider budget + bounded overhead.
- The stale-legacy-rows decision (sweeper vs cap scoping) is made and implemented.
- Full worker + web agentic gates green; findings folded into the Phase 4 evidence chain.

## 2026-08-06 implementation result

Detailed evidence and deployment notes live in
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_16_EXECUTION_HARDENING_EVIDENCE_2026-08-06.md`.

- **W1/W3:** `CHAT_PROVIDER_BUDGET_MS` defaults to 150 seconds and must remain
  below the worker timeout. The executor starts the cap after the provider-start
  fence, propagates its signal through provider/tool/publisher work, preserves
  bounded terminal-control overhead, and writes
  `provider_budget_exhausted` instead of waiting for the 360-second queue timer.
- **W2:** Task 49's 30-second read and ledger deadlines remain intact. Their
  executor terminal codes are now preserved as `read_tool_timeout` and
  `tool_execution_persist_timeout`.
- **W4:** A clean initial or synthesis finish without assistant text is a
  permanent `provider_no_assistant_text` failure with no route amplification.
- **W5:** A service-only, generation/lease-fenced observation ledger records
  redacted provider-attempt and tool-execution start/end boundaries. The Slice
  12 lifecycle view now includes those rows without consuming public sequence
  numbers. The admission route logs `capacityReason`, `runningCount`, and
  `queuedCount` in its bounded-capacity branch.
- **W6 decision:** the per-user `max_running`/`max_queued` capacity query now
  counts `worker_realtime` turns only. Same-session active-turn conflicts remain
  cross-mode. Stale legacy rows therefore remain operational cleanup debt but
  cannot silently freeze worker admission.
- **Local evidence:** worker check passed; all 769 worker tests passed (one
  intentional skip); web `svelte-check` passed with zero diagnostics; all 3,694
  web tests passed, including the disposable PostgreSQL suites; the standalone
  Slice 16 PostgreSQL test passed. The live real-model web harness still
  requires a running dev server, test Supabase, and explicit spend authorization
  before deployment evidence can be attached.

## 2026-08-07 follow-up hardening (local, gates green)

- **W2 source audit:** the worker currently exposes one read tool,
  `get_project_overview` (`onto.project.status.get`). Its complete gateway path
  and the execution-ledger write are enclosed by 30-second abortable deadlines,
  and every project-status Supabase RPC/query receives the child signal. The
  disposable ledger regression now writes and asserts the production-compatible
  `utility` category, so the known production
  `chat_tool_executions_tool_category_check` is exercised locally. A full live
  `pg_constraint` diff is still an operator gate: the CLI keychain credential
  available in this environment is not an accepted raw Management API PAT, and
  credentials must not be recovered from CLI traces. Use an approved read-only
  production query path or an operator-provided PAT for that diff.
- **Reconcile storm containment:** triggers that arrive while reconciliation is
  in flight remain queued behind the normal changed-state watchdog (2 seconds,
  jittered) instead of draining immediately when the request completes. A
  request/channel trigger storm therefore cannot reproduce canary 10's ~3/s
  loop inside one coordinator. The durable `reason` instrumentation remains in
  place to identify the original trigger source and any cross-instance loop.
- **Client terminal/activity cleanup:** durable thinking activities deduplicate
  on `event_id`, and worker completion/failure/cancellation terminalizes the
  exact thinking block by `turn_run_id` even when the semantic done projection
  was missed or replayed. This removes duplicate activity rows and the residual
  “BuildOS is thinking” state after terminal receipts.
- **W6 remains decided:** admission capacity counts only `worker_realtime`
  turns. Legacy-row cleanup is still worthwhile operational maintenance, but it
  is not a worker-capacity or cohort-widening blocker.
- **Still production-gated:** the provider-budget overrun canary deliberately
  spends model capacity and mutates production turn state. It was not run
  without explicit authorization and remains an exit gate together with the
  production constraint diff and deployment of this follow-up.
- **Verification:** focused coordinator/thinking/SSE regressions passed (72/72),
  the affected composed-flow and coordinator tests passed (11/11), the composed
  PostgreSQL read-tool contract passed (8/8), `svelte-check` completed with zero
  diagnostics, and the escalated full web suite passed 574 files / 3,703 tests.

## 2026-08-06 late-evening fix package (D2a + D2b + observability, local, gates green)

Everything below was implemented and locally verified in this package. Its
hosted migrations and worker/web deploy were pending at that point; they are now
applied and live-proven by canary 11 as recorded in the status above.

- **D2a (worker):** `fixtureTurnExecutor` gained `finalizeWithTimingFallback`:
  a finalize failure is reported through the new `onTerminalControlError` port
  (wired to redacted Railway logs in `phase3Assembly`), and when the rejected
  input carried a timing draft the terminal CAS is retried exactly once with
  the draft stripped (cancelled also drops last-turn context, failed drops the
  public-error pair, matching the RPC variant contract). `recover()`'s bare
  catch now reports before returning `recovery_required`. Tests: retry-success
  and double-failure cases in `agenticChatFixtureTurnExecutor.test.ts` (37/37).
- **D2b (hosted migration `20260806020000_agentic_chat_timing_evidence_repair.sql`,
  generated from live prod prosrc with fail-loud replaces):**
  `chat_turn_stream_state.first_text_persisted_at` is stamped by the first
  flushed text batch (exactly the receipt `persisted_at` the runtime tracker
  echoes), cleared by claim's generation reset, and both terminal-events and
  failure-events validators read it instead of the never-populated
  `text_delta` filter over `chat_turn_events`. All seven phase-arithmetic
  comparisons now use `agentic_chat_epoch_ms()` (floor per timestamp),
  reproducing JS `Date.parse` truncation — the second, independent reason
  every real prod draft failed (`EXTRACT` microsecond precision vs JS
  milliseconds; disposable fixtures had whole-ms offsets so local gates never
  saw it). Regression test
  `supabase/tests/20260806020000_agentic_chat_timing_evidence_repair.test.sql`
  proves the exact canary-10 shape (real flush RPC, zero text_delta rows,
  sub-millisecond-unaligned fixtures, accept truthful JS draft / reject
  microsecond draft / claim reset) inside the composed phase2c suite (8/8).
  The shared draft helpers in the 20260804000120 SQL test were re-sourced to
  the new evidence so the 033000/034000 suites stay truthful.
- **log_client_error (web + hosted migration `20260806021000`):** root cause of
  the dropped client errors was the sanitizer's phone-redaction rewriting IPv4
  digit runs to `[redacted-phone]` before the `::inet` cast. The web logger now
  validates the ORIGINAL `ipAddress` (mirroring the UUID normalization
  precedent) and stores a well-formed address or NULL; the anon-callable RPC
  now uses exception-safe `public.safe_inet()` so junk degrades to NULL
  instead of rejecting the whole log row (validated in a scratch database).
- **Reconcile-runaway instrumentation (web):** the coordinator now appends the
  reconciliation `reason` to the reconcile query string, so the next runaway
  names its triggering loop directly in Supabase edge logs instead of needing
  another forensic session. No behavioral fix is attempted yet — the 3/s loop
  could not be convicted from durable evidence alone.

## 2026-08-06 canary 10 findings (turn `1422ffc3` — see tasker/49 for full evidence)

- **D2 mechanism identified — it was never a hang.** The executor called
  `finalize_agentic_chat_turn_with_terminal_events` at 23:41:07.639, received
  HTTP 400 (`agentic_chat_terminal_events_finalize_timing_evidence_mismatch`),
  and `finalize()`'s bare `catch { return result('recovery_required') }`
  swallowed it — no log, no retry without the optional timing draft, no
  fallback terminal, no queue reconciliation. Sweeper cleaned up at +420 s.
  `recover()` has the identical bare catch. Both need: (1) error logging,
  (2) one retry with `timingDraft: null` on finalize rejection, (3) a bounded
  fallback that writes SOME terminal instead of abandoning the slot.
- **The provider budget was never implicated** — the turn finished provider
  work cleanly at 58.5 s; the failure was control-plane. W1's budget remains
  unexercised by a real overrun in production.
- **Timing validator contract bug (D2b):** the `20260804000120` validator
  derives `first_response_at` from `text_delta` rows in `chat_turn_events`,
  but worker text batches persist to `chat_turn_stream_state` and write no
  such rows. Every streamed worker turn deterministically fails validation.
  Decide: migrate the validator's evidence source, or omit response timings
  from the worker draft.
- **Client-side reconcile runaway:** ~3 reconcile calls/second for 7 minutes
  (1,314 calls) while a worker turn is live with the drawer open — the
  documented cadence is single-flight 2 s/5 s, and this is the likely
  mechanism behind attempt 7's "actions counter 729" observation. Own it here
  or in a new tasker before cohort widening.
- **`log_client_error` is broken** (6 × 400, `invalid input syntax for type
inet`) — client errors during incidents are being dropped.

## 2026-08-06 live canary findings (turn `f729f360`, canary 8 — see tasker/49)

- **W5 validated in production.** The observation ledger second-stamped
  provider attempt (3.1 s, tool_calls) and tool execution (801 ms,
  error_code 23514) and localized the failure in one query. The stall class
  that took a multi-hour forensic session on 2026-08-05 took minutes.
- **W1/W3 FAILED in production (open defect D2).** After the ledger 23514
  throw at 21:29:37.56Z the executor never wrote a terminal; the 150 s
  provider budget produced no executor-written failure; the sweeper
  terminalized at 422 s with the slot occupied throughout. The exit-gate
  claim "no failure path can occupy the chat slot for more than the provider
  budget + bounded overhead" does not hold live. Candidates: provider-generator
  cleanup between the read-tool throw and the outer catch is not
  signal-abortable, or `recover()`'s catch swallows a failed recovery RPC into
  `recovery_required` without a terminal write. Discriminator: Railway
  `agentic_chat_execution_boundary` logs 21:29:37–21:36:33Z.
- **W2 audit gains a new class: schema-drift contract gaps.** Prod carries
  pre-migration constraints absent from the disposable fixtures
  (`chat_tool_executions_tool_category_check` rejected the worker's
  `'project_read'`). The constraint is now mirrored into the legacy base
  fixture and the worker sends legacy-consistent `'utility'`; the broader
  audit should diff prod `pg_constraint` against the disposable schema for
  every table the worker writes (Management API query path is proven:
  Supabase CLI keyring token → `POST /v1/projects/{ref}/database/query`).

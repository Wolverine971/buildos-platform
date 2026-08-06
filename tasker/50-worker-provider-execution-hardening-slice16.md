<!-- tasker/50-worker-provider-execution-hardening-slice16.md -->

# 50 — Worker provider/execution hardening (Slice 16) before cohort widening

**Created:** 2026-08-06  
**Status:** Implemented locally — worker, web route/type, and disposable SQL gates green; hosted migration and live canary evidence remain  
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
  intentional skip); web `svelte-check` passed with zero diagnostics; 17
  admission-route/service tests passed; the disposable Slice 16 PostgreSQL test
  passed. The live real-model web harness still requires a running dev server,
  test Supabase, and explicit spend authorization before deployment evidence can
  be attached.

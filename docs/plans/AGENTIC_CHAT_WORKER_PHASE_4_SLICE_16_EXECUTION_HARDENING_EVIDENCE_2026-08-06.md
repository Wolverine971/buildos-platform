<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_16_EXECUTION_HARDENING_EVIDENCE_2026-08-06.md -->

# Agentic Chat Worker Phase 4 Slice 16 — execution hardening evidence

**Date:** 2026-08-06  
**State:** hosted migrations deployed and canary 11 live-proven; 2026-08-07 client/reconcile follow-up complete locally, production gates pending

## Decision summary

Slice 16 closes the worker-slot failure window below the queue's 360-second
timeout. Provider execution owns a 150-second per-turn budget across initial and
synthesis rounds. Non-provider awaits that could delay recovery or finalization
have independent 10-second bounds, while Task 49's read and ledger calls retain
their 30-second AbortSignal-backed deadlines.

The stale legacy admission incident is addressed by scoping the per-user
`max_running=2` and `max_queued=20` counts to `worker_realtime` rows. The
same-session active-turn conflict remains cross-mode, so a real live legacy turn
still prevents two writers from owning one conversation. Historical legacy rows
remain visible for cleanup but no longer consume worker-lane capacity.

## Durable failure contract

| Failure                                  | Durable terminal code            | Retry class          |
| ---------------------------------------- | -------------------------------- | -------------------- |
| Total provider budget exhausted          | `provider_budget_exhausted`      | `timeout_post_start` |
| Provider finishes without assistant text | `provider_no_assistant_text`     | `permanent`          |
| Read operation deadline                  | `read_tool_timeout`              | `transient_infra`    |
| Tool ledger deadline                     | `tool_execution_persist_timeout` | `transient_infra`    |

The recovery RPC still owns its compact retry classification. When it returns a
generic `finalize_failed` receipt for the same class, the executor preserves the
more specific local terminal code. Stale-generation, cancellation, and existing
terminal receipts continue to win unchanged.

## Private observations

Migration `20260806010000_agentic_chat_execution_hardening.sql` adds a
service-only observation table and RPC fenced by turn id, user id, queue job,
processing token, and execution generation. Exact replays are idempotent;
conflicting replays fail. SQL and TypeScript both bound payloads and allow only
redacted metadata.

The lifecycle projection now includes:

1. initial provider attempt started/ended;
2. tool execution started/ended;
3. synthesis provider attempt started/ended.

Provider rows carry route/model, duration, finish reason or error class, and
usage. Tool rows carry tool name, provider call id, sequence, duration, status,
and error code. Prompts, message content, tool arguments, and tool results are
not accepted. These rows do not use or mutate public reconnect sequence numbers.

## Local gate evidence

- `pnpm --filter @buildos/worker check` — passed. Existing repository warnings
  remain outside the Slice 16 files; there were no errors.
- `pnpm --filter @buildos/worker test` — 94 files passed, one intentionally
  skipped; 769 tests passed, one skipped.
- `pnpm --filter @buildos/web check` — zero errors and zero warnings.
- Web admission route/service regression — 2 files, 17 tests passed.
- `pnpm --filter @buildos/web test` — 573 files and 3,694 tests passed,
  including the disposable PostgreSQL contract suites.
- `pnpm --filter @buildos/web test:agentic` — offline harness tests passed (51),
  while the real-model scenario suite could not initialize because no dev
  server/test Supabase was running. That suite performs external writes and
  model spend and remains a deployment/canary gate, not an offline code gate.
- Disposable PostgreSQL composition through Slice 16 —
  `phase4_slice16_execution_hardening_ok`. It verified service-only grants,
  exact replay, redaction rejection, provider/tool lifecycle order, and the
  worker-only admission function definition.

## Deployment evidence and remaining gates

- Hosted migrations `20260806010000`, `20260806020000`, and `20260806021000`
  are applied.
- Canary 11 (2026-08-07, turn `9e54c04b`) passed. Its lifecycle projection
  retained all 16 expected provider/tool boundaries. The timing validator
  accepted the real draft, so the D2a retry-without-timing fallback was not
  triggered.
- The production budget relationship remains 150000 ms provider / 360000 ms
  worker by the deployed Task 50 evidence. A deliberately over-budget live
  provider run has not been authorized or executed.
- The known production-only tool-category constraint is mirrored in the
  disposable schema and the read ledger regression now persists/asserts
  `utility`. A complete production-vs-disposable `pg_constraint` diff still
  needs an approved read-only production query path or operator-provided raw
  Management API PAT.

## 2026-08-07 local follow-up evidence

- The production worker tool surface currently contains only
  `get_project_overview` (`onto.project.status.get`). Its whole project-status
  read and ledger persistence are each bounded at 30 seconds, and every network
  await on the read path receives the child AbortSignal.
- Reconcile requests queued while another request is in flight are held behind
  the jittered changed-state watchdog instead of draining immediately. The new
  fake-timer regression proves a trigger storm cannot exceed that coordinator's
  cadence.
- Thinking activities deduplicate by durable event id. Terminal worker receipts
  also finalize the exact thinking block by run id, providing a safety net when
  the semantic done projection was missed or replayed.
- Focused coordinator/thinking/SSE regressions: 72 passed. Affected composed
  flow plus coordinator: 11 passed. Composed PostgreSQL read-tool contract: 8
  passed. `pnpm --filter @buildos/web check`: zero diagnostics. Escalated
  `pnpm --filter @buildos/web test`: 574 files and 3,703 tests passed.
- Remaining gates before widening are deployment/live proof of this follow-up,
  the authorized production constraint diff, and a deliberately over-budget
  provider exercise. The original reconcile trigger source remains observable
  but not proven; the single-coordinator failure mode is now bounded.

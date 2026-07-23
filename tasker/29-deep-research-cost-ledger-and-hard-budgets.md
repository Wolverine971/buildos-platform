<!-- tasker/29-deep-research-cost-ledger-and-hard-budgets.md -->

# 29 — Deep Research Cost Ledger & Hard Budget Enforcement

**Created 2026-07-19.** Owner: agent-runtime / worker engineer.  
**Type:** safety-critical build handoff.  
**Depends on:** the V0.1 deep-research coordinator and child-run implementation.

## Outcome

Every paid operation in a deep-research tree is reserved before dispatch, attributed to the run
that caused it, rolled into the root budget, and reconcilable against the provider. No parallel
child or retry may consume money that was not allocated to it.

## Verified current state

Built locally on 2026-07-19:

- Tavily Search responses now carry a normalized billing record. Provider-reported
  `usage.credits` wins; missing/malformed usage falls back to the documented search-depth charge
  (basic = 1 credit, advanced = 2).
- Tavily is valued at no less than the current public PAYG ceiling of `$0.008/credit`. A higher
  `TAVILY_COST_PER_CREDIT_USD` may be configured; a lower value cannot silently weaken the guard.
- The worker explicitly requests Tavily usage, reserves only after local validation and immediately
  before network dispatch, and charges that reservation when a dispatched request times out/fails
  because a failed response is not proof of no bill. Locally rejected tool arguments remain free.
- `cost_usd` now includes LLM plus paid-tool cost; child `paid_tool_cost_usd` and
  `tavily_credits` roll into coordinator usage.
- Budgeted JSON LLM calls select one catalog-priced model, reserve a conservative one-token-per-byte
  prompt estimate plus overhead, cap output tokens, set OpenRouter `max_price`, and disable
  unreserved model and parse retries.
- One agent-loop LLM call may reserve at most `$0.04`; planner and synthesis calls receive explicit
  stage/remaining-budget envelopes.
- Settled child usage is checkpointed with the root's `synthesizing` state and tagged in
  orchestration state, so a coordinator restart neither forgets nor double-counts child spend.
- A protected `agent_run_cost_entries` lifecycle ledger now persists root/leaf identity, stable
  attempt key, provider/resource, reservation, actual usage/cost, request ID, state, and metadata.
- `reserve_agent_run_cost` serializes the tree on the root row and atomically enforces both leaf
  and root budgets. Duplicate equal calls are idempotent; changed economics conflict.
- Budgeted SmartLLM and Tavily calls reserve through the ledger before fetch. The worker rejects an
  existing logical attempt instead of redispatching it.
- `settle_agent_run_cost` idempotently settles/release/reconciles attempts. Missing usage or a lost
  response remains conservative; above-reservation actual cost is visibly reconciliation-required.
- Direct table writes are blocked. Seventeen disposable-PostgreSQL cases cover concurrent
  oversubscription, idempotency, conflicts, overrun resolution, mutation protection, bounded
  reconciliation claims, lease fencing, crashed-final-lease recovery, and authoritative
  settlement, the response-settlement/provider-lookup race, and denial of ledger/RPC access to
  `anon`/`authenticated`.
- A second migration adds expiring `SKIP LOCKED` reconciliation claims and bounded retries.
  OpenRouter `total_cost` is retrieved by generation ID and settled through a lease-fenced RPC.
- Missing provider IDs and unsupported Tavily/Moonshot lookups keep their exposure and are marked
  `reconciliation_needs_operator_at`; they are never silently released.

This closes the crash window where exposure existed only in worker memory and adds the first
automatic provider lookup. Deployment, live-provider proof, unsupported-provider operations, and
the broader quota/alert controls below remain open.

## Live checkpoint — 2026-07-22

The second capped smoke produced a durable row for every paid attempt: 35 rows, 34 settled and one
`reconciliation_required`. The unresolved row was a definitive OpenRouter ZDR/no-endpoint 404 with
no generation id; it retained a `$0.04` reservation even though no provider accepted work. Local
remediation now classifies only definitive pre-generation 404/410 route rejection as `released`;
timeouts, 5xx responses, missing usage, and any error with a generation id remain conservative.

The Agent Run caller also has one bounded provider fallback for deep/evidence work. It is not an
unreserved SmartLLM retry: it receives a distinct attempt key, repeats the durable budget check, and
reserves before dispatch. Known actual smoke spend was `$0.17764437`; conservative exposure was
`$0.21764436`, both safely below the `$2` batch guard. Local tests pass; deploy/re-smoke, resolution of
the historical unresolved row, reconciler enablement, quotas, and alerts remain open.

### Final remediation smoke — 2026-07-22

A clean, single-consumer four-case batch produced **55 terminal paid-attempt rows: 50 settled, 5
released, 0 reserved/reconciliation-required**. Clean-batch spend was `$0.267794599`; the complete
diagnostic session, including preserved failures and uncertain accepted-timeout exposure, stayed at
`$1.0041` under the `$2` guard. Direct deep runs remained below their 62.5k hard limit and children
below 20k/22k.

The same session exposed crash-redelivery accounting: a retry could reclaim its queue job while the
Agent Run row remained `running`, then skip the run and lose in-memory token/cost state. The worker
now permits only a genuine retry ordinal to reclaim a `running` row and reconstructs conservative
observed tokens, uncertain exposure, LLM/tool cost, and Tavily credits from
`agent_run_cost_entries`. Focused and full worker tests cover the pure policy. Remaining task-29
work is deployment/operational proof, historical-row reconciliation, quotas, alerts, and breakers.

## Work packages

### WP-1 — Durable reservation/settlement ledger (P0, built locally)

Implemented as a protected lifecycle ledger:

- root run id, leaf run id, attempt id / idempotency key;
- provider, operation, model/tool, units, and pricing snapshot metadata;
- `reserved`, `settled`, `released`, `reconciliation_required` status;
- reserved/actual USD, provider request id, timestamps, and metadata.

Reservation is an atomic DB operation that checks both the leaf allocation and root remaining
budget. A worker crash leaves an inspectable reservation. **All five base migrations plus the
`20260720010000_deep_research_hardening.sql` follow-up are deployed and role-verified** (2026-07-20):
`anon`/`authenticated` are denied on every cost RPC, the ledger table, and
`queue_deep_research_synthesis` (42501); `service_role` retains access. The hardening migration also
rounds the idempotency comparisons to column scale (the >8dp retry-conflict bug the audit found),
preserves recorded overrun actuals, restricts run deletion, and removes two reproduced lock-order
deadlocks. Generated database types remain blocked on a missing Supabase management access token.

### WP-2 — Provider settlement and reconciliation (P0, OpenRouter path built locally)

- Successful budgeted LLM calls settle from returned usage and request ID.
- Tavily settles from `usage.credits` and captures `request_id` when returned.
- Missing/uncertain usage retains a conservative reconciliation-required exposure.
- OpenRouter's generation API settles stale rows from authoritative `total_cost`.
- Claims are bounded, lease-fenced across replicas, retry with capped backoff, and dead-letter to
  operator state without releasing exposure.

Still open:

- Deploy and real-provider smoke the OpenRouter lookup.
- Determine authoritative Moonshot and Tavily Search lookup/audit paths; retain the reservation
  when no per-request proof exists.
- Alert on actual cost above reservation or unknown provider price.
- The read-only operator command/report is built and found no aged unresolved production rows on
  its first run. Add alert delivery/escalation policy around it.

### WP-3 — Tree, user, and system quotas (P1)

Add policy-controlled:

- per-root maximum cost;
- per-user daily deep-research cost and run count;
- maximum paid searches per child/root;
- global circuit breaker and provider-specific breaker.

Quota checks must be atomic and happen before dispatch. UI estimates are informative only; the
worker/DB policy is authoritative.

### WP-4 — Price registry lifecycle (P1)

Move model and tool pricing used for reservations into a versioned registry. Record the exact price
version on each reservation. Add a scheduled drift check against provider pricing and fail closed
for unknown models in budgeted runs.

### WP-5 — Abuse and failure tests (P0, partially built)

Covered locally: simultaneous child reservations, duplicate reservation/settlement, changed
idempotency payloads, malformed/missing usage fallback, provider-reported usage above reservation,
reservation callback failure before fetch, direct-write rejection, provider lookup parsing,
retry/exhaustion behavior, lease claims, lease conflicts, and scheduled-reconciliation accounting.

Still cover: a killed worker after provider acceptance in a live environment, duplicate queue
delivery across a real deployed lease, price changes, cancellation during an in-flight call, and
live scheduled-reconciliation idempotency.

## Definition of done

- A root cannot reserve beyond its configured maximum under concurrent transactions.
- Every paid request has a durable reservation before dispatch and one terminal settlement state.
- Root totals equal the sum of leaf settlements and can be compared to provider records.
- Unknown pricing fails closed; no silent `$0` paid request exists.
- Daily/global circuit breakers are operable without a deploy.

<!-- docs/operations/worker/queue-and-workflow-architecture-assessment-2026-07-23.md -->

# Queue and Workflow Architecture Assessment

**Date:** 2026-07-23

**Status:** Candid architecture assessment; recommendations are not yet implementation decisions

**Scope:** Agentic chat, Agent Runs, Supabase queue infrastructure, notification delivery, worker deployment, and a possible Temporal adoption

## Executive verdict

BuildOS did not arrive at an absurd architecture. It arrived at a common founder-led architecture: make the interactive path work first, add durable background execution when requests become too long, and progressively bolt on retries, heartbeats, signals, events, and recovery.

That evolution was reasonable. The current endpoint is no longer simple.

BuildOS now has at least three execution substrates:

1. Agentic chat runs inside a Vercel request and streams over SSE.
2. Agent Runs execute through a PostgreSQL-backed queue on Railway.
3. Notification delivery combines database fan-out, queue jobs, channel-specific state, and external providers.

Each substrate has its own status model, retry behavior, cancellation behavior, recovery mechanism, and idempotency assumptions. That is the central design debt. BuildOS is manually implementing pieces of a workflow engine, but the guarantees are spread across route code, worker code, SQL functions, cron sweeps, and client reconciliation.

The blunt assessment is:

- **The SQL queue is not inherently weird.** It is a defensible small-to-medium-scale choice.
- **Using SSE for interactive chat is not weird.** Tying the lifetime of important execution to the SSE-serving process is fragile.
- **Moving every connection into a worker would be a mistake.** Move durable execution ownership into workers; keep authentication, request admission, and SSE/WebSocket delivery in the web tier.
- **Putting every job into one generic worker pool is becoming weird.** A ten-minute Agent Run, an SMS, OCR, and chat classification do not have the same latency, timeout, fairness, retry, or idempotency requirements.
- **Temporal should not be introduced as a blanket queue replacement.** It is a credible fit for Agent Runs and deep research, but not a reason to rewrite one-shot notifications, OCR, or classification jobs.
- **There are correctness issues to fix before a platform migration.** Temporal will not repair non-idempotent activities, ambiguous external sends, or unclear domain invariants automatically.

## Direct answers

### Should all agentic chat execution move into a worker?

Important execution should become independent of the browser connection and Vercel request lifetime. The browser connection itself should not move into a worker.

The target separation should be:

```text
Browser
   │
   │ HTTPS / SSE / WebSocket
   ▼
Web gateway
   ├── authenticate
   ├── authorize tenant/project access
   ├── admit or reject a turn
   ├── create durable turn/run identity
   └── relay live events to the browser
           │
           │ durable command
           ▼
Execution worker
   ├── own LLM/tool execution
   ├── survive browser disconnects
   ├── persist checkpoints and final state
   └── publish live output events
```

The web tier owns the connection. The execution tier owns the work.

Moving normal chat to the current `queue_jobs` implementation without other changes would make the user experience worse. The queue polls every five seconds, so a normal chat could wait five seconds before the first line of work begins. It also shares one batch with long-running and unrelated jobs. Interactive chat needs sub-second dispatch, reserved concurrency, and a live event path.

### Should BuildOS adopt Temporal?

Not as a new “Temporal layer” under everything.

Run a bounded Temporal pilot for Agent Runs only after the P0 correctness fixes in this document. Agent Runs already have the characteristics that justify a workflow engine:

- long-running execution;
- retries and provider uncertainty;
- pause, resume, steer, cancel, and human input;
- parent/child deep-research orchestration;
- durable timers and budgets;
- compensation and staged writes;
- a need to recover after worker death without inventing more sweeps.

Normal notifications, chat classification, OCR, and similar one-shot jobs can remain conventional queue consumers.

Temporal is not a streaming broker. Do not store every generated token in Temporal workflow history. Temporal should orchestrate durable steps; live token chunks should travel through a separate event channel and only coarse checkpoints/final messages should be durably persisted.

## Where the current mental model went wrong

The original goal was “make the AI respond.” That optimizes for the visible happy path:

```text
request → model → SSE → visible answer
```

A reliable execution system has more boundaries:

```text
admit command
    → assign durable identity
    → acquire execution ownership
    → perform potentially non-idempotent side effects
    → checkpoint/finalize domain state
    → deliver live and final output
    → reconcile uncertain failures
```

SSE solved the last-mile display problem. Moving code into a worker changed where it ran. Neither choice, by itself, defined durable execution semantics.

The specific conceptual mistakes to avoid going forward are:

- **A worker is not durability.** A worker becomes durable only when work identity, ownership, checkpoints, retries, cancellation, and side-effect idempotency are durable.
- **Atomic claim is not exactly-once execution.** It prevents two healthy claim transactions from owning one queue row simultaneously. It cannot atomically include Twilio, an LLM provider, email, or arbitrary domain writes.
- **A timeout is not cancellation.** `Promise.race` stops waiting; it does not stop the losing promise.
- **A queue is not backpressure.** An unbounded table stores overload until the database becomes the bottleneck.
- **Statuses are not an execution protocol unless transitions and ownership are explicit.** Two tables with plausible statuses can still disagree indefinitely.
- **Retries are product behavior.** They affect money, duplicate writes, messages sent to users, and provider load. They cannot be a generic “catch and try three times” afterthought.
- **Streaming recovery is not workflow recovery.** Reconnecting to persisted output is useful, but it does not reconstruct in-memory execution after the executor dies.

The system is not failing because it lacks a fashionable infrastructure product. It is fragile where these guarantees are implicit or contradictory.

## Current architecture

### Interactive agentic chat

```text
AgentChat UI
   │ POST /api/agent/v2/stream
   │ client_turn_id + stream_run_id
   ▼
Vercel stream route
   ├── insert chat_turn_runs(status=running)
   ├── enforce one running turn per session
   ├── execute LLM/tool loop in the request process
   ├── emit best-effort SSE events
   ├── persist tool executions and messages
   └── persist assistant message before `done`

On transport loss:
   ├── server attempts to continue while the function remains alive
   └── browser reconciles from persisted session state
```

Important files:

- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`
- `supabase/migrations/20260502000003_agentic_chat_running_turn_guard.sql`

This is a sophisticated request-bound execution path, not a durable workflow. Stream detachment recovery is useful, but the process can still be frozen, killed, or exceed its platform duration. There is no deterministic replay of the LLM/tool loop.

### Agent Runs

```text
POST /api/agent-runs
   │
   ├── INSERT agent_runs(status=queued)
   └── add_queue_job(job_type=agent_run)
              │
              ▼
       queue_jobs(status=pending)
              │ Railway polls
              ▼
       claim_pending_jobs()
       FOR UPDATE SKIP LOCKED
              │
              ▼
       processAgentRunJob()
              │
              ├── agent_runs=status running
              ├── agent_run_events append
              ├── LLM and tools
              ├── signals: steer/pause/cancel
              └── agent_runs=terminal or waiting state
              │
              ▼
       complete_queue_job(processing_token)
```

Important files:

- `apps/web/src/routes/api/agent-runs/+server.ts`
- `apps/web/src/lib/server/agent-runs/dispatch.ts`
- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/workers/agent-run/agentRunWorker.ts`
- `apps/worker/src/workers/agent-run/agentRunStrandedSweep.ts`
- `packages/shared-types/src/functions/claim_pending_jobs.sql`
- `packages/shared-types/src/functions/complete_queue_job.sql`
- `packages/shared-types/src/functions/fail_queue_job.sql`
- `packages/shared-types/src/functions/reset_stalled_jobs.sql`

### Notifications

```text
emit_notification_event()
   │
   ├── notification_events
   ├── notification_deliveries(push)   ─┐
   ├── notification_deliveries(email)   ├── queue_jobs(send_notification)
   ├── notification_deliveries(sms)     │
   └── notification_deliveries(in_app) ─┘
                                               │
                                               ▼
                                  processNotification()
                                               │
                                               ├── re-check preferences
                                               ├── send to provider
                                               └── update delivery state
```

The database-side event/delivery/job fan-out is one of the stronger parts of the system. The rows are created inside one PostgreSQL function, providing an outbox-like atomic handoff.

Important files:

- `supabase/migrations/20260421000001_prevent_duplicate_daily_brief_notifications.sql`
- `apps/worker/src/workers/notification/notificationWorker.ts`
- `apps/worker/src/workers/notification/emailAdapter.ts`
- `apps/worker/src/workers/smsWorker.ts`

## What BuildOS gets right

### Atomic queue claims

`claim_pending_jobs` selects eligible rows with `FOR UPDATE SKIP LOCKED` and changes them to `processing` in the same database function. Multiple worker replicas can claim different rows without the classic read-then-update race.

### Claim fencing

Each claim gets a `processing_token`. Completion, failure, heartbeat, and progress updates include the token. A stale worker cannot overwrite the queue status after ownership has moved to another worker.

### Durable queue admission deduplication

`add_queue_job` uses a partial unique index for active `dedup_key` values. Producers that provide a stable key can avoid duplicate pending/processing jobs even under concurrent inserts.

### Explicit domain state and event history

`agent_runs`, `agent_run_events`, and `agent_run_signals` are a better model than treating `queue_jobs` as the product record. Queue status answers “who is carrying the envelope?” Domain status answers “what does the Agent Run mean?” Those are legitimately different state machines.

### One-running-chat-turn database guard

Agentic chat does not rely solely on an application read. A partial unique index makes the database authoritative for one running turn per session.

### Persist-before-done chat ordering

The final assistant message is persisted before the SSE `done` event. That supports reconciliation after a client disconnect and avoids presenting a completion that was never saved.

### Stranded-run recovery

The Agent Run sweep recognizes the two-write and worker-death gaps and attempts bounded, idempotent recovery. It is thoughtful compensating logic, even though the need for it shows that execution ownership is spread across multiple layers.

## Findings and risks

### P0 — Queue timeouts do not cancel processor execution

`SupabaseQueue.withWorkerTimeout` uses `Promise.race`. Rejecting the wrapper promise does not stop the original processor promise.

Potential sequence:

```text
Worker A starts an Agent Run
   │
   ├── queue timeout fires
   ├── queue row is failed/requeued
   └── Worker A's processor keeps executing
                 │
                 ├── heartbeat has stopped
                 ├── tool calls can continue
                 └── domain writes can continue

Worker B claims retry
   └── starts/resumes the same Agent Run concurrently
```

The queue processing token fences the queue row. It does not fence tool side effects or `agent_runs` updates. Agent Run finalization updates by `runId` without a domain execution token. The worker explicitly permits a queue retry to resume an `agent_runs.status='running'` row.

This is the most serious architecture issue found in this review.

The risk is amplified by defaults: Agent Run wall-clock budgets can be up to twenty minutes while the generic queue worker timeout defaults to ten minutes. A valid run can outlive its queue wrapper.

Required remediation:

1. Extend the processor contract with an `AbortSignal`.
2. Abort the signal when a timeout, shutdown, or ownership loss occurs.
3. Propagate the signal to LLM calls, HTTP requests, and tools.
4. Add a domain execution generation/token to `agent_runs`.
5. Predicate important run updates and finalization on that generation.
6. Require idempotency keys for all mutating tools.
7. Set per-job-type timeouts rather than one global timeout.
8. Keep the outer timeout above the allowed domain wall-clock budget plus cleanup margin.

Tests must prove that a timed-out processor cannot commit a mutation or terminal domain update after a retry takes ownership.

### P0 — Notification retry state appears internally inconsistent

`processNotification` currently appears to defeat its own retry intent:

1. A provider failure updates `notification_deliveries.status` to `failed` and increments delivery attempts.
2. If attempts remain, the function throws so the queue will retry.
3. The catch path reads the delivery, updates the already-failed delivery, and increments delivery attempts again.
4. The queue schedules a retry.
5. On retry, `FINAL_STATES` includes `failed`, so `processNotification` returns without sending.
6. The queue wrapper interprets the return as success and completes the queue job.

This means a single provider failure may increment the domain attempt counter twice and the scheduled queue retry may be a no-op. There are also two independent attempt counters: `notification_deliveries.attempts` and `queue_jobs.attempts`.

Treat this as a likely correctness bug and reproduce it with an integration test before changing behavior.

Required remediation:

- Define one owner for retry policy.
- Prefer the queue as the owner of scheduling and attempts.
- Keep a delivery in a retryable state such as `pending`/`retry_scheduled` until the final attempt is exhausted.
- Reserve `failed` for terminal failure.
- Do not increment delivery attempts in both the normal failure path and catch cleanup path.
- Test first failure, intermediate retry, final failure, provider timeout, and status-update failure.

### P0/P1 — External sends are at-least-once, not exactly-once

For notifications, an external provider can accept a request and the worker can die before recording `sent`. The queue can then retry the delivery.

```text
provider accepted request
        │
        X process dies
        │
database still says unsent
        │
retry can send a duplicate
```

Atomic claiming does not solve this because PostgreSQL and the external provider are not one transaction.

Required remediation varies by channel:

- Use provider idempotency keys where supported.
- Use stable outbound attempt/message identifiers.
- Add a unique constraint on `user_notifications.delivery_id` for in-app delivery; the current migration creates only a non-unique index.
- Persist an outbound attempt before the provider call.
- Reconcile uncertain attempts from provider receipts/webhooks.
- Document which channels are at-most-once, at-least-once, or effectively-once.
- Make user-facing content tolerant of rare duplicate delivery.

### P1 — Agent Run dispatch is a non-atomic two-write handoff

`dispatchAgentRun` inserts `agent_runs` and then separately calls `add_queue_job`. A process death between the writes leaves a queued run without work. Explicit queue errors are handled by marking the run failed, but process death is not catchable.

The stranded sweep compensates after a grace period. That is useful, but delayed repair is weaker than atomic admission when both records already live in PostgreSQL.

Recommendation: create an RPC that validates the hard database invariants, inserts the run, and inserts the queue job in one transaction. Keep the sweep as defense in depth.

### P1 — Domain execution ownership is weaker than queue ownership

The queue row has a processing token; the corresponding Agent Run does not. `processAgentRunJob` reads the run and performs an optimistic status update, but a retry against an already-`running` run can still update `running` to `running` and proceed. Finalization updates the run by ID without verifying the same executor still owns it.

Queue ownership and domain ownership should be explicitly linked. The worker should acquire a run execution generation and every critical state transition should require it.

### P1 — One generic pool mixes incompatible workloads

The same polling loop and batch handles:

- Agent Runs;
- daily briefs;
- notifications;
- SMS;
- chat classification;
- braindumps;
- transcription;
- OCR;
- context snapshots;
- project icons;
- project loops;
- calendar sync.

These workloads have different latency objectives, maximum durations, external rate limits, retry classifications, and tenant-fairness requirements. A global batch size and global worker timeout cannot model them correctly.

Production claims up to ten jobs and waits for `Promise.allSettled` on the entire batch before claiming more. Ten long Agent Runs can prevent the process from claiming fast notification or classification work until the slowest item in the batch settles.

Recommendation:

- Create named worker pools by workload class, at minimum:
    - interactive agent execution;
    - long-running Agent Runs/research;
    - latency-sensitive delivery;
    - CPU/media work;
    - maintenance/batch work.
- Give each pool independent concurrency, timeout, retry, and rate-limit policy.
- Refill capacity as individual slots complete instead of waiting for a whole batch barrier.
- Allow independent deployment scaling.

### P1 — There is buffering but no system-level backpressure

`batchSize` bounds how many jobs one process holds concurrently. It does not limit queue admission. Producers can continue inserting while workers fall behind, so PostgreSQL absorbs the backlog.

Required controls:

- queue-age and queue-depth alerts by job type;
- admission limits for optional/expensive work;
- per-user and per-organization quotas;
- overload modes that defer or reject low-priority work;
- provider-specific concurrency and rate-limit buckets;
- retention/archival that prevents the active queue table and indexes from growing indefinitely.

### P1 — Per-user Agent Run admission can race

`dispatchAgentRun` counts active runs and then inserts a new row. Two concurrent requests can observe the same count and both pass the maximum-of-three check.

If the limit is a product guarantee, enforce it atomically with a database transaction, per-user advisory lock, or explicit execution-slot records. Application-only counting is advisory, not authoritative.

### P1/P2 — Retry policy lacks classification and jitter

At the generic queue layer, every thrown error is retryable until attempts are exhausted. Permanent validation errors, authorization failures, missing records, provider throttling, network timeouts, and uncertain accepted requests should not share one policy.

The SQL backoff uses powers of two in minutes without jitter. If a provider outage fails many jobs together, they are scheduled to retry together, producing a retry wave.

Introduce a typed processor result/error contract:

```ts
type JobFailure =
	| { kind: 'permanent'; code: string; message: string }
	| { kind: 'transient'; code: string; retryAfterMs?: number }
	| { kind: 'rate_limited'; retryAfterMs: number }
	| { kind: 'uncertain_external_commit'; reconciliationKey: string };
```

Apply exponential backoff with bounded random jitter and provider `Retry-After` support.

### P2 — Queue configuration and implementation have drifted

Examples:

- `enableConcurrentProcessing` is loaded and logged, but processing always uses `Promise.allSettled`.
- `retryBackoffBase` sounds like the job retry policy but the queue's job retry delay is hardcoded in SQL; the setting is used by progress tracking.
- The queue instance uses merged environment/runtime configuration, while the Agent Run stranded sweep imports the base `queueConfig` for its grace calculation.
- Some queue documentation describes a `retrying` state, while current SQL returns retryable work to `pending` with a future `scheduled_for`.

Configuration that does not control behavior is dangerous because operators believe they changed the system when they did not.

Recommendation: create one resolved runtime configuration object, inject it into the queue and sweep, remove unused flags, and add contract tests that assert configuration changes alter behavior.

### P2 — A second notification queue-consumer implementation remains in the worker file

`processNotificationJobs` independently claims and completes `send_notification` jobs, but the active worker registers `processNotification` through the generic `SupabaseQueue`. The direct batch consumer does not appear to be called.

Keeping two ownership/retry implementations for the same job type is a drift hazard. Delete the unused consumer after confirming no external entrypoint invokes it, or make it the only implementation. Do not retain parallel queue semantics “just in case.”

### P2 — Chat message idempotency is check-then-insert

`sessionService.persistMessage` queries JSON metadata for an idempotency key and then inserts. There is no database uniqueness constraint over the message idempotency key. Two concurrent calls can both miss the lookup and insert.

The unique `chat_turn_runs.stream_run_id` and one-running-turn guard reduce exposure but do not turn message persistence itself into an atomic idempotent operation.

Recommendation: add a first-class `idempotency_key` column, a scoped unique partial index, and `INSERT ... ON CONFLICT` semantics.

### P2 — Agentic chat recovery is not durable execution recovery

The stream route wisely continues after an SSE write failure and the client reconciles from persisted messages. That protects against a transport disconnect while the Vercel function remains healthy.

It does not protect against process termination in the middle of the LLM/tool loop. `chat_turn_runs` can identify a stale turn, but it cannot reconstruct arbitrary in-memory execution. Buffered observability events can also be lost if cleanup never runs.

Call this guarantee what it is: **transport-detach tolerance**, not durable workflow recovery.

### P2 — Fire-and-forget work remains in the stream route

Most detached persistence is tracked and flushed with a budget. Agent-state reconciliation is launched with `void (async () => ...)` and is not obviously registered with the detached task tracker at that call site. Verify whether it can be frozen after `done`; if so, either track it, await it within a budget, or move it to a durable background job.

### P2 — Tenant isolation depends heavily on trusted worker code

The browser-facing tables use RLS, but the worker uses a Supabase service key and bypasses RLS. This is normal for a trusted worker, but it makes every job payload and domain query part of the tenant-isolation boundary.

Required controls:

- never trust `user_id` supplied by an unverified client;
- resolve user identity at authenticated admission;
- re-check project membership for sensitive write operations;
- include user/project ownership predicates in worker domain writes;
- test cross-tenant job payload tampering;
- prefer domain RPCs that take the authenticated/validated actor and enforce ownership centrally.

### P2 — API server, worker, and scheduler share one Railway process

One process currently runs the Express API, queue consumer, and cron scheduler. This is operationally simple but creates shared fate:

- a fatal processor error restarts the API and scheduler;
- heavy jobs can affect API responsiveness;
- scaling the queue consumer also scales scheduler/API replicas;
- multiple scheduler replicas require every cron action to be idempotent or leased;
- deployments interrupt all three roles together.

Split them into independently deployable process types when load or reliability justifies it, even if they continue sharing one code package.

## Recommended target architecture

```text
                              ┌──────────────────────────┐
Browser ── HTTPS/SSE/WS ────►│ Web gateway              │
                              │ auth, admission, relay   │
                              └────────────┬─────────────┘
                                           │ durable command
                              ┌────────────▼─────────────┐
                              │ Execution control plane │
                              │ workflow ID + state     │
                              └───────┬────────┬────────┘
                                      │        │
                         ┌────────────▼─┐   ┌──▼────────────────┐
                         │ Fast workers │   │ Durable workflows │
                         │ short jobs   │   │ Agent Runs        │
                         └──────┬───────┘   └──┬────────────────┘
                                │              │
                                └──────┬───────┘
                                       ▼
                              Domain services/tools
                                       │
                    ┌──────────────────┼───────────────────┐
                    ▼                  ▼                   ▼
             PostgreSQL state   Live event transport   External providers
             and checkpoints    Redis/NATS/Realtime    LLM/SMS/email/etc.
```

### Durable chat-turn contract

If normal chat moves to worker-owned execution, use this contract:

1. Browser creates or reuses a stable `client_turn_id`.
2. Web gateway atomically admits a durable `chat_turn_run` and command.
3. A low-latency interactive worker claims it.
4. Worker writes coarse durable events/checkpoints and publishes live chunks.
5. SSE gateway relays chunks to the browser.
6. Browser reconnects with a last-seen sequence/cursor.
7. Gateway replays a bounded durable chunk window or returns the current snapshot.
8. Worker persists final assistant message before marking the turn completed.
9. Cancellation is a durable command plus an `AbortSignal`, not merely closing SSE.

Do not write one PostgreSQL row per token. Coalesce chunks by time/size, for example every 50–200 ms or 0.5–2 KB, and persist only the amount needed for reconnection/audit. A live broker can carry higher-frequency ephemeral chunks; PostgreSQL remains the source of truth for turn status, tool effects, checkpoints, and final messages.

### State-machine ownership

Define one state machine per domain and document allowed transitions. Queue state must not be used as product state.

```text
Queue job:
pending → processing → completed
                    ↘ pending(scheduled retry)
                    ↘ failed

Agent Run:
queued → running → completed | partial | failed | cancelled
             ├── paused → running
             ├── needs_input → running
             └── proposal_ready → completed | cancelled

Notification delivery:
pending → sending → sent → delivered/opened/clicked
              ├── retry_scheduled → sending
              ├── cancelled
              ├── bounced
              └── failed_terminal
```

For every cross-state update, specify:

- source of truth;
- owner;
- valid predecessor states;
- idempotency key;
- retry classification;
- stale-owner fence;
- reconciliation mechanism.

## Temporal recommendation

### What Temporal would replace for Agent Runs

Temporal could replace or simplify:

- polling `queue_jobs` for Agent Runs;
- manual retry scheduling;
- parts of stalled-run detection;
- hand-written pause/resume timers;
- parent/child wake-up triggers;
- parts of deep-research orchestration state;
- some continuation and signal plumbing;
- workflow-level timeout and cancellation coordination.

It would not replace:

- PostgreSQL product/domain data;
- tenant authorization;
- idempotent tool implementations;
- LLM/provider APIs;
- live SSE/WebSocket event delivery;
- notification provider reconciliation;
- cost ledgers and business budgets;
- observability tailored to the product UI.

### Proposed Temporal pilot

Pilot a single `AgentRunWorkflow` behind an execution adapter and feature flag.

```text
AgentRunWorkflow
   ├── activity: load context
   ├── activity: reserve cost
   ├── activity: call LLM for next action
   ├── activity: execute idempotent tool
   ├── activity: persist tool result/event
   ├── repeat within budgets
   └── activity: finalize domain result

Signals/updates:
   ├── steer
   ├── pause
   ├── resume
   ├── answer
   └── cancel

Child workflows:
   └── deep-research workstreams
```

Rules for the pilot:

- All network I/O and database writes happen in Activities, not Workflow code.
- Workflow code remains deterministic.
- Every mutating Activity has an idempotency key derived from run/workflow/step identity.
- Provider uncertainty is represented explicitly; do not blindly retry accepted-but-unconfirmed requests.
- Live tokens are published outside Temporal history.
- Long histories use `continue-as-new` where appropriate.
- Existing `agent_runs` remains the product-facing read model during migration.
- The current worker remains available as a fallback until behavior and cost are understood.

### Adoption decision gate

Proceed beyond the pilot only if it materially improves these measured outcomes:

- stranded Agent Runs;
- duplicate or overlapping execution;
- recovery time after worker death;
- correctness of pause/resume/cancel;
- amount of custom orchestration code;
- operational debugging time;
- ability to deploy workers without losing progress.

Reject or pause adoption if the team mostly runs short one-shot jobs, the operational overhead is larger than the custom queue burden, or Temporal is being used merely as a fashionable queue.

## Prioritized roadmap

### P0 — Correctness before migration

- Make timeout/shutdown cancellation real with `AbortSignal`.
- Add domain execution fencing to Agent Runs.
- Align Agent Run maximum wall-clock budgets with per-type worker timeout.
- Reproduce and fix notification retry-state behavior.
- Add notification channel idempotency/reconciliation contracts.
- Add integration tests for crash-after-external-send and stale-worker completion.

### P1 — Make the existing platform legible and controllable

- Atomically create Agent Run plus queue job.
- Split worker pools and concurrency policies by workload class.
- Add typed transient/permanent/uncertain failure classification and jitter.
- Make per-user Agent Run admission atomic.
- Establish queue depth/age SLOs and overload behavior.
- Unify runtime queue configuration and remove misleading flags.
- Remove the unused parallel notification consumer.
- Add a first-class chat message idempotency key.

### P2 — Decouple interactive execution from transport lifetime

- Define a durable chat-turn command and event contract.
- Add an interactive worker pool with sub-second dispatch.
- Add live event relay plus bounded replay/snapshot reconciliation.
- Keep the web tier as the connection gateway.
- Migrate behind a feature flag and retain the current route as fallback.

### P3 — Temporal pilot for Agent Runs

- Introduce an `AgentRunExecutor` interface so dispatch is not coupled to queue technology.
- Implement current Postgres executor and Temporal executor behind the interface.
- Pilot standard read-only runs first.
- Add signals and write tools only after idempotency/fencing is proven.
- Pilot deep research last because it has the most orchestration complexity and cost exposure.

## Tests that should exist before calling this reliable

### Queue ownership

- Two workers race to claim the same job; only one processor begins.
- A stale processing token cannot complete, fail, heartbeat, or update progress.
- A timeout aborts processor I/O and prevents later domain writes.
- Shutdown stops new claims and either drains or safely relinquishes work.

### Agent Runs

- Two simultaneous dispatches cannot exceed the per-user active limit.
- Crash between run creation and queue publication does not strand the run.
- Retry of a running run cannot overlap the old executor.
- A stale executor cannot finalize after cancel or a newer execution generation.
- Mutating tools replay with the same idempotency key without duplicate effects.

### Notifications

- First transient provider failure actually produces a second send attempt.
- Delivery and queue attempt counts have a defined relationship.
- Final failure occurs exactly at the configured maximum.
- Provider success plus database update failure does not duplicate in-app delivery.
- Unknown provider outcome enters reconciliation rather than blind retry where possible.

### Chat

- Two identical `client_turn_id` requests produce one user and one assistant message.
- Browser disconnect does not cancel execution unless an explicit cancel command is sent.
- Process death produces an honest failed/recoverable turn rather than permanent `running`.
- Reconnect reconstructs current output from a sequence cursor or durable snapshot.
- Final assistant message is durable before terminal completion is visible.

### Tenant isolation

- A forged job payload cannot read or mutate another user's project.
- Service-role worker operations include owner/project predicates.
- Signals can only target runs owned by the authenticated user.

## Metrics and operational controls

At minimum, emit and alert on:

- queue depth by job type, priority, and age bucket;
- oldest pending age by job type;
- claim rate and completion rate;
- processing duration percentiles by job type;
- retry counts by typed error code;
- stalled resets and stale-token rejections;
- worker timeout count;
- active executions by user/organization;
- notification uncertain outcomes and duplicate-prevention hits;
- Agent Run overlap/fence-rejection count;
- chat turn stale-cancellation count;
- database RPC latency and error rate;
- PostgREST/database pool saturation.

The operational question should not be only “is the worker process healthy?” It should be “is work entering, progressing, and completing within the latency and correctness contract for its class?”

## Final recommendation

Do not perform a big-bang rewrite of BuildOS into Temporal, and do not move SSE connections into Railway workers.

First, make the current execution contracts honest:

- real cancellation;
- domain fencing;
- correct retry ownership;
- idempotent side effects;
- atomic admission;
- separate worker classes;
- explicit state machines and SLOs.

Then decouple interactive chat execution from the Vercel request using a low-latency worker and event relay. In parallel, pilot Temporal specifically for Agent Runs, where the product already demands durable orchestration.

The architecture should converge on this principle:

> Connections are ephemeral. Commands, ownership, checkpoints, and outcomes are durable. Live events are replayable enough for the UI, but external side effects are protected by idempotency and execution fencing.

That is the missing unifying contract in the current system.

## Verification checklist for the next reviewer

The next engineer or agent should challenge this assessment with code and tests, especially:

1. Reproduce the notification retry sequence and determine whether a transient first failure ever causes a second provider call.
2. Confirm the production values of `QUEUE_WORKER_TIMEOUT`, Agent Run wall-clock limits, and stalled timeout; construct the exact overlapping-executor timeline.
3. Inventory every mutating Agent Run tool and record whether it has a database-enforced idempotency key.
4. Determine whether an old Agent Run processor can still finalize or mutate after its queue processing token is stale.
5. Confirm whether `processNotificationJobs` has any runtime caller outside the searched TypeScript entrypoints.
6. Verify channel-specific provider idempotency claims for email and SMS rather than trusting comments.
7. Query production queue age/depth and processing percentiles by job type before selecting new infrastructure.
8. Test concurrent Agent Run dispatch against the maximum-of-three limit.
9. Verify whether untracked agent-state reconciliation is lost under Vercel freeze/termination.
10. Produce a small Temporal Agent Run spike that demonstrates cancellation, signal handling, activity idempotency, and live output without writing tokens to workflow history.

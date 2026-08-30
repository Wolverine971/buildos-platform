<!-- docs/plans/PROJECT_LOOP_TIMEOUT_RECOVERY_ASSESSMENT_2026-08-22.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Project Loop Timeout Recovery — Incident Assessment and Remediation Proposal

**Date:** 2026-08-22  
**Incident:** `error_logs.id = 908be41c-32b3-42f7-a5b5-eb7ecf9353a7`  
**Affected run:** `project_loop_runs.id = 1469e1b2-5afb-4ac7-b670-a917964e4c16`  
**Affected project:** `f0c4c6b6-4323-4b69-83cf-83e653601669`  
**Queue job:** `buildos_project_loop_e4ede4be-f2e5-4db3-9def-1c553b5cc9db`  
**OpenRouter generation:** `gen-1787429175-qRigIi105ph2Jb4Qo1jt`  
**Repository snapshot inspected:** `32c08d2603eb0d6f86ef35472dc4e68a6922d193`  
**Method:** source trace, read-only production queries, and read-only OpenRouter generation lookup.  
**No behavior, code, queue state, or production data was changed during the investigation.**

---

## 0. Executive assessment

This incident was not caused by malformed JSON, invalid project content, or a database failure. OpenRouter accepted the Project Loop `drift` request and routed it to `deepseek/deepseek-v4-flash-20260423` on DigitalOcean. The provider generated 1,242 completion tokens for 119.775 seconds, but BuildOS cancelled the response at its fixed 120-second client deadline before a complete response reached `getJSONResponse`.

The timeout then exposed a recovery contradiction across three layers:

1. `SmartLLMService` correctly avoided another paid model attempt after OpenRouter supplied a generation ID.
2. The Project Loop treated the loss of one optional detector as a fatal error for the entire review.
3. The generic queue classified the error as transient and retried, but the first attempt had already marked the domain run `failed`; the retry could not claim it and returned `success: true, skipped: true`.

The user therefore received no review, even though the queue ended in `completed` state. No suggestions or project writes were created.

**Verdict: fix warranted.** This is not a one-off provider incident. In the 30-day production window inspected, 13 of 142 Project Loop runs failed from the same 120-second provider timeout. Those 13 timeouts account for every substantive failed review in that window; the other 29 `failed` rows were dedup bookkeeping rows. The safest first fix is to treat recoverable detector failures as degraded coverage, continue the other detectors, and finish the review with an internal warning. The shared accepted-generation retry guard should remain in place unless it is replaced with explicit cost reconciliation and bounded retry authority.

---

## 1. User-visible and operational impact

### Specific incident

- The run stayed active for approximately 124 seconds and ended `failed`.
- No `project_suggestions` rows were created for the run.
- No project documents, tasks, goals, or metadata were changed.
- The user missed a background Project Review; there is no partial result to review.
- The queue retried once, but that retry skipped because the run was already terminal.
- The queue row now reads `completed`, while its linked `project_loop_runs` row reads `failed`.
- The admin error message says `Failed to generate valid JSON`, even though JSON parsing never occurred for the failed request.

### Severity

Recommended severity: **P1 reliability defect**, not a data-integrity incident.

Rationale:

- There was no destructive write, cross-project access, or corruption.
- The failure silently removed useful background work from the user.
- The failure mode repeats across projects and detector types.
- Queue state implies recovery, but domain state proves recovery did not happen.
- Billing and token telemetry undercount accepted provider work.

---

## 2. Incident timeline

All timestamps are UTC on 2026-08-22.

| Time           | Event                                                                                              | Evidence                                                   |
| -------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `20:06:11.044` | Project Loop run created with `trigger_reason = burst`.                                            | `project_loop_runs.created_at`                             |
| `20:06:12.717` | Worker claimed the run and set it to `running`.                                                    | `project_loop_runs.started_at`                             |
| `20:06:13.660` | `project_loop_outdated_docs` LLM request started.                                                  | `llm_usage_logs.request_started_at`                        |
| `20:06:15.485` | Outdated-doc request succeeded in 1.825 seconds with 1,032 prompt tokens and 10 completion tokens. | `llm_usage_logs.id = ddfcacde-4bc7-41cd-8ddb-3685823e1f5b` |
| `20:06:15.664` | `project_loop_drift` LLM request started.                                                          | `llm_usage_logs.request_started_at`                        |
| `20:08:15.672` | The response-body read hit the 120-second timeout.                                                 | Timeout usage row; `response_time_ms = 120008`             |
| `20:08:15.780` | Project Loop catch path marked the run `failed`.                                                   | `project_loop_runs.finished_at`                            |
| `20:08:16.033` | Run-level error `908be41c…` was persisted.                                                         | `error_logs.created_at`                                    |
| `20:09:55.707` | Generic queue retry became eligible.                                                               | `queue_jobs.scheduled_for`                                 |
| `20:09:57.701` | Queue retried the job.                                                                             | Final `queue_jobs.started_at`                              |
| `20:09:57.875` | Retry returned `success: true, skipped: true`; queue row became `completed`.                       | `queue_jobs.result`, `completed_at`                        |

The retry took only 173 ms because it did not rerun the review. It failed the status-fenced claim against a run that was already `failed` and exited as a duplicate/terminal execution.

---

## 3. What the provider actually did

The authoritative OpenRouter generation record for the failed request reported:

| Field             | Value                                 |
| ----------------- | ------------------------------------- |
| Model             | `deepseek/deepseek-v4-flash-20260423` |
| Provider          | DigitalOcean                          |
| Prompt tokens     | 1,037                                 |
| Completion tokens | 1,242                                 |
| Reasoning tokens  | 0                                     |
| Generation time   | 119,775 ms                            |
| Initial latency   | 1,505 ms                              |
| Finish reason     | `null`                                |
| Cancelled         | `true`                                |
| Actual cost       | `$0.000279068`                        |

This proves the request passed routing and began paid generation. It was neither rejected before generation nor rejected for invalid parameters. The response simply did not complete inside BuildOS's deadline.

The failed `llm_usage_logs` row records zero tokens and zero cost because the client never obtained a parsed `OpenRouterResponse`. The run-level error reports 1,042 tokens and `$0.00009468`, but those values belong to the earlier successful outdated-doc request. The actual combined provider cost for the two known requests was `$0.000373748`.

The accounting discrepancy is tiny for this incident, but its direction is systematic: accepted timeout generations are real paid work and are currently recorded as zero outside the agent-run cost-reconciliation path.

---

## 4. Production frequency and blast radius

### Project Loop run outcomes, trailing 30 days

| Outcome                       | Runs |
| ----------------------------- | ---: |
| Total                         |  142 |
| Completed                     |   89 |
| Waiting review                |   11 |
| Failed                        |   42 |
| Failed from provider timeout  |   13 |
| Failed dedup bookkeeping rows |   29 |

The provider-timeout failure rate was `13 / 142 = 9.2%` of recorded runs. More importantly, all non-dedup failed reviews in the inspected window were this timeout class.

### Detector-call timeout rate, trailing 30 days

| Operation                |   Calls | Timeouts | Timeout rate |
| ------------------------ | ------: | -------: | -----------: |
| Outdated documents       |     109 |        1 |         0.9% |
| Drift                    |     108 |        7 |         6.5% |
| Task conflicts           |      82 |        2 |         2.4% |
| Document organization    |      55 |        3 |         5.5% |
| **Fatal detector total** | **354** |   **13** |     **3.7%** |
| Project manager brief    |     106 |        5 |         4.7% |

The five project-manager-brief timeouts did not fail their runs because that generator already catches LLM errors and returns a deterministic heuristic brief. The four detector families do not have equivalent degradation behavior.

### Latency shape

Successful detector requests already operate close to the current boundary:

| Operation             | Successful p95 | Slowest success |
| --------------------- | -------------: | --------------: |
| Document organization |         96.9 s |         113.2 s |
| Drift                 |         79.6 s |         116.2 s |
| Outdated documents    |         64.3 s |         118.6 s |
| Task conflicts        |         60.4 s |          89.3 s |
| Project manager brief |         49.9 s |         118.4 s |

All 18 Project Loop/brief timeout usage rows were DeepSeek V4 Flash calls and stopped at approximately 120 seconds.

Eight recent timeout generation records were still retrievable from OpenRouter. Their generation times ranged from 108.956 to 125.217 seconds across DigitalOcean, Phala, Mancer 2, and Morph. Two eventually reported `finish_reason = stop` after the local client had already timed out. This is broader than one unhealthy provider endpoint; it is a deadline/model-output mismatch.

---

## 5. Root-cause chain

### RC-1 — Project Loop inherits a fixed 120-second request deadline

`callGenerator` supplies no explicit `timeoutMs`, so the OpenRouter client applies its 120-second default.

- Generator call: [`apps/worker/src/workers/project-loop/generators.ts`](../../apps/worker/src/workers/project-loop/generators.ts#L543)
- Timeout default: [`packages/smart-llm/src/openrouter-client.ts`](../../packages/smart-llm/src/openrouter-client.ts#L65)

This deadline is not inherently unreasonable, but current success latency and the repeated 120-second boundary show that it is too close to the tail for this model and these prompts.

### RC-2 — DeepSeek V4 Flash is first in the balanced JSON route

Every detector calls `getJSONResponse` with `profile: 'balanced'`. The first balanced JSON model is DeepSeek V4 Flash.

- Profile selection: [`apps/worker/src/workers/project-loop/generators.ts`](../../apps/worker/src/workers/project-loop/generators.ts#L554)
- Model order: [`packages/smart-llm/src/model-config.ts`](../../packages/smart-llm/src/model-config.ts#L564)

OpenRouter receives additional fallback models, but those fallbacks do not help when the primary provider accepts the request and continues generating until the local response-body deadline.

### RC-3 — Accepted generation IDs suppress local fallback

When the response body aborts after headers arrive, `openrouter-client.ts` attaches the `x-generation-id` to the error. `SmartLLMService` then refuses another model attempt whenever a generation ID exists.

- Generation ID preservation: [`packages/smart-llm/src/openrouter-client.ts`](../../packages/smart-llm/src/openrouter-client.ts#L142)
- Retry guard: [`packages/smart-llm/src/smart-llm-service.ts`](../../packages/smart-llm/src/smart-llm-service.ts#L1005)

The guard was introduced to prevent duplicate paid work when a strict-budget response is lost. That protection is valid. The problem is that Project Loop has no higher-level degraded-success path when the guard correctly declines a second paid call.

### RC-4 — One optional detector failure aborts all remaining review work

The four detector generators run sequentially. `runGenerator` only handles cost-cap skips; it does not distinguish a recoverable LLM timeout from a fatal application/database error.

- Sequential detector orchestration: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3028)
- Drift is the third detector: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3065)

As a result, this drift timeout prevented task-conflict detection, candidate insertion, rotation, manager-brief synthesis, and normal run completion.

This is an overly strong dependency. Document organization, stale-document detection, drift detection, and task-conflict detection are independent lenses. The absence of one lens should reduce review coverage, not invalidate the other results.

### RC-5 — Domain finalization and queue retry disagree

The outer catch marks `project_loop_runs.status = failed` and then rethrows. The generic queue treats unclassified errors as transient and schedules a retry. On retry, the Project Loop claim requires `status = queued`; the terminally failed run cannot be claimed, so the retry reports successful skip.

- Domain failure finalization: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3350)
- Queue transient default: [`apps/worker/src/lib/queueErrors.ts`](../../apps/worker/src/lib/queueErrors.ts#L43)
- Status-fenced claim and skip: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L2931)

Both mechanisms are individually defensible, but together they create a retry that can never recover the run.

### RC-6 — Error taxonomy obscures the real failure

`getJSONResponse` wraps every terminal failure as `Failed to generate valid JSON: ...`, even when parsing never began.

- Wrapper: [`packages/smart-llm/src/smart-llm-service.ts`](../../packages/smart-llm/src/smart-llm-service.ts#L1210)

The result is a misleading admin incident title and an avoidable detour toward prompt/JSON debugging.

### RC-7 — The queue abort signal is not propagated into Project Loop LLM calls

The queue gives each processor an abort signal for worker timeout and shutdown. Project Loop does not pass `job.signal` through its generators to `getJSONResponse`.

- Queue signal contract: [`apps/worker/src/lib/supabaseQueue.ts`](../../apps/worker/src/lib/supabaseQueue.ts#L59)
- Project Loop generator arguments omit a signal: [`apps/worker/src/workers/project-loop/generators.ts`](../../apps/worker/src/workers/project-loop/generators.ts#L543)

This omission did not cause this particular 120-second timeout, but it is part of the same ownership/retry boundary and should be corrected while touching the path.

---

## 6. Recommended remediation

### P0 — Make recoverable detector failure degrade the run

Change the detector orchestration so a provider timeout or other explicitly classified transient LLM failure produces an empty result for that detector, records a structured warning, and continues to the next detector.

Recommended behavior:

1. `doc organization`, `outdated docs`, `drift`, and `task conflicts` remain independent detector calls.
2. `runGenerator` catches only a narrow recoverable LLM classification, including timeout causes preserved under `Failed to generate valid JSON`.
3. On recoverable failure:
    - append `{ generator, reason, error_code, provider_request_id }` to a run-local warning list;
    - log the skip through `job.log`;
    - return `[]` for that detector;
    - continue remaining detectors;
    - do not ask the queue to retry the whole run.
4. Non-provider and non-recoverable errors still fail loudly.
5. Complete the run as `completed` or `waiting_review` based on the results that were actually produced.
6. Persist a neutral summary such as `Review completed with reduced coverage: drift timed out.`

Why this is the preferred first fix:

- It follows the existing manager-brief fallback precedent in [`generators.ts`](../../apps/worker/src/workers/project-loop/generators.ts#L1404).
- It avoids duplicate paid attempts after OpenRouter accepted a generation.
- It preserves useful results from the other detectors.
- It prevents a single optional lens from blocking manager synthesis and inbox delivery.
- It is a targeted change with a small behavioral surface.

Do not reuse the existing `skippedGenerators` string list unchanged. Its summary currently says every skip happened `after cost cap`. Introduce structured skip reasons so timeout, cost cap, cancellation, and any future cause are not conflated.

### P0 — Propagate cancellation ownership

Thread `job.signal` through the Project Loop generator parameter types and into every `getJSONResponse` call, including manager-brief synthesis.

Expected behavior:

- Provider timeout remains a recoverable detector failure while the queue still owns the job.
- Worker timeout or shutdown abort means ownership is lost; stop further detectors and domain writes rather than converting it into degraded success.
- The recoverable-error classifier must distinguish the OpenRouter request timeout from an already-aborted queue signal.

### P1 — Make retry/finalization semantics coherent

The current `mark domain failed → throw transient → queue retry → domain claim skips` sequence should not remain as a general Project Loop policy.

Recommended decision:

- For recoverable detector timeouts, absorb at detector level as described above; no queue retry is necessary.
- For a truly retryable whole-run failure that occurs before any durable child output, atomically restore the domain run to `queued` before rethrowing, or move Project Loop to a processor-managed lifecycle with explicit retry state.
- For failures after durable suggestions exist, do not replay the whole run blindly. Preserve the existing failed-parent cleanup or define a resumable phase boundary first.
- For permanent failures, throw an explicit `PermanentQueueError` so the queue does not schedule a retry that can only skip.

This broader lifecycle cleanup can follow the detector fix, but the implementation should add a regression test proving that every scheduled retry has a claimable domain state.

### P1 — Run a bounded model/deadline experiment

Do not raise the shared 120-second default globally as the first response. Project Loop currently makes up to five sequential LLM calls; increasing every call to 180 seconds without an overall run budget can push worst-case runtime beyond the queue's default ten-minute worker timeout.

Instead, instrument and compare one or more targeted policies:

1. Keep the 120-second detector deadline and rely on degraded coverage.
2. Give Project Loop an explicit 150–180 second per-call deadline plus an overall run deadline that stops launching new detectors when insufficient time remains.
3. Test a different primary JSON model for Project Loop detectors while retaining DeepSeek as a fallback.
4. Add a tighter output budget only if fixture tests show the expected 0–3 suggestion envelope remains complete and valid.

Measure per detector:

- success and timeout rate;
- p50/p90/p95 response time;
- completion-token distribution;
- provider and actual model;
- degraded-run frequency;
- review yield and cost.

The present evidence supports a tail-latency problem, but it does not yet establish which alternate model provides the best quality/cost/reliability tradeoff.

### P1 — Correct error classification and presentation

Introduce or preserve a typed/coded LLM failure category instead of applying the JSON wrapper to all failures.

Minimum acceptable result:

- Timeout: `LLM request timed out after 120000ms while reading an accepted OpenRouter generation.`
- Parse failure: `LLM returned invalid JSON.`
- Empty completion: `LLM returned no usable content.`
- Provider rejection: preserve HTTP/provider classification.
- Caller cancellation: `LLM request cancelled because the worker lost ownership.`

Keep the original `cause`, OpenRouter generation ID, requested model, and attempted models in telemetry. Admin UI should group this incident as a timeout, not a JSON validation error.

### P2 — Reconcile accepted timeout cost

When an accepted OpenRouter request fails after a generation ID is known:

1. Persist `billing_disposition = uncertain` and the generation ID.
2. Do not record the call as definitively zero-cost.
3. Reuse or generalize the existing OpenRouter generation lookup in `agentRunCostReconciler.ts`.
4. Update the usage row with authoritative prompt/completion tokens, provider, model version, total cost, finish reason, and cancellation state.
5. Ensure run-level totals include reconciled cost or are explicitly marked provisional.

This is not required to restore user-facing reliability, but it closes the telemetry gap that currently makes timeout cost and model throughput look better than they are.

---

## 7. Approaches not recommended as the standalone fix

### Remove the generation-ID retry guard globally

Not recommended. A generation ID means provider work may already be billable or may finish after the client disconnects. Blind fallback can double cost and make strict spend reservations dishonest. Any accepted-generation retry needs explicit authority, a bounded retry count, and cost reconciliation.

### Only increase the timeout

Not sufficient. A longer deadline may reduce failures, but one provider stall would still abort the whole review, and sequential worst-case runtime would approach or exceed the worker deadline.

### Rely on the existing queue retry

Not functional today. The first attempt terminally fails the run, and the retry cannot satisfy the `queued → running` status fence.

### Catch every generator exception and continue

Too broad. Database, authorization, invariant, and programming errors should remain visible and fail the run. Degradation must be limited to a reviewed recoverable LLM/provider classification.

### Mark the current error resolved without code changes

Not recommended. Production frequency shows a repeating boundary condition rather than an isolated outage.

---

## 8. Proposed implementation footprint

No implementation is included in this assessment. The likely change surface is:

| Area                                                                                 | Proposed responsibility                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/workers/project-loop/projectLoopWorker.ts`                          | Structured detector outcomes, recoverable degradation, warning summary, coherent retry behavior, propagation of `job.signal`. |
| `apps/worker/src/workers/project-loop/generators.ts`                                 | Accept `AbortSignal` and explicit timeout/model policy; pass them to `getJSONResponse`.                                       |
| `packages/smart-llm/src/smart-llm-service.ts`                                        | Preserve typed failure classification; avoid labeling transport timeouts as JSON failures.                                    |
| `packages/smart-llm/src/openrouter-client.ts`                                        | Likely no timeout-mechanism change; ensure accepted-generation metadata remains attached to timeout/body-read errors.         |
| `apps/worker/src/workers/agent-run/agentRunCostReconciler.ts` or a shared reconciler | Generalize authoritative OpenRouter generation reconciliation beyond agent runs.                                              |
| Project Loop and Smart LLM tests                                                     | Lock degraded-success, fatal-error, cancellation, retry-state, taxonomy, and reconciliation behavior.                         |

Prefer extracting a small pure classifier/result helper over embedding more string matching inside `processProjectLoopJob`.

---

## 9. Required regression coverage

### Project Loop orchestration

- Drift timeout returns `[]`, records `reason = provider_timeout`, and still runs task-conflict detection.
- Document-organization timeout does not discard successful outdated/drift/task-conflict results.
- Manager brief still runs after one detector timeout.
- Completed summary reports reduced coverage without claiming the skip was caused by cost cap.
- A non-recoverable generator exception still marks the run failed.
- An aborted `job.signal` stops later generators and prevents terminal writes by an execution that lost ownership.

### Queue/domain lifecycle

- A queue retry is never scheduled against a domain run left in an unclaimable terminal state.
- A duplicate or stale execution still cannot insert duplicate suggestions.
- A degraded successful run is completed once and is not retried.

### Smart LLM

- An accepted-generation timeout retains its generation ID and typed timeout cause.
- The public error message does not claim invalid JSON for a transport/body timeout.
- The strict-budget no-duplicate-attempt guarantee remains intact.
- Parse failures continue to use the existing repair/fallback behavior.

### Cost reconciliation

- A timeout usage row with a generation ID is marked uncertain, not settled at zero.
- Authoritative OpenRouter generation data updates token, cost, model, and provider fields idempotently.
- A still-pending/404 lookup retries with a bounded reconciliation policy.

---

## 10. Acceptance criteria

The incident class is resolved when all of the following are true:

1. A single detector timeout no longer fails an otherwise healthy Project Loop run.
2. Other detectors and manager synthesis continue after a recoverable detector timeout.
3. The completed run records which coverage was skipped and why.
4. Queue retry state and Project Loop run state cannot contradict each other.
5. Worker cancellation propagates to in-flight LLM I/O and prevents post-ownership writes.
6. Admin error text distinguishes timeout, cancellation, provider error, empty output, parse failure, and validation failure.
7. Accepted timeout generations are not reported as definitively zero-token/zero-cost.
8. A production smoke with one injected detector timeout completes with degraded coverage and no duplicate queue execution.
9. Post-deploy monitoring shows the fatal Project Loop timeout rate at or near zero; degraded detector rate is tracked separately.

---

## 11. Reviewer questions

The reviewing agent should explicitly challenge these decisions:

1. Is degraded success the correct product behavior for all four detectors, or should any detector remain mandatory?
2. Is the recoverable-error boundary narrow and typed enough to avoid hiding application/database failures?
3. Should degraded coverage remain an internal run warning, or appear in the user-facing Project Review?
4. Is `completed`/`waiting_review` plus structured warnings sufficient, or is a new `completed_with_warnings` status worth the schema and UI cost?
5. Should Project Loop get an explicit higher timeout, a different primary model, or only graceful degradation first?
6. Can a whole-run retry ever be safe after suggestions have been inserted, or should retries be phase-aware?
7. Should the accepted-generation no-retry guard apply globally to unbudgeted calls, or only to strict-budget/reserved calls?
8. Is the existing agent-run cost reconciler the right abstraction to generalize, or should accepted-generation reconciliation live in `packages/smart-llm`?

---

## 12. Recommended delivery order

1. **Detector isolation and structured skip reasons.** Restore user-facing reliability without duplicate model attempts.
2. **Signal propagation and lifecycle tests.** Make ownership/cancellation behavior explicit.
3. **Error taxonomy cleanup.** Make future incidents immediately diagnosable.
4. **Targeted timeout/model experiment.** Optimize the degraded-call rate with measured data.
5. **Accepted-generation cost reconciliation.** Correct billing/telemetry after reliability is restored.
6. **Broader Project Loop retry-state redesign.** Address retryable failures outside the detector phase without weakening idempotency.

The shortest credible fix is steps 1–3. Steps 4–6 improve efficiency, accounting, and the general recovery model but should not block the first reliability patch.

---

## 13. Requested reviewer output

The reviewing agent should return:

1. A verdict of `agree`, `agree with changes`, or `disagree` on the root-cause chain.
2. Any factual claim that is unsupported or contradicted by the current source.
3. Any reliability, billing, idempotency, or cancellation edge case the proposal misses.
4. A judgment on whether detector-level degradation is the right P0 boundary.
5. A ranked implementation plan, calling out anything that should move between P0, P1, and P2.
6. The minimum tests required before deployment and the minimum production smoke after deployment.

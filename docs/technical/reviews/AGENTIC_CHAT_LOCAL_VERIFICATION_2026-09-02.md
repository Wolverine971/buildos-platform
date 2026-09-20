<!-- docs/technical/reviews/AGENTIC_CHAT_LOCAL_VERIFICATION_2026-09-02.md -->

<!-- doc-status: point-in-time -->

# Agentic chat local verification — September 2, 2026

Tested commit `53a77af1f0cf4410216b1569c53ca68ff7616049` plus the existing uncommitted chat overhaul. The initial local run finished with **3,150 passing automated checks**, 11 explicitly opt-in model tests skipped, and six passing real-model probes with synthetic tool effects. After authorization to apply migrations and continue hosted test-account workflows, **5 of 7 durable end-to-end scenarios passed without retries**. Two failed on the older hosted worker's pinned-provider HTTP 404 handling, which is fixed in local source. Live browser testing found and fixed two additional UI integration bugs; follow-up regression suites passed 106 checks and web Svelte check remained clean. Additional browser edge cases remain below; this is not an all-green end-to-end result.

## Failure found and fixed

A request to create four independent tasks correctly entered the complex-write gate. Its opening model pass succeeded on StreamLake, which became the provider pin for the turn. The next pass changed `tool_choice` to `required`; OpenRouter returned HTTP 404, “No endpoints found.” The pin had disabled provider fallback, and the client classified 404 as permanent. The turn ended before any task was created.

The client now treats a 404 from an already pinned OpenRouter provider as retryable. Existing route-failure handling clears the pin; the existing bounded pass retry then restores configured routing. Unpinned 404s remain permanent. No retry allowance or mutation replay rule changed.

The deterministic regression failed before the fix (`retryable: false` instead of `true`) and passed afterward. The same live scenario reproduced the failed StreamLake attempt after the fix, retried successfully on DeepInfra, passed contract and mutation reviews, and created exactly four local fixture tasks in 38.1 seconds.

- [Client change](../../../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts)
- [Regression tests](../../../apps/worker/tests/agenticChatOpenRouterClient.test.ts)
- [Original live trace](./agentic-chat-local-verification-2026-09-02/initial-live-results.json)
- [Successful recovery trace](./agentic-chat-local-verification-2026-09-02/complex-after-fix.json)

## Automated coverage

Counts consolidate overlapping reruns rather than counting the same checks twice.

| Area                                          |    Passed | Notes                                                                                           |
| --------------------------------------------- | --------: | ----------------------------------------------------------------------------------------------- |
| Worker agentic chat                           |       710 | Includes two added routing cases; 11 pre-existing opt-in OpenRouter/Ollama tests remain skipped |
| Shared chat runtime                           |       340 | Full package suite                                                                              |
| Web chat services, components, and API routes |     2,091 | Includes all 29 disposable PostgreSQL suites and the added backoff assertion                    |
| Shared tool-surface contract                  |         9 | Shared-types validation                                                                         |
| **Total**                                     | **3,150** | No remaining failing suites                                                                     |

Also passed: worker TypeScript, targeted client ESLint, web Svelte check (zero errors/warnings), and SQL contract inventory. The worker test-type baseline gate passed with 215 existing errors against its accepted baseline of 217; this is not a clean test-type check. Svelte autofixer reported no issues in the modal, composer, or prewarm controller; its broader style suggestions were not treated as regressions.

The initial database-suite failures were sandbox `listen EPERM` errors before test execution. Rerunning with localhost access allowed every database contract to execute against disposable local PostgreSQL.

### Retry migration coverage added

The existing execution/recovery suite stopped at the August queue-first migration and therefore did not exercise `20260902150000_agentic_chat_recovery_throttle_backoff_seconds.sql`.

The suite now applies the new migration twice to verify replay safety. Its SQL assertions exercise the real recovery RPC and check:

- Provider throttle delays of 5–10, 10–15, and 60–65 seconds at the corresponding attempt counts.
- Initial pre-start timeout delay of 5–10 seconds and refusal of a second timeout retry.
- Infrastructure delays of 60–120, 120–180, and 960–1,020 seconds.
- Repeated recovery calls preserve the scheduled timestamp and attempt count.

The existing ownership, ACL, execution-fence, rollback, and retry-exhaustion assertions also pass with the migration applied.

## Real-model local probe

The probe uses the current production prompt builder, canonical tool definitions, provider adapter/state machine, OpenRouter client, and separate reviewer model. Its six-tool fixture surface and read/mutation/control results are synthetic and remain in memory. A transport guard permits outbound requests only to OpenRouter. It never constructs a database client or starts a queue consumer.

This verifies real model interaction with the changed provider code. It does **not** replace browser-to-queue-to-database end-to-end verification or test durable tool effects.

| Scenario                      | Result         | Wall time | Observed behavior                                                               |
| ----------------------------- | -------------- | --------: | ------------------------------------------------------------------------------- |
| Exact text-only reply         | Pass           |     3.3 s | One acting pass; no tools                                                       |
| Read task list                | Pass           |     8.9 s | One task-list read, correct two tasks, no writes or reviewer                    |
| Create one task               | Pass           |     9.1 s | Exact title and priority; one write; no reviewer                                |
| Update task by explicit UUID  | Pass           |     8.1 s | Correct task marked done; one write; no reviewer                                |
| Ambiguous “email task”        | Pass           |    13.3 s | Asked which of two candidates; zero writes                                      |
| Create four independent tasks | Pass after fix |    38.1 s | Failed pinned endpoint recovered; both review gates passed; exactly four writes |

A separate pre-fix run with the production preferred-provider order also completed the four-task case on DeepInfra in 45.0 seconds. The failure is conditional on the selected endpoint; it is not a universal complex-write failure.

One lower-priority presentation observation remains: the raw read-only provider trace concatenated a lead-in and the final answer as `for thisThere are`. The executor/publisher append text directly, but this was not verified in a rendered completed browser conversation. Retain it as a formatting follow-up rather than treating the functional read assertion as evidence of polished output.

## Migration applied and verified

Replayed the exact `20260902150000_agentic_chat_recovery_throttle_backoff_seconds.sql` migration against the configured BuildOS Supabase project. Preflight showed its function body had already been patched but its migration receipt was missing. An isolated CLI directory contained placeholders for existing recorded versions and this one executable migration; dry run identified only this migration. Push reported the idempotent already-applied notice and recorded version `20260902150000`. The following dry run reported up to date. No other repository migration was pushed.

Postflight verified the seconds-based throttle branch and unchanged function EXECUTE grants for `postgres` and `service_role`. Migration SHA-256: `962a5b7972f2d9eaa2fcd099fe501b651c0f4c0fe940e3934abacd242bceeaac`.

## Live end-to-end continuation

The browser used current local web source at `http://localhost:5173`, the dedicated configured E2E account, and hosted Supabase. Durable jobs ran on the hosted chat worker at release `98c5dffdaeee7a22c9ff9b427bdd0a2a5a4b9278`; this worker does not include the local provider fix. Port 3001 is the general background worker. No worker or web deployment was performed. These checks therefore verify local web integration with the deployed worker, alongside the separately tested current local provider implementation.

| Scenario                                           | Result | Wall time | Observed behavior                                                                 |
| -------------------------------------------------- | ------ | --------: | --------------------------------------------------------------------------------- |
| Structured document creation                       | Pass   |    20.3 s | Durable document assertions passed                                                |
| Scheduled, prioritized task creation               | Pass   |    18.5 s | Exact task fields verified                                                        |
| Passing mention and ambiguous reference            | Pass   |    55.8 s | Two turns; no unrequested writes; clarification instead of guessing               |
| Three task operations in one sentence              | Pass   |    70.1 s | All three durable changes verified                                                |
| Document edit followed by contextual edit          | Fail   |    20.8 s | First turn stopped on pinned Alibaba route HTTP 404 after reads                   |
| Cold company reference, task completion, next step | Pass   |    57.5 s | Target resolution and durable effects verified                                    |
| Project creation through approved contract         | Fail   |    84.2 s | Project creation progressed; later task-add follow-up hit pinned Alibaba HTTP 404 |

The two failed provider traces have zero endpoints after fallback filtering and were classified `provider_permanent_error` by the older worker. Retained turn IDs are in the continuation summary. Test retries were disabled. An earlier battery overlapped browser sign-out and received authentication failures; it is excluded from the above seven results.

### Browser failures fixed locally

**Accepted turn without a client observer.** Starting on the public homepage, then signing in without a full reload, left the root layout's initially absent Supabase context absent. The modal submitted a durable turn successfully but raised `Worker admission runtime is unavailable`; the worker could complete while the UI failed. `AgentChatModal.svelte` now falls back to the shared browser Supabase singleton when no context was provided. The same public-page login flow then created a project and task with the complete response visible.

**Premature response-ready notification.** The minimized-chat probe queried `chat_turn_runs` through the ordinary user client. The deployed table permits SELECT only through the admin policy, so a non-admin received an empty result during a running turn. The card incorrectly announced completion and previewed the previous answer. `probeActiveTurnRun` now uses the existing ownership-checked worker discovery endpoint and treats malformed responses as unknown. Queued/running, terminal-empty, malformed, and cross-session fixtures are covered. Seven regressions failed before the change; the four affected suites passed all 55 tests afterward.

The modal/worker-adapter, adoption, and stream-controller suites separately passed 51 tests. These 106 focused checks overlap the earlier full run and are not added to its 3,150 total. After both fixes, Svelte check reported zero errors and zero warnings; formatting and diff checks passed.

### What was observed in the browser

- Created `AE2E · Local chat smoke 20260903` with exactly one `Draft welcome email` task. Verified the rendered response and database rows. The turn took 47.9 seconds with eight model passes and seven tool attempts, including review and contract repair.
- Followed up to mark that task done and create `Launch notes` with exactly `The launch audience is new subscribers.` Both durable results were correct. The turn took 65.3 seconds and repaired two invalid contract declarations before completing.
- Clicked Stop during a long answer. The persisted cancellation reached terminal state in **337.796 ms**, with zero tool effects. The next prompt rendered exactly `AFTER STOP OK`.
- Reopened the conversation from History and later received exactly `HISTORY FOLLOWUP OK` on a new turn.
- After confirming another worker turn was running, minimized the chat. The corrected card remained working, then displayed the new rainbow-answer preview after completion. Reopening restored the completed response ending in `RAINBOW TEST COMPLETE`; its turn took 31.8 seconds.
- Verified chat activity tabs, empty-send protection, and multiline input. Browser screenshots are retained alongside the test results.

### Remaining failures and limits

- **Worker release mismatch:** the two automated live failures cannot validate recovery until the locally tested provider fix is running in the worker that consumes these jobs.
- **Minimize during admission:** clicking Minimize before admission completes can leave an idle “Paused” card while the accepted worker turn runs. `buildParkPayload` does not include `stream.isStartingStream`, and the bridge starts polling only for active cards. This edge remains; minimizing after confirmed execution worked.
- **Long-answer control failure:** browser turn `c927868d-cc3a-4da7-97f4-88cef5bf1d8a` failed with `read_tool_execution_failed` on `request_turn_clarification` after a model text pass. No checkpoint or durable edits were created. The underlying control error was not available in the retained records inspected.
- **Wrong request answered:** turn `2cc6b429-faa5-46be-8858-34909fc1ec1a` asked for integers 1–200 but saved an answer to the preceding newsletter-strategy request. Both admission and the prompt snapshot contained the correct latest message in the final user position. This is a model follow-up failure, not evidence that prepared input omitted the new request. A subsequent exact-reply prompt passed.
- The dashboard also logged a missing Supabase-context error after the public-page login transition. The modal fix covers chat; the dashboard consumer is outside this change.

The isolated test projects and their child task/document fixtures were removed after verification. Worker sessions and their diagnostic records remain under the existing seven-day retention policy. No emails or calendar events were sent by the browser scenarios. Forced network disconnect/reconnect was not exercised manually in this continuation.

## Evidence and reproduction

- [Consolidated test results](./agentic-chat-local-verification-2026-09-02/test-summary.json)
- [Local provider probe](./agentic-chat-local-verification-2026-09-02/local-provider-probe.ts)
- [Production routing comparison](./agentic-chat-local-verification-2026-09-02/complex-production-routing.json)
- [Migration and live continuation summary](./agentic-chat-local-verification-2026-09-02/live-continuation-summary.json)
- [Core durable scenario results](./agentic-chat-local-verification-2026-09-02/live-core-battery.json)
- [Cold reference and follow-up results, including failures](./agentic-chat-local-verification-2026-09-02/live-cold-followup-battery.json)
- [Parked-status regression results](./agentic-chat-local-verification-2026-09-02/parked-status-regressions.json)
- [Rendered project creation](./agentic-chat-local-verification-2026-09-02/browser-project-created.png)
- [Completed minimized-chat card](./agentic-chat-local-verification-2026-09-02/browser-parked-status.png)
- [Restored response](./agentic-chat-local-verification-2026-09-02/browser-restored-response.png)

From the repository root:

```sh
pnpm --filter @buildos/worker exec vitest run tests/agenticChat --maxWorkers=4
pnpm --filter @buildos/agentic-chat-runtime exec vitest run --maxWorkers=3
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat src/lib/components/agent src/routes/api/agent --maxWorkers=4
pnpm --filter @buildos/shared-types exec vitest run src/agentic-chat-tool-surface.test.ts
```

The live probe makes paid model calls. The retained script records the exact paths used on this machine. Run from `apps/web`:

```sh
LOCAL_SMOKE_ONLY=complex-four-creates \
LOCAL_SMOKE_OUTPUT=/tmp/agentic-local-complex-rerun.json \
pnpm exec vite-node --config vitest.config.ts --mode test \
  ../../docs/technical/reviews/agentic-chat-local-verification-2026-09-02/local-provider-probe.ts
```

Set `LOCAL_SMOKE_PRODUCTION_ROUTING=true` to use the production preferred-provider order; omit `LOCAL_SMOKE_ONLY` to run all six cases. Retained result files contain synthetic fixture data and no credentials.

<!-- docs/testing/TEST_VALUE_AUDIT_2026-11-17.md -->
<!-- doc-status: point-in-time -->

# Test value audit

- **Date:** 2026-11-17
- **Status:** Targeted cleanup implemented
- **Scope:** Runner inventory and a risk-based sample of assertions; not an exhaustive review of every test

The complicated failure-path tests are mostly worth keeping. The clearest waste is migration
history enforced as source spelling, and tests that search other tests for particular names.
The clearest improvement is testing what an adapter actually adds instead of repeating its
shared implementation's tests.

There is no case for cutting tests based on file length or pursuing a repository-wide coverage
percentage. A short equality test can protect an authorization boundary. A large suite can
protect many distinct crash points. Judge each case by the regression it catches and whether
another test exercises the same production path with the same fault and observable outcome.

## Decisions implemented

| Test                                                                                            | Decision                                         | Reason and retained protection                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/worker/tests/agenticChatProductionNaming.test.ts`                                         | Removed                                          | Checked that old migration filenames and identifiers were absent. Renaming or adding a comment could fail it; incorrect execution could pass. It enforced migration history rather than a runtime guarantee.                                                                                                                   |
| `apps/worker/tests/agenticChatRuntimeBoundary.test.ts`                                          | Removed                                          | Checked four strings in the read adapter, including a private runner name and a TypeScript cast. The existing [adapter suite](../../apps/worker/tests/agenticChatToolExecutionAdapter.test.ts) executes shared reads, rejects forbidden tools/access, maps failures, and bounds hung reads. Package portability checks remain. |
| `apps/worker/tests/agenticChatPhase5FailureMatrixAudit.test.ts`                                 | Moved to documentation                           | Checked that 53 phrases existed in 24 other files. It could pass with those tests skipped or their assertions removed. All scenario mappings are preserved in [the failure scenario index](./AGENTIC_CHAT_FAILURE_SCENARIOS.md); the owning tests were not removed.                                                            |
| [Web Calendar token crypto](../../apps/web/src/lib/server/google-calendar-token-crypto.test.ts) | Replaced duplicated cases with adapter contracts | The old suite repeated envelope, key validity, and identity checks from the shared package while always mocking the SvelteKit environment as empty. It missed the adapter's actual key-selection branches.                                                                                                                     |
| [Worker abortable deadline](../../apps/worker/tests/agenticChatAbortableDeadline.test.ts)       | Added focused failure-path coverage              | Existing call-site tests cover hung reads and writes, but no test directly exercised the shared deadline/settling helpers. The new suite covers cancellation before dispatch, ignored aborts, late rejection, exact deadline boundaries, cleanup after success/rejection/synchronous throw, and bounded shutdown waits.        |

The Calendar replacement uses real encryption across the web/shared boundary with **different**
keys in the two environments. Encrypting and decrypting only through the same wrapper could
use the wrong key twice and still pass. The new tests prove SvelteKit precedence, fallback for
missing/blank placeholders, refusal of a configured invalid key, missing-key failure, and
version-specific lookup. [Shared crypto tests](../../packages/shared-agent-ops/src/calendar/google-calendar-token-crypto.test.ts)
retain identity binding, malformed/legacy envelopes, double encryption, and unavailable keys.

The deadline tests use fake time and controllable promises. They assert observable cancellation,
settlement, and resource cleanup without sleeping or contacting services. The existing
[abortable regression](../../apps/worker/tests/agenticChatAbortable.test.ts) remains: an
unhandled rejection can terminate the worker and interrupt every active turn.

## Tests that earn their maintenance cost

| Area and examples                                                                                                                                                                       | Failure worth catching                                                                                                | Why the apparent repetition matters                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Mutation executor](../../apps/worker/tests/agenticChatMutationExecutor.test.ts)                                                                                                        | Duplicate writes, writes after loss of ownership, retrying an ambiguous non-idempotent operation                      | Cancellation before reservation, after reservation, and after possible commit have different legal outcomes. These should stay separate.                                                                     |
| [Write deadlines](../../apps/worker/tests/agenticChatWriteDeadline.test.ts)                                                                                                             | A hung save leaves the user waiting; an uncertain save is reported as definitely failed or saved                      | The helper, executor, adapter, and real SDK with fake transport cover different boundaries. Preserve the composed gateway tests.                                                                             |
| [Turn executor](../../apps/worker/tests/agenticChatTurnExecutor.test.ts)                                                                                                                | Lost durable partials, stale-worker publication, contradictory terminal state                                         | Its size alone is not evidence of redundancy. Admission, durable publication, cancellation, and finalization fail at distinct points. Split fixtures if maintenance becomes difficult; retain the scenarios. |
| [Realtime inbox](../../packages/agentic-chat-client/src/worker-realtime-inbox.test.ts)                                                                                                  | Missing/duplicated text, stale-generation takeover, forged terminal state                                             | Duplicates, sequence gaps, new generations, and authoritative snapshots require different recovery behavior.                                                                                                 |
| [Workflow crash cuts](../../apps/worker/tests/agenticChatWorkflowCrashCuts.postgres.test.ts) and [process restart](../../apps/worker/tests/agenticChatWorkflowRestart.postgres.test.ts) | Repeating accepted provider work after a crash or corrupting the visible prefix                                       | A process kill and durable recovery exercise properties an in-memory mock cannot establish. Requires local PostgreSQL; a skipped suite is not a pass.                                                        |
| [Stripe service](../../apps/web/src/lib/services/stripe-service.test.ts)                                                                                                                | Acknowledging failed persistence, reactivating a canceled subscription from an old event, repeated proration on retry | Delayed events and partial provider/database success are distinct failure modes. Mocked providers keep these free; they do not prove concurrent exactly-once handling.                                       |
| [Campaign sender](../../apps/web/src/lib/server/email-campaigns/sender.test.ts)                                                                                                         | Sending after opt-out/deletion, retrying an uncertain send, exceeding a shared allowance                              | Sender orchestration and real two-connection allowance/claim checks prove different things. Keep both layers.                                                                                                |
| [Calendar sync](../../packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts)                                                                                           | Editing the wrong person's event, reviving deleted records, applying stale jobs                                       | Guest identity, source mapping, deletion, and stale-job handling are high-impact contracts. Similar test names in web and shared suites do not prove duplication.                                            |
| [Scheduler](../../apps/worker/tests/scheduler.comprehensive.test.ts)                                                                                                                    | Missing or duplicating a delivery across daylight-saving changes                                                      | Exact instants through spring gaps and fall overlaps matter more than merely returning a date.                                                                                                               |
| [Package worker safety](../../apps/worker/tests/packageWorkerSafety.endstate.test.ts) and [runtime portability](../../packages/agentic-chat-runtime/src/portability.test.ts)            | A portable package starts importing host-only modules                                                                 | Source analysis can be appropriate when the dependency itself is the forbidden behavior. These differ from checking private variable names.                                                                  |
| [Gmail content boundary](../../apps/web/src/lib/server/gmail-relevance/scan-content-boundary.test.ts)                                                                                   | Durable metadata gains email content or contract code acquires a provider dependency                                  | Field and import restrictions express privacy/capability boundaries. Keep these guarantees when improving the scanner.                                                                                       |

Current-schema SQL assertions remain essential for ownership, grants, atomic state transitions,
and archival rules. The runner/CI wiring established in the October audit is still present:
`test:sql-current` has a dedicated PostgreSQL 15 lane; historical self-contained SQL and Agent
Run integration tests have separate owners. An isolated historical migration fixture is not
equivalent to testing the current schema.

## Follow-up implemented

The first two replacement priorities are complete. The source-count suite
`agenticChatReliabilityContractAudit.test.ts` was removed after strengthening the existing
behavior suites, rather than creating another suite that repeats them.

- **Durable writes:** [effect control](../../apps/worker/tests/agenticChatEffectControl.test.ts),
  [execution control](../../apps/worker/tests/agenticChatExecutionControl.test.ts),
  [observations](../../apps/worker/tests/agenticChatExecutionObservation.test.ts),
  [prompt snapshots](../../apps/worker/tests/agenticChatPromptSnapshot.test.ts),
  [research capture](../../apps/worker/tests/agenticChatResearchCapture.test.ts),
  [tool execution](../../apps/worker/tests/agenticChatToolExecution.test.ts), and
  [stream persistence](../../apps/worker/tests/agenticChatStreamPublisher.test.ts) now check the
  previously missing ownership fields on actual RPC calls and denied-ownership outcomes.
  Stale, cancelled, or terminal receipts retain each API's intended behavior: skip capture,
  refuse authority, throw an execution fence, or return a non-publishable receipt. Existing
  [workflow recovery](../../apps/worker/tests/agenticChatWorkflowRecovery.test.ts) and
  [semantic batching](../../apps/worker/tests/agenticChatBatchedPersistence.test.ts) already
  assert their complete RPC envelopes and remain in place. Text flushes preserve each row's
  own ownership fields.
- **Mutation boundaries:** the table adapter already exercises stable effect IDs, immutable
  admission, and cancellation before dispatch. Added the missing equivalents to the
  [project creation](../../apps/worker/tests/agenticChatCreateOntoProjectMutationAdapter.test.ts)
  and [delegation](../../apps/worker/tests/agenticChatDelegateTaskMutationAdapter.test.ts)
  adapters, asserting that downstream work never starts. This replaces the source search
  for a boundary-helper call and the three-file roster.
- **Mutation policy:** removed fixed tool/capability counts. The
  [policy suite](../../apps/worker/tests/agenticChatMutationSurfacePolicy.test.ts) retains the
  exact signed/reviewed/deferred partition, disabled-by-default capabilities, shared admission
  compatibility, and the explicit safe-replay allowlist. The identical safe-replay assertion
  in the deleted audit was redundant. Knowledge tools remain covered by the dynamic policy
  checks; their earlier staged additions were not reverted.
- **Scheduler:** removed `schedulerOwnership.test.ts` and its line-count/source-fragment
  assertions. The [behavior suite](../../apps/worker/tests/agentOperativeScheduler.test.ts) now
  checks conditional claims of stale locks, user-scoped active-run limits, count-query failure,
  queue failure cleanup, and failure to advance a schedule after a successful enqueue. The
  last case must not enter the defer/retry path during that invocation. Mocked calls do not
  establish race safety across real database connections or future scheduler invocations.
- **Provider dependencies:** retained one deliberate dependency-direction check in
  [the provider boundary suite](../../apps/worker/tests/agenticChatProviderBoundary.test.ts).
  It parses imports, exports, and dynamic imports from discovered provider modules. Removed
  two tests enforcing old filenames and private declaration placement, plus the fixed module
  roster. Source analysis is appropriate here because the import itself is the violation.
- **Shared markdown:** moved the web re-export's cases into the
  [owning package](../../packages/shared-agent-ops/src/utils/markdown-normalization.test.ts).
  Eleven cases across two suites became ten distinct cases: null/non-string/empty input,
  escaped line breaks and quotes separately and together, single/mixed payloads, fenced-code preservation, `/n`
  markers, and the compound plan fixture. Removed the duplicate fenced-code case and `/n` assertion, plus
  the redundant web test location; the runtime re-exports are unchanged.

Further comparisons did **not** justify deleting the web versioning, instantiation, or
last-turn-context suites. Their force-create/outline-cache, actor/schema, and marker-neutralization
cases differ from the shared package's version-window/recovery, instantiation cleanup, and
partial-continuity cases. The two response-parsing suites target separate implementations;
similar names do not establish redundancy.

## Remaining audit work

Continue sampling tests by production path, fault, and outcome before removing cases. The
changes above address the identified source-count and refactor-shape priorities, not every
source-reading test in the repository. Database ownership, grants, and atomicity still need
real current-schema SQL tests in addition to these mocked adapter contracts.

Built-app login/navigation, editing across reload, and chat send/stop/reopen remain an
integration gap. The browser harness is explicitly paused and incomplete; this follow-up did
not restart it or add browser builds. Resume that work deliberately with a small suite
isolated from live credentials.

## Rule for the next test

Write down the plausible regression and the observable failure first. Add a case when it
protects a distinct branch, boundary, or failure timing. Put exhaustive pure behavior tests in
the owning package; let adapters test their configuration, authorization, translation, and
wiring. Mock external systems at the edge, not the result whose behavior is under test.

Keep exact assertions for IDs, money, authorization, ordering, idempotency keys, and persisted
state. Avoid freezing incidental wording, class order, file layout, or the names of other
tests. A deletion is justified when no unique contract remains, not merely because another
test calls the same function. Do not use a test-count reduction as the success metric.

## Validation

### Initial pass

- Four worker files: **87 passed**, including the new deadline suite and existing abort,
  read-adapter, and mutation-executor tests. One worker through `test-gate`; no live calls.
- Web Calendar adapter and Stripe service: **35 passed** (7 Calendar, 28 billing).
- Shared Calendar crypto: **10 passed**. Total focused validation: **132 passing tests**.
- Prettier, `git diff --check`, and the strict documentation health check passed (zero
  findings across 1,677 Markdown files). All 53 scenario mappings were retained.
  The first web run waited out a full test gate; its single retry
  after the required wait obtained a slot and passed.
- No full-suite, fresh coverage, PostgreSQL, browser, or paid-model run was performed.
- Production behavior is unchanged. Unrelated staged work and concurrent edits were preserved. This audit's conclusions apply to the reviewed sample, not every file on disk.

### Follow-up

- **335 worker tests passed across 15 focused files**, including the modified suites and
  existing table-adapter, workflow-recovery, and batched-persistence contracts.
- **10 shared markdown tests passed**. Follow-up total: **345 passing tests**.
- Focused native TypeScript checking passed for the 12 modified worker test files and their
  imports. Temporary configuration was kept outside the repository.
- Runs used one Vitest worker through `test-gate`. No paid models, live services, database,
  full-suite, browser, or coverage run was performed.
- A temporary Vitest transform deliberately removed the ownership token from effect begin
  and reconcile requests while leaving the fence-helper calls intact. Both new RPC assertions
  failed on the missing token; the other seven cases passed. The transform lived in `/tmp`
  and did not edit production source. This catches a defect the former helper-call counts
  would have accepted.
- Prettier, `git diff --check`, and strict documentation health checking passed; the latter
  found no issues across 1,677 Markdown files.

### Independent review

A second agent independently reviewed the test changes, deletions, retained production
contracts, and scenario documentation. The review confirmed that all 53 scenario IDs and
24 owning-file mappings remain. Two test weaknesses were corrected:

- The provider dependency check skipped the worker's configured `@/` alias. It now resolves
  imports with the worker's TypeScript configuration before comparing the target module.
- Stream-adapter assertions shared mutable inputs and receipts with their expectations.
  The adapter now receives independent fixture copies, so an in-place ownership rewrite or
  publication-outcome change cannot also rewrite the expected value.

The effect-control denial test also again requires `AgenticChatEffectControlRpcError`
instances, retaining the prior error-class guarantee alongside the code/RPC-name assertions.

Temporary transforms injected an aliased coordinator import and overwrote the second text
batch's token/generation with the first batch's values. The corrected tests rejected both
faults; the other 47 cases passed. Production source was not edited by these experiments.
All **58 tests in the three affected suites passed** with the normal configuration, and
focused native TypeScript checking passed. The reviewer rechecked the fixes and reported
no remaining material findings in the reviewed changes.

### Verification approach refinement

The [verification workflow](./README.md#verification-workflow) now starts from the changed
behavior, plausible failure, and independent expected result. Repository collaboration
instructions point to it. It includes scoped validation evidence, bounded invariant checks,
independent comparisons for refactors, and negative controls for critical replacement checks.
No new dependency, commit hook, blocking gate, or live validation requirement was added.

The [chat inbox suite](../../packages/agentic-chat-client/src/worker-realtime-inbox.test.ts)
now composes the real inbox and UI adapter. Two generated checks enumerate 360 distinct
delivery orders each, treating repeated deliveries as identical when generating permutations:

- Initial reconciliation, out-of-order text, duplicate delivery, and stale-generation events
  must preserve an ordered prefix and converge to the durable text snapshot.
- Attempt takeover, future events, duplicate delivery, and old reconciliation replies must
  keep each attempt's text separate and never move back to an older generation. Sequence
  numbers may reset across generations; within a generation they cannot move backward.

All **19 inbox tests passed** after the additions (about 0.3 seconds total, 0.12 seconds in
tests on this machine). The two new checks also failed as intended when temporary transforms
replayed retained text after a snapshot and removed the receipt-generation checks. Failures
reported the offending delivery order, repeated text, and generation rollback. The normal
run passed again afterward. Focused native TypeScript checking passed.

Validation used base revision `68bd7f4606a4e22e158f1bdf2630b196f7c6cf65` plus the working-tree
test edit (SHA-256 `7033f6143a6c4c0d6b5e7169b7829d06a5b3aab8cfdf8897f9393e0f2704be76`).
Client package sources/configuration and the lockfile were fingerprinted around the run.
These are bounded client-state checks with a view/store port, not browser rendering, HTTP
polling, database concurrency, or live-model evidence. Production code was unchanged.

### Five-flow hardening follow-up

Added **16 failure-focused cases** across the areas requested after the verification review:

| Flow                           | New behavior exercised                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool definitions and calls     | Interleaved streamed arguments across 1/2/7/64-character fragments preserve Unicode, escaping, scheduling references and call identity. Actual worker definitions accept valid calls, identify the invalid call in a mixed batch, and reject duplicate ids before returning a completed batch.                                                                                                                               |
| Project creation               | A failed create carrying partial project ids cannot satisfy the request or clear pending work. A subsequent confirmed success can.                                                                                                                                                                                                                                                                                           |
| Frontend streaming             | Real channel → inbox → UI adapter composition buffers until baseline recovery, ignores wrong-session data, deduplicates text, repairs a gap on reconnect, and finishes with authoritative saved text despite late frames.                                                                                                                                                                                                    |
| Daily brief                    | Losing queue ownership during generation or notification metadata reads prevents notification, waiting-item refresh, and successful completion by the retired attempt; both new and already-saved briefs are exercised.                                                                                                                                                                                                      |
| Closing and synthesizing chats | Cross-user session access is rejected; failed context saves stop follow-ups; stale activity counters do not hide messages; unchanged synthesis is not queued again; explicit project detach saves before queueing. A failed synthesis save does not hand off entities or mark completion, and succeeds on retry. Messages arriving during the model call are included in the next synthesis, not stamped as already covered. |

The new tool-validation test **failed before the production fix**: `project.state_key:
"launch"` passed preflight even though the project mutation adapter rejected it. The shared
project-create validator now uses the same state normalizer as the adapter, giving invalid
values a validation-repair opportunity before mutation execution. The regression also
checks that the supported `In Progress` alias remains accepted.

Two additional daily-brief tests failed before a second production fix: when ownership was
lost during the notification helper's metadata reads, both a newly generated brief and an
already-saved brief still emitted `brief.completed` and reported success. The helper now
receives the job signal, checks it immediately before delivery, and propagates cancellation
instead of swallowing it as a notification failure. The existing Cycle Run tests also pass.

Removed another exact source-count assertion from the playbook example suite. Every
operational playbook must still supply a discovered example, and every discovered example
still runs through real validation and capability/field checks; adding a valid example no
longer fails an arbitrary example-count expectation.

Validation: **177 tests in 12 focused files passed** (worker 110, runtime 31, client 27,
web close route 9). The modified playbook guard was rerun separately. Focused native
TypeScript checks passed for the worker tests, client composition, runtime change and
close-route test. No paid model tests, production calls, browser run or full suite was used.
The [behavior risk matrix](./COVERAGE_MATRIX.md) records the evidence boundaries: database,
queue and model ports remain mocked, and frontend composition stops at the view/store port.

A temporary transform made the close route refresh the old project after an explicit
detach. The new regression failed as intended (the other eight cases passed); the ordinary
run passed afterward. The route's database fixture returns independent read snapshots so
later writes cannot accidentally mutate the loaded session and hide this bug. No production
source was changed by this negative control.

These runs used base `68bd7f4606a4e22e158f1bdf2630b196f7c6cf65` plus the working tree.
The nine edited code/test files were fingerprinted after validation in
`/tmp/buildos-five-flow-validated-files.json`; their combined SHA-256 is
`3ca14a36716f4b0043ace20c640964d511382571e5456ad7fe5ea453efae9e97`.
This fingerprints this follow-up's edits, not every transitive dependency in the workspace.

Successful test commands (the two worker reruns reflect the later brief fix and playbook
guard change, rather than one additional full run):

```sh
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/worker exec vitest run tests/agenticChatStreamedToolValidation.test.ts tests/chatSessionClassifierLibri.test.ts tests/briefWorker.stale.test.ts tests/agenticChatCreateOntoProjectMutationAdapter.test.ts tests/agenticChatSkillContractExamples.test.ts
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/worker exec vitest run tests/briefWorker.stale.test.ts tests/dailyBriefCycleHandler.test.ts
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/worker exec vitest run tests/agenticChatSkillContractExamples.test.ts
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/loop/project-create-args.test.ts src/loop/project-create-completion.test.ts src/loop/tool-validation.test.ts
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/agentic-chat-client exec vitest run src/worker-realtime-channel.test.ts src/worker-realtime-inbox.test.ts
test-gate run 'env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/web exec vitest run "src/routes/api/chat/sessions/[id]/close/server.test.ts"'
```

Focused type checks ran `test-gate run node apps/worker/node_modules/@typescript/native/bin/tsc
-p /tmp/buildos-five-flow-<scope>-types.json --pretty false` separately for `worker`,
`client`, `runtime`, and `web`. These temporary configs extend each package's configuration
and include the changed tests/source, rather than running a full workspace typecheck.

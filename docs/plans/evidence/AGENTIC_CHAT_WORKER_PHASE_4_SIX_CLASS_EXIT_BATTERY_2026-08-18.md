<!-- docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 4 — Six-Class Exit Battery

**Run date:** 2026-08-18
**Decision:** **NO EXIT — latest retest passed 11/18 with two deterministic stream errors**
**Initial source revision:** `091300faf4a254762ce02219e108cff4c56d8582`
**Initial run ID:** `phase4-six-class-exit-a70c31e8-abf`
**Latest retest source revision:** `33b4faec017264e87ecda102cbd5db12a962316c`
**Latest retest run ID:** `phase4-six-class-second--fe1ffaf1-d33`
**Latest artifact:** `agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`
**Latest artifact SHA-256:** `7b01ae2dce6d023d2861f5a6fde1feb801e0c20ef14b72ab0ca194d442738438`

## Second remediation exit retest — 2026-08-19

The exact-`33b4faec` retest improved the aggregate from 8/18 to **11/18**, but Phase 4 still does
not exit because the deterministic lane emitted two stream-error turns. This was the only paid
battery in this gate: repetitions were three, retries were zero, and no failed scenario was rerun.

### Exact source, staging, and preflight

The harness ran from a clean detached worktree at exact source
`33b4faec017264e87ecda102cbd5db12a962316c`, tree
`08d801b16731f39fd5a80750edbab121dedf9c0a`, with exact `worker_realtime` attribution. CI run
[`32218882941`](https://github.com/Wolverine971/buildos-platform/actions/runs/32218882941) was green
before staging.

| Surface                     | Receipt/state                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Vercel routed deployment    | `dpl_fWcknFAHtGvDkJCsZZM8kTqFoFU8` — Ready and aliased to `build-os.com`                |
| Railway worker deployment   | `7d3dc9df-f8d6-4a1a-b630-a29806cbdee1` — exact `33b4faec`, later removed on restoration |
| Web routing cohort          | exact one-user UUID `76c04859-837c-4d13-88ea-9a39ed15ed81`                              |
| Provider capabilities       | `createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree`                   |
| Adapter capabilities        | `createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree`                   |
| Zero-spend worker preflight | 1/1 passed in 7.823 seconds                                                             |

An earlier guarded launch in the same gate reached a Ready route-on deployment but stopped before
preflight or provider spend because `vercel inspect` wrote its status to stderr while the wrapper
captured stdout. Its EXIT trap restored both control planes, and an independent readback verified
routing false, both capability strings empty, unchanged cohort, and HTTP 200 before the corrected
wrapper relaunched. That attempt contributes no model turns and no battery result.

### Latest result against the comparator

A repetition passes only when every turn in that repetition has `assertionPassed: true`.

| Scenario                         |  Initial | First retest | Latest retest | Latest rate | Legacy rate | Result      |
| -------------------------------- | -------: | -----------: | ------------: | ----------: | ----------: | ----------- |
| `project-catchup-cold`           |      3/3 |          3/3 |           3/3 |     100.00% |     100.00% | Meets       |
| `project-organize`               |      0/3 |          0/3 |           0/3 |       0.00% |      83.33% | Misses      |
| `restraint-noop-and-ambiguity`   |      3/3 |          2/3 |           2/3 |      66.67% |     100.00% | Misses      |
| `task-complete-cold-reference`   |      1/3 |          0/3 |           1/3 |      33.33% |      91.67% | Misses      |
| `task-multi-update`              |      0/3 |          1/3 |           2/3 |      66.67% |     100.00% | Misses      |
| `task-reschedule-cold-reference` |      1/3 |          2/3 |           3/3 |     100.00% |      75.00% | Meets       |
| **All six**                      | **8/18** |     **8/18** |     **11/18** |  **61.11%** |  **91.67%** | **NO EXIT** |

Supplementary turn-level result: 14/21 assertions passed. All 21 turns retained a completed
terminal state; two turns emitted stream errors, and no turn had a capture error.

### Latest failure classification

Two deterministic failures were both in `project-organize`:

| Repetition | Turn run                               | Typed failure                   | Evidence/interpretation                                                                                              |
| ---------: | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
|        1/3 | `af662d43-2c8f-4289-9684-1a4393d5a4c7` | `provider_tool_not_allowlisted` | The provider invented unavailable `skill_search`; advertised tool count was 16, and the call did not execute.        |
|        3/3 | `c33f04df-79bc-45ef-8565-ba327591f086` | `provider_tool_call_disabled`   | After durable `request_turn_clarification`, the tool-free synthesis pass attempted another tool and failed the turn. |

The remaining five misses were stream-clean judgment failures:

- `project-organize` 2/3 inspected the tree but asked the user to choose the organization despite
  the explicit delegation.
- `task-complete-cold-reference` 1/3 and 2/3 asked for unnecessary date/confirmation details
  instead of completing the uniquely matched task; 3/3 passed and used `update_onto_task`.
- `restraint-noop-and-ambiguity` 1/3 correctly kept the passing mention read-only, then guessed
  and completed one task on the deliberately ambiguous follow-up instead of clarifying.
- `task-multi-update` 2/3 asked whether the top-priority task should also become in progress rather
  than applying the three dictated operations; 1/3 and 3/3 each executed all three updates.

No coercive model override is justified by those five judgment misses. The deterministic tool
contract failures do justify bounded provider-state repairs.

### Latest cost and timing

| Metric                                   |                          Result |
| ---------------------------------------- | ------------------------------: |
| Provider cost                            |                   `$0.11939497` |
| Client total duration p50 / p95 / max    | `53.729s / 135.573s / 151.002s` |
| Server total request p50 / p95 / max     | `50.360s / 133.425s / 148.101s` |
| Client TTFT p50 / p95 / max (20 samples) |    `8.981s / 28.245s / 32.401s` |
| Stream-error turns                       |                          `2/21` |
| Capture-error turns                      |                          `0/21` |

### Latest unconditional restoration

The failed Vitest result immediately entered the EXIT trap. Final readbacks verified:

| Surface               | Restored receipt/state                                                |
| --------------------- | --------------------------------------------------------------------- |
| Vercel                | `dpl_HiFX44rvVcJE15DmK1B6LnuxCLpF` — Ready, aliased to `build-os.com` |
| Web routing           | exact `false`                                                         |
| Web cohort            | unchanged exact one-user UUID                                         |
| Railway               | `59ab22eb-b4cf-4c88-8de1-1b0bffea462f` — SUCCESS, exact `33b4faec`    |
| Worker consumer       | enabled and healthy                                                   |
| Provider capabilities | exact empty string                                                    |
| Adapter capabilities  | exact empty string                                                    |
| Public site           | HTTP 200                                                              |

### Shipped deterministic follow-up — not paid-retested

The two provider-state failures now have narrow regressions in the same two worker files:

- the one-shot, non-executing unavailable-skill repair recognizes both `skill_load` and
  `skill_search`, restores the exact admitted surface, and still permanently rejects repetition
  or every other unknown tool;
- after durable clarification, the existing buffered forced-synthesis path now discards one stray
  tool attempt and retries tool-free, instead of failing immediately with
  `provider_tool_call_disabled`.

Proof: focused provider 60/60, full worker 1,059 passed plus one intentional skip, worker check
green (zero lint errors, existing warnings only, HTTP size guard green, TypeScript clean), and
Prettier clean. The worker follow-up landed inside aggregate commit
`6c73357aed37d6b50062fa2fd896082157bdedf6`; Railway deployment
`2a3c25d5-6621-4445-bea3-cceebafeb9ca` is SUCCESS on that exact revision and the agentic consumer
is healthy with zero claim failures. Aggregate CI run
[`32279811296`](https://github.com/Wolverine971/buildos-platform/actions/runs/32279811296) failed
only because four web tests still referenced routes and URLs moved by the same aggregate commit.
The isolated three-test correction landed as `00246a8fc05dac93914274625dc111a0e18a615a` after a
focused 25/25 pass, Svelte check 0/0, and a local CI-equivalent 595/595 files and 3,802/3,802 tests.
Authoritative CI run
[`32282265304`](https://github.com/Wolverine971/buildos-platform/actions/runs/32282265304) then
passed every required job in 12m26s. Vercel deployment `dpl_C2CYjyvoq8gLb52MMMkivpVdwJqS` is
Ready and aliased to `build-os.com` on the repair commit. Routing is exact false, the one-user
cohort is unchanged, both Railway capability strings are empty, and the worker/site return HTTP 200. No further production flag change, capability widening, provider spend, or paid battery
occurred. Any subsequent paid retest requires fresh explicit authorization and the same
unconditional off/empty restoration.

## Remediation exit retest — 2026-08-19

The first post-remediation retest is complete. It did not improve the aggregate pass rate, so
Phase 4 remains closed. The deterministic lane improved from four stream-error turns to one, but
the judgment failures moved between scenario classes rather than converging.

### Landing, CI, and exact production receipts

The provider repair and its regression coverage landed in aggregate worker revision
`f5f9917e42aa88651aef72099ef037f591ecb274`. A later test-only CI stabilization landed as
`870c3feef15cfa978ecbc28f78eb447058d95f85`: `DocumentModal.test.ts` now starts the lazy
`AgentChatModal.svelte` import during module collection so the loaded interaction assertion does
not pay the first transform inside its five-second polling budget. Authoritative GitHub Actions
run [`32212816674`](https://github.com/Wolverine971/buildos-platform/actions/runs/32212816674)
passed typecheck, schema tooling, lint, coverage, deep-research database integration, and artifact
upload. The exact local coverage gate also passed 17/17 tasks, 595/595 web files, and 3,800/3,800
web tests.

The retained artifact came from a clean detached `870c3feef` worktree with source tree
`f252ce7c542e1d51601b58345b44871e068d4a6a`. The live run used:

| Surface                     | Receipt/state                                                                 |
| --------------------------- | ----------------------------------------------------------------------------- |
| Vercel routed deployment    | `dpl_3J79U1dJUCDh6jS8mohrwq7dqJz1` — Ready and aliased to `build-os.com`      |
| Railway worker deployment   | `8a1a5cd7-ea22-4a20-9010-63a37860aa93` — SUCCESS, exact worker SHA `f5f9917e` |
| Web routing cohort          | exact one-user UUID `76c04859-837c-4d13-88ea-9a39ed15ed81`                    |
| Provider capabilities       | `createOntoDocument,updateOntoTask,moveDocumentInTree`                        |
| Adapter capabilities        | `createOntoDocument,updateOntoTask,moveDocumentInTree`                        |
| Zero-spend worker preflight | 1/1 passed in 7.776 seconds                                                   |

The first staging-wrapper attempt stopped before web routing or provider spend because Zsh treats
`status` as a read-only shell variable. The staged Railway revision
`0f5a6c88-fe83-4bee-84a1-4c83478da7d9` was removed, the newer empty-capability restore
`c78dd62a-a74a-4422-a4d9-72e6174f2ca5` succeeded, and Vercel remained routing-off throughout.
After exact readback, the corrected Bash wrapper ran the preflight and battery above.

### Retest result against the comparator

A repetition passes only when every turn in that repetition has `assertionPassed: true`.

| Scenario                         |  Initial |   Retest | Retest rate | Legacy rate | Result      |
| -------------------------------- | -------: | -------: | ----------: | ----------: | ----------- |
| `project-catchup-cold`           |      3/3 |      3/3 |     100.00% |     100.00% | Meets       |
| `project-organize`               |      0/3 |      0/3 |       0.00% |      83.33% | Misses      |
| `restraint-noop-and-ambiguity`   |      3/3 |      2/3 |      66.67% |     100.00% | Misses      |
| `task-complete-cold-reference`   |      1/3 |      0/3 |       0.00% |      91.67% | Misses      |
| `task-multi-update`              |      0/3 |      1/3 |      33.33% |     100.00% | Misses      |
| `task-reschedule-cold-reference` |      1/3 |      2/3 |      66.67% |      75.00% | Misses      |
| **All six**                      | **8/18** | **8/18** |  **44.44%** |  **91.67%** | **NO EXIT** |

Supplementary turn-level result: 11/21 assertions passed. All 21 turns retained completed terminal
evidence; one turn emitted stream errors, and no turn had a capture error.

### Retest failure classification

The one deterministic failure was `project-organize` 1/3. Railway typed diagnostic
`agentic_chat_typed_execution_failure` identified rejected tool `create_onto_document`, even
though `createOntoDocument` was staged in both capability lists. The turn first entered the
unavailable-`skill_load` repair path. That repair rebuilt the reduced semantic-gate surface, so the
subsequent valid create-parent strategy saw only 11 advertised tools and failed closed. The
allowlist still prevented an unadvertised call from executing; the defect is loss of the already
reviewed admitted surface during repair.

The remaining nine failures were judgment/semantic misses:

- `project-organize` 2/3 and 3/3 requested clarification instead of carrying out delegated
  organization.
- `task-complete-cold-reference` failed 3/3: one repetition completed the Northwind task but the
  judge scored the forward carry 2/5; two requested clarification before updating the unique task.
- `restraint-noop-and-ambiguity` 1/3 guessed among three email tasks and mutated before asking.
- `task-reschedule-cold-reference` 1/3 asked for a time even though the commissioned date change
  was uniquely resolvable.
- `task-multi-update` 1/3 and 2/3 asked for confirmation instead of applying all three explicit
  clauses.

This distribution reinforces the no-coercion policy: deterministic surface loss is a code defect;
the semantic misses belong in the shared acting/reviewer guidance and statistical comparator.

### Retest cost, timing, and restoration

| Metric                                |                          Result |
| ------------------------------------- | ------------------------------: |
| Provider cost                         |                   `$0.10674149` |
| Client total duration p50 / p95 / max | `49.898s / 103.750s / 107.403s` |
| Server total request p50 / p95 / max  | `47.720s / 101.230s / 104.449s` |
| Client TTFT p50 / p95 / max           |    `9.016s / 17.438s / 74.172s` |
| Stream-error turns                    |                          `1/21` |
| Capture-error turns                   |                          `0/21` |

The guarded EXIT path restored production after the failed Vitest result. Final readbacks:

| Surface               | Restored receipt/state                                                |
| --------------------- | --------------------------------------------------------------------- |
| Vercel                | `dpl_DvmkNiQ5ibkCUJyd63YSgCeoUj8C` — Ready, aliased to `build-os.com` |
| Web routing           | exact `false`                                                         |
| Web cohort            | unchanged exact one-user UUID                                         |
| Railway               | `8e251601-efe3-4029-9409-a25be0d61a11` — SUCCESS, exact `f5f9917e`    |
| Worker consumer       | enabled and healthy; zero claim failures                              |
| Provider capabilities | exact empty string                                                    |
| Adapter capabilities  | exact empty string                                                    |
| Public site           | HTTP 200                                                              |

### Follow-up after the retest — committed and deployed, not paid-retested

The next bounded two-file change landed as commit
`33b4faec017264e87ecda102cbd5db12a962316c`:

- unavailable-`skill_load` repair restores the stable admitted tool surface rather than preserving
  a transient semantic-gate subset;
- continuation passes now apply the same pre-mutation semantic withholding gate as the initial
  pass, so a directly proposed mutation cannot execute before disposition and review;
- completion, reschedule/priority, multi-change, and delegated-organization rules now come from one
  shared instruction set used by the acting gate and both independent semantic-review paths;
- genuine multiple-target ambiguity still requires clarification, and repeated `skill_load` or any
  other unadvertised tool remains permanently fail-closed.

Local proof: focused provider 59/59, full worker 1,058 passed plus one intentional skip, worker
lint/HTTP guard zero errors, worker typecheck clean, Prettier clean, and scoped diff check clean.
Authoritative CI run
[`32218882941`](https://github.com/Wolverine971/buildos-platform/actions/runs/32218882941)
passed every required job in 12m27s. Railway deployment
`e2eab557-0ab1-488a-b778-d3afe10b48fc` is SUCCESS on exact `33b4faec0`; the worker is healthy, both
capability strings remain empty, and routing remains false. The current production alias is Vercel
`dpl_AiKGEXaz645PQjMxj5dkT7C3CUJo`, Ready, with the cohort unchanged and public HTTP 200.

The next exact battery inventory must add `createOntoTask` for the valid model-authored durable
forward-carry strategy in `task-complete-cold-reference`, yielding
`createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` after a fresh surface recheck.
No paid retest, routing change, capability widening, or additional provider spend has occurred.

## Scope and authorization

DJ authorized one paid production battery containing exactly these six scenarios, three
repetitions each, with no retries:

- `restraint-noop-and-ambiguity`
- `task-reschedule-cold-reference`
- `task-multi-update`
- `project-catchup-cold`
- `task-complete-cold-reference`
- `project-organize`

The run used `worker_realtime`, required exact `agentic_chat_worker_v1` attribution, captured
telemetry, and retained evidence from a clean detached worktree at the exact deployed revision.
The two research scenarios remained excluded under the 2026-08-18 Phase 5 deferral.

## Preflight and deployment receipts

The first readback found undocumented production drift before any traffic was sent:

| Gate               | Expected safe value | Found value                                                                              |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------- |
| Web routing        | `false`             | `true`                                                                                   |
| Provider mutations | empty               | `createOntoDocument,updateOntoDocument,moveDocumentInTree,createOntoTask,updateOntoTask` |
| Adapter mutations  | empty               | `createOntoDocument,updateOntoDocument,moveDocumentInTree,createOntoTask,updateOntoTask` |

Production was first normalized to routing-off/capabilities-empty and independently read back.
The clean detached worktree initially lacked built workspace package outputs; a zero-spend preflight
therefore failed during module collection with zero tests and zero model turns. Production was
restored again before the worktree dependencies were generated. The repaired test file collected
cleanly, and the second authenticated zero-spend preflight passed 1/1 in 10.4 seconds.

The actual battery ran against:

| Surface                   | Receipt                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| Vercel routed deployment  | `dpl_AGWKeak8AWeKPJDMNVuCgYhpyPSy` — Ready and aliased to `build-os.com` |
| Railway worker deployment | `b4f308cb-cd27-44eb-8aeb-d350a4c327de` — SUCCESS, exact `091300faf`      |
| Web routing cohort        | exact one-user UUID `76c04859-837c-4d13-88ea-9a39ed15ed81`               |
| Provider capabilities     | `updateOntoTask,moveDocumentInTree`                                      |
| Adapter capabilities      | `updateOntoTask,moveDocumentInTree`                                      |

## Result against the legacy comparator

A scenario repetition passes only when every retained turn in that repetition has
`assertionPassed: true`.

| Scenario                         | Worker passes | Worker rate |        Legacy rate | Result      |
| -------------------------------- | ------------: | ----------: | -----------------: | ----------- |
| `project-catchup-cold`           |           3/3 |     100.00% |            100.00% | Meets       |
| `project-organize`               |           0/3 |       0.00% |             83.33% | Misses      |
| `restraint-noop-and-ambiguity`   |           3/3 |     100.00% |            100.00% | Meets       |
| `task-complete-cold-reference`   |           1/3 |      33.33% |             91.67% | Misses      |
| `task-multi-update`              |           0/3 |       0.00% |            100.00% | Misses      |
| `task-reschedule-cold-reference` |           1/3 |      33.33% |             75.00% | Misses      |
| **All six**                      |      **8/18** |  **44.44%** | **66/72 (91.67%)** | **NO EXIT** |

Supplementary turn-level result: 11/21 assertions passed. All 21 turns reached a retained terminal
state, four turns emitted stream errors, and no turn had a capture error.

## Failure classification

### Deterministic lane — four fail-closed provider/tool-surface errors

Railway's typed diagnostics identify the rejected tool names without relying on model text:

| Scenario repetition                  | Turn run                               | Rejected tool          | Interpretation                                                                                                            |
| ------------------------------------ | -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `project-organize` 1/3               | `62f1f500-ce0c-4130-b2e3-bc8adc5ec143` | `create_onto_document` | The two-capability staging plan omitted the parent-document creation strategy the model selected before moving documents. |
| `project-organize` 2/3               | `97767030-8888-48b3-8651-8078181af05e` | `create_onto_document` | Same fail-closed capability mismatch.                                                                                     |
| `task-reschedule-cold-reference` 3/3 | `ddee54f4-3f50-4b7a-a90a-5b7f7aee2c5d` | `skill_load`           | The model called a skill tool absent from the exact worker request surface despite the worker surface override.           |
| `task-multi-update` 1/3              | `cbb3b27b-4e90-4ed5-adce-616e80a0a749` | `skill_load`           | Same absent-tool contract mismatch.                                                                                       |

The allowlist boundary behaved correctly: none of these unadvertised calls executed. The
`project-organize` failures also prove that the handoff's claim that this scenario required only
`moveDocumentInTree` was incomplete. The scenario begins with loose source documents and permits a
new grouping parent, so an actual model strategy can legitimately require `createOntoDocument`
before `moveDocumentInTree`.

### Judgment/semantic lane — six over-clarification misses

Six terminal, stream-clean attempts chose clarification instead of the commissioned mutation:

- `project-organize` 3/3 read the document tree/outlines, then requested clarification instead of
  approving the delegated organization contract and moving documents.
- `task-complete-cold-reference` 2/3 and 3/3 declared/requested clarification instead of updating
  the uniquely referenced Northwind task.
- `task-reschedule-cold-reference` 1/3 requested clarification instead of rescheduling the uniquely
  described beta-list task.
- `task-multi-update` 2/3 and 3/3 requested clarification instead of applying the three explicitly
  commissioned task changes.

This is not a reason to reintroduce the removed model-output coercion. The remediation belongs in
the semantic gate/system guidance and in the staged capability inventory, with deterministic tests
that preserve genuine ambiguity behavior.

## Cost and timing

| Metric                                   |                        Result |
| ---------------------------------------- | ----------------------------: |
| Provider cost                            |                 `$0.08247295` |
| Client total duration p50 / p95 / max    | `49.261s / 91.107s / 94.434s` |
| Server total request p50 / p95 / max     | `46.177s / 88.718s / 91.925s` |
| Client TTFT p50 / p95 / max (19 samples) |  `8.231s / 21.990s / 21.990s` |
| Stream-error turns                       |                        `4/21` |
| Capture-error turns                      |                        `0/21` |

No provider request exceeded the earlier multi-minute long-tail profile in this run.

## Unconditional restoration

The battery shell's EXIT trap queued restoration immediately after Vitest returned. Independent
post-run checks verified:

| Surface               | Restored receipt/state                                                |
| --------------------- | --------------------------------------------------------------------- |
| Vercel                | `dpl_2269rqUemoWW6KYdVv1NnLYSDyJA` — Ready, aliased to `build-os.com` |
| Web routing           | exact `false`                                                         |
| Web cohort            | unchanged exact one-user UUID                                         |
| Railway               | `4bac57e3-c56a-4919-98ff-25385ec7e8d6` — SUCCESS, exact `091300faf`   |
| Worker consumer       | enabled and healthy; zero claim failures; idle after restoration      |
| Provider capabilities | exact empty string                                                    |
| Adapter capabilities  | exact empty string                                                    |
| Public site           | HTTP 200                                                              |

## Local remediation proof — not deployed or retested in production

The deterministic follow-up is implemented locally in
`apps/worker/src/workers/agentic-chat/readOnlyProvider.ts` with regression coverage in
`apps/worker/tests/agenticChatReadOnlyProvider.test.ts`:

- A non-advertised `skill_load` call can take one bounded, non-executing repair pass through the
  exact semantic disposition surface. The rejected call never executes, `skill_load` remains
  absent from the provider request, and a repeated attempt still terminates with the original
  permanent `provider_tool_not_allowlisted` failure.
- Other non-advertised tools, including mutation tools, remain fail-closed. The repair is available
  only when the request already has the three semantic controls and a reviewed mutation surface.
- Semantic disposition guidance now covers uniquely matched past-tense completion reports, direct
  reschedules/prioritizations, multi-change utterances, and delegated organization including a
  reasonable parent container. Genuine multi-target ambiguity still requires clarification.
- The corrected future battery inventory is
  `createOntoDocument,updateOntoTask,moveDocumentInTree` in both capability lists, subject to an
  exact pre-run surface recheck.

Local proof on 2026-08-18:

| Gate                              | Result                              |
| --------------------------------- | ----------------------------------- |
| Focused provider suite            | 59/59 passed                        |
| Full worker suite                 | 1,058 passed, 1 intentional skip    |
| Worker TypeScript                 | passed                              |
| Worker lint and HTTP size guard   | zero errors; existing warnings only |
| Prettier for the two worker files | passed                              |

No commit, push, deployment, production flag/capability change, or additional provider spend was
made for this remediation.

## Next remediation gate

1. Review and commit only the two latest worker files with DJ's approval and an explicit pathspec;
   the shared worktree contains extensive unrelated staged, modified, and untracked work.
2. Deploy and rerun only after fresh DJ authorization. Before any traffic, recheck the exact
   scenario surface and stage only
   `createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` in both capability lists.
3. Use one six-class x3, zero-retry battery against the exact deployed revision, then restore
   routing false and both capability lists empty unconditionally.

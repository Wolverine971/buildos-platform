<!-- docs/technical/reviews/CADRE_CHAT_CONTEXT_FIX_REVIEW_HANDOFF_2026-10-16.md -->

# Review handoff: oversized last-turn context blocks chat continuation

**Status:** The size fix below shipped in `2efd12598` (web and chat worker deployed 2026-10-17 ~04:14 UTC). It was then superseded by the follow-up in the next section. No production data was changed.

## Follow-up 2026-10-17: the server reads continuity; the browser no longer carries it

An independent audit found that the packet was mostly dead weight. The prompt hint names at most 4 records per kind, by name, so the model saw 18 of the 150 records. Descriptions were never read anywhere, and `buildEntityResolutionHint` is computed but never rendered. The packet also lived only in the open chat window's memory, so closing and reopening a chat lost it.

What changed (not yet committed when written):

- **Server-side load.** Worker admission and prewarm read the session's newest `last_turn_context` row from `chat_turn_events` (`loadSessionLastTurnContext`, `apps/web/src/lib/services/agentic-chat-v2/last-turn-context.server.ts`).
    - The read runs beside the history read, so it adds no wait; prepared-prompt hits skip it.
    - A failed read returns null and never blocks the turn.
    - Packets older than the cap are bounded on the way out.
    - Production plan: 0.3 ms for an active session, 1.8 ms for a session with no packet.
    - Rows follow the 7-day turn-event retention, so a chat idle longer than that has no hint.
- **The browser stops storing and sending it.** The turns and prewarm schemas still accept the field from tabs opened before the deploy, and drop it.
- **Capped at the source.** The worker keeps at most 8 previews per kind, IDs and names only, plus `entity_totals`. The hint now reads "projects (4 of 36)" and also lists milestones and risks. The context-shift target is inserted ahead of bulk read results, so the cap cannot drop it. `boundLastTurnContext` remains as the safety net for cleanup recall and legacy packets.
- **Effect on the Cadre export.** The turn-2 packet drops from 35,671 to 4,369 characters, with the same 18 records visible to the model. Each send and prewarm request no longer uploads the packet at all.

Validation (free):

- Runtime: 14 tests.
- Web: 331 tests across 14 files, including new loader and admission tests and the parallel-read check.
- Typechecks clean: web svelte-check, web test types, runtime, shared types, worker.
- Lint and Prettier clean on the changed files.

Not run: a paid live chat check and a browser click-through.

**Incident:** The user researched combining Cadre-related projects through agentic chat, then saw **“Invalid worker turn request.”** Session: `0919e6e2-e00b-4ae5-80bf-4e9d55193531`.

- [Admin workflow](https://build-os.com/admin/chat/workflows?chat_session_id=0919e6e2-e00b-4ae5-80bf-4e9d55193531&view=flow)
- [Detailed investigation and evidence](/Users/djwayne/buildos-platform/docs/technical/reviews/CADRE_CHAT_INVALID_WORKER_REQUEST_2026-10-16.md)
- [Supplied export](/Users/djwayne/Downloads/csa-have-few-projects-multiple-20261016T204953Z/)
- [Offline reproduction script](/Users/djwayne/buildos-platform/artifacts/investigations/cadre-chat-2026-10-16/reproduce.mts)

## What failed

BuildOS generated a continuation object larger than its own next-request validator accepted. The model did not author this oversized request field: application code assembled `lastTurnContext` from the records read during the turn, sent it to the browser, and the browser forwarded it with the next user message.

The second research turn accumulated **150 entity previews**: 36 projects, 66 tasks, 38 documents, 8 plans, and 2 goals. Descriptions and compatibility ID lists increased the serialized size to **35,671 characters**. Admission allowed only **32,768**.

The measurement is JavaScript `JSON.stringify(value).length`—UTF-16 code units, called “characters” here. This was an application request-field limit, not the LLM's token or context-window limit.

| Original continuation | Serialized characters | Original admission result |
| --------------------- | --------------------: | ------------------------- |
| First research reply  |                15,166 | Accepted                  |
| Second research reply |                35,671 | HTTP 422                  |
| No continuation hint  |                     0 | Accepted                  |

The failing response identified `lastTurnContext` with `Object is too large`, under error code `INVALID_FIELD` and the generic message `Invalid worker turn request`.

Validation occurs **before durable turn admission**. Both existing research turns therefore appear completed in the audit, while the rejected follow-up has no admitted turn. All 37 exported tool calls were reads; no merge was attempted. The original rejected HTTP request was not captured, so its precise text and time remain unverified. Replaying the saved continuation through the actual request parser reproduced the reported error deterministically.

## Why the object grew

The continuity builder deduplicated entity IDs but did not budget the aggregate serialized packet. Its typed plural-list traversal collected entire result lists; a nearby 25-item limit on generic traversal did not bound those lists.

An existing 30,000-character check applied only when deciding whether to attach optional cleanup recall. It did not constrain ordinary research results. This incident had no cleanup recall, so that check offered no protection.

Two diagnostic gaps obscured the failure:

- Audit export compaction omitted the payload of `last_turn_context` events. The production event retained it, and the full exported tool results independently allowed reconstruction.
- The client displayed the generic error but discarded the field-specific `details.issues` information.

Those diagnostic gaps are documented but unchanged by this patch.

## How I approached the fix

1. **Established what actually ran.** Compared exported messages, tool calls, prompt snapshots, and read-only production records. Distinguished completed research from an attempted merge or failed worker execution.
2. **Traced the continuation boundary.** Followed the builder, completion event, browser storage/forwarding, request schema, and pre-admission parser.
3. **Reproduced the failure offline.** Rebuilt both packets from the export, compared them with saved production events, and passed otherwise equivalent requests through the actual schema and parser. The first packet and null control passed; the second failed.
4. **Fixed both production and consumption of the hint.** Bounding newly generated packets prevents recurrence. Normalizing incoming packets also recovers sessions holding oversized data from older workers.
5. **Verified the contract with free tests and the real bundle.** Covered broad inventories, serialization escaping, cleanup recall, legacy IDs, prewarm parity, and unchanged validation of the actual user message.

The admission ceiling was retained. Increasing it alone would leave inventory growth unbounded and postpone the same failure.

## What changed

The shared `boundLastTurnContext` helper targets **30,000 serialized characters**, leaving headroom below the existing 32,768-character ceiling for the committed timestamp.

Its reduction order is deterministic and does not mutate input:

1. Return packets already within budget unchanged.
2. Remove entity descriptions while retaining IDs and names.
3. If still oversized, binary-search a shared prefix length across entity kinds. Preserve each list's insertion order, synchronize legacy task/goal ID lists, and remove legacy singular references that no longer match retained previews.
4. Mark reduced inventories with `entity_references_truncated: true`. The continuity prompt then tells the model to retrieve records before treating recall as the complete scope.
5. Preserve cleanup recall whole while reducing ordinary entity lists. If non-entity metadata alone cannot fit, return `null`; the builder uses a minimal fallback and admission omits the optional hint. This does **not** guarantee cleanup is always retained. Existing cleanup eligibility limits of 100 items and 24,000 characters remain.

| Area                | Files and purpose                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared budget       | [last-turn-context-budget.ts](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context-budget.ts): serialization budget and reduction policy                                                                                                                                                                                  |
| Producer and prompt | [Runtime continuity builder](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.ts): apply the budget to every draft and disclose omitted references                                                                                                                                                                    |
| Shared contract     | [agent.types.ts](/Users/djwayne/buildos-platform/packages/shared-types/src/agent.types.ts): optional truncation marker                                                                                                                                                                                                                                   |
| Web exports         | [Web continuity wrapper](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/last-turn-context.ts): expose the shared helper and ceiling                                                                                                                                                                                           |
| Admission           | [worker-admission-schema.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.ts): normalize old packets before checking the size limit                                                                                                                                                                    |
| Prewarm             | [Prewarm route](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/prewarm/+server.ts): normalize recall consistently with admission                                                                                                                                                                                                       |
| Regression coverage | [Budget tests](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context-budget.test.ts), [schema tests](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.test.ts), and [prewarm tests](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/prewarm/server.test.ts) |

For this incident, removing descriptions was sufficient: **35,671 → 18,410 characters**, retaining all **150 entity previews and their IDs/names**. No entity-list truncation was needed. Both newly reconstructed packets and the original saved oversized production packet now pass local admission.

## Validation performed

**53 distinct focused tests passed:** 13 runtime tests, 29 existing admission-route tests, 3 admission-schema tests, and 8 prewarm-route tests. A focused strict TypeScript check of the budget helper and `git diff --check` also passed. Heavy checks ran sequentially through `test-gate` with one Vitest worker.

Relevant commands, from the repository root:

```sh
VITEST_MAX_WORKERS=1 test-gate run pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/last-turn-context-budget.test.ts src/last-turn-context.test.ts
VITEST_MAX_WORKERS=1 test-gate run pnpm --filter @buildos/web exec vitest run src/routes/api/agent/v2/turns/worker-admission-schema.test.ts src/routes/api/agent/v2/turns/server.test.ts src/routes/api/agent/v2/prewarm/server.test.ts
test-gate run pnpm --filter @buildos/agentic-chat-runtime exec tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler src/last-turn-context-budget.ts
```

The web suite initially passed with 7 prewarm tests; after adding the large-packet prewarm case, that file was rerun and all 8 passed. The 53 total counts distinct tests, not repeated executions.

To replay the supplied bundle from `/Users/djwayne/buildos-platform/apps/web`:

```sh
test-gate run pnpm exec vite-node --config vitest.config.ts ../../artifacts/investigations/cadre-chat-2026-10-16/reproduce.mts /Users/djwayne/Downloads/csa-have-few-projects-multiple-20261016T204953Z
```

The script makes no network/model calls. Its optional second input accepts saved production continuation events; those raw records were kept outside the repository. The current script asserts successful admission after the fix; the original failure is recorded in the investigation.

**Not performed:** full repository build/typecheck/lint, paid model tests, deployed browser replay, or production deployment. Local test results do not establish deployed behavior. Paid tests require separate explicit approval under repository instructions.

## Separate finding: hierarchy context did not reach this model run

The user specifically asked whether added parent/child project information was available to the agent. It was not present in either captured model run. Both global-context prompts, messages, tool definitions, context payloads, and all tool results omitted the hierarchy schema/capability information.

The live product supports `parent_project_id` and one parent/child level, with permission checks. However, the hierarchy prompt section runs only in qualifying project/ontology contexts, and the curated `get_field_info` project metadata omits the parent field despite being described as authoritative. Neither captured tool surface exposed a nesting operation. The model incorrectly generalized those omissions into a claim that the product could not nest projects.

This is a **separate, unfixed integration gap**. The review should not mistake this packet-size patch for a hierarchy fix. Whole-project merge is also distinct: fold/unfold migrations and functions were not deployed in the inspected production state. The research inventory was incomplete and should not authorize deletion or consolidation.

## What the reviewing agent should scrutinize

- **Budget contract:** serialized escaping, timestamp headroom, idempotence, and the minimal builder fallback. Ensure every producer/consumer path uses compatible rules.
- **Information loss:** prefix selection preserves insertion order, not semantic importance. Check whether explicit/focused references and important changed entities survive pathological inventories, and whether the truncation warning is sufficient.
- **Cleanup continuity:** verify recovery from durable history/receipts when an optional hint must be omitted. Tests cover whole-recall preservation and omission behavior, but do not prove end-to-end recovery of every pending cleanup workflow.
- **Compatibility:** review canonical versus legacy IDs, acceptance of old packets, prewarm/history consistency, and any prepared-cache or request-hash implications. Rolling deployment behavior has not been tested live.
- **Validation scope:** the helper operates on loosely shaped JSON records; it is a budget normalizer, not comprehensive field validation. Actual message size and non-object context validation remain enforced.
- **Patch boundaries:** inspect both staged and unstaged changes. This shared checkout contains unrelated work; this document and the investigation/reproducer may be untracked. Do not treat the entire working-tree diff as this fix.

The intended review outcome is a judgment on whether this local patch safely prevents and repairs oversized continuation requests, with any required changes identified before deployment.

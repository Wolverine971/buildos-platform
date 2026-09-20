<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/INTEGRATION.md -->

# Integration — agentic chat harness audit iteration (2026-09-10)

Audit: `docs/technical/reviews/AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08.md`.
Inputs: the seven implementer receipts in this directory (`WP-A1`, `WP-A2`, `WP-B`, `WP-C`, `WP-D`,
`WP-E`, `WP-F`) and their handoff lists. Everything is left unstaged; nothing was added, committed,
stashed or reset. One disclosure: reverting my own attempt at the F33 web half used
`git checkout -- <2 files>` on `email-surface-mount.server.ts` / `.test.ts`; both files were
byte-identical to `HEAD` before my edit (no implementer had touched them), so nothing of the
iteration was discarded.

## Validation sequence (strictly sequential, each through test-gate; no refusals)

| #   | Command                                                                                                                                                                                                                         | Result                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | `pnpm --filter @buildos/agentic-chat-runtime typecheck`                                                                                                                                                                         | clean                                                                                                                                                                                                                                                                               |
| 1b  | `pnpm --filter @buildos/agentic-chat-runtime exec vitest run`                                                                                                                                                                   | 47 files / 484 tests passed                                                                                                                                                                                                                                                         |
| 2   | `pnpm --filter @buildos/agentic-chat-runtime build`                                                                                                                                                                             | ESM + CJS + DTS success (worker consumes dist)                                                                                                                                                                                                                                      |
| 3a  | `pnpm --filter @buildos/worker typecheck`                                                                                                                                                                                       | clean                                                                                                                                                                                                                                                                               |
| 3b  | `pnpm --filter @buildos/worker exec vitest run tests/agenticChat`                                                                                                                                                               | 71 files passed, 3 live files skipped; 996 tests passed, 19 skipped (live)                                                                                                                                                                                                          |
| 4a  | `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-lite src/lib/services/agentic-chat-v2/worker-turn-preparation src/lib/services/agentic-chat/tools/domains src/lib/services/agentic-chat/tools/skills` | first run: 327 passed, 1 failed (my own new calendar crosscheck case — `get_project_calendar` is project-only; fixed by making SKILL.md step 4 tool-neutral); rerun of the two affected targets (`tools/domains/skill-gate-preload.test.ts` + `tools/skills`): 9 files / 108 passed |
| 4b  | `pnpm --filter @buildos/web check`                                                                                                                                                                                              | first run: 3 errors in `worker-turn-preparation.server.ts:1143-1144` (WP-A2's new `collectWindowLoadedSkillIds` narrowed `Json` with the local `isRecord`, which leaves `Json[]` in the union); fixed; rerun: 0 errors, 0 warnings                                                  |
| 5   | `node scripts/docs/check-doc-health.mjs`                                                                                                                                                                                        | exit 0; dead-schema 0, dead-paths 0, 6 unstamped point-in-time docs — all pre-existing (`apps/web/docs/features/document-service/*_2026-09-07/09.md`, `hyperplexed/TODAY_VIEW_POLISH_AUDIT_2026-09-04.md`, committed in 6db131447, not touched by this iteration)                   |

Narrow per-file runs used while applying handoffs (all `pnpm --filter <pkg> exec vitest run <file>`):

| Command                                                                                                                                       | Result                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| worker `tests/agenticChatWorkerSurfaceBudget.test.ts` (after restoring the original caps)                                                     | 8 passed; measured global opening 26,546 B, project admitted 38,300 B, project_create 11,674 B                                                                                                                                                                                                                                                                                    |
| worker `tests/agenticChatProviderBoundary.test.ts`                                                                                            | 3 passed                                                                                                                                                                                                                                                                                                                                                                          |
| worker `tests/agenticChatTurnProvider.test.ts -t "three plausible"` (restraint canary)                                                        | 1 passed                                                                                                                                                                                                                                                                                                                                                                          |
| worker `tests/agenticChatReviewRequestEvidence.test.ts` (reviewer prompt byte-identical across reviews)                                       | 11 passed                                                                                                                                                                                                                                                                                                                                                                         |
| worker `tests/agenticChatRuntimeBoundary.test.ts tests/agenticChatWriteRouting.test.ts` (worker never imports web source; direct-write floor) | 25 passed                                                                                                                                                                                                                                                                                                                                                                         |
| web `agentic-chat-v2/session-service.test.ts` + `turn-preparation.test.ts`                                                                    | 24 passed                                                                                                                                                                                                                                                                                                                                                                         |
| web `agentic-chat/tools/core/catalog-fitness.test.ts` (then `-u`)                                                                             | 1 snapshot failed as expected → updated; 6 passed. Diff verified: `declare_read_only_turn` gone from every profile, `delegate_task` global → project, definition SHAs changed only for `create_onto_task`, `update_onto_task`, `list_onto_tasks`, `request_email_account_connection` (WP-B) and `declare_turn_contract` (WP-C handoff 1 below), `catalogSerializedSha256` changed |
| web `agentic-chat-v2/worker-turn-preparation.test.ts` (after the narrowing fix)                                                               | 30 passed                                                                                                                                                                                                                                                                                                                                                                         |
| web `routes/api/agent/v2/prewarm/server.test.ts` + `email-surface-mount.server.test.ts` + `tool-trace.test.ts`                                | 29 passed, 1 failed — the prewarm route test (see Remaining failures)                                                                                                                                                                                                                                                                                                             |
| eslint on every touched worker/web source file                                                                                                | clean (worker `tests/` are outside its eslint project by pre-existing config)                                                                                                                                                                                                                                                                                                     |
| prettier `--write` on every touched file                                                                                                      | clean                                                                                                                                                                                                                                                                                                                                                                             |

## Handoffs applied (files nobody owned; exact spec followed)

Runtime (`packages/agentic-chat-runtime`)

1. **WP-F 1** — `provider/repair-policy.ts`: deleted `contextSaturationRepairRank` and the
   `READ_LOOP_REPAIR_RANK` import (import is now `import type { WriteLedgerEntry }`); deleted
   `src/loop/read-loop-escalation.ts` and its `export *` in `src/loop/index.ts`.
   `tests/agenticChatProviderBoundary.test.ts`: dropped the now-stale
   `'function contextSaturationRepairRank('` entry from the extracted-declarations list.
2. **WP-F 2 (first half)** — `src/loop/repair-instructions.ts`: deleted
   `buildReadLoopRepairInstruction` and its private `ReadLoopRepairInstructionLevel` type (zero
   callers after WP-F; the file's export-surface guard test would otherwise fail). The
   `gatewayModeActive` parameter of `buildToolValidationRepairInstruction` is **kept** — the one
   caller (`request-builders.ts:363`) passes `false` explicitly, and the parameter's `true` branch is
   pinned by `repair-instructions.test.ts:168`; see Open.
3. **WP-A2 1 (F44 stage 2)** — deleted `src/loop/turn-intent.ts`, `src/loop/turn-outcome.ts`,
   `src/loop/turn-intent.test.ts`; removed both `export *` lines from `src/loop/index.ts`;
   `src/loop/synthesis-context.ts`: removed the `FastChatTurnIntent` import, the `turnIntent` param
   and the `intentLine`/`originalRequest` ternaries — the literal
   `'This is an answer-only synthesis pass.'` line (the only value the ternary could produce) stays
   so the prompt bytes are unchanged. Web side: deleted
   `agentic-chat-v2/turn-intent.ts`, `turn-outcome.ts`, `turn-outcome.test.ts`; removed both
   `export *` lines from `agentic-chat-v2/index.ts`. Verified by grep that no other file (components
   and routes included) referenced any export of the two modules.
4. **WP-C 1 (F06/F07 schema prose)** — `src/catalog/definitions/controls.ts`: the four label
   descriptions and the `required_fields` description replaced with the exact text in the handoff
   (`declare_turn_contract` 4,354 → 3,528 serialized chars). `apps/worker/tests/agenticChatTurnProvider.test.ts`
   pin flipped to `'Create only: name for one new entity'`.
5. **WP-B 12 (stale comment)** — `src/tools/shared-read-dispatch.ts:92-93`: calendar writes now
   described as executing on the worker through the reviewed mutation catalog.

Shared types

6. **WP-E 2 (F53)** — `packages/shared-types/src/agentic-chat-worker-contract.ts`: deleted
   `AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS` (no importer left anywhere); removed its import and
   `toBe(500)` pin from `agentic-chat-worker-contract.test.ts`.

Worker (`apps/worker`)

7. **WP-C 3 (F39)** — `provider/turn-provider.ts` post-shell branch: when
   `takeContractCompletionContinuation` returns null and the write ledger holds a successful
   `create_onto_project`, the next request is `forceToolFreeRequest(...)` (comment names the audit
   finding). Test: the 09-04 case-1 test (`mounts semantic controls and reviews a project shell before
creating it`) now asserts the third acting request has `tools: []` and `toolChoice: 'none'`.
   The optional `validation.ts` half was not applied (Open).
8. **WP-C 5 (F36 dead counters)** — `provider/turn-provider.ts`: deleted `providerToolCallCount`,
   `recordProviderToolCalls` and `getProviderToolCallCount` (zero call sites for all three).
9. **WP-D 3 (F109 downstream)** — `provider/contracts.ts`: `reasoning` union member removed;
   `provider/provider-pass.ts:55` and the three `turn-provider.ts` guards removed / reduced to
   `if (event.type === 'text') continue;`; the `{ type: 'reasoning', … }` fixture removed from
   `tests/agenticChatTurnProvider.test.ts`. The optional `loop/shared.ts` counter fields were left.
10. **WP-C 6** — `README.md`: deleted the `review/mutation-batch.ts` bullet;
    `provider/validation.ts` docstring now says "adjudicated by the contract reviewer before
    execution".
11. **WP-E 4** — `README.md` "Executor side effects": appended the pendingEffects / terminal-fence
    sentence verbatim.
12. **WP-F 4** — `README.md`: `repair-policy.ts` bullet no longer claims a read-loop repair policy;
    the "read-loop ladder" phrase in the loop paragraph now names the context-gathering ledger.
13. **WP-B 12 (stale comment)** — `provider/review/decision-handling.ts:223-226` reworded (host
    renders candidates beneath the question; shared budget is for length only).
14. **WP-B 1** — `tests/agenticChatWorkerSurfaceBudget.test.ts`: `delegate_task` removed from the
    global executable list and asserted absent on global / present on project. The byte ratchet was
    **not** loosened: with WP-C's label-description cut landing in the same tree the measured
    surfaces are project admitted 38,300 B (< 39,000) and project_create 11,674 B (< 12,400), so
    the original caps stay and the dated comment records the measurement.
15. **WP-B 2 / WP-C 8** — `tests/agenticChatTurnProvider.test.ts`: `merge_instructions` removed
    from `reviewedFields.update_onto_document`; `create_onto_project` `required` → `['project']`,
    `entities`/`relationships` pinned with `default: []` (F29 shape).
16. **WP-B 3** — `tests/agenticChatCreateOntoProjectMutationAdapter.test.ts`: added
    `defaults missing entities and relationships to empty (harness audit F29)`.
17. **WP-D 1 / WP-C 7** — `tests/agenticChatTurnProvider.test.ts`: the three pinned-retry
    `allow_fallbacks: false` assertions flipped to `true` (F76).
18. **WP-D 2** — `tests/agenticChatConsumer.test.ts`: provider order →
    `['deepinfra', 'gmicloud', 'alibaba', 'streamlake']` with `ignore: ['azure']` (F78).
19. **WP-E 1** — `tests/agenticChatCancellationObserver.test.ts`: test retitled to "2 s timer",
    advances `3 * DEFAULT_AGENTIC_CHAT_CANCELLATION_POLL_INTERVAL_MS` (imported from
    `cancellationObserver.ts`).

Web (`apps/web`, never under `components/**` or `routes/**`)

20. **WP-A2 3 (F44 param)** — `agentic-chat-lite/prompt/situational-rules.ts`:
    `turnIntentRequiresWrite` → `pendingTurnContract` (one-line doc comment); the caller
    `worker-turn-preparation.server.ts:631` and the eight fixtures in `situational-rules.test.ts`
    renamed.
21. **WP-A2 2 (F44 checkpoint service)** — deleted
    `agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts` and `checkpoint-service.test.ts`
    (grep: zero importers).
22. **WP-A2 5 (F69 dead ledger cluster)** — `agentic-chat-v2/session-service.ts`: deleted
    `LOADED_SKILLS_LEDGER_PREFIX`, `extractLoadedSkillIdsFromHistory`,
    `historyIncludesLoadedSkillsLedger`, `buildLoadedSkillHistorySummary` and their private helpers
    (`LoadedSkillSummary`, `extractLoadedSkillSummary`, `formatLoadedSkillSummaryLine`,
    `extractLoadedSkillIdFromLedgerLine`, `truncateBlock`, `stringArray` — all now unreferenced);
    removed the two re-exports from `agentic-chat-v2/index.ts`; removed the two unit tests
    (`summarizes loaded skills as a cross-turn continuity ledger`, `extracts only loaded skill ids
from the cross-turn ledger`) from `session-service.test.ts`. `LoadedSkillExecutionSummaryRow`
    stays (still used by the clarification summary and the admission snapshot).
23. **WP-E 3 (F118)** — `agentic-chat-v2/session-service.ts` `buildInterruptedToolHistorySummary`:
    control rows (`CONTROL_TOOL_NAMES`) dropped; successful writes (`isLikelyWriteToolName`) render
    one line each, in sequence order, `- created task "…" (id)` (verb/kind parsed from
    `create|update|move|delete_[onto_]<kind>`, else `gateway_op ?? tool_name`), capped at 100 chars
    and outside the 3,000-char cap; read summaries (`.slice(0, 6)`) and the
    `Interrupted or failed calls:` line follow, together under the 3,000-char `previewText`. Adds the
    side-effect import of `tools/registry/install-loop-catalog` (the classification helper needs the
    loop catalog installed) plus the two runtime imports. New test: six task creates + three control
    calls + one web_search → six create lines, no control line, the web_search summary present.
    Existing web_search / web_visit tests unchanged and green.
24. **WP-B 5** — `agentic-chat-v2/turn-preparation.test.ts:32`: `declare_read_only_turn` removed
    from the pinned project_create list. (`worker-turn-preparation.test.ts:2154` — `delegate_task`
    — was already aligned by WP-A2.)
25. **WP-B 6** — `tools/core/__snapshots__/catalog-fitness.test.ts.snap` re-snapshotted; diff
    verified as listed in the table above.
26. **WP-A2 8 (F71 calendar_management)** —
    `tools/skills/definitions/calendar_management/SKILL.md`: Procedure step 4 no longer names the
    dotted `cal.project.get`; the "Reschedule" example names `list_calendar_events` /
    `get_calendar_event_details` instead of `cal.event.list` / `cal.event.get`. Step 4 is
    tool-neutral ("read the project's calendar binding first…") because `get_project_calendar` rides
    only the project surface and the crosscheck forbids naming an unmounted tool on global. Two
    calendar cases added to the `worker playbook crosscheck against the mounted surface` test
    (global schedule-a-call, project reschedule); both pass (block ≤ 40 lines, no dotted op, every
    named tool mounted).

Fixes of failures the iteration caused (not handoffs)

27. `agentic-chat-v2/worker-turn-preparation.server.ts:1143-1144` (WP-A2's
    `collectWindowLoadedSkillIds`): the `Json` result is bound to a local and guarded with
    `!isRecord(result) || Array.isArray(result)` so TypeScript drops the `Json[]` member; runtime
    behaviour is identical (`isRecord` already excludes arrays). This was the only svelte-check error.

## Handoffs applied then reverted

- **WP-B 4 (F33 web half)** — `agentic-chat-v2/email-surface-mount.server.ts` selecting through
  `getGatewayEmailSurfaceToolNames(hasConnection)` with no early return. The one-line change works
  and its own test flips as described, but it also breaks seven exact-surface pins in
  `agentic-chat-v2/worker-turn-preparation.test.ts` (every un-connected fixture — calendar reads,
  calendar writes, normal launch, read-only artifact, mutation-capable artifact, the Gmail-state test,
  and the bounded project_create surface, which would grow from 6 to 7 tools). That is wider than
  the handoff described and carries a product question (does the project_create hot path carry the
  743 B OAuth handoff for every un-connected user?), so it is reverted and listed under Open with
  those specifics.

## Remaining failures (not fixed; provably not this iteration's regressions to fix here)

- `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts` › `threads the last-turn continuity hint
and the worker preload ledger into the prepared history` — 1 of 7 fails. Cause: WP-A2 F69 removed
  the loaded-skills ledger (`loadWorkerSkillPreloadLedgerMessage` now returns `null`) and the route
  still expects the `task_management` ledger system message. The fix is the route edit in WP-A2
  handoff 4 (`routes/**`, which this integration must not touch). Not a regression of user-visible
  behaviour: the ledger's removal is the intended F69 outcome and the worker admission path (which
  the prewarm route mirrors) is green.

## Open handoffs (listed, not applied)

Decisions / conflicts between packages

- **F02 remaining six overrides** (WP-A1 handoff 1 vs WP-B "deliberately left alone"):
  `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts` still ends the `create_task_document`,
  `tag_onto_entity`, `update_onto_goal/plan/milestone/risk` descriptions with "otherwise
  declare*turn_contract first". WP-B narrowed F02 to the three opening-pass tools; WP-A1 wants all nine.
  The F75 verifier's suggestion to \_add* that sentence to `link_onto_entities` /
  `update_calendar_event` / `delete_calendar_event` conflicts with both and is superseded by WP-B's
  `link_onto_entities` rewrite. One decision needed. `disposition.ts:72` (WP-A1 handoff 1, third
  item) is covered by WP-C's tool-neutral `ACTOR_COMMISSION_GUIDANCE[0]`.
- **F11 reviewer copy** (WP-A1 handoff 4): WP-C investigated and kept the reviewer user-message
  copy of `projectCreateShellGuidance` (`review/turn-contract.ts:99-113`) because
  `buildReviewerEvidence` drops worker system messages, so the reviewer sees the shell rules exactly
  once; WP-C removed the acting-side duplicate in `disposition.ts` instead. Treat as resolved unless
  WP-A1 disagrees.
- **F75 keying** (WP-A2 handoff 9): the worker write recipe in `situational-rules.ts` is still
  intent-keyed (`looksLikeMutationTurn` / pending contract / capture); WP-A2's note wants it
  mount-keyed on worker-bound artifacts. One decision, one place.
- **F01 `delegate_task` base description** (WP-A1 handoff 2):
  `packages/agentic-chat-runtime/src/catalog/definitions/utility.ts:560`. WP-B already added a
  restraint sentence to the worker `descriptionOverride`; adding WP-A1's wording to the base
  definition would change the catalog SHA again and duplicate the worker sentence. Decide whether the
  web/MCP-rendered base needs it.
- **F33 web half** — see "applied then reverted" above. Exact remaining work: apply the
  `email-surface-mount.server.ts` change from WP-B handoff 4, update
  `email-surface-mount.server.test.ts:108` as described there, and update the seven exact tool-list
  pins in `worker-turn-preparation.test.ts` (or exclude `project_create` from the mount if the
  bounded hot path should stay handoff-free).
- **F36 web-side `cancel_turn_contract`** (WP-C handoff 2): remove from
  `GLOBAL_DIRECT_TOOL_NAMES` / `PROJECT_CREATE_DIRECT_TOOL_NAMES` in `surfaces.ts` and append in web
  admission only when `turnPreparation.pendingTurnContract !== null`. Surface change with pins in
  `surfaces.test.ts`, `turn-preparation.test.ts`, `worker-turn-preparation.test.ts` and the
  catalog-fitness snapshot; worker side already tolerates either state.
- **F43 `replacePhaseInstruction`** (WP-C handoff 4): helper in `request-builders.ts` plus five
  call sites (`disposition.ts` ×2, `contract-execution.ts` ×2, `turn-provider.ts`
  `organizeExecutionInstruction`). Semantic change to what the model sees on later passes; the TODO
  naming all sites is in `review/contract-execution.ts`.
- **F104 latch deletion** (WP-D handoff 4): `providerCapacity.ts`, `capacity.ts`,
  `provider-pass.ts`, `turn-provider.ts`, `contracts.ts`, `README.md:82` ("cooldown marking" left as
  is), `composition-root.ts` and three test files. Exact line list is in WP-D's receipt; a multi-file
  refactor, not applied.
- **F117 worker receipts** (WP-A1 handoff 7 / WP-B handoff 7): project
  `mutation.downstreamReceipt` through `projectReadResultInstantsToTimezone` at the model-visible
  boundary in `turn-executor.ts` (~:1512 `chatToolResult`, and decide whether the published
  `tool_result` payload at ~:1570 and the returned `execution.result` at ~:1604 project too — the
  handoff names only `chatToolResult`), exposing the memoized `turnTimezoneFor` on
  `AgenticChatReadToolPortV1`; keep `persistMutation` on the UTC receipt. Needs the
  America/New_York test described in WP-B's receipt.
- **F25 ontology context fence** (WP-B handoff 8): `mutationAdapterBoundary.ts:98` treating
  `context.type === 'ontology'` like `'project'` — in ontology context `entityId` may be a non-project
  entity, so `explicit ?? entity` needs a check that the id is the project before it becomes the
  fence. Not applied as written.
- **F29 follow-up** (WP-B handoff 10): `loop/project-create-args.ts:389-403` default missing
  arrays to `[]`, then delete the two optional properties from the worker projection and trim the
  three "entities: [] and relationships: []" prompt lines.
- **F35 payload message** (WP-B handoff 11): `tools/ontology-reads.ts:835`. The worker's
  `advertiseMaterializedTools: false` policy routes messages through
  `stripToolDiscoveryHintsFromPayload`; check that before wording. Two worker fixtures embed the old
  message text (`tests/fixtures/agenticChatTurnFixtures.ts:204`,
  `tests/agenticChatToolExecutionAdapter.test.ts:1140`) as inputs.
- **F28 dead strips** (WP-B handoff 9): `provider/tool-surface.ts:94` and `:163` can go after the
  90 s prepared-prompt window; another session is editing that file.
- **F18** (WP-A1 handoff 3): drop `model_context_notice` in `tool-payload-compaction.ts`
  `addToolResultSecurityNotice` (−157 chars/result) and reduce the continuity hint in
  `last-turn-context.ts:510-511` to a tag — the handoff requires a cedar-house case 9 turn 2 rerun
  before merging, so not applied here.
- **F39 optional half** (WP-C handoff 3): `validation.ts` `turnContractOutcomeAuthorizesCall`
  rejecting a second `create_*` for a fulfilled targetless create outcome.
- **WP-F 2 second half**: drop `gatewayModeActive` from `buildToolValidationRepairInstruction`
  (only caller passes `false`; the `true` branch is pinned by `repair-instructions.test.ts:168`, so
  the test moves with it).
- **WP-F 3**: `DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS` 16 → 12 in `turn-executor.ts:117` — this is
  the production default through `config.ts:134` (`CHAT_MAX_TOOL_ROUNDS`), and the web
  `limits.ts` default is also 16; lowering moves when the ledger's `roundsRemaining <= 2` guard
  fires. Product decision.
- **WP-F 6**: `overview-helper.ts` source `entity_counts`/`entity_totals` duplication
  (needs `utility-executor.overview.test.ts` edits).
- **WP-F 7**: `record_references` ride outside the size guard (~9.5k chars worst case).
- **WP-A2 7 (F70 content)**: rewrite `project_creation/SKILL.md` Contract/Examples to the
  shell-only payload; fold `google_calendar/SKILL.md` into `calendar_management` and redirect the
  blog post.

SQL / migrations (deferred by the packages themselves)

- **F114**: `load_fastchat_context.sql:504` `LIMIT 18` → 40 in a follow-up migration, then raise
  `PROJECT_CONTEXT_TASK_LIMIT` and `PROMPT_OPEN_TASK_LINE_LIMIT` together and re-baseline
  `prompt-size-budget.test.ts`.
- **F115**: drop `project_logs` (and goal/plan `description`) from the global branch of
  `load_fastchat_context.sql` (~145 KB); mount `list_onto_projects` (limit ≤ 50) on the global
  surface in `surfaces.ts`.

Routes (another session owns `apps/web/src/routes/**`)

- **F69 prewarm** (WP-A2 handoff 4): `routes/api/agent/v2/prewarm/+server.ts` — delete the
  `loadWorkerSkillPreloadLedgerMessage` import and the `skillPreloadLedger` block, pass
  `loadedHistory` straight to `composeFastChatHistory`; retitle the `server.test.ts:353` test and
  drop its second history expectation; then delete `loadWorkerSkillPreloadLedgerMessage` from
  `worker-turn-preparation.server.ts`. This is the one remaining red test.

Operator / canaries

- **F81 env** (DJ): on the Railway agentic-chat service set
  `AGENTIC_CHAT_REVIEWER_MODEL=openai/gpt-5.6-luna` and `AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS=`
  (empty).
- **Canaries owed before keeping F76/F78/F80** (WP-D): same-provider continuation rate
  (`evidence/lane-K-pin-snapshot-cache.mjs`, baseline 31/57), pinned-pass retryable-error receipts
  (~0), per-provider p50/p90 for a day incl. StreamLake p90 and first GMICloud data, and the 09-04
  reviewed-write battery + three-email restraint case with identical decisions and per-call
  reasoning-token counts before/after.
- **F85 health script** (WP-F 5): count calendar outages as
  `result->>'calendar_read_failed' = 'true'` grouped by `result->>'error_code'` on
  `chat_tool_executions` where `tool_name = 'list_calendar_events'`.

## Survive list — checked

- Finding 11 addendum: `request-builders.ts` replay untouched by every package and by this pass.
- Direct-write floor (`write-routing.ts`) and the restraint canary ("keeps an update chosen from
  three plausible tasks on the contract route"): green.
- SHA-bound approvals, fail-closed unknown tool names, reviewer system prompt and approval tools
  byte-identical across reviews: `agenticChatReviewRequestEvidence.test.ts`,
  `agenticChatTurnExecutor.test.ts` (F55's `still fails the turn when a private read is rejected
with read_tool_not_allowlisted / read_tool_context_invalid`) green.
- Terminal-truth invariants in `apps/worker/src/workers/agentic-chat/README.md`: untouched (only
  module bullets and the side-effects paragraph changed).
- Worker never imports web source: `agenticChatRuntimeBoundary.test.ts` green.
- Context-only tool surfaces: no surface edit in this pass (the F33/F36 surface changes are listed
  open, not applied).
- Idempotent usage receipts: `openrouter-client.ts` untouched by this pass.

## Files touched by integration

Runtime: `src/loop/repair-instructions.ts`, `src/loop/index.ts`, `src/loop/synthesis-context.ts`,
`src/catalog/definitions/controls.ts`, `src/tools/shared-read-dispatch.ts`; deleted
`src/loop/read-loop-escalation.ts`, `src/loop/turn-intent.ts`, `src/loop/turn-intent.test.ts`,
`src/loop/turn-outcome.ts`.
Shared types: `src/agentic-chat-worker-contract.ts`, `src/agentic-chat-worker-contract.test.ts`.
Worker: `README.md`, `provider/repair-policy.ts`, `provider/turn-provider.ts`,
`provider/contracts.ts`, `provider/provider-pass.ts`, `provider/validation.ts`,
`provider/review/decision-handling.ts`; tests `agenticChatWorkerSurfaceBudget`,
`agenticChatTurnProvider`, `agenticChatConsumer`, `agenticChatCancellationObserver`,
`agenticChatCreateOntoProjectMutationAdapter`, `agenticChatProviderBoundary`.
Web: `agentic-chat-lite/prompt/situational-rules.ts` + `.test.ts`,
`agentic-chat-v2/session-service.ts` + `.test.ts`, `agentic-chat-v2/index.ts`,
`agentic-chat-v2/worker-turn-preparation.server.ts`, `agentic-chat-v2/turn-preparation.test.ts`,
`agentic-chat/tools/core/__snapshots__/catalog-fitness.test.ts.snap`,
`agentic-chat/tools/domains/skill-gate-preload.test.ts`,
`agentic-chat/tools/skills/definitions/calendar_management/SKILL.md`; deleted
`agentic-chat-v2/turn-intent.ts`, `turn-outcome.ts`, `turn-outcome.test.ts`,
`agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts`, `checkpoint-service.test.ts`.

# Agentic Chat Skill Tool Bundles Plan

**Created:** 2026-08-25
**Status:** Complete — deployed and observed in production
**Owner:** Agentic Chat
**Trigger:** The failed Precision Hunter calendar deletion turn

## Kernel

Tool visibility is a context-budget decision, not an authorization decision.

BuildOS should keep the default tool surface intentionally small. Once a skill is selected, however,
that skill must be operationally complete: every enabled, context-compatible tool declared in its
canonical `Related Tools` list should be mounted together in one append-only expansion.

Authorization, project scope, exact-target requirements, and destructive-action confirmation remain
execution-time responsibilities. A hidden schema is not a safety boundary.

## Incident evidence

The Precision Hunter deletion turn loaded `calendar_management`, found the exact event and project
calendar, and declared a deletion outcome, but never received `delete_calendar_event`. The skill
advertised `cal.event.delete` while its `materialized_tools` contained only calendar reads.

Result:

- 10 provider calls / 9 orchestrator passes
- 180,835 total tokens
- 237,416 ms total request time
- one 60,003 ms provider timeout
- seven successful tool calls and zero tool failures
- no deletion

The failure was orchestration overhead, not backend tool latency.

## Decisions

### D1. Defaults stay small

Context profiles continue to expose only their strategic hot-path tools. This work does not add every
registered tool to every launch surface.

### D2. An active skill owns a complete direct-tool bundle

`SkillDefinition.relatedOps` is the authoritative declaration. Loading or preloading a skill resolves
all registered operations to their direct tool definitions and materializes them together.

### D3. Risk classification does not control visibility

`read_ops`, `write_ops`, and `destructive_ops` remain in the skill payload for instructions, policy,
telemetry, and audits. They do not decide whether a related tool is mounted.

### D4. Canonical declarations only

Only `relatedOps` / the parsed `## Related Tools` block changes the runtime bundle. Tool names in prose,
examples, notes, child-skill descriptions, or reference modules do not implicitly expand the surface.

### D5. Tool compatibility is a valid filter

A related tool may be omitted only when it is unresolved, disabled, hidden from the chat runtime, or
incompatible with the active context. It may not be omitted merely because it writes or deletes.

The first implementation uses the existing enabled registry behavior. Context filtering is a separate
follow-up because the current skill loader does not receive the active chat context.

### D6. One bundle expansion, not per-tool discovery

The bundle is deduplicated against defaults and appended once. `tool_search` remains a fallback for
long-tail capabilities outside the active skill. `tool_schema` is not automatically mounted when the
direct tool schema is already present.

### D7. Skills are not recursive instruction bundles

Child and referenced skills remain discoverable pointers. Loading a root skill does not automatically
load every other skill it mentions.

### D8. Destructive policy belongs at execution time

Exact, explicitly requested, single-target actions should execute after identity and scope checks.
Ambiguous targets, bulk effects, broad recurrence changes, or newly discovered destructive effects
must clarify or use a confirmation-token flow. This policy must not depend on hiding the tool.

## Baseline measurements

Current launch tool-schema estimates:

| Surface                  | Tools | Estimated tokens |
| ------------------------ | ----: | ---------------: |
| `global_basic`           |    11 |            2,970 |
| `project_write_document` |    20 |            5,666 |
| `project_calendar`       |    13 |            3,297 |

Current full skill-bundle estimates:

| Skill                 | Tools | Full bundle | Incremental in normal project surface |
| --------------------- | ----: | ----------: | ------------------------------------: |
| `plan_management`     |    16 |       4,317 |                                 3,060 |
| `project_forecast`    |    11 |       2,898 |                                 2,248 |
| `research_capture`    |     7 |       2,823 |                                 1,213 |
| `document_workspace`  |     9 |       2,367 |                                   931 |
| `calendar_management` |     7 |       1,833 |                                 1,833 |
| `task_management`     |     8 |       1,976 |                                   719 |

These numbers justify selective defaults, but they do not justify incomplete active skills. Add a
regression report so bundle growth is reviewed rather than discovered through production latency.

## Work plan

### Phase 1 — Make skill bundles complete

- [x] Change related-op resolution so every registered related tool is materialized.
- [x] Preserve read/write/destructive classification metadata.
- [x] Stop adding `tool_schema` merely because a skill contains writes.
- [x] Keep deterministic ordering and deduplication.
- [x] Verify unresolved operations do not leak invalid tool names.

Primary files:

- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.ts`
- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts`

### Phase 2 — Prove loaded and preloaded paths

- [x] Assert `calendar_management` mounts all seven declared tools, including delete.
- [x] Assert mixed read/write/destructive fixtures mount all related direct tools.
- [x] Assert domain-sensed skill preload carries the complete bundle before the first model pass.
- [x] Assert runtime `skill_load` results append the complete bundle once and deduplicate defaults.
- [x] Assert no separate `tool_schema` hop is required before the direct write.

Primary files:

- `apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts`

### Phase 3 — Remove superseded tactical routing

- [x] Remove the staged skill-loader `tool_schema` bridge.
- [x] Remove the staged special-case calendar-delete materialization from semantic turn contracts.
- [x] Keep turn contracts focused on outcome tracking and completion, not tool visibility.
- [x] Remove tests that encode either superseded workaround.

Primary files:

- `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
- `packages/agentic-chat-runtime/src/loop/turn-contract.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`

### Phase 4 — Align skill instructions

- [x] Remove instructions that require `tool_schema` before a paired direct tool.
- [x] Preserve guidance to inspect exact IDs, scope, and existing state before mutation.
- [x] Review every skill containing `tool_schema` for a legitimate long-tail use.
- [x] Keep `Related Tools` authoritative and free of documentation-only references.

Primary skill definitions:

- `calendar_management`
- `task_management`
- `document_workspace`
- `project_audit`
- `project_creation`

### Phase 5 — Make execution safety explicit

- [x] Inventory destructive tools reachable from current skills.
- [x] Document which operations are single-target/recoverable versus bulk/broad.
- [x] Verify authentication, project ownership, exact-ID, and schema checks for each reachable delete.
- [x] Add execution-policy tests for unknown and cross-project destructive attempts.
- [x] Define confirmation-token requirements for future bulk deletes and recurrence-wide calendar
      effects.
- [x] Do not add a second confirmation for an exact target explicitly requested by the user.

This phase may produce a separate implementation slice if the generic policy requires new trusted
turn-intent data in `ServiceContext`. It must not reintroduce visibility gating as a shortcut.

Current skill-reachable destructive inventory:

| Tool                    | Scope and identity boundary                                                                                                                                                    | Breadth / confirmation decision                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete_calendar_event` | Requires an exact `onto_event_id` or external event ID. Project-scoped ontology deletes now require trusted same-turn event→project evidence before execution.                 | Current call deletes one exact event. An explicit exact user request needs no second confirmation. Future bulk/series-wide operations must use preview + confirmation token. |
| `delete_onto_document`  | Requires an exact `document_id`; the existing mutation guard requires trusted document→project ownership and rejects unknown/cross-project IDs. Backend route enforces access. | Current call deletes one exact document permanently. Ambiguous identity must be resolved before calling it.                                                                  |

No current skill-related delete operation accepts a bulk target list or a recurrence-wide mode.

### Phase 6 — Budget and observability

- [x] Add a report for every skill: resolved tools, unresolved ops, full schema chars/tokens, and
      incremental size against relevant default profiles.
- [x] Add a regression budget or review threshold for unexpectedly broad skill bundles.
- [x] Verify skill id and materialized tool names remain present in existing preload/runtime
      telemetry.
- [x] Distinguish default, skill-bundle, search, schema, contract, and entity-result materialization.
      Durable `tool_surface_materialized` turn events record the normalized source and the direct
      tools actually added. Launch defaults and server-side skill preloads are recorded in the stream
      route; mid-turn search/schema/entity/contract paths are attributed by the orchestrator before
      deduplication.
- [x] Confirm direct tools are appended once and deduplicated when a skill loads.

### Phase 7 — Verification and rollout

- [x] Run focused skill-load, preload, tool-selector, orchestrator, and turn-contract tests.
- [x] Run the relevant package type checks.
- [x] Reproduce the Precision Hunter control flow in a deterministic test:
      load skill → resolve event → call delete directly → report success.
- [x] Compare the deterministic path with the failed audit: two tool passes plus synthesis, versus
      nine orchestrator passes; the complete calendar bundle is ~1,833 estimated tokens versus
      180,835 tokens consumed by the failed turn.
- [x] Deploy behind the existing runtime path; no new feature flag unless validation uncovers a
      compatibility risk.
- [x] Monitor skill-loaded turns for pass count, cache misses, validation errors, and destructive
      policy blocks.

## Acceptance criteria

The implementation is complete when:

1. Loading `calendar_management` makes `delete_calendar_event` directly callable without
   `tool_search`, `tool_schema`, or a special turn-contract materialization rule.
2. Every registered `relatedOp` for every loaded skill resolves to a mounted direct tool unless an
   explicit compatibility rule excludes it.
3. Default launch surfaces do not grow.
4. Read/write/destructive metadata remains available and accurate.
5. Loaded and preloaded paths behave identically.
6. A deterministic exact-event deletion test completes without a discovery loop.
7. Destructive execution remains scoped and exact-target safe.
8. Bundle-size drift is visible in tests or generated reports.

## Risks and mitigations

| Risk                                                  | Mitigation                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Wrong skill preload adds unnecessary schemas          | Keep sensing thresholds and track preload accuracy/bundle size.                            |
| Broad skills add several thousand tokens              | Review bundle reports; split genuinely over-broad skills rather than partially gate tools. |
| Destructive tool becomes easier for the model to call | Enforce scope, exact identity, and confirmation at execution time.                         |
| Skill docs and runtime declarations drift             | Parse only canonical `Related Tools`; keep disk/registry parity tests.                     |
| Multiple skill loads grow the surface repeatedly      | Deduplicate and append each direct tool only once.                                         |
| Existing tactical fix conflicts with the new model    | Remove the schema bridge and contract-specific delete routing in Phase 3.                  |

## Progress log

- **2026-08-25:** Research completed. Confirmed the failure was caused by incomplete skill-tool
  materialization, not slow tools. Agreed on small defaults + complete active-skill bundles +
  execution-time policy.
- **2026-08-25:** Implementation plan created. Work started with Phase 1.
- **2026-08-25:** Complete related-tool bundles implemented for loaded and preloaded
  skills. Removed the `tool_schema` bridge and the special calendar-delete turn-contract workaround.
- **2026-08-25:** Added exact event ownership evidence and fail-closed project scope checks for
  ontology calendar deletion. Existing document delete scope behavior received a dedicated regression.
- **2026-08-25:** Added per-skill bundle/incremental-size reports, unresolved-op validation, and a
  4,500-token maximum bundle regression threshold.
- **2026-08-25:** Verification: 163 focused tests passed; `pnpm --filter @buildos/web check` completed
  with 0 errors and 0 warnings; `git diff --check` passed. Full orchestrator coverage is 56/57 with
  one unrelated existing write-claim repair assertion. Full tool-execution coverage is 108/110 with
  two unrelated existing living-fiction content-augmentation assertions.
- **2026-08-25:** Added durable source-attributed tool-surface telemetry for launch defaults,
  skill bundles, search, schema, contracts, and entity-result inference. Explicit materialization and
  inferred entity-result expansion are attributed separately before tool-name deduplication.
- **2026-08-25:** Clean dependency-aware production build passed across all nine workspace packages.
  The expanded focused suite passed 275/278 tests; the three failures are the same unrelated
  write-claim-repair and living-fiction baselines documented above.
- **2026-08-25:** Deployed the existing runtime path to production as Vercel deployment
  `dpl_94wAJRmhLvwQ958UjKSxCmVMyM4A` (Ready at `2026-08-25T16:21:38Z`; aliased to
  `build-os.com` and `www.build-os.com`). No feature flag was added.
- **2026-08-25:** Post-deploy production observation covered one bounded, read-only, skill-preloaded
  turn (`stream_run_id=4af0f709-6625-4fef-ba36-585936262090`). `project_audit` mounted six
  incremental direct tools before the first model pass; telemetry separately recorded `default`,
  `skill_bundle`, and `entity_result` materialization. The turn completed with 3 model passes, 2 tool
  rounds, 10/10 successful tool executions, 0 validation failures, and 0 policy/block events. The
  cold harness request recorded one prepared-prompt miss (`missing_key`), expected because it bypassed
  client-side prompt preparation. The test runner exited non-zero only when its legacy-session cleanup
  raced the active control-row guard; the production turn itself completed and the seeded project was
  torn down.

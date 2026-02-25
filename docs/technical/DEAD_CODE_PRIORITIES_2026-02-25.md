<!-- docs/technical/DEAD_CODE_PRIORITIES_2026-02-25.md -->

# Dead Code Cleanup Priorities (Web) - 2026-02-25

## Scope and Method

This audit covered `apps/web/src/lib/components/**` and `apps/web/src/lib/services/**`.

Method:

- Built a static import graph across `apps/web/src`.
- Resolved aliases: `$lib`, `$components`, `$utils`, `$ui`, `$routes`.
- Excluded test files and `.d.ts` from dead-code candidates.
- Classified files with `0 runtime imports` as dead-code candidates.
- Ran a second pass for core-route reachability from:
    - `routes/projects/**`
    - `routes/history/**`
    - `routes/profile/**`
    - `routes/onboarding/**`
    - root route/layout files under `routes/`

Artifacts:

- `docs/testing/artifacts/test-prune-2026-02-25/dead-code-file-usage.tsv`
- `docs/testing/artifacts/test-prune-2026-02-25/dead-code-zero-imports.tsv`
- `docs/testing/artifacts/test-prune-2026-02-25/dead-code-zero-imports-components.txt`
- `docs/testing/artifacts/test-prune-2026-02-25/dead-code-zero-imports-services.txt`
- `docs/testing/artifacts/test-prune-2026-02-25/dead-code-import-graph.json`
- `docs/testing/artifacts/test-prune-2026-02-25/core-route-reachability.json`

## Executive Summary

- Component files analyzed: **337**
- Service files analyzed: **222**
- Zero-runtime-import candidates: **87**
    - Components: **68**
    - Services: **19**
- Zero-runtime-import candidates outside ontology/agentic-chat: **72**
- Top-level component entries with zero external inbound imports:
    - `ErrorBoundary.svelte`
    - `SearchCombobox.svelte`
    - `SearchViewAll.svelte`
    - `icons/` (only `LoadingSpinner.svelte`)
    - `tasks/` (`RecurrenceSelector`, `RecurringDeleteModal`)

## Priority List

## P0 - Remove First (Very High Confidence)

These are zero-import and also have clear legacy/deprecated signals.

1. Deprecated/alternate files:

- `apps/web/src/lib/components/ontology/EntityListItem.CORRECTED.svelte`
- `apps/web/src/lib/components/ontology/InsightPanelSkeleton.refactored.svelte`

2. Fully orphaned top-level components:

- `apps/web/src/lib/components/ErrorBoundary.svelte`
- `apps/web/src/lib/components/SearchCombobox.svelte`
- `apps/web/src/lib/components/SearchViewAll.svelte`
- `apps/web/src/lib/components/icons/LoadingSpinner.svelte`

3. Fully orphaned top-level task components:

- `apps/web/src/lib/components/tasks/RecurrenceSelector.svelte`
- `apps/web/src/lib/components/tasks/RecurringDeleteModal.svelte`

4. Service files explicitly legacy/deprecated/test-harness:

- `apps/web/src/lib/services/ontology/project-props-generation.service.ts`
    - File comments already mark this deprecated.
- `apps/web/src/lib/services/agentic-chat/config/test-enhanced-wrapper.ts`
    - Local test harness script, not wired into runtime.
- `apps/web/src/lib/services/agent-planner-service.ts`
    - Legacy planner/orchestrator not referenced by current runtime graph.

## P1 - Remove in Batches (High Confidence)

Zero-runtime-import files in active folders. These are likely stale but should be deleted by feature cluster to reduce rollback risk.

1. `components/project` stale set (**12 unused of 23**):

- `BraindumpProjectCard.svelte`
- `CoreDimensionsField.svelte`
- `NoteModal.svelte`
- `ProjectBriefCard.svelte`
- `ProjectCalendarConnectModal.svelte`
- `ProjectCard.svelte`
- `ProjectContextModal.svelte`
- `ProjectTimelineCompact.svelte`
- `SynthesisOperationModal.svelte`
- `TaskBraindumpSection.svelte`
- `synthesis/SynthesisLoadingState.svelte`
- `synthesis/SynthesisOptionsModal.svelte`

2. `components/history` stale set (**5 unused of 7**):

- `BraindumpHistoryCard.svelte`
- `BraindumpHistoryDeleteModal.svelte`
- `BraindumpModalHistory.svelte`
- `ContributionChart.svelte`
- `LinkNoteToProject.svelte`

3. `components/brain-dump` stale set (**7 unused of 14**):

- `OperationsList.svelte`
- `ProjectSelectionView.svelte`
- `RecordingView.svelte`
- `TextVirtualizer.svelte`
- `icons/ProjectSelectionIcons.svelte`
- `icons/RecordingIcons.svelte`
- `icons/SuccessIcons.svelte`

4. `components/ui` stale set (**15 unused of 50**):

- `ChoiceModal.svelte`
- `CurrentTimeIndicator.svelte`
- `LoadingModal.svelte`
- `ManyToOneDiffView.svelte`
- `ProgressiveImage.svelte`
- `RecentActivityIndicator.svelte`
- `SkeletonLoader.svelte`
- `ui/skeletons/*` (8 files)

5. Service singletons with zero imports:

- `apps/web/src/lib/services/draft.service.ts`
- `apps/web/src/lib/services/link-shortener.service.ts`
- `apps/web/src/lib/services/project-activity-log.service.ts`
- `apps/web/src/lib/services/promptEnhancer.service.ts`

6. Unused service submodules (still under active umbrellas):

- `apps/web/src/lib/services/smart-llm/errors.ts`
- `apps/web/src/lib/services/smart-llm/model-selection.ts`
- `apps/web/src/lib/services/smart-llm/openrouter-client.ts`
- `apps/web/src/lib/services/smart-llm/transcription-utils.ts`
- `apps/web/src/lib/services/smart-llm/usage-logger.ts`
- `apps/web/src/lib/services/agentic-chat/config/error-handling-strategies.ts`
- `apps/web/src/lib/services/agentic-chat/config/llm-cache-wrapper.ts`
- `apps/web/src/lib/services/agentic-chat/config/token-optimization-strategies.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/index.ts`

## P2 - Route-Scope Rationalization (Medium Confidence, Big Wins)

These are not dead by import alone, but sit outside your stated core pages and tend to be route-isolated.

Core-route reachability results:

- Components unreached from core routes: **157 / 338**
- Services unreached from core routes: **171 / 222**

Largest unreached component clusters:

- `components/admin` (36)
- `components/ui` (22)
- `components/ontology` (19)
- `components/project` (14)
- `components/time-blocks` (10)

Largest unreached service clusters:

- `services/agentic-chat` (60)
- `services/ontology` (35)
- `services/agentic-chat-v2` (13)
- `services/smart-llm` (8)

Interpretation:

- This does **not** mean these are dead; it means they are outside the specific route set you identified.
- Use this as a roadmap for feature deprecation rounds (for example: admin-only flows, older time-block flows, older brain-dump flows).

## Top-Level Component Usage Snapshot

This matches your request to evaluate top-level components and child usage.

- `components/project`: 23 total, 11 used, 12 unused
- `components/history`: 7 total, 2 used, 5 unused
- `components/dashboard`: 5 total, 2 used, 3 unused
- `components/brain-dump`: 14 total, 7 used, 7 unused
- `components/agent`: 16 total, 13 used, 3 unused
- `components/ui`: 50 total, 35 used, 15 unused
- `components/tasks`: 2 total, 0 used, 2 unused
- `components/admin`: 36 total, 34 used, 2 unused

## Suggested Cleanup Execution Order

1. Remove all **P0** files in one PR.
2. Remove **P1** by cluster (`project`, `history`, `brain-dump`, `ui`, services) in separate PRs.
3. After each cluster PR, run:
    - `pnpm --filter @buildos/web test:quiet`
    - `pnpm --filter @buildos/web build`
4. Re-run this dead-code scan after each batch to keep the list current.

## Caveat

This is static analysis. It can miss:

- Runtime string-based module loading with non-literal import specifiers.
- References from outside `apps/web/src` (for example one-off scripts).

For this repo state, these caveats appear limited; all P0 candidates have strong corroboration as stale or orphaned.

<!-- research-library/research/unused-web-cleanup-scan-2026-02-08.md -->

# Unused /web components & services scan (2026-02-08)

## Summary

- Components scanned: 336
- Services scanned: 230
- Unused components (no refs found): 65
- Unused services (no refs found): 19
- Test-only services: 1
- Test-only components: 0

## Method

- Scanned the repo for import/export specifiers in .ts/.tsx/.js/.jsx/.svelte/.svx/.md/.mdx files (excluding node_modules, build output, .svelte-kit, coverage, etc.).
- Resolved relative imports (./, ../) and SvelteKit aliases ($lib, $components, $utils, $ui) to actual file paths.
- Handled multi-dot filenames (e.g., \*.service.ts) when resolving imports without explicit extensions.
- Flagged a component/service as used if any import resolved to that file, or if it was re-exported by a used barrel index file under the same directory.
- Marked as “unused” if no references were found anywhere in the repo.

## Caveats

- Dynamic runtime references not expressed as import specifiers (e.g., string-based module resolution) will not be detected.
- SvelteKit conventions or runtime-only usage could lead to false positives (files marked unused but actually used).
- If you have additional path aliases not covered here, those references won’t be detected.

---

## Unused components (no references found)

- `ErrorBoundary.svelte`
- `SearchCombobox.svelte`
- `SearchViewAll.svelte`
- `admin/BrainDumpChart.svelte`
- `admin/PayloadEditor.svelte`
- `agent/DraftsList.svelte`
- `agent/OperationsLog.svelte`
- `agent/OperationsQueue.svelte`
- `brain-dump/OperationsList.svelte`
- `brain-dump/ProjectSelectionView.svelte`
- `brain-dump/RecordingView.svelte`
- `brain-dump/TextVirtualizer.svelte`
- `brain-dump/icons/ProjectSelectionIcons.svelte`
- `brain-dump/icons/RecordingIcons.svelte`
- `brain-dump/icons/SuccessIcons.svelte`
- `history/BraindumpHistoryCard.svelte`
- `history/BraindumpHistoryDeleteModal.svelte`
- `history/BraindumpModalHistory.svelte`
- `history/ContributionChart.svelte`
- `history/LinkNoteToProject.svelte`
- `icons/LoadingSpinner.svelte`
- `layout/ThemeToggle.svelte`
- `ontology/DocumentEditor.svelte`
- `ontology/EntityListItem.CORRECTED.svelte`
- `ontology/GoalReverseEngineerModal.svelte`
- `ontology/InsightPanelSkeleton.refactored.svelte`
- `ontology/OntologyContextDocModal.svelte`
- `ontology/OntologyProjectHeader.svelte`
- `phases/EmptyState.svelte`
- `phases/KanbanView.svelte`
- `phases/PhaseForm.svelte`
- `phases/PhaseSkeleton.svelte`
- `phases/PhasesActionsSection.svelte`
- `phases/TimelineView.svelte`
- `project/AssignBacklogTasksModal.svelte`
- `project/BraindumpProjectCard.svelte`
- `project/NoteModal.svelte`
- `project/PhaseGenerationConfirmationModal.svelte`
- `project/PhaseSchedulingModal.svelte`
- `project/ProjectBriefCard.svelte`
- `project/ProjectCalendarConnectModal.svelte`
- `project/ProjectContextModal.svelte`
- `project/ProjectDatesModal.svelte`
- `project/ProjectEditModal.svelte`
- `project/ProjectHistoryModal.svelte`
- `project/ProjectTimelineCompact.svelte`
- `project/RescheduleOverdueTasksModal.svelte`
- `project/ScheduleAllPhasesModal.svelte`
- `project/TaskModal.svelte`
- `project/UnscheduleAllTasksModal.svelte`
- `project/synthesis/SynthesisLoadingState.svelte`
- `project/synthesis/SynthesisOptionsModal.svelte`
- `time-blocks/TimeBlockModal.svelte`
- `trial/ReadOnlyOverlay.svelte`
- `ui/ChoiceModal.svelte`
- `ui/ProgressiveImage.svelte`
- `ui/SkeletonLoader.svelte`
- `ui/skeletons/BriefsSkeleton.svelte`
- `ui/skeletons/NotesListSkeleton.svelte`
- `ui/skeletons/PhasesSkeleton.svelte`
- `ui/skeletons/ProjectHeaderSkeleton.svelte`
- `ui/skeletons/ProjectStatsSkeleton.svelte`
- `ui/skeletons/ProjectsGridSkeleton.svelte`
- `ui/skeletons/SynthesisSkeleton.svelte`
- `ui/skeletons/TaskListSkeleton.svelte`

## Unused services (no references found)

- `agentic-chat/config/error-handling-strategies.ts`
- `agentic-chat/config/llm-cache-wrapper.ts`
- `agentic-chat/config/test-enhanced-wrapper.ts`
- `agentic-chat/config/token-optimization-strategies.ts`
- `agentic-chat/tools/core/index.ts`
- `dailyBrief/ontologyBriefRepository.ts`
- `draft.service.ts`
- `link-shortener.service.ts`
- `ontology/project-props-generation.service.ts`
- `phase-generation/strategies/calendar-optimized.strategy.ts`
- `project-graph/index.ts`
- `project-synthesis.service.ts`
- `prompts/core/question-generation.ts`
- `recurring-instance.service.ts`
- `smart-llm/errors.ts`
- `smart-llm/model-selection.ts`
- `smart-llm/openrouter-client.ts`
- `smart-llm/transcription-utils.ts`
- `smart-llm/usage-logger.ts`

## Test-only references

### Services referenced only in tests

- `synthesis/task-synthesis-helpers.ts`

### Components referenced only in tests

- None

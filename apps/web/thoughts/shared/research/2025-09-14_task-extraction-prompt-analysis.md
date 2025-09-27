---
date: 2025-09-14T10:00:00-08:00
researcher: Claude
git_commit: e92fe2a
branch: main
repository: build_os
topic: 'Task Extraction Prompt Not Tailored for New vs Existing Projects'
tags: [research, codebase, braindump-processor, prompt-templates, task-extraction]
status: complete
last_updated: 2025-09-14
last_updated_by: Claude
---

# Research: Task Extraction Prompt Not Tailored for New vs Existing Projects

**Date**: 2025-09-14T10:00:00-08:00
**Researcher**: Claude
**Git Commit**: e92fe2a
**Branch**: main
**Repository**: build_os

## Research Question

The `extractTasks()` function in `braindump-processor.ts` gets called for both new and existing projects, but the `getTaskExtractionPrompt()` isn't properly tailored to distinguish between these scenarios. The "Current Project Data" section shouldn't be present for new projects, and the instructions should be specific based on whether we're updating an existing project or creating a new one.

## Summary

The current implementation of `getTaskExtractionPrompt()` doesn't properly differentiate between new and existing projects. It always includes a "Current Project Data" section with existing tasks, even for new projects where no tasks exist. The prompt should follow the pattern established in `processWithStrategy()`, which properly tailors prompts based on project type using separate methods and conditional logic.

## Detailed Findings

### Current Problem in extractTasks()

The `extractTasks()` function (lines 866-951 in `braindump-processor.ts`) currently:

1. **Always uses the same prompt structure** regardless of project type:
    - Lines 879-883: Calls `getTaskExtractionPrompt()` with `selectedProjectId` parameter
    - This method always includes "Current Project Data" section even when there's no project

2. **Doesn't follow the established pattern** from `processWithStrategy()`:
    - `processWithStrategy()` properly differentiates using `isNewProject` flag
    - Uses different prompt methods for new vs existing projects
    - Conditionally includes/excludes sections based on project type

### How processWithStrategy() Handles This Correctly

In `processWithStrategy()` (lines 415-586 in `braindump-processor.ts`):

```typescript
// Lines 436-447: Proper prompt selection based on project type
const systemInstructionsPrompt = isNewProject
	? this.promptTemplateService.getOptimizedNewProjectPrompt()
	: this.promptTemplateService.getOptimizedExistingProjectPrompt(
			selectedProjectId!,
			existingProjectStartDate
		);

// Lines 467-469: Proper section naming
const fullSystemPrompt = isNewProject
	? `${systemInstructionsPrompt}\n\n## Analysis Context:\n${projectContextPrompt}${questionsPrompt}`
	: `${systemInstructionsPrompt}\n\n## Current Project Data:\n${projectContextPrompt}${questionsPrompt}`;
```

### Current getTaskExtractionPrompt() Implementation Issues

From `promptTemplate.service.ts` (lines 1088-1243):

1. **Always includes "Current Project Data" section** (line 1117):

    ```
    ## Current Project Data:
    ${existingTasksSection}
    ```

2. **Always shows existing tasks** even when `projectId` is undefined:
    - Lines 1095-1100: Shows "No existing tasks" but still has the section

3. **Uses single set of instructions** for both scenarios:
    - Lines 1121-1142: Same decision logic regardless of project type
    - Doesn't differentiate between creating tasks for a new project vs updating existing

### Data Model Differences

The research revealed that different data models should be used:

**For New Projects:**

- Should only use `DataModelsComponent.getTaskCreateModel()` without projectId
- Tasks use `project_ref: "new-project-1"` to link to project being created

**For Existing Projects:**

- Should use both:
    - `DataModelsComponent.getTaskUpdateModel()` for updating existing tasks
    - `DataModelsComponent.getTaskCreateModel(projectId)` for creating new tasks
- Tasks use `project_id: "actual-uuid"` for direct reference

## Code References

- `src/lib/utils/braindump-processor.ts:879-883` - extractTasks() calling getTaskExtractionPrompt()
- `src/lib/utils/braindump-processor.ts:436-447` - processWithStrategy() proper prompt selection
- `src/lib/services/promptTemplate.service.ts:1088-1243` - getTaskExtractionPrompt() implementation
- `src/lib/services/promptTemplate.service.ts:1117-1119` - Problematic "Current Project Data" section
- `src/lib/services/prompts/core/data-models.ts:38-92` - Task model definitions

## Architecture Insights

The codebase has two parallel processing patterns:

1. **Single Processing (processWithStrategy)**:
    - Properly differentiates between new and existing projects
    - Uses separate prompt methods with tailored instructions
    - Conditionally includes sections based on project type

2. **Dual Processing (extractTasks)**:
    - Doesn't differentiate project types in prompt generation
    - Always assumes existing project structure
    - Missing the conditional logic present in single processing

## Proposed Solution

The `getTaskExtractionPrompt()` method should be refactored to follow the pattern established in the single processing flow:

### 1. Create Separate Methods or Add Conditional Logic

```typescript
getTaskExtractionPrompt(
  projectId?: string,
  existingTasks?: Task[],
  displayedQuestions?: any[],
  isNewProject?: boolean  // Add this parameter
) {
  if (isNewProject || !projectId) {
    return this.getNewProjectTaskExtractionPrompt(displayedQuestions);
  } else {
    return this.getExistingProjectTaskExtractionPrompt(
      projectId,
      existingTasks,
      displayedQuestions
    );
  }
}
```

### 2. New Project Task Extraction Prompt

Should:

- **Remove** "Current Project Data" section entirely
- **Include** only `DataModelsComponent.getTaskCreateModel()` without projectId
- **Focus** instructions on extraction without update logic
- **Use** `project_ref` for task-project linking

### 3. Existing Project Task Extraction Prompt

Should:

- **Keep** "Current Project Data" section with existing tasks
- **Include** both update and create models:
    - `DataModelsComponent.getTaskUpdateModel()`
    - `DataModelsComponent.getTaskCreateModel(projectId)`
- **Maintain** current decision logic for UPDATE vs CREATE
- **Use** `project_id` for direct project reference

### 4. Update extractTasks() Function

```typescript
private async extractTasks({
  brainDump,
  selectedProjectId,
  userId,
  existingTasks,
  displayedQuestions
}: {
  // ... parameters
}): Promise<BrainDumpParseResult> {
  const isNewProject = !selectedProjectId;

  const systemPrompt = this.promptTemplateService.getTaskExtractionPrompt(
    selectedProjectId,
    existingTasks,
    displayedQuestions,
    isNewProject  // Pass the flag
  );
  // ... rest of implementation
}
```

## Open Questions

1. Should the task extraction for new projects also include project context generation, or should it remain focused solely on tasks?
2. How should the question generation instructions differ between new and existing projects?
3. Should there be different temperature settings for task extraction in new vs existing projects?

## Related Research

- Previous research on dual processing patterns
- Task scheduling and time slot finder integration
- Project synthesis service architecture

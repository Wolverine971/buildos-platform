---
date: 2025-09-24T19:18:26-04:00
researcher: Claude
git_commit: 4b90ad16ac1827df5fe15ab4f8b742334de0ea69
branch: main
repository: daily-brief-worker
topic: "Project URL Migration from Slug-based to ID-based"
tags: [research, codebase, project-urls, migration, markdown-links]
status: complete
last_updated: 2025-01-24
last_updated_by: Claude
---

# Research: Project URL Migration from Slug-based to ID-based

**Date**: 2025-09-24T19:18:26-04:00
**Researcher**: Claude
**Git Commit**: 4b90ad16ac1827df5fe15ab4f8b742334de0ea69
**Branch**: main
**Repository**: daily-brief-worker

## Research Question

Find and create a list of all the places where markdown links to projects need to be updated from using slugs to using project IDs.

## Summary

Identified **4 files** containing **11 distinct markdown link patterns** that need updating from slug-based (`/projects/{slug}`) to ID-based (`/projects/{id}`) URLs. The primary file requiring updates is `briefGenerator.ts` which generates all project-related markdown links in daily briefs.

## Files Requiring Updates

### 1. **src/workers/brief/briefGenerator.ts** (PRIMARY - Production Code)

This is the main file that generates markdown links for daily briefs.

#### Lines to Update:

- **Line 625**: Project header link

  ```typescript
  ## [${project.name}](/projects/${project.slug})
  ```

  Should become:

  ```typescript
  ## [${project.name}](/projects/${project.id})
  ```

- **Line 518**: Task links within projects

  ```typescript
  [${task.title}](/projects/${projectSlug}/tasks/${task.id})
  ```

  Should become:

  ```typescript
  [${task.title}](/projects/${projectId}/tasks/${task.id})
  ```

- **Line 554**: Note links within projects

  ```typescript
  [${note.title || 'Untitled Note'}](/projects/${projectSlug}/notes/${note.id})
  ```

  Should become:

  ```typescript
  [${note.title || 'Untitled Note'}](/projects/${projectId}/notes/${note.id})
  ```

- **Line 756**: Overdue alerts project link
  ```typescript
  **[${brief.project_name}](/projects/${brief.project_slug})**: ${brief.metadata.overdue_task_count} overdue task(s)
  ```
  Should become:
  ```typescript
  **[${brief.project_name}](/projects/${brief.project_id})**: ${brief.metadata.overdue_task_count} overdue task(s)
  ```

### 2. **tests/test-url-transform.ts** (Test File)

Contains test cases for URL transformation that use slug-based project URLs.

#### Lines to Update:

- **Line 18**: Test input
  ```typescript
  "Check out [this project](/projects/my-project) for details.";
  ```
- **Line 19**: Expected output

  ```typescript
  "Check out [this project](https://build-os.com/projects/my-project) for details.";
  ```

- **Line 23**: Test input with multiple links

  ```typescript
  "See [Project A](/projects/project-a) and [Task B](/tasks/task-123)";
  ```

- **Line 24**: Expected output

  ```typescript
  "See [Project A](https://build-os.com/projects/project-a) and [Task B](https://build-os.com/tasks/task-123)";
  ```

- **Line 55**: Test content

  ```typescript
  Check [Project Alpha](/projects/alpha) for updates.
  ```

- **Line 64**: Expected transformation

  ```typescript
  Check [Project Alpha](https://build-os.com/projects/alpha) for updates.
  ```

- **Line 74**: Test with mixed links

  ```typescript
  "External link: [Google](https://google.com) and internal [project](/projects/test)";
  ```

- **Line 75**: Expected output
  ```typescript
  "External link: [Google](https://google.com) and internal [project](https://build-os.com/projects/test)";
  ```

### 3. **tests/test-email-tracking.ts** (Test File)

Contains a test case with a project link.

#### Line to Update:

- **Line 23**: Test content
  ```typescript
  Check out [Project Alpha](/projects/alpha) for updates.
  ```

### 4. **src/lib/services/email-sender.ts** (URL Transformation Logic)

While this file doesn't contain hardcoded project links, it contains the regex patterns that handle URL transformation. The patterns themselves don't need updating as they're generic, but you should verify they still work correctly with ID-based URLs.

## Impact Analysis

### Code Changes Required:

1. **Variable Updates**:
   - Replace `projectSlug` with `projectId` variables
   - Update function parameters to pass `project.id` instead of `project.slug`
   - Ensure `project_id` is available in all contexts where links are generated

2. **Database/Type Changes**:
   - The `projects` table already has both `id` and `slug` fields
   - May need to update TypeScript interfaces if they expect slug in certain places
   - Brief metadata may need to store `project_id` instead of `project_slug`

3. **Test Updates**:
   - All test cases need to use UUID-style IDs instead of slug strings
   - Example: `/projects/my-project` → `/projects/123e4567-e89b-12d3-a456-426614174000`

## Recommended Update Approach

1. **Update Production Code First** (`briefGenerator.ts`):
   - Change all four link generation patterns
   - Update variable names from `projectSlug` to `projectId`
   - Ensure `project.id` is passed through function calls

2. **Update Test Files**:
   - Replace slug examples with UUID examples
   - Ensure tests still validate URL transformation correctly

3. **Verify URL Transformation**:
   - The `email-sender.ts` transformation logic should work unchanged
   - It already handles any `/projects/*` pattern generically

4. **Database Considerations**:
   - Ensure brief generation queries include `project.id`
   - Update any stored metadata to use `project_id` instead of `project_slug`

## Pattern Summary

### Current Pattern (Slug-based):

- `/projects/{slug}`
- `/projects/{slug}/tasks/{task-id}`
- `/projects/{slug}/notes/{note-id}`

### New Pattern (ID-based):

- `/projects/{id}`
- `/projects/{id}/tasks/{task-id}`
- `/projects/{id}/notes/{note-id}`

## Open Questions

1. Should the frontend routes also be updated to handle both patterns for backwards compatibility?
2. Are there any existing briefs in the database that contain the old slug-based URLs?
3. Should a migration script be created to update historical brief content?
4. Will the frontend application need simultaneous updates to handle the new ID-based routing?

---
date: 2025-09-12T12:47:06-04:00
researcher: Claude
git_commit: e1b0cbf244edf5cf9e1c4705f37f1265753947ba
branch: main
repository: build_os
topic: 'Markdown Heading Consistency in Project Context Prompts'
tags: [research, codebase, markdown, prompts, project-context, heading-consistency]
status: complete
last_updated: 2025-09-12
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-09-12_12-47-06_markdown-heading-consistency.md
---

# Research: Markdown Heading Consistency in Project Context Prompts

**Date**: 2025-09-12T12:47:06-04:00
**Researcher**: Claude
**Git Commit**: e1b0cbf244edf5cf9e1c4705f37f1265753947ba
**Branch**: main
**Repository**: build_os

## Research Question

How is project context being created and displayed across different prompt generation scenarios, and where are the heading inconsistencies that need to be fixed to properly use markdown-nesting.ts?

## Summary

The codebase has significant markdown heading inconsistencies across different prompt generation scenarios. The main issue is that `formatProjectData()` in data-formatter.ts does not properly use the `formatProjectForPrompt()` function from markdown-nesting.ts, resulting in mixed formatting styles (bold text vs markdown headers). Additionally, different prompt templates use varying heading structures without standardization.

## Detailed Findings

### Core Markdown Utility (markdown-nesting.ts)

The markdown-nesting.ts file provides comprehensive utilities for managing markdown heading hierarchies:

- `adjustMarkdownHeadingLevels()` - Adjusts heading levels while maintaining structure ([markdown-nesting.ts:21-57](src/lib/utils/markdown-nesting.ts:21))
- `normalizeMarkdownHeadings()` - Normalizes inflated headings back to reasonable levels ([markdown-nesting.ts:65-104](src/lib/utils/markdown-nesting.ts:65))
- `hasInflatedHeadings()` - Detects overly deep headings ([markdown-nesting.ts:109-127](src/lib/utils/markdown-nesting.ts:109))
- `formatProjectForPrompt()` - Main project formatting function with proper nesting ([markdown-nesting.ts:132-200](src/lib/utils/markdown-nesting.ts:132))
- `formatTasksForPrompt()` - Formats tasks with proper grouping ([markdown-nesting.ts:320-353](src/lib/utils/markdown-nesting.ts:320))
- `formatNotesForPrompt()` - Formats notes consistently ([markdown-nesting.ts:421-448](src/lib/utils/markdown-nesting.ts:421))

### Current Implementation Issues

#### 1. formatProjectData() in data-formatter.ts

The current implementation in [data-formatter.ts:50-138](src/lib/services/prompts/core/data-formatter.ts:50) has these issues:

**Current problematic structure:**

```typescript
// Not using formatProjectForPrompt properly
sections.push(`**Project: ${project.name || 'Untitled'}**`);
sections.push(`**ID:** ${project.id}`);
// ... more bold text formatting
```

**Should be using:**

```typescript
const projectSection = formatProjectForPrompt(project, 2); // Use proper formatting from markdown-nesting.ts
```

#### 2. New Project Context Generation

New project prompts use numbered lists instead of markdown headers:

- Framework specifies: `1. **Situation & Environment**` (numbered lists)
- Actual generated content uses: `### Situation & Environment` (H3 headers)
- Inconsistency between prompt framework and actual output

#### 3. Existing Project Context Updates

Existing project prompts show multiple inconsistencies:

- Long braindump: Uses `## Current Project Data:` with mixed heading levels
- Context updates: Uses `**PROJECT DATA:**` (bold text, not headers)
- No consistent use of markdown-nesting utilities

#### 4. Dual Processing Mode

Dual processing uses yet another structure:

- Bold `**Context**` wrapper (not a heading)
- H4 headers (`####`) for most sections
- Embedded tasks within context structure

### Heading Structure Variations Found

| Scenario                 | Project Header | Context Section                     | Tasks Section  | Notes Section |
| ------------------------ | -------------- | ----------------------------------- | -------------- | ------------- |
| formatProjectData()      | **Bold text**  | **Bold text**                       | ### Tasks      | ### Notes     |
| New Project Prompts      | Numbered list  | Numbered list                       | N/A            | N/A           |
| Existing Project Long    | ## Project:    | ### Context                         | #### Task:     | N/A           |
| Existing Project Context | **PROJECT:**   | **Context:**                        | N/A            | N/A           |
| Dual Processing          | **Bold text**  | #### Sections                       | ### Tasks      | N/A           |
| formatProjectForPrompt() | **Bold text**  | **Bold text** with adjusted content | ### subsection | N/A           |

## Architecture Insights

### Design Pattern Issues

1. **Separation of Concerns Violation**: The data-formatter.ts duplicates logic that exists in markdown-nesting.ts
2. **Inconsistent Abstraction**: Some services use utilities, others implement custom formatting
3. **Missing Standardization Layer**: No single source of truth for project context formatting

### Technical Debt

1. **Heading Inflation Problem**: Without consistent normalization, repeated LLM processing creates deeply nested headings
2. **Mixed Formatting Paradigms**: Bold text, markdown headers, and numbered lists used interchangeably
3. **Documentation Drift**: Sample documentation doesn't match actual implementation

## Code References

- `src/lib/utils/markdown-nesting.ts:132-200` - formatProjectForPrompt() function that should be used consistently
- `src/lib/services/prompts/core/data-formatter.ts:50-138` - formatProjectData() that needs fixing
- `src/lib/services/prompts/core/project-data-fetcher.ts:195-212` - getFormattedProjectData() that calls formatProjectData
- `src/lib/utils/braindump-processor.ts:280-320` - processWithStrategy() that generates prompts
- `docs/prompts/new-project/new-project-long-braindump.md` - New project prompt template
- `docs/prompts/existing-project/existing-project-long-braindump.md` - Existing project prompt template
- `docs/prompts/dual-processing/dual-processing-context-prompt.md` - Dual processing template

## Recommended Fix Strategy

### 1. Standardize formatProjectData()

Update `src/lib/services/prompts/core/data-formatter.ts` to properly use markdown-nesting utilities:

```typescript
export function formatProjectData(
	project: ProjectWithRelations,
	options: FormatOptions = {}
): string {
	// Use the proper formatting function from markdown-nesting.ts
	const projectSection = formatProjectForPrompt(project, 2);

	// Use consistent task formatting
	const taskSection = project.tasks?.length ? formatTasksForPrompt(project.tasks, 3, 'full') : '';

	// Use consistent notes formatting
	const notesSection = project.notes?.length
		? formatNotesForPrompt(project.notes, 3, 'full')
		: '';

	return [projectSection, taskSection, notesSection].filter(Boolean).join('\n\n');
}
```

### 2. Update Prompt Templates

Ensure all prompt templates expect the standardized format:

- New projects: Use markdown headers consistently (## for main, ### for subsections)
- Existing projects: Use the same structure as new projects
- Dual processing: Align with standard structure

### 3. Apply Heading Normalization

Before any LLM processing, normalize existing content:

```typescript
const normalizedContext = normalizeMarkdownHeadings(project.context, 2);
```

### 4. Create Centralized Constants

Define heading levels in one place:

```typescript
const HEADING_LEVELS = {
	PROJECT: 2, // ## Project Name
	SECTION: 3, // ### Context, Tasks, Notes
	SUBSECTION: 4, // #### Task groups, Note categories
	ITEM: 5 // ##### Individual items if needed
};
```

## Open Questions

1. Should we use numbered lists (1. 2. 3.) or markdown headers (## ###) for the project context framework?
2. Should project metadata (ID, status, etc.) use bold text or structured headers?
3. How should we handle legacy project contexts that have inflated headings?
4. Should dual processing mode maintain its unique H4-based structure or align with standard?

## Next Steps

The implementation phase will update data-formatter.ts to properly use markdown-nesting.ts utilities and ensure all prompt templates expect consistent heading structures. This will eliminate the current inconsistencies and prevent heading inflation issues.

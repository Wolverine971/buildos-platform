<!-- apps/web/docs/features/project-activity-logging/NEXT_STEP_GENERATION_FLOW.md -->

# Next Step Generation Flow

## Overview

The "Next Move" feature provides AI-generated, contextual recommendations for what users should focus on next in their projects. This document details the analysis process, data inputs, and generation flow.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interface                              │
├─────────────────────────────────────────────────────────────────┤
│  NextStepDisplay.svelte                                         │
│  - Shows existing next step (short + expandable long)           │
│  - Generate button when no next step exists                     │
│  - Regenerate button on hover                                   │
│  - Entity reference links (clickable)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Endpoint                                  │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/onto/projects/[id]/next-step/generate                │
│  - Authenticates user                                           │
│  - Verifies project ownership                                   │
│  - Calls generation service                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              next-step-generation.service.ts                     │
├─────────────────────────────────────────────────────────────────┤
│  1. Fetch Project Context                                       │
│     - Project metadata                                          │
│     - Tasks (status, priority, due dates)                       │
│     - Goals and progress                                        │
│     - Plans and phases                                          │
│     - Milestones and deadlines                                  │
│     - Outputs/deliverables                                      │
│                                                                 │
│  2. Build Analysis Prompt                                       │
│     - Categorize tasks (overdue, active, pending)               │
│     - Identify high-priority items                              │
│     - Calculate completion percentages                          │
│     - Format with entity references                             │
│                                                                 │
│  3. Call LLM (DeepSeek via OpenRouter)                          │
│     - System prompt with rules                                  │
│     - Structured JSON response                                  │
│                                                                 │
│  4. Parse and Save                                              │
│     - Validate response format                                  │
│     - Enforce length limits                                     │
│     - Update onto_projects table                                │
└─────────────────────────────────────────────────────────────────┘
```

## Data Analysis Factors

The generation service analyzes multiple dimensions of project state:

### 1. Task Analysis

| Category                | Description               | Priority Weight |
| ----------------------- | ------------------------- | --------------- |
| **Overdue Tasks**       | Tasks past their due date | Highest         |
| **High Priority**       | Tasks with priority >= 3  | High            |
| **Due This Week**       | Tasks due within 7 days   | Medium-High     |
| **Active/In Progress**  | Currently being worked on | Medium          |
| **Pending/Not Started** | Ready to begin            | Low             |
| **Completed**           | Already done              | Context only    |

### 2. Goal Analysis

- Active vs completed goals
- Goal types (strategic, tactical, etc.)
- Progress toward objectives

### 3. Milestone Analysis

- Upcoming deadlines
- Missed milestones
- Timeline pressure

### 4. Output/Deliverable Analysis

- Pending deliverables
- Draft vs published states
- Output types

### 5. Project State

- Current FSM state (planning, active, review, etc.)
- Project type/template
- Overall description and context

## Entity Reference Format

Entity references allow linking to specific items in the long description:

```
[[type:id|display text]]
```

### Supported Types

| Type        | Description     | Example              |
| ----------- | --------------- | -------------------- | -------------------- |
| `task`      | Project tasks   | `[[task:abc-123      | Complete proposal]]` |
| `goal`      | Project goals   | `[[goal:def-456      | Launch MVP]]`        |
| `plan`      | Execution plans | `[[plan:ghi-789      | Marketing Phase]]`   |
| `output`    | Deliverables    | `[[output:jkl-012    | User Manual]]`       |
| `milestone` | Key dates       | `[[milestone:mno-345 | Beta Release]]`      |
| `document`  | Project docs    | `[[document:pqr-678  | Requirements]]`      |

### Regex Pattern

```regex
/\[\[(\w+):([\w-]+)\|([^\]]+)\]\]/gi
```

This pattern supports:

- Standard UUIDs: `abc-123-def-456`
- Slug-style IDs: `improve-sharing-functionality`
- Any alphanumeric with hyphens/underscores

## LLM Prompt Structure

### System Prompt

The system prompt instructs the LLM to:

1. Analyze project state comprehensively
2. Prioritize urgent/blocking items
3. Consider time sensitivity
4. Generate specific, actionable recommendations
5. Use entity reference format for links
6. Return structured JSON response

### User Prompt Format

```markdown
## Project: [Name]

State: [Current State]
Description: [If available]

## Tasks (N total)

- Completed: X
- Active/In Progress: Y
- Pending/Not Started: Z

### ⚠️ OVERDUE Tasks (if any):

- [[task:id|title]] (N days overdue, priority: X)

### 🔥 High Priority Tasks:

- [[task:id|title]] (priority: X, due: date)

### 📅 Due This Week:

- [[task:id|title]] (due: date, state: X)

### 🚀 Currently Active:

- [[task:id|title]]

## Goals (N)

- Active: X, Completed: Y
- [[goal:id|name]] (state)

## Upcoming Milestones

- [[milestone:id|title]] (due: date)

## Pending Deliverables

- [[output:id|name]] (state)

## Analysis Summary

- Total tasks: N, Completed: X (Y%)
- Overdue items: N
- High priority pending: N
- Active goals: N
```

### Response Format

```json
{
	"short": "Complete the proposal draft - it's overdue by 2 days.",
	"long": "Focus on finishing [[task:abc-123|Complete proposal draft]] first as it's now overdue. Once done, move to [[task:def-456|Schedule client review]] which depends on it.",
	"reasoning": "Overdue task with dependencies blocking other work"
}
```

## Priority Decision Logic

The LLM follows this priority order:

1. **Overdue Tasks** - Always surface first
2. **Blocking Tasks** - Items that block other work
3. **High Priority + Near Due Date** - Urgent important items
4. **Active Tasks** - Continue momentum
5. **High Priority (no due date)** - Important but flexible
6. **Goals at Risk** - Strategic objectives needing attention
7. **Milestones Approaching** - Deadline awareness
8. **Next Logical Step** - If nothing urgent, what's next

## Storage

Next steps are stored on the `onto_projects` table:

| Column                 | Type        | Description                          |
| ---------------------- | ----------- | ------------------------------------ |
| `next_step_short`      | text        | One-line summary (max 100 chars)     |
| `next_step_long`       | text        | Detailed description (max 500 chars) |
| `next_step_source`     | enum        | `'ai'` or `'user'`                   |
| `next_step_updated_at` | timestamptz | Last generation/edit time            |

## UI Components

### NextStepDisplay.svelte

Located at: `/apps/web/src/lib/components/project/NextStepDisplay.svelte`

Features:

- **With Next Step**: Shows accent-colored card with Zap icon
    - Short description always visible
    - Chevron to expand long description
    - Source indicator (AI/User) with icon
    - Relative timestamp
    - Regenerate button on hover
    - Entity references rendered as clickable buttons

- **Without Next Step**: Shows muted dashed-border card
    - Sparkles icon
    - "Click to generate your next step" prompt
    - Loading state during generation

### Props

```typescript
interface Props {
	projectId: string;
	nextStepShort: string | null | undefined;
	nextStepLong: string | null | undefined;
	nextStepSource?: 'ai' | 'user' | null;
	nextStepUpdatedAt?: string | null;
	onEntityClick?: (ref: EntityReference) => void;
	onNextStepGenerated?: (nextStep: { short: string; long: string }) => void;
	class?: string;
}
```

## Integration Points

### 1. Project Header

The NextStepDisplay is shown in the project detail page header, after the FSM State Bar.

### 2. Chat Session Classification

When chat sessions involving projects are classified, the activity processor can also trigger next step regeneration based on changes made.

### 3. Brain Dump Processing

When new projects are created via brain dump, initial next steps are seeded using the `NextStepSeedingService`.

## Cost Considerations

- **LLM Model**: DeepSeek Chat via OpenRouter
- **Cost**: ~$0.14 per 1M tokens (very low)
- **Average Request**: ~500-1000 tokens prompt, ~200 tokens response
- **Per Generation**: ~$0.0001-0.0002

## Error Handling

| Error                | Handling                      |
| -------------------- | ----------------------------- |
| Auth failure         | Return 401, show login prompt |
| Project not found    | Return 404, show error toast  |
| LLM timeout          | Return 500, show retry prompt |
| Invalid LLM response | Return 500, log for debugging |
| DB update failure    | Return 500, show error toast  |

## Future Enhancements

1. **User Editing**: Allow users to manually set/edit next steps
2. **Historical Tracking**: Log next step changes in activity log
3. **Smart Triggers**: Auto-regenerate on significant project changes
4. **Context from Chat**: Use recent chat context for better recommendations
5. **Team Awareness**: Consider team workload in recommendations
6. **Calendar Integration**: Factor in user's calendar availability

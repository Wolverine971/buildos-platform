<!-- apps/web/docs/prompts/calendar-analysis/2-part/part2-project-creation-prompt.md -->

# Prompt Audit: calendar-analysis-part2-project-creation

**Generated at:** 2026-02-27T03:26:04.812Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 2 of 2
**Purpose:** Project creation with deduplication
**Input from Part 1:** 1 event groups

## Metadata

```json
{
	"userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
	"eventGroupCount": 1,
	"existingProjectCount": 4,
	"pastEventCount": 6,
	"upcomingEventCount": 36,
	"timestamp": "2026-02-27T03:26:04.812Z"
}
```

## System Prompt

```
You are an expert in creating structured projects from calendar event patterns. Always respond with valid JSON following the specified schema.
```

## User Prompt

````
You are creating BuildOS projects from calendar event groups with proper deduplication.

**Today's date**: 2026-02-27

## User's Existing Projects

### Project 1: 9takes - Enneagram Community Platform
**Description**: A community platform for sharing insights and discussions on the Enneagram personality system.
**Project ID**: `23d5d5ca-a601-4c74-a5b5-dcf72b6b999a`

### Project 2: The Last Ember
**Description**: A fantasy novel about a young blacksmith who forges magical weapons in a kingdom threatened by darkness.
**Project ID**: `1cf4d5f4-925d-4a44-8c68-5af1347694f4`

### Project 3: Organizing BuildOS Project
**Description**: A project aimed at organizing BuildOS, an air-first project organization tool.
**Project ID**: `5fe7f122-0432-4bad-86b9-7c558cd6dba9`

### Project 4: BuildOS CEO Training Sprint
**Description**: 30-day training program to prepare DJ for Series A funding and scaling BuildOS.
**Project ID**: `b8f84d3e-52d0-43fe-b3e6-1619a16dbbb3`

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: Check EVERY event group against existing projects above.

**Deduplication Decision** (Apply in order):

1. **Strong Match (≥75% confidence)**:
   - Set "add_to_existing: true"
   - Set "existing_project_id: 'actual-uuid-from-above'"
   - Set "deduplication_reasoning: 'Events match existing project because...'"
   - Still generate tasks to add to that project

2. **Weak/No Match (<75%)**:
   - Set "add_to_existing: false"
   - Set "existing_project_id: null"
   - Set "deduplication_reasoning: 'No match with existing projects because...'"
   - Create NEW project

**ALWAYS** provide "deduplication_reasoning" explaining your decision.

## Examples:

✅ **Strong Match**:
- Existing: "Product Launch Q4 2025"
- Events: "Launch Planning Meeting", "Launch Review" (Oct-Dec 2025)
- Decision: "add_to_existing: true" - Events are clearly part of existing Q4 launch project

❌ **No Match**:
- Existing: "Marketing Campaign"
- Events: "Engineering Standup", "Code Review"
- Decision: "add_to_existing: false" - Engineering events unrelated to marketing

## Event Groups to Process

You've already identified 1 event groups. Now create BuildOS projects for each group.


### Group 1: Recurring team collaboration sessions

**Suggested Name**: Finned Friends Project
**Confidence**: 0.85
**Event Count**: 19
**Keywords**: Finned Friends, recurring
**Time Range**: 2026-02-20 to 2026-04-24
**Reasoning**: 19 recurring weekly events with identical title 'Finned Friends', consistent 3-hour duration, and 2 attendees. The recurring pattern and consistent naming strongly indicate a coordinated work effort or team project.

**Past Events in this group (3 events - for context only)**:
[
  {
    "id": "187stvtin15i2pnp62theevu3g_20260220T170000Z",
    "title": "No Finned Friends",
    "start": "2026-02-20T12:00:00-05:00",
    "end": "2026-02-20T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260225T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-25T12:00:00-05:00",
    "end": "2026-02-25T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260226T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-26T12:00:00-05:00",
    "end": "2026-02-26T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  }
]

**Upcoming Events in this group (16 events - create tasks from these)**:
[
  {
    "id": "187stvtin15i2pnp62theevu3g_20260227T170000Z",
    "title": "Finned Friends",
    "start": "2026-02-27T12:00:00-05:00",
    "end": "2026-02-27T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260304T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-04T12:00:00-05:00",
    "end": "2026-03-04T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260305T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-05T12:00:00-05:00",
    "end": "2026-03-05T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260306T170000Z",
    "title": "Finned Friends",
    "start": "2026-03-06T12:00:00-05:00",
    "end": "2026-03-06T15:00:00-05:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260401T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-01T12:00:00-04:00",
    "end": "2026-04-01T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260402T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-02T12:00:00-04:00",
    "end": "2026-04-02T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260403T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-03T12:00:00-04:00",
    "end": "2026-04-03T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260408T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-08T12:00:00-04:00",
    "end": "2026-04-08T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260409T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-09T12:00:00-04:00",
    "end": "2026-04-09T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260410T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-10T12:00:00-04:00",
    "end": "2026-04-10T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260415T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-15T12:00:00-04:00",
    "end": "2026-04-15T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260416T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-16T12:00:00-04:00",
    "end": "2026-04-16T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260417T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-17T12:00:00-04:00",
    "end": "2026-04-17T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260422T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-22T12:00:00-04:00",
    "end": "2026-04-22T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260423T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-23T12:00:00-04:00",
    "end": "2026-04-23T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260424T160000Z",
    "title": "Finned Friends",
    "start": "2026-04-24T12:00:00-04:00",
    "end": "2026-04-24T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  }
]


## Data Models

### Project Model (REQUIRED structure):
projects: {
  name: string (required, max 255),
  slug: string (REQUIRED - generate from name: lowercase, replace spaces/special chars with hyphens),
  description: string,
  context: string (required, rich markdown),
  executive_summary: string (<500 chars),
  status: "active"|"paused"|"completed"|"archived",
  start_date: "YYYY-MM-DD" (REQUIRED - parse from braindump or use today),
  end_date?: "YYYY-MM-DD" (parse timeline from braindump or leave null),
  tags: string[]
}

### Task Model (REQUIRED structure):
tasks: {
  title: string (required, max 255),
  description: string,
  details: string (specifics mentioned in braindump),
  status: "backlog"|"in_progress"|"done"|"blocked",
  priority: "low"|"medium"|"high",
  task_type: "one_off"|"recurring",
  duration_minutes?: number,
  start_date?: "YYYY-MM-DDTHH:MM:SS" (timestamptz - parse dates AND times, intelligently order tasks throughout the day e.g. "2024-03-15T09:00:00" for 9am, "2024-03-15T14:30:00" for 2:30pm, REQUIRED if task_type is "recurring"),
  recurrence_pattern?: "daily"|"weekdays"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly" (REQUIRED if task_type is "recurring"),
  recurrence_ends?: "YYYY-MM-DD" (date only - parse from braindump or defaults to project end date if not specified),
  dependencies?: string[],
  parent_task_id?: string
}

**Project Context Doc (Vision + Strategy Narrative):**

Write a markdown document that orients any human or agent to the project's vision, stakes, and strategic plan.

**Purpose**
- Explain why the project exists and what must be true for success
- Capture the strategic approach, major bets, and how the story is evolving
- Provide enough context for decision-making without digging into task lists

**Include**
- Mission/vision and the promise being made (who benefits, why now)
- Definition of success and non-negotiables (metrics, deadlines, quality bars)
- Strategy and approach (phases, leverage points, sequencing of big rocks)
- Scope and boundaries (what is in/out, constraints, assumptions, guardrails)
- Operating context (timeline, resources, dependencies, stakeholders)
- Decisions, insights, pivots, and the reasoning behind them
- Risks, open questions, and signals being monitored
- Next strategic moves or hypotheses (not granular tasks)

**Avoid**
- Task lists, status checklists, or implementation minutiae
- Raw braindump transcripts or disconnected bullet soup
- Step-by-step directives that belong inside the task model

**Formatting**
- Always use markdown headings, bullets, emphasis, tables when helpful
- Integrate updates into the narrative and add timestamps like **[2025-10-17]** for major shifts
- Maintain the user's voice so the doc reads like a coherent story, not a log

## Output Format

Return JSON:

{
  "suggestions": [
    {
      "event_group_id": "group-1",

      // Project fields
      "name": "Specific project name",
      "slug": "project-slug",
      "description": "2-3 sentence description",
      "context": "Comprehensive markdown using BuildOS framework above",
      "executive_summary": "Brief summary <500 chars",
      "status": "active",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD" or null,
      "tags": ["tag1", "tag2"],

      // Metadata
      "event_ids": ["all", "event", "ids"],
      "confidence": 0.8,
      "reasoning": "Why this is a project",
      "keywords": ["keyword1", "keyword2"],

      // Deduplication (ALWAYS REQUIRED)
      "add_to_existing": false,
      "existing_project_id": null,
      "deduplication_reasoning": "Checked against existing projects. No match found because...",

      // Tasks (see task generation rules below)
      "suggested_tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "details": "Comprehensive details including event info",
          "status": "backlog",
          "priority": "medium",
          "task_type": "one_off" | "recurring",
          "recurrence_pattern": "daily|weekly|monthly|etc" or null,
          "recurrence_ends": "YYYY-MM-DD" or null,
          "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z" or null,
          "duration_minutes": 60,
          "start_date": "YYYY-MM-DDTHH:MM:SS",
          "event_id": "calendar-event-id",
          "tags": ["tag1"]
        }
      ]
    }
  ]
}

## CRITICAL RULES

### 1. Task Generation Requirements

**Task Count**: Generate tasks for 30-50% of upcoming events
- Calculate: For 1 event groups, if a group has N upcoming events, generate Math.ceil(N * 0.4) tasks minimum
- **Minimum**: 2 tasks per project
- **Strategy**: Convert key upcoming events to tasks + add inferred preparation/follow-up tasks

**Task Dates**:
- **ALL tasks must have start_date >= 2026-02-27**
- No past-dated tasks allowed

### 2. Recurring Event Handling (CRITICAL)

When an event has a "recurrence" field with RRULE:

**Steps**:
1. Set "task_type: 'recurring'"
2. **COPY the exact RRULE string** to "recurrence_rrule" field (preserve it exactly!)
3. Parse RRULE to set "recurrence_pattern":
   - "FREQ=DAILY" → "daily"
   - "FREQ=WEEKLY" → "weekly"
   - "FREQ=MONTHLY" → "monthly"
4. Parse "UNTIL" parameter for "recurrence_ends":
   - "UNTIL=20251215T235959Z" → "2025-12-15"

**Example**:
```json
{
  "title": "Sprint Planning",
  "task_type": "recurring",
  "recurrence_pattern": "weekly",
  "recurrence_ends": "2025-12-15",
  "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z",
  "event_id": "event-123"
}
````

### 3. Task Metadata (REQUIRED)

**Details field MUST include**:

```
**Meeting**: {event.title}
**Date**: {event.start}
**Duration**: {duration_minutes} minutes
**Attendees**: {comma-separated emails}
**Location**: {location or "Virtual"}
**Meeting Link**: {hangoutLink or "None"}

{additional context}
```

**Duration**: Calculate from event.end - event.start (in minutes)
**Event ID**: Always link task to source event via "event_id"

### 4. Deduplication

- **ALWAYS** provide "deduplication_reasoning" (even for new projects)
- Use EXACT project IDs from "User's Existing Projects" section above
- Don't hallucinate project IDs

### 5. Data Model Compliance

- Follow BuildOS data models exactly
- All required fields must be present
- Use proper date formats (YYYY-MM-DD or ISO 8601 for timestamps)

```

## Token Estimates

- **System Prompt:** ~36 tokens
- **User Prompt:** ~4118 tokens
- **Total Estimate:** ~4154 tokens

## Flow Notes

This is Part 2 of a 2-part flow. It receives event groups from Part 1 and creates structured projects.
Part 2 includes full data models and deduplication logic against existing projects.

---
*This file is automatically generated in development mode for prompt auditing purposes.*
```

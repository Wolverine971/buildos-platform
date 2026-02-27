# Prompt Audit: calendar-analysis-part2-project-creation

**Generated at:** 2026-02-27T05:22:29.450Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 2 of 2
**Purpose:** Ontology project suggestion creation (new projects only)
**Input from Part 1:** 1 event groups


## Metadata

```json
{
  "userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
  "eventGroupCount": 1,
  "pastEventCount": 6,
  "upcomingEventCount": 36,
  "timestamp": "2026-02-27T05:22:29.449Z"
}
```


## System Prompt

```
You are an expert in creating structured projects from calendar event patterns. Always respond with valid JSON following the specified schema.
```

## User Prompt

```
You are creating BuildOS ontology project suggestions from calendar event groups.

**Today's date**: 2026-02-27

## Event Groups to Process

You've already identified 1 event groups. Now create BuildOS projects for each group.


### Group 1: Recurring team collaboration and development sessions

**Suggested Name**: Finned Friends Development Team
**Confidence**: 0.92
**Event Count**: 27
**Keywords**: Finned, Friends, recurring
**Time Range**: 2026-02-25 to 2026-04-24
**Reasoning**: The 'Finned Friends' events form a clear recurring weekly pattern with consistent title, time (12:00-15:00), and 2 attendees. The consistent recurrence and naming suggest a structured team collaboration effort. The recurring pattern continues through multiple months with only one instance marked as 'NO Finned Friends' which appears to be an exception rather than a cancellation of the series.

**Past Events in this group (2 events - for context only)**:
[
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

**Upcoming Events in this group (25 events - create tasks from these)**:
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
    "id": "21bpafpsrusahhqv0b1n861m8k_20260311T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-11T12:00:00-04:00",
    "end": "2026-03-11T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260312T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-12T12:00:00-04:00",
    "end": "2026-03-12T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260313T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-13T12:00:00-04:00",
    "end": "2026-03-13T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260318T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-18T12:00:00-04:00",
    "end": "2026-03-18T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260319T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-19T12:00:00-04:00",
    "end": "2026-03-19T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260320T160000Z",
    "title": "NO Finned Friends",
    "start": "2026-03-20T12:00:00-04:00",
    "end": "2026-03-20T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260325T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-25T12:00:00-04:00",
    "end": "2026-03-25T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260326T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-26T12:00:00-04:00",
    "end": "2026-03-26T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260327T160000Z",
    "title": "Finned Friends",
    "start": "2026-03-27T12:00:00-04:00",
    "end": "2026-03-27T15:00:00-04:00",
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


## Ontology-First Contract (CRITICAL)

Your response is converted into an ontology `ProjectSpec` and instantiated into ontology entities.

Each accepted suggestion creates a **new** ontology project:
- `onto_projects` (project root)
- `onto_documents` (context document from `context`, type `document.context.project`)
- `onto_plans` (auto-created execution plan)
- `onto_tasks` (from `suggested_tasks`)
- `onto_edges` (project→plan, plan→task, project→context-document)

**No merge behavior is supported in this flow.**
Do not output merge fields (e.g. `add_to_existing`, `existing_project_id`, `deduplication_reasoning`).
Do not design for legacy `projects`/`tasks` tables.

### Context Markdown Guidance
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

      // Project suggestion fields (mapped to ontology project + context document)
      "name": "Specific project name",
      "description": "2-3 sentence description",
      "context": "Comprehensive markdown using BuildOS framework above",
      "status": "active", // suggestion metadata; ontology project is created as active
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD" or null,
      "tags": ["tag1", "tag2"],

      // Metadata
      "event_ids": ["all", "event", "ids"],
      "confidence": 0.8,
      "reasoning": "Why this is a project",
      "keywords": ["keyword1", "keyword2"],

      // Tasks (see task generation rules below)
      "suggested_tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "details": "Comprehensive details including event info",
          "status": "backlog", // mapped to ontology state_key
          "state_key": "todo", // optional ontology-native alternative
          "priority": "medium",
          "task_type": "one_off" | "recurring",
          "type_key": "task.execute", // optional; inferred if omitted
          "recurrence_pattern": "daily|weekly|monthly|etc" or null,
          "recurrence_ends": "YYYY-MM-DD" or null,
          "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z" or null,
          "duration_minutes": 60,
          "start_date": "YYYY-MM-DDTHH:MM:SS",
          "due_at": "YYYY-MM-DDTHH:MM:SS" or null,
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
```

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

### 4. Ontology Contract Compliance

- Follow the schema in this prompt exactly
- Keep project context strategic (for ontology context document)
- Keep tasks actionable and schedulable (for ontology task instantiation)
- Use proper date formats (YYYY-MM-DD or ISO 8601 for timestamps)
- Do not output legacy table names, SQL, or merge fields
```

## Token Estimates

- **System Prompt:** ~36 tokens
- **User Prompt:** ~4335 tokens
- **Total Estimate:** ~4370 tokens

## Flow Notes

This is Part 2 of a 2-part flow. It receives event groups from Part 1 and creates ontology-first project suggestions.
Each accepted suggestion creates a new ontology project graph (no merge/dedup with existing projects).

---
*This file is automatically generated in development mode for prompt auditing purposes.*

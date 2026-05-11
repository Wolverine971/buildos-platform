<!-- apps/web/docs/prompts/calendar-analysis/2-part/part2-project-creation-prompt.md -->

# Prompt Audit: calendar-analysis-part2-project-creation

**Generated at:** 2026-05-11T19:17:58.051Z
**Environment:** Development

## Flow Context

**Flow Type:** 2-Part LLM Analysis
**Current Part:** Part 2 of 2
**Purpose:** Ontology project suggestion creation (new projects only)
**Input from Part 1:** 2 event groups

## Metadata

```json
{
	"userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
	"eventGroupCount": 2,
	"pastEventCount": 9,
	"upcomingEventCount": 19,
	"timestamp": "2026-05-11T19:17:58.051Z"
}
```

## System Prompt

```
You are an expert in creating structured projects from calendar event patterns. Always respond with valid JSON following the specified schema.
```

## User Prompt

````
You are creating BuildOS ontology project suggestions from calendar event groups.

**Today's date**: 2026-05-11

## Event Groups to Process

You've already identified 2 event groups. Now create BuildOS projects for each group.


### Group 1: Recurring social or hobby group meetings

**Suggested Name**: Finned Friends Group
**Confidence**: 0.8
**Event Count**: 11
**Keywords**: Finned Friends, recurring, group
**Time Range**: 2026-05-06 to 2026-05-28
**Reasoning**: Multiple recurring events with the same title 'Finned Friends' spanning several weeks, indicating a regular group meeting or project.

**Past Events in this group (3 events - for context only)**:
[
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260506T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-06T12:00:00-04:00",
    "end": "2026-05-06T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260507T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-07T12:00:00-04:00",
    "end": "2026-05-07T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260508T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-08T12:00:00-04:00",
    "end": "2026-05-08T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  }
]

**Upcoming Events in this group (8 events - create tasks from these)**:
[
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260513T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-13T12:00:00-04:00",
    "end": "2026-05-13T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260514T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-14T12:00:00-04:00",
    "end": "2026-05-14T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260515T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-15T12:00:00-04:00",
    "end": "2026-05-15T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260520T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-20T12:00:00-04:00",
    "end": "2026-05-20T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260521T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-21T12:00:00-04:00",
    "end": "2026-05-21T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "187stvtin15i2pnp62theevu3g_20260522T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-22T12:00:00-04:00",
    "end": "2026-05-22T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "21bpafpsrusahhqv0b1n861m8k_20260527T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-27T12:00:00-04:00",
    "end": "2026-05-27T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  },
  {
    "id": "jm7ubs5qnljaa4rj036tje90b8_20260528T160000Z",
    "title": "Finned Friends",
    "start": "2026-05-28T12:00:00-04:00",
    "end": "2026-05-28T15:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/sqt-rzbq-sxg",
    "is_recurring": true
  }
]

---

### Group 2: Recurring personal outdoor activity

**Suggested Name**: Fun in the Forest Outings
**Confidence**: 0.75
**Event Count**: 5
**Keywords**: Fun in the forest, recurring
**Time Range**: 2026-05-04 to 2026-06-01
**Reasoning**: Recurring events with the same title 'Fun in the forest' every Monday, suggesting a regular personal or hobby activity.

**Past Events in this group (2 events - for context only)**:
[
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260504T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-04T15:00:00-04:00",
    "end": "2026-05-04T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260511T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-11T15:00:00-04:00",
    "end": "2026-05-11T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com"
  }
]

**Upcoming Events in this group (3 events - create tasks from these)**:
[
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260518T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-18T15:00:00-04:00",
    "end": "2026-05-18T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/kfh-diib-mgz",
    "is_recurring": true
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260525T190000Z",
    "title": "Fun in the forest",
    "start": "2026-05-25T15:00:00-04:00",
    "end": "2026-05-25T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/kfh-diib-mgz",
    "is_recurring": true
  },
  {
    "id": "li5o3slq63boc3ira3svdtjq4g_20260601T190000Z",
    "title": "Fun in the forest",
    "start": "2026-06-01T15:00:00-04:00",
    "end": "2026-06-01T17:00:00-04:00",
    "attendees": [
      "glittrgraveyard@gmail.com",
      "djwayne35@gmail.com"
    ],
    "organizer": "glittrgraveyard@gmail.com",
    "hangoutLink": "https://meet.google.com/kfh-diib-mgz",
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
- Raw transcripts or disconnected bullet soup
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
- Calculate: For 2 event groups, if a group has N upcoming events, generate Math.ceil(N * 0.4) tasks minimum
- **Minimum**: 2 tasks per project
- **Strategy**: Convert key upcoming events to tasks + add inferred preparation/follow-up tasks

**Task Dates**:
- **ALL tasks must have start_date >= 2026-05-11**
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

### 4. Ontology Contract Compliance

- Follow the schema in this prompt exactly
- Keep project context strategic (for ontology context document)
- Keep tasks actionable and schedulable (for ontology task instantiation)
- Use proper date formats (YYYY-MM-DD or ISO 8601 for timestamps)
- Do not output legacy table names, SQL, or merge fields

```

## Token Estimates

- **System Prompt:** ~36 tokens
- **User Prompt:** ~3232 tokens
- **Total Estimate:** ~3268 tokens

## Flow Notes

This is Part 2 of a 2-part flow. It receives event groups from Part 1 and creates ontology-first project suggestions.
Each accepted suggestion creates a new ontology project graph (no merge/dedup with existing projects).

---
*This file is automatically generated in development mode for prompt auditing purposes.*
```

# Prompt Audit: calendar-analysis

**Generated at:** 2025-10-07T20:57:12.605Z
**Environment:** Development

## Metadata

```json
{
  "userId": "c44daf9e-27d5-4ef0-9ffd-a57887daff95",
  "eventCount": 7,
  "pastEventCount": 1,
  "upcomingEventCount": 6,
  "minConfidence": 0.4,
  "existingProjectCount": 0,
  "timestamp": "2025-10-07T20:57:12.605Z"
}
```


## System Prompt

```
You are an expert in analyzing calendar events to identify potential projects. Always respond with valid JSON following the specified schema.
```

## User Prompt

```

A user has asked you to analyze their google calendar and suggest projects based off the events.

Your role is to act like a project organizer and look at the google calendar events and suggest projects with associated tasks.

**IMPORTANT CONTEXT**: Today's date is 2025-10-07. You have access to both past and upcoming calendar events.

You will be returning a JSON response of detailed "suggestions" array. See **Output Requirements** for correct JSON schema formatting.

## User's Existing Projects

No existing projects.

---

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: The user already has the projects listed above. When analyzing calendar events:

1. **Check for matches** against existing projects:
   - Compare by project name, description, tags, and context
   - Look for semantic similarity (e.g., "Marketing Campaign" matches "Q4 Marketing Push")
   - Consider if calendar events relate to existing project scope

2. **If a match is found** (confidence >= 70%):
   - Set "add_to_existing": true
   - Set "existing_project_id": "<matching_project_id>"
   - Set "deduplication_reasoning": "Explanation of why this matches existing project"
   - Still generate suggested_tasks to add to the existing project

3. **Only suggest NEW projects if**:
   - Calendar events represent meaningfully different work
   - No semantic match with existing projects
   - Events indicate a distinct initiative or goal

4. **When uncertain** (50-70% match):
   - Err on the side of adding to existing projects
   - Provide clear reasoning for the decision

## Project Detection Criteria

Identify projects based on:
- Recurring meetings with similar titles/attendees (likely ongoing projects)
- Clusters of related events (project milestones, reviews, planning sessions)
- Events with project-indicating keywords (sprint, launch, milestone, review, kickoff, deadline, sync, standup, retrospective, planning, design, implementation)
- Series of events building toward a goal
- Events with multiple attendees working on the same topic
- Any pattern suggesting coordinated work effort

Ignore:
- One-off personal events (lunch, coffee, dentist, doctor, vacation)
- Company all-hands or general meetings without specific project focus
- Events marked as declined or tentative
- Generic focus/work blocks without specific context
- Social events without work context

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

**Context Generation (for projects)**:
Create comprehensive markdown that brings anyone up to speed. The following framework provides organizational guidance that should be adapted to best serve each project's unique needs:

**[Note: This is a flexible guide, not a rigid template. Adapt sections, combine categories, or add new dimensions as appropriate for the project]**

1. **Situation & Environment** – Current state, pain points, relevant history, external factors, stakeholder landscape
2. **Purpose & Vision & Framing** – The vision is the most important part. The framing should draw from the words of the user
Core purpose, success criteria, desired future state, strategic alignment
3. **Scope & Boundaries** – Deliverables, exclusions, constraints, assumptions, key risks
4. **Approach & Execution** – Strategy, methodology, workstreams, milestones, resource plan
5. **Coordination & Control** – Governance, decision rights, communication flow, risk/issue management
6. **Knowledge & Learning** – Lessons applied, documentation practices, continuous improvement approach

**Remember:** This framework is a guide to help organize thoughts. Prioritize clear communication and project-specific organization over rigid adherence to this structure. Add, combine, or reorganize sections as needed.

**Rule:** Include in context only if the update affects these dimensions. Progress updates or short-term tasks go in `tasks` or status fields instead.

## Calendar Events to Analyze

### Past Events (1 events)
**Use these events ONLY for project context and understanding. DO NOT create tasks from past events.**
[
  {
    "id": "knddn7t31epru4timrkv9t635c_20251001T180000Z",
    "title": "DJ and Anna financial me ting",
    "start": "2025-10-01T14:00:00-04:00",
    "end": "2025-10-01T15:00:00-04:00",
    "attendees": [
      "djwayne3@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  }
]

### Upcoming Events (6 events)
**Use these events for BOTH project context AND task generation.**
[
  {
    "id": "e5jel8iftgo2lb91to4qhcfie4_20251015T190000Z",
    "title": "DJ and Anna financial meeting",
    "start": "2025-10-15T15:00:00-04:00",
    "end": "2025-10-15T16:00:00-04:00",
    "attendees": [
      "djwayne3@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "4rg1fsv8o0v2q72m0oirf8j9l8_20251020",
    "title": "research trends",
    "description": "<a href=\"https://trends.google.com/trends/explore?date=today%205-y&amp;q=%2Fm%2F02z3kbb\">https://trends.google.com/trends/explore?date=today%205-y&amp;q=%2Fm%2F02z3kbb</a>",
    "start": "2025-10-20",
    "end": "2025-10-21",
    "recurring": false
  },
  {
    "id": "knddn7t31epru4timrkv9t635c_20251101T180000Z",
    "title": "DJ and Anna financial me ting",
    "start": "2025-11-01T14:00:00-04:00",
    "end": "2025-11-01T15:00:00-04:00",
    "attendees": [
      "djwayne3@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "e5jel8iftgo2lb91to4qhcfie4_20251115T200000Z",
    "title": "DJ and Anna financial meeting",
    "start": "2025-11-15T15:00:00-05:00",
    "end": "2025-11-15T16:00:00-05:00",
    "attendees": [
      "djwayne3@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  },
  {
    "id": "4rg1fsv8o0v2q72m0oirf8j9l8_20251117",
    "title": "research trends",
    "description": "<a href=\"https://trends.google.com/trends/explore?date=today%205-y&amp;q=%2Fm%2F02z3kbb\">https://trends.google.com/trends/explore?date=today%205-y&amp;q=%2Fm%2F02z3kbb</a>",
    "start": "2025-11-17",
    "end": "2025-11-18",
    "recurring": false
  },
  {
    "id": "knddn7t31epru4timrkv9t635c_20251201T190000Z",
    "title": "DJ and Anna financial me ting",
    "start": "2025-12-01T14:00:00-05:00",
    "end": "2025-12-01T15:00:00-05:00",
    "attendees": [
      "djwayne3@gmail.com",
      "glittrgraveyard@gmail.com"
    ],
    "recurring": false
  }
]

## CRITICAL TASK GENERATION RULES


For each project, create tasks using ONE or BOTH of these approaches:

### Approach 1: Tasks from Upcoming Calendar Events
- Convert upcoming calendar events into actionable tasks
- Use the event's date/time as the task's start_date
- If event is recurring, set task_type to "recurring" with appropriate recurrence_pattern

### Approach 2: Inferred Next Steps
- Based on the project context and goals, infer logical next steps
- Schedule these tasks starting from 2025-10-07 or later
- Space tasks intelligently (e.g., planning tasks this week, execution tasks next week)

**TASK DATE REQUIREMENTS**:
- ALL tasks MUST have start_date >= 2025-10-07 (today or future)
- NEVER create tasks with dates in the past
- Use past events to understand the project, but create tasks for future work
- If an upcoming event exists, you can create a task for it
- If no upcoming events exist, infer 2-3 logical next steps and schedule them starting 2025-10-07

**Examples**:

Example 1 - Project with upcoming events:
- Past events: "Sprint Planning" (weekly, last 8 weeks)
- Upcoming events: "Sprint Planning" on 2025-10-14
- Tasks to create:
  1. "Attend Sprint Planning" - from upcoming event
  2. "Review sprint backlog" - inferred preparation task (2 days before)
  3. "Update team on progress" - recurring task (weekly)

Example 2 - Project with only past events:
- Past events: "Product Review" (monthly, last 3 months)
- No upcoming events
- Tasks to create:
  1. "Schedule next product review" - starting 2025-10-07
  2. "Gather product metrics" - starting 2025-10-09
  3. "Prepare review presentation" - starting 2025-10-12

## Output Requirements - JSON schema

Return a JSON object with a "suggestions" array. Each suggestion must follow this EXACT structure:

{
  "suggestions": [
    {
      // Project fields (all required unless noted)
      "name": "Clear, action-oriented project name",
      "slug": "generated-from-name-lowercase-hyphens",
      "description": "2-3 sentence description of what this project is about",
      "context": "Comprehensive markdown following the BuildOS context framework. Include all relevant information about the project's purpose, vision, scope, approach, stakeholders, timelines, and any other relevant context extracted from the calendar events. Use BOTH past and upcoming events to build complete context.",
      "executive_summary": "Brief executive summary under 500 characters",
      "status": "active", // Default to active for new projects
      "start_date": "YYYY-MM-DD", // Earliest relevant event date or today
      "end_date": "YYYY-MM-DD or null", // Latest relevant event date or null if ongoing
      "tags": ["relevant", "tags", "from", "events"],

      // Calendar analysis metadata (all required)
      "event_ids": ["array", "of", "ALL", "event", "ids", "both", "past", "and", "upcoming"],
      "confidence": 0.7, // 0-1 score, must be >= 0.4
      "reasoning": "Clear explanation of why these events suggest a project",
      "keywords": ["detected", "keywords", "that", "indicated", "project"],

      // Deduplication fields (REQUIRED - check against existing projects)
      "add_to_existing": false, // Set to true if this matches an existing project
      "existing_project_id": null, // Set to existing project ID if add_to_existing is true
      "deduplication_reasoning": "Explanation of deduplication decision (why new project or why adding to existing)",

      "suggested_tasks": [
        {
          "title": "Specific task title (max 255 chars)",
          "description": "Brief task description",
          "details": "Comprehensive details including:
- Event description
- Meeting attendees (if from calendar event)
- Location (if applicable)
- Meeting link (if available)
- Additional context or next steps",
          "status": "backlog",
          "priority": "medium", // low|medium|high based on urgency/importance
          "task_type": "one_off", // or "recurring" for repeating events
          "duration_minutes": 60, // Estimate based on event duration or task complexity
          "start_date": "YYYY-MM-DDTHH:MM:SS", // MUST be >= 2025-10-07T00:00:00, schedule intelligently
          "recurrence_pattern": "weekly", // Only if task_type is "recurring"
          "recurrence_ends": "YYYY-MM-DD", // Only if recurring
          "event_id": "linked-calendar-event-id", // Only if task is from an upcoming event
          "tags": ["optional", "task", "tags"]
        }
      ]
    }
  ]
}

**VALIDATION CHECKLIST** (verify before returning):
- [ ] Checked all calendar events against existing projects for duplicates
- [ ] Each suggestion has deduplication fields (add_to_existing, existing_project_id, deduplication_reasoning)
- [ ] ALL task start_date values are >= 2025-10-07
- [ ] NO tasks have dates in the past
- [ ] Task details include event metadata (attendees, location, links) when available
- [ ] Tasks either correspond to upcoming events OR are inferred next steps
- [ ] Project context incorporates insights from BOTH past and upcoming events
- [ ] All required fields are present
- [ ] Valid JSON that can be parsed

IMPORTANT:
- **Deduplication is CRITICAL** - always check against existing projects first
- Only suggest NEW projects if meaningfully different from existing ones
- Generate meaningful, actionable project names (not just event titles)
- Create rich, comprehensive context using the BuildOS framework
- **Enrich task details** with meeting metadata (attendees, location, links)
- **ALL tasks must have future dates (>= 2025-10-07)**
- Use proper date formats (YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM:SS for timestamps)
- Ensure all required fields are present
- The response must be valid JSON that can be parsed

```

## Token Estimates

- **System Prompt:** ~35 tokens
- **User Prompt:** ~3374 tokens
- **Total Estimate:** ~3409 tokens

---
*This file is automatically generated in development mode for prompt auditing purposes.*

---
date: 2025-10-07T02:58:00-04:00
researcher: Claude (Sonnet 4.5)
git_commit: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
branch: main
repository: buildos-platform
topic: 'Calendar Analysis 2-Part LLM Flow Redesign'
tags: [research, codebase, calendar-analysis, llm-optimization, architecture]
status: complete
last_updated: 2025-10-07
last_updated_by: Claude (Sonnet 4.5)
path: thoughts/shared/research/2025-10-07_02-58-00_calendar-analysis-2-part-llm-flow-redesign.md
---

# Research: Calendar Analysis 2-Part LLM Flow Redesign

**Date**: 2025-10-07T02:58:00-04:00
**Researcher**: Claude (Sonnet 4.5)
**Git Commit**: 6f9c8dc2b31bed0d2dd4f601c0bb7999f134c2c7
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should we redesign the calendar analysis flow to use a 2-part LLM process that:

1. First identifies project patterns from calendar events (without full data model complexity)
2. Then creates BuildOS projects with proper deduplication and task generation

The goal is to reduce prompt complexity, improve LLM focus, and produce higher quality project suggestions.

## Summary

The current calendar analysis service (`calendar-analysis.service.ts:264-644`) feeds too much data to a single LLM call (~3409 tokens), causing cognitive overload and quality issues. This research proposes a 2-part flow:

**Part 1: Event Pattern Analysis** - Groups related calendar events and identifies project themes
**Part 2: Project Creation** - Transforms event groups into BuildOS projects with deduplication

This separation allows each LLM call to focus on a specific task, reduces token usage per call, and produces higher quality results.

## Detailed Findings

### Current Flow Analysis

#### Current Implementation (`calendar-analysis.service.ts:264-644`)

```typescript
private async analyzeEventsWithAI({
  events,
  minConfidence = DEFAULT_CONFIDENCE_THRESHOLD,
  userId
}: {
  events: CalendarEvent[];
  minConfidence?: number;
  userId: string;
}): Promise<ProjectSuggestion[]>
```

**Single Prompt Contains:**

1. User's existing projects (up to 50, with truncated descriptions/summaries)
2. ALL past events (formatted as JSON arrays)
3. ALL upcoming events (formatted as JSON arrays)
4. Complete project data model with all fields
5. Complete task data model with recurring task rules
6. Full project context framework (6 sections)
7. Deduplication rules and instructions
8. Task generation rules with date validation
9. Complete JSON output schema
10. Validation checklist

**Estimated Token Count**: ~3409 tokens (from prompt audit file)

#### Problems with Current Approach

1. **Cognitive Overload**
    - LLM must simultaneously: understand events, identify patterns, check duplicates, generate context, create tasks, validate dates
    - Too many competing concerns leads to mistakes and generic output

2. **Token Inefficiency**
    - All events (300+ possible) sent with full details
    - Existing projects (50+) included even if not relevant
    - Full data models included even though only subset needed for initial grouping

3. **Quality Issues** (observed in code comments and validations)
    - LLM generates tasks with past dates despite explicit warnings (lines 604-617)
    - Projects sometimes have <2 tasks (lines 621-631)
    - Deduplication fields not consistently provided
    - Generic context that doesn't deeply incorporate event details

4. **Deduplication Data Loss**
    - Deduplication fields (`add_to_existing`, `existing_project_id`, `deduplication_reasoning`) requested in prompt
    - BUT not stored in database (lines 1164-1170) - missing from `event_patterns` object
    - This means deduplication decisions are lost even if LLM provides them

### Calendar Event Data Structure

From `calendar-service.ts:86-148`:

**Full CalendarEvent Interface includes:**

- Basic: `id`, `summary`, `description`, `status`, `location`
- Timing: `start`, `end`, `recurringEventId`, `timeZone`
- People: `creator`, `organizer`, `attendees` (with responseStatus)
- Meeting: `hangoutLink`, `conferenceData`, `location`
- Metadata: `colorId`, `eventType`, `visibility`, `transparency`
- Recurrence: `recurrence` (RRULE strings)

**Currently sent to LLM** (lines 386-419):

```typescript
{
  id: e.id,
  title: e.summary,
  description: e.description?.substring(0, 500), // Truncated
  start: e.start?.dateTime || e.start?.date,
  end: e.end?.dateTime || e.end?.date,
  attendees: e.attendees?.map((a) => a.email),
  organizer: e.organizer?.email,
  recurring: !!e.recurringEventId,
  status: e.status,
  location: e.location
}
```

**Available but NOT sent:**

- Conference links (hangoutLink, conferenceData)
- Attendee names and response statuses
- Event type (focusTime, outOfOffice)
- Full recurrence rules
- Visibility/transparency

### BuildOS Data Models

From research on `prompts/core/prompt-components.ts` and `data-models.ts`:

**Project Model**: 13 core fields

- Identity: name, slug, description, context, executive_summary
- Status: status, visibility
- Dates: start_date, end_date
- Metadata: tags, source, source_metadata
- Calendar: calendar_color_id, calendar_settings, calendar_sync_enabled

**Task Model**: 16+ fields

- Core: title, description, details
- Organization: project_id/project_ref, parent_task_id, tags, dependencies
- Status: status, priority, task_type
- Timing: start_date, duration_minutes
- Recurring: recurrence_pattern, recurrence_ends, recurrence_end_source
- Source: source, source_calendar_event_id

**Context Framework**: 6-section flexible structure

1. Situation & Environment
2. Purpose & Vision & Framing
3. Scope & Boundaries
4. Approach & Execution
5. Coordination & Control
6. Knowledge & Learning

### Project Deduplication System

From `project-data-fetcher.ts:258-286` and `data-formatter.ts:273-320`:

**Fetching Logic:**

```typescript
const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
	limit: 50,
	includeStatus: ['active', 'planning']
});
```

**Data Included in Summary:**

- id, name, slug
- description (truncated to 200 chars)
- executive_summary (truncated to 300 chars)
- tags, status, updated_at

**Data NOT Included:**

- Project context (richest semantic information)
- Tasks, phases, notes
- Start/end dates
- Paused or completed projects

**Formatting for LLM:**

```markdown
### Project 1: [Name]

**Description**: [200 chars]
**Summary**: [300 chars]
**Tags**: [list]
**Project ID**: `uuid`
```

## Proposed 2-Part Flow Architecture

### Overview

```
Calendar Events (300+)
      ↓
[Part 1: Event Pattern Analysis]
  - Lightweight event format
  - Focus: Group related events
  - Output: Event groups with themes
      ↓
Event Groups (5-15)
      ↓
[Part 2: Project Creation]
  - Full event details (only for grouped events)
  - Existing projects for deduplication
  - Complete BuildOS data models
  - Output: ProjectSuggestion[] with tasks
      ↓
Project Suggestions
```

### Part 1: Event Pattern Analysis

**Purpose**: Pure pattern recognition - group related calendar events and identify project themes

**Input Data:**

```typescript
interface EventPatternInput {
	events: LightweightCalendarEvent[];
	dateContext: {
		today: string;
		analysisRangeStart: string;
		analysisRangeEnd: string;
	};
}

interface LightweightCalendarEvent {
	id: string;
	title: string;
	description_snippet: string; // First 200 chars
	start: string;
	end: string;
	is_recurring: boolean;
	attendee_count: number;
	is_organizer: boolean;
	location?: string;
}
```

**Prompt Focus:**

1. Identify patterns in event titles/descriptions
2. Group events that seem related
3. Detect recurring meetings (same title, similar attendees)
4. Identify project-indicating keywords
5. Suggest high-level project themes

**Output Schema:**

```typescript
interface EventGroupAnalysis {
	groups: EventGroup[];
	ungrouped_event_ids: string[]; // Events that don't fit any pattern
}

interface EventGroup {
	group_id: string; // Generated: "group-1", "group-2", etc.

	// High-level project identification
	project_theme: string; // e.g., "Marketing Campaign Planning"
	suggested_project_name: string; // e.g., "Q4 Marketing Campaign"
	confidence: number; // 0-1 score

	// Event relationships
	event_ids: string[]; // IDs of events in this group
	event_count: number;

	// Pattern analysis
	keywords: string[]; // Keywords that indicated this pattern
	recurring_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
	meeting_series: boolean; // Is this a recurring meeting series?

	// Context
	reasoning: string; // Why these events were grouped together
	key_participants: string[]; // Unique email addresses across events
	time_range: {
		earliest_event: string;
		latest_event: string;
	};

	// Preliminary metadata
	estimated_start_date: string; // YYYY-MM-DD
	estimated_end_date: string | null; // YYYY-MM-DD or null if ongoing
	suggested_tags: string[];
}
```

**Benefits:**

- Lightweight event format (50-70% token reduction)
- No existing projects needed (not checking duplicates yet)
- No complex data models (not creating projects yet)
- Single clear task: "find patterns and group related events"
- Fast response (smaller context, simpler task)

**Estimated Token Count**: ~1000-1500 tokens (vs ~3409 currently)

### Part 2: Project & Task Creation

**Purpose**: Transform event groups into BuildOS projects with proper deduplication and task generation

**Input Data:**

```typescript
interface ProjectCreationInput {
	event_groups: EventGroup[]; // From Part 1
	full_event_details: Record<string, CalendarEvent>; // Only events in groups
	existing_projects: ProjectSummary[]; // For deduplication
	dateContext: {
		today: string;
	};
}
```

**Prompt Focus:**

1. Check each event group against existing projects (deduplication)
2. Generate comprehensive project context using BuildOS framework
3. Create appropriate tasks from calendar events
4. Schedule tasks intelligently
5. Follow BuildOS data models exactly

**Output Schema:**

```typescript
interface ProjectCreationResult {
	suggestions: ProjectSuggestion[];
}

interface ProjectSuggestion {
	// Source reference
	event_group_id: string; // Reference to group from Part 1

	// Project fields (BuildOS model)
	name: string;
	slug: string;
	description: string;
	context: string; // Rich markdown following framework
	executive_summary: string;
	status: 'active' | 'paused' | 'completed' | 'archived';
	start_date: string; // YYYY-MM-DD
	end_date?: string; // YYYY-MM-DD
	tags: string[];

	// Calendar analysis metadata
	event_ids: string[]; // All event IDs in this project
	confidence: number;
	reasoning: string;
	keywords: string[];

	// Deduplication (CRITICAL - must be stored)
	add_to_existing: boolean;
	existing_project_id: string | null;
	deduplication_reasoning: string; // Always required

	// Tasks
	suggested_tasks: TaskSuggestion[];
}

interface TaskSuggestion {
	// Task fields (BuildOS model)
	title: string;
	description: string;
	details: string; // Comprehensive event details
	status: 'backlog' | 'in_progress' | 'done' | 'blocked';
	priority: 'low' | 'medium' | 'high';
	task_type: 'one_off' | 'recurring';
	duration_minutes?: number;
	start_date?: string; // YYYY-MM-DDTHH:MM:SS (MUST be >= today)
	recurrence_pattern?:
		| 'daily'
		| 'weekdays'
		| 'weekly'
		| 'biweekly'
		| 'monthly'
		| 'quarterly'
		| 'yearly';
	recurrence_ends?: string; // YYYY-MM-DD
	event_id?: string; // Linked calendar event
	tags?: string[];
}
```

**Benefits:**

- Event groups already identified (no need to rediscover patterns)
- Only relevant events included (not all 300+)
- Can dedicate tokens to rich context generation
- Deduplication check is focused and thorough
- Task generation informed by pre-identified patterns

**Estimated Token Count**: ~1500-2000 tokens per batch of 5 groups

### Implementation Strategy

#### Method 1: Sequential Processing (Recommended)

```typescript
async analyzeUserCalendar(userId: string, options): Promise<AnalysisResult> {
  // Step 1: Fetch and filter events
  const events = await this.calendarService.getCalendarEvents(userId, ...);
  const relevantEvents = this.filterRelevantEvents(events);

  // Step 2: Part 1 - Event Pattern Analysis
  const eventGroups = await this.analyzeEventPatterns({
    events: relevantEvents,
    userId
  });

  // Step 3: Part 2 - Project Creation (with deduplication)
  const suggestions = await this.createProjectsFromGroups({
    eventGroups,
    events: relevantEvents, // Full event details
    userId
  });

  // Step 4: Store and return
  await this.storeSuggestions(analysis.id, userId, suggestions);
  return { analysisId: analysis.id, suggestions, eventsAnalyzed: relevantEvents.length };
}
```

#### Method 2: Batched Processing (For Many Events)

If event groups > 10, process in batches:

```typescript
async createProjectsFromGroups(input): Promise<ProjectSuggestion[]> {
  const batchSize = 5; // Process 5 groups at a time
  const batches = chunk(input.eventGroups, batchSize);

  const allSuggestions: ProjectSuggestion[] = [];

  for (const batch of batches) {
    const batchSuggestions = await this.createProjectsFromGroupBatch({
      eventGroups: batch,
      events: input.events,
      existingProjects: input.existingProjects,
      userId: input.userId
    });
    allSuggestions.push(...batchSuggestions);
  }

  return allSuggestions;
}
```

## Code References

### Files to Modify

1. **`calendar-analysis.service.ts`** (primary changes)
    - Split `analyzeEventsWithAI` into two methods:
        - `analyzeEventPatterns()` - Part 1
        - `createProjectsFromGroups()` - Part 2
    - Update `analyzeUserCalendar()` orchestration (lines 112-216)
    - Fix deduplication field storage (lines 1164-1170)

2. **`calendar-analysis.service.ts:1144-1181`** (bug fix)
    - Add deduplication fields to `event_patterns` object:

    ```typescript
    event_patterns: {
      executive_summary: suggestion.executive_summary,
      start_date: suggestion.start_date,
      end_date: suggestion.end_date,
      tags: suggestion.tags,
      slug: suggestion.slug,
      // ADD THESE:
      add_to_existing: suggestion.add_to_existing,
      existing_project_id: suggestion.existing_project_id,
      deduplication_reasoning: suggestion.deduplication_reasoning
    }
    ```

3. **New Prompt Files** (create these)
    - `/apps/web/docs/prompts/calendar-analysis/part1-event-grouping-prompt.md`
    - `/apps/web/docs/prompts/calendar-analysis/part2-project-creation-prompt.md`

4. **Potentially Update Schema** (if needed)
    - Consider dedicated columns for deduplication fields instead of JSONB
    - `calendar_project_suggestions` table might benefit from explicit columns

### Key Functions to Reference

- `getProjectModel()` - `/apps/web/src/lib/services/prompts/core/prompt-components.ts:75`
- `getTaskModel()` - `/apps/web/src/lib/services/prompts/core/prompt-components.ts:154`
- `generateProjectContextFramework()` - `/apps/web/src/lib/services/prompts/core/prompt-components.ts:377`
- `getAllUserProjectsSummary()` - `/apps/web/src/lib/services/prompts/core/project-data-fetcher.ts:258`
- `formatProjectsSummaryList()` - `/apps/web/src/lib/services/prompts/core/data-formatter.ts:273`
- `filterRelevantEvents()` - `/apps/web/src/lib/services/calendar-analysis.service.ts:221`

## Detailed Implementation Spec

### Part 1: Event Pattern Analysis Implementation

#### New Method Signature

```typescript
private async analyzeEventPatterns({
  events,
  userId
}: {
  events: CalendarEvent[];
  userId: string;
}): Promise<EventGroup[]>
```

#### Prompt Template (Part 1)

```markdown
You are analyzing calendar events to identify patterns and group related events that might represent projects.

**Today's date**: ${today}

## Your Task

Group related calendar events and identify project themes. Focus on:

1. Recurring meetings with similar titles/attendees
2. Clusters of events around similar topics
3. Project-indicating keywords (sprint, launch, milestone, review, planning, etc.)
4. Series of events building toward a goal

## Calendar Events (${events.length} total)

${JSON.stringify(events.map(e => ({
id: e.id,
title: e.summary,
description_snippet: e.description?.substring(0, 200),
start: e.start?.dateTime || e.start?.date,
end: e.end?.dateTime || e.end?.date,
is_recurring: !!e.recurringEventId,
attendee_count: e.attendees?.length || 0,
is_organizer: e.organizer?.self || false,
location: e.location
})), null, 2)}

## Output Format

Return JSON with this structure:

{
"groups": [
{
"group_id": "group-1",
"project_theme": "High-level theme description",
"suggested_project_name": "Specific project name",
"confidence": 0.8,
"event_ids": ["event-1", "event-2", ...],
"event_count": 5,
"keywords": ["keyword1", "keyword2"],
"recurring_pattern": "weekly" or null,
"meeting_series": true or false,
"reasoning": "Why these events were grouped together",
"key_participants": ["email1@example.com", "email2@example.com"],
"time_range": {
"earliest_event": "YYYY-MM-DD",
"latest_event": "YYYY-MM-DD"
},
"estimated_start_date": "YYYY-MM-DD",
"estimated_end_date": "YYYY-MM-DD" or null,
"suggested_tags": ["tag1", "tag2"]
}
],
"ungrouped_event_ids": ["event-x", "event-y"]
}

## Guidelines

- Only group events that are clearly related
- Confidence >= 0.5 for grouping (be selective)
- One event can only belong to one group
- Ungrouped events go in `ungrouped_event_ids`
- Be specific with project names (not just "Team Sync")
- Include ALL relevant events in time_range calculation
```

#### Processing Logic

```typescript
private async analyzeEventPatterns({
  events,
  userId
}: {
  events: CalendarEvent[];
  userId: string;
}): Promise<EventGroup[]> {
  const today = new Date().toISOString().split('T')[0];

  // Create lightweight event format
  const lightweightEvents = events.map(e => ({
    id: e.id || 'unknown',
    title: e.summary,
    description_snippet: e.description?.substring(0, 200),
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    is_recurring: !!e.recurringEventId,
    attendee_count: e.attendees?.length || 0,
    is_organizer: e.organizer?.self || false,
    location: e.location
  }));

  const systemPrompt = `You are an expert at analyzing calendar patterns to identify potential projects. Always respond with valid JSON following the specified schema.`;

  const userPrompt = `[Insert Part 1 prompt template from above]`;

  // Save prompt for auditing
  await savePromptForAudit({
    systemPrompt,
    userPrompt,
    scenarioType: 'calendar-analysis-part1-event-grouping',
    metadata: {
      userId,
      eventCount: events.length,
      timestamp: new Date().toISOString()
    }
  });

  // Call LLM
  const response = await this.llmService.getJSONResponse<EventGroupAnalysis>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'balanced',
    temperature: 0.3,
    validation: {
      retryOnParseError: true,
      validateSchema: true,
      maxRetries: 2
    },
    operationType: 'calendar_analysis_part1'
  });

  if (DEBUG_LOGGING) {
    console.log(`[Calendar Analysis Part 1] Generated ${response.groups.length} event groups`);
    console.log(`[Calendar Analysis Part 1] Ungrouped events: ${response.ungrouped_event_ids.length}`);
  }

  return response.groups;
}
```

### Part 2: Project Creation Implementation

#### New Method Signature

```typescript
private async createProjectsFromGroups({
  eventGroups,
  events,
  userId
}: {
  eventGroups: EventGroup[];
  events: CalendarEvent[];
  userId: string;
}): Promise<ProjectSuggestion[]>
```

#### Prompt Template (Part 2)

```markdown
You are creating BuildOS projects from calendar event groups with proper deduplication.

**Today's date**: ${today}

## User's Existing Projects

${projectsContext || 'No existing projects found.'}

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: Check each event group against existing projects above.

1. **If match found** (confidence >= 70%):
    - Set "add_to_existing": true
    - Set "existing_project_id": "uuid"
    - Set "deduplication_reasoning": "Why this matches"
    - Still generate tasks to add to existing project

2. **Only create NEW project if**:
    - No semantic match with existing projects
    - Events represent meaningfully different work

3. **When uncertain** (50-70%):
    - Err on side of adding to existing projects

## Event Groups to Process

You've already identified ${eventGroups.length} event groups. Now create BuildOS projects for each group.

${eventGroups.map((group, idx) => `

### Group ${idx + 1}: ${group.project_theme}

**Suggested Name**: ${group.suggested_project_name}
**Confidence**: ${group.confidence}
**Event Count**: ${group.event_count}
**Keywords**: ${group.keywords.join(', ')}
**Time Range**: ${group.time_range.earliest_event} to ${group.time_range.latest_event}
**Reasoning**: ${group.reasoning}

**Events in this group**:
${JSON.stringify(
group.event_ids.map(id => {
const event = events.find(e => e.id === id);
return {
id: event?.id,
title: event?.summary,
description: event?.description?.substring(0, 500),
start: event?.start?.dateTime || event?.start?.date,
end: event?.end?.dateTime || event?.end?.date,
attendees: event?.attendees?.map(a => a.email),
organizer: event?.organizer?.email,
location: event?.location,
hangoutLink: event?.hangoutLink
};
}),
null,
2
)}
`).join('\n---\n')}

## Data Models

### Project Model (REQUIRED structure):

${getProjectModel(true)}

### Task Model (REQUIRED structure):

${getTaskModel({ includeRecurring: true, includeProjectRef: false })}

${generateProjectContextFramework('condensed')}

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

      // Tasks (minimum 2 per project)
      "suggested_tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "details": "Comprehensive details including event info",
          "status": "backlog",
          "priority": "medium",
          "task_type": "one_off",
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

1. **ALL tasks must have start_date >= ${today}**
2. **Minimum 2 tasks per project**
3. **ALWAYS provide deduplication_reasoning** (even if creating new project)
4. **Include meeting details** in task details (attendees, location, hangoutLink)
5. **Rich context** using BuildOS framework
6. **Exact data model compliance**
```

#### Processing Logic

```typescript
private async createProjectsFromGroups({
  eventGroups,
  events,
  userId
}: {
  eventGroups: EventGroup[];
  events: CalendarEvent[];
  userId: string;
}): Promise<ProjectSuggestion[]> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch existing projects for deduplication
  const projectDataFetcher = new ProjectDataFetcher(this.supabase);
  const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
    limit: 50,
    includeStatus: ['active', 'planning']
  });

  const projectsContext = formatProjectsSummaryList(existingProjects || []);

  if (DEBUG_LOGGING) {
    console.log(`[Calendar Analysis Part 2] Processing ${eventGroups.length} event groups`);
    console.log(`[Calendar Analysis Part 2] Checking against ${existingProjects?.length || 0} existing projects`);
  }

  // Build prompt with event groups and full event details
  const systemPrompt = `You are an expert in creating structured projects from calendar event patterns. Always respond with valid JSON following the specified schema.`;

  const userPrompt = `[Insert Part 2 prompt template from above]`;

  // Save prompt for auditing
  await savePromptForAudit({
    systemPrompt,
    userPrompt,
    scenarioType: 'calendar-analysis-part2-project-creation',
    metadata: {
      userId,
      eventGroupCount: eventGroups.length,
      existingProjectCount: existingProjects?.length || 0,
      timestamp: new Date().toISOString()
    }
  });

  // Call LLM
  const response = await this.llmService.getJSONResponse<{
    suggestions: ProjectSuggestion[];
  }>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'balanced',
    temperature: 0.3,
    validation: {
      retryOnParseError: true,
      validateSchema: true,
      maxRetries: 2
    },
    operationType: 'calendar_analysis_part2'
  });

  const suggestions = response.suggestions || [];

  if (DEBUG_LOGGING) {
    console.log(`[Calendar Analysis Part 2] Generated ${suggestions.length} project suggestions`);
    console.log(`[Calendar Analysis Part 2] Deduplication results:`,
      suggestions.map(s => ({
        name: s.name,
        add_to_existing: s.add_to_existing,
        existing_project_id: s.existing_project_id
      }))
    );
  }

  // Validate suggestions
  this.validateProjectSuggestions(suggestions, today);

  return suggestions;
}

private validateProjectSuggestions(suggestions: ProjectSuggestion[], today: string): void {
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);

  suggestions.forEach(suggestion => {
    // Check for past-dated tasks
    if (suggestion.suggested_tasks && Array.isArray(suggestion.suggested_tasks)) {
      const pastTasks = suggestion.suggested_tasks.filter(task => {
        if (!task.start_date) return false;
        const taskDate = new Date(task.start_date);
        return taskDate < todayDate;
      });

      if (pastTasks.length > 0) {
        console.warn(
          `[Calendar Analysis] WARNING: Project "${suggestion.name}" has ${pastTasks.length} task(s) with past dates`,
          pastTasks.map(t => ({ title: t.title, start_date: t.start_date }))
        );
      }
    }

    // Check for minimum task count
    const taskCount = suggestion.suggested_tasks?.length || 0;
    if (taskCount < 2) {
      console.warn(
        `[Calendar Analysis] WARNING: Project "${suggestion.name}" has only ${taskCount} task(s). Minimum 2 expected.`
      );
    }

    // Check for deduplication fields
    if (suggestion.deduplication_reasoning === undefined || suggestion.deduplication_reasoning === null) {
      console.warn(
        `[Calendar Analysis] WARNING: Project "${suggestion.name}" missing deduplication_reasoning field`
      );
    }
  });
}
```

### Updating the Main Orchestration Method

```typescript
async analyzeUserCalendar(
  userId: string,
  options: {
    daysBack?: number;
    daysForward?: number;
    calendarsToAnalyze?: string[];
  } = {}
): Promise<AnalysisResult> {
  const { daysBack = 30, daysForward = 60 } = options;

  // Create analysis record
  const analysis = await this.createAnalysisRecord(userId, {
    date_range_start: dayjs().subtract(daysBack, 'days').format('YYYY-MM-DD'),
    date_range_end: dayjs().add(daysForward, 'days').format('YYYY-MM-DD'),
    calendars_analyzed: options.calendarsToAnalyze || []
  });

  try {
    // Step 1: Fetch calendar events
    const eventsResponse = await this.calendarService.getCalendarEvents(userId, {
      timeMin: dayjs().subtract(daysBack, 'days').toISOString(),
      timeMax: dayjs().add(daysForward, 'days').toISOString(),
      maxResults: 300,
      calendarId: 'primary'
    });

    if (!eventsResponse.events || eventsResponse.events.length === 0) {
      throw new Error('No calendar events found');
    }

    const events = eventsResponse.events;

    if (DEBUG_LOGGING) {
      console.log(`[Calendar Analysis] Total events fetched: ${events.length}`);
    }

    // Step 2: Filter relevant events
    const relevantEvents = this.filterRelevantEvents(events);

    if (DEBUG_LOGGING) {
      console.log(`[Calendar Analysis] Relevant events: ${relevantEvents.length}`);
    }

    // Step 3: Store event snapshots
    await this.storeAnalysisEvents(analysis.id, relevantEvents);

    // Step 4: Part 1 - Analyze event patterns and group them
    const eventGroups = await this.analyzeEventPatterns({
      events: relevantEvents,
      userId
    });

    if (DEBUG_LOGGING) {
      console.log(`[Calendar Analysis] Event groups identified: ${eventGroups.length}`);
    }

    // Step 5: Part 2 - Create projects from event groups with deduplication
    const suggestions = await this.createProjectsFromGroups({
      eventGroups,
      events: relevantEvents,
      userId
    });

    if (DEBUG_LOGGING) {
      console.log(`[Calendar Analysis] Project suggestions generated: ${suggestions.length}`);
    }

    // Step 6: Store suggestions
    await this.storeSuggestions(analysis.id, userId, suggestions);

    // Step 7: Get stored suggestions with full data
    const storedSuggestions = await this.getSuggestionsForAnalysis(analysis.id);

    // Step 8: Update analysis record
    await this.updateAnalysisRecord(analysis.id, {
      status: 'completed',
      events_analyzed: relevantEvents.length,
      events_excluded: events.length - relevantEvents.length,
      projects_suggested: suggestions.length,
      confidence_average:
        suggestions.length > 0
          ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
          : null,
      completed_at: new Date().toISOString()
    });

    return {
      analysisId: analysis.id,
      suggestions: storedSuggestions,
      eventsAnalyzed: relevantEvents.length
    };
  } catch (error) {
    await this.updateAnalysisRecord(analysis.id, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });

    this.errorLogger.logError(error, {
      userId,
      metadata: {
        operation: 'calendar_analysis',
        analysisId: analysis.id
      }
    });

    throw error;
  }
}
```

### Fixing Deduplication Field Storage

**Current code** (`calendar-analysis.service.ts:1164-1170`):

```typescript
event_patterns: {
  executive_summary: suggestion.executive_summary,
  start_date: suggestion.start_date,
  end_date: suggestion.end_date,
  tags: suggestion.tags,
  slug: suggestion.slug
}
```

**Fixed code**:

```typescript
event_patterns: {
  executive_summary: suggestion.executive_summary,
  start_date: suggestion.start_date,
  end_date: suggestion.end_date,
  tags: suggestion.tags,
  slug: suggestion.slug,
  // CRITICAL: Store deduplication fields
  add_to_existing: suggestion.add_to_existing,
  existing_project_id: suggestion.existing_project_id,
  deduplication_reasoning: suggestion.deduplication_reasoning
}
```

## Architecture Insights

### Token Efficiency Gains

**Current Single-Prompt Approach:**

- Base prompt: ~800 tokens
- Existing projects (50): ~1000 tokens
- Events (300): ~1200 tokens
- Data models + framework: ~400 tokens
- **Total: ~3400 tokens**

**New 2-Part Approach:**

- **Part 1**: ~1000-1500 tokens (lightweight events only)
- **Part 2**: ~1500-2000 tokens per batch of 5 groups
- **Total**: ~2500-3500 tokens (similar), BUT:
    - Each prompt is focused (better quality)
    - Part 2 can be batched (process 5 groups at a time)
    - Overall better token efficiency for large event sets

### Quality Improvements Expected

1. **Better Event Grouping**
    - Part 1 dedicated to pattern recognition
    - No distraction from data models or deduplication
    - Can focus on semantic relationships

2. **Better Deduplication**
    - Part 2 has pre-grouped events
    - Can focus on comparing project theme to existing projects
    - Not overwhelmed by event processing

3. **Richer Context**
    - Part 2 can dedicate tokens to comprehensive context
    - Has event groups already identified
    - Can reference group patterns in context

4. **Better Task Generation**
    - Understanding from Part 1 grouping
    - Can create tasks that align with project pattern
    - More thoughtful task scheduling

### Error Handling Considerations

1. **Part 1 Failure**
    - If Part 1 fails, entire analysis fails
    - Could fall back to single-prompt approach
    - Or return error and let user retry

2. **Part 2 Failure**
    - If Part 2 fails on one batch, continue with others
    - Could retry failed batch
    - Return partial results if some batches succeed

3. **LLM Hallucinations**
    - Part 1: Validate all event IDs exist
    - Part 2: Validate all group IDs reference Part 1 output
    - Validate all dates are in correct format

## Open Questions

1. **Should we store event groups?**
    - Pros: Can show user how events were grouped, debug issues
    - Cons: Additional database complexity
    - **Recommendation**: Store in analysis metadata JSONB field

2. **Should we allow user to modify grouping?**
    - Could show event groups to user before Part 2
    - Let user merge/split groups
    - **Recommendation**: Future enhancement, not MVP

3. **How to handle ungrouped events?**
    - Could run Part 2 on ungrouped events as individual projects
    - Or just log and ignore them
    - **Recommendation**: Log for now, revisit if users want them

4. **Should we enhance existing project context?**
    - If adding to existing project, could fetch existing context
    - Use it to inform new task generation
    - **Recommendation**: Yes, fetch in Part 2 if `add_to_existing: true`

5. **Batch size for Part 2?**
    - 5 groups per call seems reasonable
    - Could make configurable
    - **Recommendation**: Start with 5, monitor token usage

6. **Should we include more event fields in Part 1?**
    - conferenceData, attendee names, event type
    - Trade-off: More context vs token usage
    - **Recommendation**: Start minimal, add if needed

## Related Research

- `/thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md` - System design patterns
- `/apps/web/docs/features/calendar-integration/calendar-analysis-implementation-status.md` - Current implementation status
- `/apps/web/docs/features/calendar-integration/calendar-analysis-bugs-investigation.md` - Known issues

## Summary and Recommendations

### Immediate Actions (MVP)

1. ✅ **Split `analyzeEventsWithAI` into two methods**
    - `analyzeEventPatterns()` for Part 1
    - `createProjectsFromGroups()` for Part 2

2. ✅ **Fix deduplication field storage bug**
    - Add `add_to_existing`, `existing_project_id`, `deduplication_reasoning` to `event_patterns`

3. ✅ **Create new prompt templates**
    - Part 1: Event grouping prompt
    - Part 2: Project creation prompt

4. ✅ **Update orchestration in `analyzeUserCalendar()`**
    - Call Part 1, then Part 2
    - Handle errors appropriately

### Future Enhancements

1. **Batched Part 2 processing** for many event groups (>10)
2. **Store event groups** in analysis metadata for debugging
3. **User review of grouping** before project creation
4. **Enhanced context** for existing projects when adding tasks
5. **Include more event fields** if quality improves (conference links, attendee names)
6. **Dedicated deduplication columns** in schema (instead of JSONB)
7. **Include paused/completed projects** in deduplication check

### Success Metrics

Track these to measure improvement:

- Average project suggestions per analysis
- Deduplication accuracy (% correctly matched to existing projects)
- Task date validation pass rate (% tasks with future dates)
- Average tasks per project (should be ≥2)
- User acceptance rate of suggestions
- Token usage per analysis
- LLM call latency

---

**Status**: Ready for implementation
**Priority**: High (quality improvement + bug fix)
**Estimated Effort**: 2-3 days (1 day split + prompts, 1 day testing, 0.5 day refinement)
**Risk Level**: Medium (requires careful prompt engineering)
**Dependencies**: None (self-contained change in calendar-analysis.service.ts)

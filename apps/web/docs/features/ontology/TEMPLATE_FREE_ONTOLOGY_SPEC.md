<!-- apps/web/docs/features/ontology/TEMPLATE_FREE_ONTOLOGY_SPEC.md -->

# Template-Free Ontology System Specification

**Date**: December 10, 2025
**Status**: Design Specification
**Supersedes**: All template-related documentation

---

## Executive Summary

BuildOS is transitioning from a **template-driven ontology** to a **dynamic props-based ontology**. This change:

- **Removes** the `onto_templates` table entirely
- **Keeps** `type_key` as a simple classification string (no template lookup)
- **Keeps** `props` JSONB columns for flexible, AI-inferred properties
- **Moves** state transition logic to the application/AI layer

The key insight: Templates added complexity without proportional value. The AI should infer relevant properties from conversation context, not match against predefined schemas.

---

## Core Principles

### 1. Props Are Inferred, Not Declared

Props are discovered through conversation with the user:

- AI asks clarifying questions about project scope/complexity
- User responses are extracted into structured props
- Props accumulate over time as more context is gathered

### 2. Type Key Is Just a Category

`type_key` remains as a classification string for:

- UI routing and rendering
- Query filtering
- AI context (knowing what kind of entity this is)

But it does NOT:

- Link to a template table
- Enforce a schema
- Define an FSM

### 3. State Is Simple

States are basic lifecycle phases, handled at the application layer:

- Projects: `draft → active → complete → archived`
- Tasks: `todo → in_progress → done → abandoned`
- Documents: `draft → published`

Complex guards and actions are handled by AI/application logic, not database FSMs.

---

## Props Naming Guidance

### Naming Conventions

| Rule        | Convention         | Example                                       |
| ----------- | ------------------ | --------------------------------------------- |
| **Case**    | `snake_case`       | `target_word_count`, not `targetWordCount`    |
| **Prefix**  | No type prefixes   | `deadline`, not `date_deadline`               |
| **Boolean** | `is_*` or `has_*`  | `is_fiction`, `has_illustrations`             |
| **Counts**  | `*_count`          | `chapter_count`, `session_count`              |
| **Targets** | `target_*`         | `target_word_count`, `target_completion_date` |
| **Dates**   | `*_at` or `*_date` | `started_at`, `deadline_date`                 |
| **Enums**   | Singular noun      | `status`, `priority`, `genre`                 |

### Prop Value Types

```typescript
type PropValue =
	| string // "fantasy", "high"
	| number // 50000, 10
	| boolean // true, false
	| string[] // ["chapter-1", "chapter-2"]
	| Date // ISO 8601 string in practice
	| Record<string, PropValue>; // Nested objects (use sparingly)
```

**Avoid**:

- Deeply nested objects (prefer flat props)
- Arrays of objects (use edges for relationships)
- Computed/derived values (compute at query time)

---

## Standard Props by Entity Type

### Projects (`onto_projects`)

#### Universal Project Props

These apply to ALL projects regardless of type:

```typescript
interface UniversalProjectProps {
	// Scope & Complexity
	complexity?: 'simple' | 'moderate' | 'complex' | 'epic';
	estimated_duration?: string; // "2 weeks", "3 months"

	// Context
	context?: 'personal' | 'client' | 'commercial' | 'academic' | 'open_source';
	audience?: string; // "executives", "developers", "general public"

	// Status tracking
	completion_percentage?: number; // 0-100
	blockers?: string[];

	// Metadata
	tags?: string[];
	notes?: string;
}
```

#### Domain-Specific Project Props

**Creative Projects** (`project.creative.*`)

```typescript
interface CreativeProjectProps {
	// Writing
	genre?: string; // "fantasy", "sci-fi", "memoir", "business"
	target_word_count?: number;
	current_word_count?: number;
	writing_stage?: 'ideation' | 'outlining' | 'drafting' | 'editing' | 'polishing';

	// Book-specific
	chapter_count?: number;
	target_chapter_count?: number;
	working_title?: string;

	// Content
	tone?: string; // "formal", "casual", "humorous"
	target_reading_level?: string;
	is_fiction?: boolean;

	// Publishing
	target_publisher?: string;
	submission_deadline?: string;
	has_agent?: boolean;
}
```

**Technical Projects** (`project.technical.*`)

```typescript
interface TechnicalProjectProps {
	// Stack
	tech_stack?: string[]; // ["svelte", "supabase", "typescript"]
	platform?: string; // "web", "mobile", "desktop", "api"

	// Scope
	feature_count?: number;
	is_mvp?: boolean;
	has_existing_codebase?: boolean;

	// Architecture
	architecture_style?: string; // "monolith", "microservices", "serverless"
	database_type?: string;

	// Deployment
	hosting_provider?: string;
	deployment_strategy?: string;

	// Quality
	has_tests?: boolean;
	test_coverage_target?: number;
}
```

**Business Projects** (`project.business.*`)

```typescript
interface BusinessProjectProps {
	// Venture
	business_model?: string; // "saas", "marketplace", "agency"
	target_market?: string;
	value_proposition?: string;

	// Metrics
	target_revenue?: number;
	target_customers?: number;
	current_mrr?: number;

	// Stage
	funding_stage?: string; // "bootstrapped", "pre-seed", "seed", "series-a"
	has_launched?: boolean;
	launch_date?: string;

	// Team
	team_size?: number;
	hiring_roles?: string[];
}
```

**Service Projects** (`project.service.*`)

```typescript
interface ServiceProjectProps {
	// Client
	client_name?: string;
	client_industry?: string;
	engagement_type?: 'one-time' | 'retainer' | 'project-based';

	// Scope
	session_count?: number;
	session_duration_minutes?: number;
	deliverables?: string[];

	// Timeline
	engagement_start_date?: string;
	engagement_end_date?: string;

	// Pricing
	rate_type?: 'hourly' | 'fixed' | 'value-based';
	total_value?: number;
}
```

**Education Projects** (`project.education.*`)

```typescript
interface EducationProjectProps {
	// Course/Learning
	subject?: string;
	institution?: string;
	instructor?: string;

	// Progress
	module_count?: number;
	current_module?: number;

	// Assessment
	has_certification?: boolean;
	grade_target?: string;

	// Research
	thesis_topic?: string;
	advisor?: string;
	defense_date?: string;
}
```

**Personal Projects** (`project.personal.*`)

```typescript
interface PersonalProjectProps {
	// Goal
	goal_type?: 'habit' | 'milestone' | 'transformation';
	motivation?: string;

	// Tracking
	frequency?: string; // "daily", "weekly", "3x per week"
	streak_count?: number;
	best_streak?: number;

	// Health/Wellness
	target_metric?: string; // "weight", "steps", "meditation minutes"
	target_value?: number;
	current_value?: number;
}
```

---

### Tasks (`onto_tasks`)

```typescript
interface TaskProps {
	// Effort
	estimated_minutes?: number;
	actual_minutes?: number;
	complexity?: 'trivial' | 'simple' | 'moderate' | 'complex';

	// Context
	energy_required?: 'low' | 'medium' | 'high';
	focus_required?: 'shallow' | 'deep';
	location_constraint?: string; // "office", "home", "anywhere"

	// Dependencies
	blocked_by?: string; // Task ID or description
	blocks?: string[];

	// Recurrence (if applicable)
	is_recurring?: boolean;
	recurrence_pattern?: string; // RRULE format

	// Metadata
	tags?: string[];
	notes?: string;

	// AI-inferred
	suggested_time_of_day?: 'morning' | 'afternoon' | 'evening';
	suggested_duration_minutes?: number;
}
```

---

### Documents (`onto_documents`)

```typescript
interface DocumentProps {
	// Content
	word_count?: number;
	format?: 'markdown' | 'rich_text' | 'plain';

	// Structure
	section_count?: number;
	has_table_of_contents?: boolean;

	// Metadata
	author?: string;
	version?: string;
	last_reviewed_at?: string;

	// Purpose
	document_purpose?: 'reference' | 'decision' | 'context' | 'spec' | 'notes';
	audience?: string;

	// Storage
	storage_uri?: string;
	embedding_id?: string;
}
```

---

### Plans (`onto_plans`)

```typescript
interface PlanProps {
	// Timeframe
	start_date?: string;
	end_date?: string;
	duration_days?: number;

	// Scope
	task_count?: number;
	completed_task_count?: number;

	// Type
	plan_type?: 'sprint' | 'weekly' | 'phase' | 'milestone';
	iteration_number?: number;

	// Goals
	primary_goal?: string;
	success_criteria?: string[];
}
```

---

### Goals (`onto_goals`)

```typescript
interface GoalProps {
	// Definition
	goal_type?: 'outcome' | 'output' | 'habit' | 'learning';
	measurable_target?: string;

	// Tracking
	current_progress?: number; // 0-100 or actual value
	target_value?: number;
	unit?: string; // "words", "dollars", "sessions"

	// Timeline
	target_date?: string;

	// Hierarchy
	parent_goal_id?: string;
	is_key_result?: boolean; // OKR pattern
}
```

---

### Milestones (`onto_milestones`)

```typescript
interface MilestoneProps {
	// Definition
	milestone_type?: 'deliverable' | 'decision' | 'event' | 'checkpoint';

	// Dependencies
	required_tasks?: string[];
	required_outputs?: string[];

	// Celebration
	reward?: string;
	announcement?: string;
}
```

---

## Type Key Taxonomy (Without Templates)

Type keys remain as classification strings. Format:

```
{scope}.{realm}.{deliverable}[.{variant}]
```

### Projects

| Type Key                     | Description               |
| ---------------------------- | ------------------------- |
| `project.creative.book`      | Writing a book            |
| `project.creative.article`   | Article/essay/blog        |
| `project.creative.content`   | General content creation  |
| `project.technical.app`      | Building an application   |
| `project.technical.feature`  | Feature development       |
| `project.technical.api`      | API development           |
| `project.business.startup`   | Starting a company        |
| `project.business.launch`    | Product launch            |
| `project.business.campaign`  | Marketing campaign        |
| `project.service.coaching`   | Coaching engagement       |
| `project.service.consulting` | Consulting project        |
| `project.education.course`   | Taking a course           |
| `project.education.research` | Research project          |
| `project.personal.habit`     | Building a habit          |
| `project.personal.goal`      | Achieving a personal goal |

### Tasks

Task type keys describe the **work mode**:

| Type Key          | Description              |
| ----------------- | ------------------------ |
| `task.execute`    | Action/do task (default) |
| `task.create`     | Produce new artifact     |
| `task.refine`     | Improve existing work    |
| `task.research`   | Investigate/gather info  |
| `task.review`     | Evaluate and feedback    |
| `task.coordinate` | Sync with others         |
| `task.admin`      | Administrative work      |
| `task.plan`       | Strategic planning       |

### Documents

| Type Key             | Description              |
| -------------------- | ------------------------ |
| `document.context`   | Project context/brief    |
| `document.notes`     | Meeting notes, research  |
| `document.spec`      | Technical specification  |
| `document.reference` | Handbook, SOP, checklist |
| `document.decision`  | RFC, proposal, ADR       |

### Outputs

| Type Key                  | Description       |
| ------------------------- | ----------------- |
| `output.written.chapter`  | Book chapter      |
| `output.written.article`  | Published article |
| `output.media.design`     | Design asset      |
| `output.media.video`      | Video content     |
| `output.software.feature` | Shipped feature   |
| `output.software.release` | Software release  |

---

## State Management (Application Layer)

> **Key Change**: Previously, states were defined in template FSMs (`onto_templates.fsm.states`).
> Now, states are hardcoded constants in the application layer with simple transition validation.

### Standard States by Entity Type

| Entity        | States                                                | Initial     | Terminal                 |
| ------------- | ----------------------------------------------------- | ----------- | ------------------------ |
| **Project**   | `draft`, `active`, `paused`, `complete`, `archived`   | `draft`     | `archived`               |
| **Task**      | `todo`, `in_progress`, `blocked`, `done`, `abandoned` | `todo`      | `done`, `abandoned`      |
| **Plan**      | `draft`, `active`, `review`, `complete`               | `draft`     | `complete`               |
| **Output**    | `draft`, `review`, `approved`, `published`            | `draft`     | `published`              |
| **Document**  | `draft`, `published`                                  | `draft`     | `published`              |
| **Goal**      | `active`, `achieved`, `abandoned`                     | `active`    | `achieved`, `abandoned`  |
| **Milestone** | `pending`, `achieved`, `missed`                       | `pending`   | `achieved`, `missed`     |
| **Event**     | `scheduled`, `confirmed`, `completed`, `cancelled`    | `scheduled` | `completed`, `cancelled` |

### State Constants (TypeScript)

```typescript
// apps/web/src/lib/server/ontology/state-transitions.ts

export const ENTITY_STATES = {
	project: ['draft', 'active', 'paused', 'complete', 'archived'],
	task: ['todo', 'in_progress', 'blocked', 'done', 'abandoned'],
	plan: ['draft', 'active', 'review', 'complete'],
	output: ['draft', 'review', 'approved', 'published'],
	document: ['draft', 'published'],
	goal: ['active', 'achieved', 'abandoned'],
	milestone: ['pending', 'achieved', 'missed'],
	event: ['scheduled', 'confirmed', 'completed', 'cancelled']
} as const;

export const INITIAL_STATES: Record<string, string> = {
	project: 'draft',
	task: 'todo',
	plan: 'draft',
	output: 'draft',
	document: 'draft',
	goal: 'active',
	milestone: 'pending',
	event: 'scheduled'
};

export type EntityType = keyof typeof ENTITY_STATES;
export type ProjectState = (typeof ENTITY_STATES.project)[number];
export type TaskState = (typeof ENTITY_STATES.task)[number];
// ... etc
```

### State Transitions

```typescript
export const STATE_TRANSITIONS: Record<string, Record<string, string[]>> = {
	project: {
		draft: ['active', 'archived'],
		active: ['paused', 'complete', 'archived'],
		paused: ['active', 'archived'],
		complete: ['archived'],
		archived: []
	},
	task: {
		todo: ['in_progress', 'abandoned'],
		in_progress: ['blocked', 'done', 'abandoned', 'todo'],
		blocked: ['in_progress', 'abandoned'],
		done: ['todo'],
		abandoned: ['todo']
	},
	plan: {
		draft: ['active'],
		active: ['review', 'complete'],
		review: ['active', 'complete'],
		complete: []
	},
	output: {
		draft: ['review'],
		review: ['draft', 'approved'],
		approved: ['published'],
		published: []
	},
	document: {
		draft: ['published'],
		published: ['draft']
	},
	goal: {
		active: ['achieved', 'abandoned'],
		achieved: [],
		abandoned: ['active']
	},
	milestone: {
		pending: ['achieved', 'missed'],
		achieved: [],
		missed: []
	},
	event: {
		scheduled: ['confirmed', 'cancelled'],
		confirmed: ['completed', 'cancelled'],
		completed: [],
		cancelled: []
	}
};
```

### Transition Validation

```typescript
/**
 * Check if a state transition is allowed
 */
export function canTransition(
	entityType: EntityType,
	currentState: string,
	targetState: string
): boolean {
	const transitions = STATE_TRANSITIONS[entityType];
	if (!transitions) return false;
	return transitions[currentState]?.includes(targetState) ?? false;
}

/**
 * Get allowed next states for an entity
 */
export function getAllowedTransitions(entityType: EntityType, currentState: string): string[] {
	return STATE_TRANSITIONS[entityType]?.[currentState] ?? [];
}

/**
 * Validate and execute a state transition
 */
export function validateTransition(
	entityType: EntityType,
	currentState: string,
	targetState: string
): { valid: boolean; error?: string } {
	if (!ENTITY_STATES[entityType]?.includes(targetState as never)) {
		return { valid: false, error: `Invalid state '${targetState}' for ${entityType}` };
	}
	if (!canTransition(entityType, currentState, targetState)) {
		return {
			valid: false,
			error: `Cannot transition ${entityType} from '${currentState}' to '${targetState}'`
		};
	}
	return { valid: true };
}
```

### Complex Conditions (Previously FSM Guards)

Complex transition conditions are now handled at the application/AI layer:

```typescript
// Example: Can't complete a project until all tasks are done
async function canCompleteProject(projectId: string): Promise<boolean> {
	const incompleteTasks = await supabase
		.from('onto_tasks')
		.select('id')
		.eq('project_id', projectId)
		.not('state_key', 'in', ['done', 'abandoned'])
		.limit(1);

	return incompleteTasks.data?.length === 0;
}

// Example: AI suggests state transitions based on context
// "It looks like you've finished all tasks. Would you like to mark the project complete?"
```

---

## AI Prompt Guidance for Prop Inference

### System Prompt Addition

When creating/updating entities, include guidance in the AI system prompt:

```markdown
## Property Inference Guidelines

When extracting properties from user conversation, follow these conventions:

### Naming Rules

- Use snake_case: `target_word_count` not `targetWordCount`
- Booleans: `is_fiction`, `has_agent`
- Counts: `chapter_count`, `session_count`
- Targets: `target_revenue`, `target_completion_date`
- Dates: ISO 8601 format

### What to Extract

For PROJECTS, look for:

- Scope indicators: complexity, duration, audience
- Domain-specific details: genre, tech stack, client info
- Success criteria: target metrics, deadlines
- Context: personal vs professional, client vs internal

For TASKS, look for:

- Effort estimates: how long, how complex
- Energy/focus requirements
- Dependencies and blockers
- Optimal time/location

### What NOT to Store as Props

- Conversation history (store in chat context)
- Computed values (calculate at query time)
- Relationships (use onto_edges)
- Large text content (use onto_documents)

### Asking Clarifying Questions

Before creating a project, gather:

1. **Scope**: What's the end goal? How big is this?
2. **Timeline**: Any deadlines? Target completion?
3. **Context**: Personal or professional? Client work?
4. **Key details**: Domain-specific info (genre for books, stack for apps, etc.)

Ask 2-4 focused questions, not a long list.
```

---

## Database Changes Required

### Tables to Remove

- `onto_templates`
- Template-related seeded data

### Columns to Keep (No Changes)

- `type_key` on all entity tables (stays as classification string)
- `state_key` on all entity tables (stays for simple states)
- `props` JSONB on all entity tables (stays for dynamic props)

### Functions to Remove/Simplify

- `get_template_catalog()` - Remove
- `resolve_template()` - Remove
- `get_allowed_transitions()` - Remove (state validation handled in `state-transitions.ts`)
- Template inheritance resolution - Remove

### Functions to Keep

- Basic CRUD operations
- Edge management
- Facet queries

---

## Migration Plan

### Phase 1: Remove Template Dependencies

1. Remove template resolver service
2. Remove template-related API endpoints
3. Update entity creation to not require templates
4. Update UI components that depend on templates

### Phase 2: Simplify State Management

1. Hardcode state transitions in application layer
2. Remove FSM engine complexity
3. Keep basic `state_key` column and simple validation

### Phase 3: Database Cleanup

1. Drop `onto_templates` table
2. Remove template-related functions
3. Clean up any orphaned constraints

### Phase 4: Enhance AI Prompts

1. Add prop naming guidance to system prompts
2. Add clarifying question patterns
3. Test prop inference quality

---

## Example: Creating a Project

### Before (Template-Based)

```typescript
// 1. Find matching template
const template = await findTemplate('project.creative.book');

// 2. Validate props against schema
validateAgainstSchema(props, template.schema);

// 3. Create with template_id
const project = await createProject({
	type_key: 'project.creative.book',
	template_id: template.id,
	props: { ...template.default_props, ...userProps }
});
```

### After (Template-Free)

```typescript
// 1. AI asks clarifying questions in chat
// "What genre? Target word count? Is this fiction or non-fiction?"

// 2. AI infers props from conversation
const inferredProps = {
	genre: 'fantasy',
	is_fiction: true,
	target_word_count: 80000,
	target_chapter_count: 24,
	writing_stage: 'outlining'
};

// 3. Create with inferred props
const project = await createProject({
	type_key: 'project.creative.book',
	state_key: 'draft',
	props: inferredProps
});
```

---

## Open Questions

1. **Prop Evolution**: How do props get updated as project progresses?
    - AI monitors conversation and suggests updates?
    - User manually edits?
    - Both?

2. **Prop Display**: How does UI know which props to prominently display?
    - Entity-type specific layouts?
    - AI-suggested "important props"?
    - User-configurable?

3. **Prop Search**: How do users find projects by prop values?
    - Full-text search on props?
    - Faceted search UI?
    - AI-powered natural language queries?

---

**End of Specification**

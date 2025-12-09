<!-- apps/web/docs/features/ontology/BATCH_TASK_MIGRATION_SPEC.md -->

# Batch Task Migration Spec

**Created**: December 3, 2025
**Status**: ✅ Implemented
**Author**: Claude Code
**Purpose**: Efficient batch migration of tasks during project migration

---

## Implementation Status

| Phase                         | Status      | Implementation                                    |
| ----------------------------- | ----------- | ------------------------------------------------- |
| Phase 1: Batch Classification | ✅ Complete | Single LLM call classifies 20 tasks at once       |
| Phase 2: Template Resolution  | ✅ Complete | Single DB query, uses FindOrCreateTemplateService |
| Phase 3: Property Extraction  | ✅ Complete | Grouped by schema, batch LLM calls                |
| Phase 4: Database Operations  | ✅ Complete | Batch insert tasks, edges, mappings               |
| Integration                   | ✅ Complete | Auto-triggers for projects with 5+ tasks          |

### Implementation Files

- **Main Service**: `src/lib/services/ontology/batch-task-migration.service.ts`
- **Integration**: `src/lib/services/ontology/task-migration.service.ts` (auto-uses batch for 5+ tasks)

---

## Key Design Decisions

### 1. Dynamic Specializations (Flexible Type Keys)

The LLM is **not limited to a fixed set of specializations**. While the 8 base work modes are fixed:

- `task.execute`, `task.create`, `task.refine`, `task.research`, `task.review`, `task.coordinate`, `task.admin`, `task.plan`

The third segment (specialization) is **fully dynamic**. The LLM can suggest:

- `task.review.code` - Code review
- `task.create.design` - Design work
- `task.research.competitor` - Competitor research
- `task.execute.migration` - Data migrations
- Any other valid specialization that fits the task

**Phase 2** handles this by using the existing `FindOrCreateTemplateService` which automatically:

- Creates the new specialization template
- Sets up proper inheritance from the parent work mode
- Generates an appropriate schema via LLM

### 2. Task Details (Not Notes)

When classifying tasks, we use the `details` field (not `notes`) but **truncate to 200 characters** since details can be very long:

```typescript
details: task.details ? task.details.slice(0, 200) : '';
```

### 3. Filtering: Exclude Deleted Tasks

**CRITICAL**: Never migrate soft-deleted tasks. The legacy `tasks` table uses soft delete:

```typescript
// Filter out deleted tasks
.is('deleted_at', null)  // Only tasks where deleted_at IS NULL
```

### 4. Skip Completed Tasks

Don't migrate tasks that are already completed:

```typescript
.neq('status', 'completed')  // Skip completed tasks
```

### 5. Scheduling: start_date → due_at

| Legacy Field         | Onto Field     | Notes                       |
| -------------------- | -------------- | --------------------------- |
| `start_date`         | `due_at`       | Scheduled date for the task |
| `recurrence_pattern` | `props.series` | For recurring task series   |

---

## Problem Statement

### Current Flow (Per Task)

When migrating a project, each task triggers:

1. **DB Query** - Search for templates (returns ~30 candidates)
2. **LLM Call #1** - Score templates against task narrative (15-20s)
3. **LLM Call #2** - Suggest new template if no match ≥70% (10-15s)
4. **LLM Call #3** - Generate ancestor schema if creating new template (5-10s per ancestor)
5. **LLM Call #4** - Extract properties from legacy task (10-15s)
6. **DB Operations** - Create onto_task, edges, mappings

**Total per task**: 25-60 seconds, 2-5 LLM calls

### Observed Problem

From logs:

```
[ProjectMigration][Enhanced] Result for 136e772b-...: status=completed
[FindOrCreateTemplate] START scope=task threshold=0.7 allowCreate=true
[FindOrCreateTemplate] START scope=task threshold=0.7 allowCreate=true
[FindOrCreateTemplate] START scope=task threshold=0.7 allowCreate=true
[FindOrCreateTemplate] START scope=task threshold=0.7 allowCreate=true
[FindOrCreateTemplate] START scope=task threshold=0.7 allowCreate=true
[FindOrCreateTemplate] SEARCH found=30 scope=task
[FindOrCreateTemplate] SEARCH found=30 scope=task
[FindOrCreateTemplate] SEARCH found=30 scope=task
[FindOrCreateTemplate] SEARCH found=30 scope=task
[FindOrCreateTemplate] SEARCH found=30 scope=task
```

Each task independently:

- Queries the same 30 templates
- Makes its own LLM scoring call
- Potentially creates/suggests the same template type

### The Waste

For a project with 20 tasks:

- **20 template searches** returning same 30 templates
- **20 LLM scoring calls** (often scoring same templates)
- **Up to 20 template suggestions** (likely only 3-5 unique type_keys needed)
- **20 property extraction calls** (could batch by schema)

---

## Solution: Batch Task Migration

### Core Insight

Tasks within a project typically map to a small set of type_keys:

- **8 base work modes** (fixed): `task.execute`, `task.create`, `task.refine`, `task.research`, `task.review`, `task.coordinate`, `task.admin`, `task.plan`
- **Dynamic specializations**: The LLM can suggest ANY valid specialization (e.g., `task.review.code`, `task.create.design`, `task.research.competitor`). The system will create templates as needed via the existing `FindOrCreateTemplateService`.

A typical project has **3-5 unique task type_keys**, not 20+. By batching classification, we avoid redundant LLM calls and can efficiently create any new specialization templates needed.

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     BATCH TASK MIGRATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Phase 1    │    │   Phase 2    │    │   Phase 3    │              │
│  │   CLASSIFY   │───▶│   RESOLVE    │───▶│   EXTRACT    │              │
│  │  (1 LLM call)│    │  TEMPLATES   │    │ (N LLM calls)│              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ Task → Key   │    │ Key → Templ  │    │ Templ → Props│              │
│  │   Mapping    │    │    Cache     │    │   per Task   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
│         └────────────────────┬────────────────────┘                     │
│                              ▼                                          │
│                    ┌──────────────────┐                                 │
│                    │     Phase 4      │                                 │
│                    │  BATCH INSERT    │                                 │
│                    │   (DB Batch)     │                                 │
│                    └──────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Batch Type Key Classification

### Purpose

Classify all tasks in a batch to their appropriate `type_key` using a single LLM call.

### Input

```typescript
interface BatchClassificationInput {
	projectContext: {
		name: string;
		description: string;
		type_key: string; // e.g., "project.developer.app"
		realm?: string; // e.g., "developer"
	};
	tasks: Array<{
		legacy_id: string;
		title: string;
		description?: string;
		details?: string; // First 200 chars only
		status?: string;
		priority?: string;
		start_date?: string; // Scheduled date → maps to due_at
		is_recurring: boolean; // Has recurrence_pattern
	}>;
}
```

### LLM Prompt Structure

```
You are classifying tasks into a work mode taxonomy.

## Task Type Key Format
Format: task.{work_mode}[.{specialization}]

- Maximum 3 segments (e.g., task.execute.deploy)
- Use lowercase with underscores for multi-word (e.g., task.coordinate.code_review)

## 8 Required Work Modes (Second Segment)
These are the ONLY valid work modes:

| Work Mode | Type Key | Use When |
|-----------|----------|----------|
| execute | task.execute | Action tasks - doing the work (DEFAULT) |
| create | task.create | Producing NEW artifacts from scratch |
| refine | task.refine | Improving EXISTING work |
| research | task.research | Investigating, gathering information |
| review | task.review | Evaluating, providing feedback |
| coordinate | task.coordinate | Syncing with others, meetings |
| admin | task.admin | Administrative housekeeping |
| plan | task.plan | Strategic thinking, planning |

## Dynamic Specializations (Third Segment - OPTIONAL)
You MAY add a specialization to be more specific. Specializations are DYNAMIC -
suggest whatever fits the task best. The system will create templates as needed.

Examples of valid specializations:
- task.coordinate.meeting - Any scheduled meeting
- task.coordinate.standup - Daily sync meetings
- task.coordinate.interview - Interview sessions
- task.execute.deploy - Production deployments
- task.execute.migration - Data/system migrations
- task.execute.setup - Environment/project setup
- task.create.design - Design work
- task.create.prototype - Building prototypes
- task.review.code - Code reviews
- task.review.design - Design reviews
- task.research.competitor - Competitor analysis
- task.research.user - User research
- task.admin.reporting - Reporting tasks
- task.plan.sprint - Sprint planning

Guidelines for specializations:
1. Only add a specialization if it provides meaningful distinction
2. Use single words or underscore_separated words
3. Be specific but not overly verbose
4. If unsure, omit specialization (use base work mode)

## Selection Rules
1. Default to task.execute when unsure
2. Use task.create ONLY when producing something NEW from scratch
3. Use task.refine when improving EXISTING work
4. Use task.coordinate for any people-sync (meetings, calls, reviews with others)
5. Use task.research for investigation/learning tasks
6. Use task.review for solo evaluation/feedback tasks
7. Consider project domain when choosing specializations

## Project Context
Name: {{project.name}}
Description: {{project.description}}
Domain: {{project.realm}}
Project Type: {{project.type_key}}

## Tasks to Classify
{{#each tasks}}
[{{index}}] "{{title}}"
   Description: {{description}}
   Details: {{details}}
   Status: {{status}}
{{/each}}

## Output Format (JSON)
Return a JSON array. You MAY suggest new specializations - the system will create them.

[
  { "index": 0, "type_key": "task.execute", "confidence": 0.9, "rationale": "Basic action item" },
  { "index": 1, "type_key": "task.coordinate.meeting", "confidence": 0.95, "rationale": "Team sync" },
  { "index": 2, "type_key": "task.review.code", "confidence": 0.88, "rationale": "PR review task" },
  { "index": 3, "type_key": "task.create.design", "confidence": 0.85, "rationale": "Creating new mockups" },
  ...
]
```

### Output

```typescript
interface BatchClassificationResult {
	classifications: Array<{
		index: number;
		legacy_id: string;
		type_key: string;
		confidence: number;
		rationale: string;
	}>;
	unique_type_keys: string[]; // Deduplicated list for Phase 2
	processing_time_ms: number;
}
```

### Data Preparation

#### Step 1: Load Tasks (Exclude Deleted + Completed)

```typescript
async function loadLegacyTasksForProject(
	supabase: SupabaseClient,
	projectId: string
): Promise<LegacyTask[]> {
	const { data: tasks, error } = await supabase
		.from('tasks')
		.select('id, title, description, details, status, priority, start_date, recurrence_pattern')
		.eq('project_id', projectId)
		.is('deleted_at', null) // Exclude deleted
		.neq('status', 'completed'); // Exclude completed

	if (error) throw error;
	return tasks;
}
```

#### Step 2: Prepare for Classification

```typescript
function prepareTasksForClassification(legacyTasks: LegacyTask[]): ClassificationTask[] {
	return legacyTasks.map((task) => ({
		legacy_id: task.id,
		title: task.title,
		description: task.description ?? '',
		details: task.details ? task.details.slice(0, 200) : '', // Truncate to 200 chars
		status: task.status,
		priority: task.priority,
		start_date: task.start_date,
		is_recurring: !!task.recurrence_pattern
	}));
}
```

### Batching Strategy

- **Batch size**: 20 tasks per LLM call (balances token limits vs. efficiency)
- **Large projects**: Split into multiple batches, process sequentially
- **Token estimation**: ~100 tokens per task input, ~50 tokens per output

### Cost Analysis

| Scenario            | Current      | Batch       |
| ------------------- | ------------ | ----------- |
| 20 tasks, scoring   | 20 LLM calls | 1 LLM call  |
| 50 tasks, scoring   | 50 LLM calls | 3 LLM calls |
| Token cost per task | ~2000 tokens | ~150 tokens |

---

## Phase 2: Batch Template Resolution

### Purpose

Resolve templates for all unique type_keys discovered in Phase 1, using a single pass.

**Key Design**: This phase leverages the existing `FindOrCreateTemplateService` for dynamic template creation. When the LLM suggests a new specialization (e.g., `task.review.code`), this phase will automatically create it with proper inheritance from the parent work mode.

### Input

```typescript
interface BatchTemplateResolutionInput {
	unique_type_keys: string[]; // From Phase 1 (may include NEW specializations)
	project_context: string; // For template creation if needed
	allow_create: boolean;
	dry_run: boolean;
}
```

### Algorithm

```typescript
async function batchResolveTemplates(
	input: BatchTemplateResolutionInput
): Promise<Map<string, ResolvedTemplate>> {
	const templateCache = new Map<string, ResolvedTemplate>();

	// 1. SINGLE database query for all existing task templates
	const allTaskTemplates = await supabase
		.from('onto_templates')
		.select('*')
		.eq('scope', 'task')
		.eq('status', 'active');

	// 2. Separate existing vs. new type_keys
	const existingTypeKeys: string[] = [];
	const newTypeKeys: string[] = [];

	for (const typeKey of input.unique_type_keys) {
		const exists = allTaskTemplates.find((t) => t.type_key === typeKey);
		if (exists) {
			existingTypeKeys.push(typeKey);
		} else {
			newTypeKeys.push(typeKey);
		}
	}

	// 3. Resolve existing templates (fast - no LLM)
	for (const typeKey of existingTypeKeys) {
		const template = allTaskTemplates.find((t) => t.type_key === typeKey)!;
		templateCache.set(typeKey, await resolveWithInheritance(template));
	}

	// 4. Create new templates using FindOrCreateTemplateService
	// This handles:
	//   - Automatic ancestor creation (e.g., task.review before task.review.code)
	//   - Schema generation via LLM
	//   - FSM setup
	//   - Race condition handling
	if (input.allow_create && !input.dry_run) {
		for (const typeKey of newTypeKeys) {
			const result = await this.findOrCreateTemplateService.findOrCreate({
				scope: 'task',
				context: `Creating template for ${typeKey} in context: ${input.project_context}`,
				suggestedTypeKey: typeKey, // Hint to use this exact type_key
				matchThreshold: 1.0, // Force exact match only (we already know it doesn't exist)
				allowCreate: true,
				dryRun: false
			});

			if (result.template) {
				templateCache.set(typeKey, result.template);
			}
		}
	} else if (!input.allow_create) {
		// Fall back to parent templates for new type_keys
		for (const typeKey of newTypeKeys) {
			const parentKey = getParentTypeKey(typeKey); // e.g., task.review.code → task.review
			const parentTemplate = allTaskTemplates.find((t) => t.type_key === parentKey);

			if (parentTemplate) {
				templateCache.set(typeKey, await resolveWithInheritance(parentTemplate));
				console.log(`[BatchResolve] Falling back to parent ${parentKey} for ${typeKey}`);
			}
		}
	}

	return templateCache;
}

function getParentTypeKey(typeKey: string): string {
	const segments = typeKey.split('.');
	if (segments.length <= 2) return typeKey; // Already at base (task.execute)
	return segments.slice(0, -1).join('.'); // Remove last segment
}
```

### Key Optimizations

1. **Single DB Query**: Load all task templates once (currently ~30), not per-task
2. **Exact Match Priority**: Skip LLM scoring when exact type_key match exists
3. **Batch Creation**: Create all new templates in sequence (no redundant searches)
4. **Reuse `FindOrCreateTemplateService`**: Leverages existing auto-ancestor creation logic
5. **Parent Fallback**: Use parent template when specialization doesn't exist and creation disabled

### Template Resolution Order

```
For each unique type_key from Phase 1:

1. Exact match exists? → Use existing template (NO LLM call)
   task.coordinate.meeting → template task.coordinate.meeting ✓

2. New specialization + allow_create? → Create via FindOrCreateTemplateService
   task.review.code → FindOrCreateTemplateService creates:
     - task.review (if not exists, as parent)
     - task.review.code (with parent_template_id → task.review)

3. New specialization + !allow_create? → Fall back to parent
   task.review.code → template task.review
```

### Dynamic Template Creation Flow

When a new specialization like `task.review.code` is suggested:

```
Phase 1 Output: ["task.execute", "task.review", "task.review.code", "task.create.design"]
                                                    ↑ NEW              ↑ NEW

Phase 2 Processing:
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Load all existing task templates (single DB query)                   │
│    Found: task.execute, task.create, task.refine, task.research,       │
│           task.review, task.coordinate, task.admin, task.plan          │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Separate existing vs. new:                                          │
│    Existing: [task.execute, task.review]                               │
│    New: [task.review.code, task.create.design]                         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Resolve existing (fast, no LLM):                                    │
│    task.execute → cached                                               │
│    task.review → cached                                                │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Create new via FindOrCreateTemplateService:                         │
│    task.review.code:                                                   │
│      - Parent task.review exists ✓                                     │
│      - LLM generates schema for code review properties                 │
│      - Created with parent_template_id → task.review                   │
│                                                                        │
│    task.create.design:                                                 │
│      - Parent task.create exists ✓                                     │
│      - LLM generates schema for design task properties                 │
│      - Created with parent_template_id → task.create                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Output

```typescript
interface BatchTemplateResolutionResult {
	template_cache: Map<string, ResolvedTemplate>;
	created_templates: string[]; // Type keys of newly created templates
	reused_templates: string[]; // Type keys of existing templates used
	parent_fallbacks: string[]; // Type keys that fell back to parent
}
```

---

## Phase 3: Batch Property Extraction

### Purpose

Extract properties for multiple tasks at once, grouped by template schema.

### Grouping Strategy

Tasks sharing the same template share the same schema, so they can be batch-extracted:

```typescript
// Group tasks by resolved template
const tasksByTemplate = groupBy(tasks, (t) => t.resolved_type_key);

// Example groupings:
// task.execute: [task1, task2, task5, task8, task12, task15]
// task.review: [task3, task6, task9]
// task.coordinate.meeting: [task4, task7, task10, task11]
// task.research: [task13, task14]
```

### Batch Extraction Prompt

```
You are extracting structured properties from task descriptions.

## Schema for task.execute
{
  "title": { "type": "string", "required": true },
  "estimated_duration_minutes": { "type": "number" },
  "complexity": { "type": "string", "enum": ["trivial", "simple", "moderate", "complex"] },
  "blockers": { "type": "array", "items": { "type": "string" } }
}

## Tasks to Extract (all task.execute)
{{#each tasks}}
[{{index}}] Legacy ID: {{legacy_id}}
   Title: "{{title}}"
   Description: {{description}}
   Details: {{details}}
   Status: {{status}}
   Priority: {{priority}}
{{/each}}

## Output Format (JSON Array)
[
  {
    "index": 0,
    "legacy_id": "abc-123",
    "props": {
      "title": "Implement login flow",
      "estimated_duration_minutes": 120,
      "complexity": "moderate",
      "blockers": []
    },
    "confidence": 0.85
  },
  ...
]

## Extraction Rules
- Use intelligent type inference (e.g., "$80k budget" → 80000)
- Dates should be ISO 8601 format
- Arrays from comma/+ separated strings
- Leave optional fields null if not inferrable
```

### Batch Size Optimization

| Template Schema Size | Max Tasks per Batch | Estimated Tokens |
| -------------------- | ------------------- | ---------------- |
| Small (5 fields)     | 25                  | ~4000            |
| Medium (10 fields)   | 15                  | ~4000            |
| Large (20 fields)    | 8                   | ~4000            |

### Output

```typescript
interface BatchExtractionResult {
	extractions: Array<{
		legacy_id: string;
		type_key: string;
		props: Record<string, unknown>;
		confidence: number;
		validation_errors?: string[];
	}>;
	template_groups: Map<string, number>; // type_key → count extracted
}
```

---

## Phase 4: Batch Database Operations

### Purpose

Create all onto_tasks, edges, and mappings in efficient batch operations.

### Batch Insert Strategy

```typescript
async function batchCreateTasks(
	extractions: BatchExtractionResult,
	templateCache: Map<string, ResolvedTemplate>,
	projectId: string,
	legacyTaskMap: Map<string, LegacyTask>
): Promise<BatchCreateResult> {
	// 1. Prepare all task records
	const taskRecords = extractions.extractions.map((ext) => {
		const template = templateCache.get(ext.type_key)!;
		const legacyTask = legacyTaskMap.get(ext.legacy_id)!;

		return {
			id: crypto.randomUUID(),
			project_id: projectId,
			type_key: ext.type_key,
			template_id: template.template.id,
			state_key: template.fsm?.states.find((s) => s.initial)?.key ?? 'todo',
			props: mergeWithDefaults(ext.props, template.default_props),
			priority: mapPriority(legacyTask.priority),
			due_at: legacyTask.start_date ?? null, // start_date → due_at
			_legacy_id: ext.legacy_id // Temporary for mapping
		};
	});

	// 2. Batch insert tasks (Supabase supports up to 1000 per call)
	const { data: insertedTasks, error: taskError } = await supabase
		.from('onto_tasks')
		.insert(taskRecords.map((r) => omit(r, '_legacy_id')))
		.select('id');

	if (taskError) throw taskError;

	// 3. Batch insert edges (task → plan relationships)
	const edgeRecords = insertedTasks.map((task, i) => ({
		src_id: task.id,
		src_kind: 'task',
		dst_id: planId, // From project context
		dst_kind: 'plan',
		rel: 'belongs_to'
	}));

	const { error: edgeError } = await supabase.from('onto_edges').insert(edgeRecords);

	if (edgeError) throw edgeError;

	// 4. Batch insert legacy mappings
	const mappingRecords = taskRecords.map((record, i) => ({
		legacy_table: 'tasks',
		legacy_id: record._legacy_id,
		onto_table: 'onto_tasks',
		onto_id: insertedTasks[i].id,
		migrated_at: new Date().toISOString()
	}));

	const { error: mappingError } = await supabase
		.from('legacy_entity_mappings')
		.insert(mappingRecords);

	if (mappingError) throw mappingError;

	return {
		created_count: insertedTasks.length,
		task_ids: insertedTasks.map((t) => t.id)
	};
}
```

### Transaction Safety

Wrap all Phase 4 operations in a transaction:

```typescript
const { error } = await supabase.rpc('batch_create_tasks_transaction', {
	task_records: taskRecords,
	edge_records: edgeRecords,
	mapping_records: mappingRecords
});
```

---

## Complete Pipeline Implementation

### Service Interface

```typescript
// src/lib/services/ontology/batch-task-migration.service.ts

export interface BatchTaskMigrationOptions {
	project_id: string;
	batch_size: number; // Default: 20
	allow_template_creation: boolean;
	dry_run: boolean;
	on_progress?: (progress: BatchProgress) => void;
}

export interface BatchProgress {
	phase: 'classify' | 'resolve' | 'extract' | 'insert';
	batch_number: number;
	total_batches: number;
	tasks_processed: number;
	total_tasks: number;
	current_operation: string;
}

export interface BatchMigrationResult {
	success: boolean;
	tasks_migrated: number;
	templates_created: string[];
	templates_reused: string[];
	type_key_distribution: Record<string, number>;
	scheduling_stats: {
		scheduled: number; // Tasks with start_date → due_at
		unscheduled: number; // Tasks without start_date
		recurring: number; // Tasks with recurrence_pattern
	};
	timing: {
		classify_ms: number;
		resolve_ms: number;
		extract_ms: number;
		insert_ms: number;
		total_ms: number;
	};
	errors: Array<{
		legacy_id: string;
		phase: string;
		error: string;
	}>;
}

export class BatchTaskMigrationService {
	async migrateProjectTasks(
		legacyTasks: LegacyTask[],
		options: BatchTaskMigrationOptions
	): Promise<BatchMigrationResult>;
}
```

### Orchestration Flow

```typescript
async migrateProjectTasks(
  legacyTasks: LegacyTask[],
  options: BatchTaskMigrationOptions
): Promise<BatchMigrationResult> {
  const timing = { classify_ms: 0, resolve_ms: 0, extract_ms: 0, insert_ms: 0, total_ms: 0 };
  const startTotal = Date.now();
  const errors: BatchMigrationResult['errors'] = [];

  // Get project context
  const project = await this.getProjectContext(options.project_id);

  // Split into batches
  const batches = chunk(legacyTasks, options.batch_size);

  let allClassifications: Classification[] = [];
  let templateCache: Map<string, ResolvedTemplate> = new Map();
  let allExtractions: Extraction[] = [];

  // ========== PHASE 1: BATCH CLASSIFICATION ==========
  const startClassify = Date.now();
  for (let i = 0; i < batches.length; i++) {
    options.on_progress?.({
      phase: 'classify',
      batch_number: i + 1,
      total_batches: batches.length,
      tasks_processed: i * options.batch_size,
      total_tasks: legacyTasks.length,
      current_operation: `Classifying batch ${i + 1}/${batches.length}`
    });

    const batchResult = await this.classifyBatch(batches[i], project);
    allClassifications.push(...batchResult.classifications);
  }
  timing.classify_ms = Date.now() - startClassify;

  // ========== PHASE 2: BATCH TEMPLATE RESOLUTION ==========
  const startResolve = Date.now();
  const uniqueTypeKeys = [...new Set(allClassifications.map(c => c.type_key))];

  options.on_progress?.({
    phase: 'resolve',
    batch_number: 1,
    total_batches: 1,
    tasks_processed: 0,
    total_tasks: uniqueTypeKeys.length,
    current_operation: `Resolving ${uniqueTypeKeys.length} unique templates`
  });

  templateCache = await this.resolveTemplates({
    unique_type_keys: uniqueTypeKeys,
    project_context: project.description,
    allow_create: options.allow_template_creation,
    dry_run: options.dry_run
  });
  timing.resolve_ms = Date.now() - startResolve;

  // ========== PHASE 3: BATCH PROPERTY EXTRACTION ==========
  const startExtract = Date.now();

  // Group tasks by type_key for efficient extraction
  const tasksByTypeKey = groupBy(
    allClassifications.map((c, i) => ({ ...c, legacy_task: legacyTasks[i] })),
    c => c.type_key
  );

  let extractBatchNum = 0;
  const totalExtractBatches = Object.keys(tasksByTypeKey).length;

  for (const [typeKey, tasksGroup] of Object.entries(tasksByTypeKey)) {
    extractBatchNum++;
    const template = templateCache.get(typeKey)!;

    // Sub-batch if group is large
    const extractionBatches = chunk(tasksGroup, this.getExtractionBatchSize(template));

    for (const extractBatch of extractionBatches) {
      options.on_progress?.({
        phase: 'extract',
        batch_number: extractBatchNum,
        total_batches: totalExtractBatches,
        tasks_processed: allExtractions.length,
        total_tasks: legacyTasks.length,
        current_operation: `Extracting ${typeKey} (${extractBatch.length} tasks)`
      });

      const extracted = await this.extractPropertiesBatch(extractBatch, template);
      allExtractions.push(...extracted.extractions);
    }
  }
  timing.extract_ms = Date.now() - startExtract;

  // ========== PHASE 4: BATCH INSERT ==========
  if (!options.dry_run) {
    const startInsert = Date.now();

    options.on_progress?.({
      phase: 'insert',
      batch_number: 1,
      total_batches: 1,
      tasks_processed: 0,
      total_tasks: allExtractions.length,
      current_operation: `Inserting ${allExtractions.length} tasks`
    });

    await this.batchInsertTasks(allExtractions, templateCache, options.project_id);
    timing.insert_ms = Date.now() - startInsert;
  }

  timing.total_ms = Date.now() - startTotal;

  // Calculate type_key distribution
  const typeKeyDistribution: Record<string, number> = {};
  for (const c of allClassifications) {
    typeKeyDistribution[c.type_key] = (typeKeyDistribution[c.type_key] ?? 0) + 1;
  }

  return {
    success: errors.length === 0,
    tasks_migrated: options.dry_run ? 0 : allExtractions.length,
    templates_created: [...templateCache.values()]
      .filter(t => t._created)
      .map(t => t.template.type_key),
    templates_reused: [...templateCache.values()]
      .filter(t => !t._created)
      .map(t => t.template.type_key),
    type_key_distribution: typeKeyDistribution,
    timing,
    errors
  };
}
```

---

## Performance Comparison

### Before (Current Implementation)

| Project Size | Template Searches | LLM Scoring | LLM Suggestions | LLM Extractions | Total LLM Calls | Est. Time |
| ------------ | ----------------- | ----------- | --------------- | --------------- | --------------- | --------- |
| 10 tasks     | 10                | 10          | ~2              | 10              | 22              | 5-10 min  |
| 20 tasks     | 20                | 20          | ~3              | 20              | 43              | 10-20 min |
| 50 tasks     | 50                | 50          | ~5              | 50              | 105             | 25-50 min |

### After (Batch Implementation)

| Project Size | Template Searches | LLM Classification | LLM Template Creation | LLM Extraction Batches | Total LLM Calls | Est. Time |
| ------------ | ----------------- | ------------------ | --------------------- | ---------------------- | --------------- | --------- |
| 10 tasks     | 1                 | 1                  | ~2                    | ~3                     | 6               | 1-2 min   |
| 20 tasks     | 1                 | 1                  | ~3                    | ~5                     | 9               | 2-3 min   |
| 50 tasks     | 1                 | 3                  | ~5                    | ~10                    | 18              | 4-6 min   |

### Efficiency Gains

| Metric                | Before    | After   | Improvement          |
| --------------------- | --------- | ------- | -------------------- |
| DB Template Queries   | N         | 1       | **99%** reduction    |
| LLM Scoring Calls     | N         | 0       | **100%** elimination |
| LLM Total Calls       | ~2N       | ~0.4N   | **80%** reduction    |
| Total Time (20 tasks) | 10-20 min | 2-3 min | **5-7x** faster      |
| API Cost (20 tasks)   | ~$0.40    | ~$0.10  | **75%** reduction    |

---

## Integration Points

### Where to Integrate

```
src/lib/services/ontology/
├── batch-task-migration.service.ts   # NEW - Main batch service
├── task-migration.service.ts         # MODIFY - Use batch service
├── enhanced-task-migrator.ts         # KEEP - For single task fallback
├── find-or-create-template.service.ts # KEEP - Used for template creation
└── migration/
    └── batch-classification-prompts.ts # NEW - Batch prompts
```

### Migration Service Integration

```typescript
// task-migration.service.ts

async migrateTasks(context: MigrationContext): Promise<TaskMigrationSummary> {
  const tasks = context.legacyTasks;

  // Use batch migration for projects with multiple tasks
  if (tasks.length >= 5 && context.enhancedMode) {
    return this.batchMigrationService.migrateProjectTasks(tasks, {
      project_id: context.ontoProjectId,
      batch_size: 20,
      allow_template_creation: !context.dryRun,
      dry_run: context.dryRun,
      on_progress: context.onProgress
    });
  }

  // Fall back to single-task migration for small batches
  return this.migrateTasksIndividually(context);
}
```

### Admin UI Integration

Update `/admin/migration` to show batch progress:

```svelte
{#if migrationProgress.phase === 'classify'}
	<ProgressBar
		label="Classifying tasks"
		value={migrationProgress.tasks_processed}
		max={migrationProgress.total_tasks}
	/>
{:else if migrationProgress.phase === 'resolve'}
	<ProgressBar
		label="Resolving templates ({migrationProgress.total_tasks} unique types)"
		indeterminate
	/>
{:else if migrationProgress.phase === 'extract'}
	<ProgressBar
		label="Extracting properties"
		value={migrationProgress.tasks_processed}
		max={migrationProgress.total_tasks}
	/>
{:else if migrationProgress.phase === 'insert'}
	<ProgressBar
		label="Creating tasks"
		value={migrationProgress.tasks_processed}
		max={migrationProgress.total_tasks}
	/>
{/if}
```

---

## Error Handling

### Partial Failure Strategy

```typescript
interface BatchErrorStrategy {
	// If classification fails, fall back to default type_key
	classification_fallback: 'task.execute';

	// If template resolution fails, use parent template
	template_fallback: 'use_parent';

	// If extraction fails, use minimal props
	extraction_fallback: 'title_only';

	// If insert fails, retry individual tasks
	insert_fallback: 'individual_retry';
}
```

### Error Recovery Flow

```
Classification fails for task[5]
  └─► Assign default type_key: task.execute
      └─► Continue with batch

Template resolution fails for task.coordinate.meeting
  └─► Fall back to parent: task.coordinate
      └─► Log warning, continue

Extraction fails for task[12]
  └─► Use minimal extraction: { title: legacy_title }
      └─► Log warning, continue

Batch insert fails
  └─► Retry failed tasks individually
      └─► Collect individual errors
          └─► Report partial success
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('BatchTaskMigrationService', () => {
	describe('classifyBatch', () => {
		it('should classify multiple tasks in single LLM call', async () => {
			const tasks = generateMockTasks(20);
			const result = await service.classifyBatch(tasks, mockProject);

			expect(result.classifications).toHaveLength(20);
			expect(result.llm_calls).toBe(1);
		});

		it('should handle diverse task types with dynamic specializations', async () => {
			const tasks = [
				{ title: 'Write unit tests', details: 'Add tests for auth' },
				{ title: 'Review PR #123', details: 'Code review for API' },
				{ title: 'Design mobile dashboard', details: 'Create Figma mockups' },
				{ title: 'Research competitor pricing', details: 'Analyze pricing' }
			];

			const result = await service.classifyBatch(tasks, mockProject);

			// LLM can suggest dynamic specializations
			expect(result.classifications[0].type_key).toBe('task.create');
			expect(result.classifications[1].type_key).toBe('task.review.code');
			expect(result.classifications[2].type_key).toBe('task.create.design');
			expect(result.classifications[3].type_key).toBe('task.research.competitor');
		});
	});

	describe('resolveTemplates', () => {
		it('should query database only once for all type_keys', async () => {
			const spy = vi.spyOn(supabase, 'from');

			await service.resolveTemplates({
				unique_type_keys: ['task.execute', 'task.review', 'task.coordinate.meeting'],
				allow_create: false
			});

			expect(spy).toHaveBeenCalledTimes(1);
		});

		it('should create new specialization templates via FindOrCreateTemplateService', async () => {
			const createSpy = vi.spyOn(findOrCreateTemplateService, 'findOrCreate');

			await service.resolveTemplates({
				unique_type_keys: ['task.execute', 'task.review.code', 'task.create.design'],
				project_context: 'Software development project',
				allow_create: true,
				dry_run: false
			});

			// task.execute exists, so no creation
			// task.review.code and task.create.design are new - should trigger creation
			expect(createSpy).toHaveBeenCalledTimes(2);
			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					suggestedTypeKey: 'task.review.code'
				})
			);
			expect(createSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					suggestedTypeKey: 'task.create.design'
				})
			);
		});

		it('should fall back to parent when allow_create is false', async () => {
			const result = await service.resolveTemplates({
				unique_type_keys: ['task.review.code'], // Doesn't exist
				allow_create: false,
				dry_run: false
			});

			// Should use task.review (parent) instead
			const template = result.get('task.review.code');
			expect(template?.template.type_key).toBe('task.review');
		});
	});

	describe('extractPropertiesBatch', () => {
		it('should extract properties for multiple tasks sharing schema', async () => {
			const tasks = generateMockTasks(10, { type_key: 'task.execute' });
			const template = await service.getTemplate('task.execute');

			const result = await service.extractPropertiesBatch(tasks, template);

			expect(result.extractions).toHaveLength(10);
			expect(result.llm_calls).toBe(1);
		});
	});
});
```

### Integration Tests

```typescript
describe('Batch Task Migration Integration', () => {
	it('should migrate a project with 20 tasks efficiently', async () => {
		const project = await createTestProject();
		const tasks = await createTestLegacyTasks(project.id, 20);

		const result = await batchMigrationService.migrateProjectTasks(tasks, {
			project_id: project.onto_id,
			batch_size: 20,
			allow_template_creation: true,
			dry_run: false
		});

		expect(result.success).toBe(true);
		expect(result.tasks_migrated).toBe(20);
		expect(result.timing.total_ms).toBeLessThan(180000); // < 3 minutes

		// Verify tasks created correctly
		const ontoTasks = await supabase
			.from('onto_tasks')
			.select('*')
			.eq('project_id', project.onto_id);

		expect(ontoTasks.data).toHaveLength(20);
	});
});
```

---

## Implementation Checklist

### Phase 1: Classification Service

- [ ] Create `batch-classification.service.ts`
- [ ] Implement batch classification prompt
- [ ] Add classification result validation
- [ ] Add fallback for failed classifications
- [ ] Write unit tests

### Phase 2: Template Resolution

- [ ] Create `batch-template-resolver.service.ts`
- [ ] Implement single-query template loading
- [ ] Add exact match → parent match → create flow
- [ ] Integrate with existing `FindOrCreateTemplateService`
- [ ] Write unit tests

### Phase 3: Property Extraction

- [ ] Create `batch-property-extraction.service.ts`
- [ ] Implement grouped extraction by template
- [ ] Add dynamic batch sizing based on schema
- [ ] Add extraction validation
- [ ] Write unit tests

### Phase 4: Database Operations

- [ ] Create `batch-task-insert.service.ts`
- [ ] Implement batch insert for tasks, edges, mappings
- [ ] Add transaction wrapper
- [ ] Add partial failure handling
- [ ] Write unit tests

### Integration

- [ ] Create main `BatchTaskMigrationService` orchestrator
- [ ] Integrate with `TaskMigrationService`
- [ ] Update admin UI for batch progress
- [ ] Add logging and monitoring
- [ ] Write integration tests

### Documentation

- [ ] Update migration service docs
- [ ] Add batch migration troubleshooting guide
- [ ] Document performance benchmarks

---

## Open Questions

1. **Threshold for batch vs individual**: Currently proposed at 5 tasks. Should this be configurable?

2. **Template creation approval**: In batch mode, should we queue template creations for review or auto-create?

3. **Progress streaming**: Should we use SSE/WebSocket for real-time progress updates to admin UI?

4. **Rollback strategy**: If Phase 4 fails mid-batch, should we rollback all or keep successful ones?

5. **Parallel batch processing**: Should Phase 1 batches run in parallel (risk: rate limits)?

---

## Related Documentation

- [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) - Task type_key taxonomy
- [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md) - Architecture rationale
- [FIND_OR_CREATE_TEMPLATE_SPEC.md](./FIND_OR_CREATE_TEMPLATE_SPEC.md) - Template service details
- [DATA_MODELS.md](./DATA_MODELS.md) - Database schema reference

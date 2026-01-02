<!-- docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md -->

# Ontology LLM Classification System - Technical Specification

**Status:** Draft
**Created:** 2026-01-02
**Author:** AI Assistant
**Scope:** Web App + Worker Service

---

## Overview

This specification defines the implementation for automatic LLM-based classification of ontology entities. Instead of requiring users to pre-select entity types in create modals, entities will be created with default type_keys and then asynchronously classified by an LLM worker job.

### Goals

1. **Simplify creation flow** - Remove preselect/type selection step from create modals
2. **Automatic classification** - LLM determines appropriate `type_key` based on content
3. **Automatic tagging** - LLM generates relevant tags stored in `props.tags`
4. **Non-blocking UX** - Classification happens asynchronously after creation
5. **Safe updates** - Only append tags to props, never overwrite existing data

### Non-Goals

- Real-time classification feedback (silent update chosen)
- Mandatory classification (entities work fine with default type_key)
- Classification of existing/historical entities (future enhancement)

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CREATE MODAL (Simplified)                    │
│  1. User fills: title, description, associations                │
│  2. Entity created with default type_key (e.g., "task.default") │
│  3. Non-blocking: queue classification job                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓ HTTP POST (fire-and-forget)
              ┌──────────────────────────────────┐
              │  RailwayWorkerService            │
              │  .queueOntologyClassification()  │
              └──────────────┬───────────────────┘
                             │
                             ↓
              ┌──────────────────────────────────┐
              │  Worker API                      │
              │  POST /queue/ontology/classify   │
              └──────────────┬───────────────────┘
                             │
                             ↓ queue.add()
              ┌──────────────────────────────────┐
              │  Supabase queue_jobs             │
              │  job_type: classify_ontology     │
              │  priority: 7 (moderate)          │
              └──────────────┬───────────────────┘
                             │
                             ↓ Worker processor (5s polling)
              ┌──────────────────────────────────┐
              │  SmartLLMService.getJSONResponse │
              │  Profile: 'fast' or 'balanced'   │
              │  Model: DeepSeek Chat / Gemini   │
              └──────────────┬───────────────────┘
                             │
                             ↓
              ┌──────────────────────────────────┐
              │  Update Entity                   │
              │  - Set type_key                  │
              │  - Append tags to props          │
              │  - Log classification metadata   │
              └──────────────────────────────────┘
```

---

## Entity Types & Default Type Keys

All 8 ontology entity types will receive LLM classification:

| Entity    | Table             | Default Type Key    | Example Classified        |
| --------- | ----------------- | ------------------- | ------------------------- |
| Task      | `onto_tasks`      | `task.default`      | `task.execute.deploy`     |
| Output    | `onto_outputs`    | `output.default`    | `output.written.report`   |
| Plan      | `onto_plans`      | `plan.default`      | `plan.timebox.sprint`     |
| Goal      | `onto_goals`      | `goal.default`      | `goal.metric.revenue`     |
| Risk      | `onto_risks`      | `risk.default`      | `risk.technical.security` |
| Milestone | `onto_milestones` | `milestone.default` | `milestone.delivery`      |
| Decision  | `onto_decisions`  | `decision.default`  | `decision.technical`      |
| Document  | `onto_documents`  | `document.default`  | `document.spec.technical` |

---

## API Design

### 1. Create Entity API (Modified)

**Current Flow:**

```
POST /api/onto/tasks/create
Body: { type_key: "task.execute", title, description, ... }
```

**New Flow:**

```
POST /api/onto/tasks/create
Body: { title, description, ... }  // No type_key required

Response: {
  success: true,
  data: {
    task: { id, type_key: "task.default", ... }
  }
}

// After response, non-blocking:
RailwayWorkerService.queueOntologyClassification({
  entityType: 'task',
  entityId: task.id,
  userId: actorId
});
```

### 2. Classification Queue Endpoint (New)

**Endpoint:** `POST /queue/ontology/classify`

**Request:**

```typescript
interface ClassifyOntologyRequest {
	entityType:
		| 'task'
		| 'output'
		| 'plan'
		| 'goal'
		| 'risk'
		| 'milestone'
		| 'decision'
		| 'document';
	entityId: string; // UUID
	userId: string; // UUID (for RLS and logging)
}
```

**Response:**

```typescript
// Success (202 Accepted)
{
  success: true,
  jobId: "queue_job_id",
  message: "Classification queued"
}

// Duplicate (409 Conflict)
{
  error: "Classification already in progress",
  existingJobId: "queue_job_id"
}

// Validation Error (400)
{
  error: "Invalid entityType or UUID format"
}
```

### 3. Classification Result (Worker Output)

```typescript
interface OntologyClassificationResult {
	success: boolean;
	entityType: string;
	entityId: string;

	// Classification output
	type_key: string; // e.g., "task.execute.deploy"
	tags: string[]; // e.g., ["deployment", "infrastructure", "ci-cd"]

	// Metadata
	confidence: number; // 0-1 scale
	reasoning?: string; // Optional explanation
	model_used: string; // For debugging
	classification_time_ms: number;

	// Error case
	error?: string;
	kept_default?: boolean; // True if classification failed
}
```

---

## LLM Classification Implementation

### System Prompt

```typescript
const ONTOLOGY_CLASSIFICATION_SYSTEM_PROMPT = `You are an expert ontology classifier for a productivity system. Your task is to analyze an entity and determine:

1. **type_key**: The most appropriate classification following the taxonomy pattern
2. **tags**: 3-7 relevant keywords for discoverability

## Type Key Taxonomy

Type keys follow the pattern: {scope}.{family}[.{variant}]

### Valid Patterns by Entity Type:

**Tasks** - Pattern: task.{work_mode}[.{specialization}]
- Work modes: execute, create, refine, research, review, coordinate, admin, plan
- Specializations: meeting, standup, deploy, checklist
- Examples: task.execute, task.coordinate.meeting, task.research

**Outputs** - Pattern: output.{family}[.{variant}]
- Families: written, media, software, operational
- Examples: output.written.report, output.software.feature, output.media.presentation

**Plans** - Pattern: plan.{family}[.{variant}]
- Families: timebox, pipeline, campaign, roadmap, process, phase
- Examples: plan.timebox.sprint, plan.roadmap.product, plan.campaign.marketing

**Goals** - Pattern: goal.{family}[.{variant}]
- Families: outcome, metric, behavior, learning
- Examples: goal.outcome.project, goal.metric.revenue, goal.learning.skill

**Documents** - Pattern: document.{family}[.{variant}]
- Families: context, knowledge, decision, spec, reference, intake
- Examples: document.spec.technical, document.knowledge.research, document.decision.rfc

**Risks** - Pattern: risk.{family}[.{variant}]
- Families: technical, schedule, resource, budget, scope, external, quality
- Examples: risk.technical.security, risk.schedule.deadline

**Milestones** - Pattern: milestone.{variant}
- Variants: delivery, phase_complete, review, deadline, release, launch
- Examples: milestone.delivery, milestone.launch

**Decisions** - Pattern: decision.{category}
- Categories: technical, process, resource, strategic, operational
- Examples: decision.technical, decision.strategic

## Tag Guidelines

- Use lowercase, hyphen-separated words (e.g., "user-research", "api-design")
- Focus on WHAT the entity does, not what it IS
- Include action verbs where relevant (e.g., "planning", "reviewing")
- Include domain terms (e.g., "frontend", "marketing", "hr")
- Avoid generic tags like "important" or "misc"

## Response Format

Respond ONLY with valid JSON:
{
  "type_key": "scope.family.variant",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.85,
  "reasoning": "Brief explanation of classification choice"
}`;
```

### User Prompt Template

```typescript
function buildClassificationPrompt(entity: OntologyEntity, entityType: string): string {
	return `Classify this ${entityType}:

## Entity Data
- **Title**: ${entity.title || 'Untitled'}
- **Description**: ${entity.description || 'No description'}
${entity.body ? `- **Body Content**: ${truncate(entity.body, 2000)}` : ''}

## Context
- **Current type_key**: ${entity.type_key} (default, needs classification)
- **State**: ${entity.state_key || 'unknown'}
${entity.priority ? `- **Priority**: ${entity.priority}` : ''}

Analyze and classify this ${entityType}.`;
}
```

### LLM Call Configuration

```typescript
const classificationConfig = {
	profile: 'fast', // Use fast profile for quick classification
	temperature: 0.2, // Low temperature for consistency
	validation: {
		retryOnParseError: true,
		maxRetries: 2
	},
	operationType: 'ontology_classification'
	// Timeout: default (handled by SmartLLMService)
};
```

### Model Selection

Per existing `SmartLLMService` patterns:

1. **Primary:** DeepSeek Chat V3 (best cost/quality)
2. **Fallback 1:** Gemini 2.5 Flash Lite (ultra-fast)
3. **Fallback 2:** GPT-4o Mini (reliable JSON)

---

## Props Update Pattern (Critical)

**IMPORTANT:** Tags must be APPENDED to props, never overwriting existing data.

```typescript
async function updateEntityWithClassification(
	supabase: SupabaseClient,
	tableName: string,
	entityId: string,
	classification: ClassificationResult
): Promise<void> {
	// Step 1: Fetch existing entity
	const { data: existing, error: fetchError } = await supabase
		.from(tableName)
		.select('props, type_key')
		.eq('id', entityId)
		.single();

	if (fetchError || !existing) {
		throw new Error(`Entity not found: ${entityId}`);
	}

	// Step 2: Safely merge props
	const currentProps = (existing.props as Record<string, unknown>) ?? {};
	const existingTags = Array.isArray(currentProps.tags) ? (currentProps.tags as string[]) : [];

	// Deduplicate tags
	const allTags = [...new Set([...existingTags, ...classification.tags])];

	// Step 3: Build new props (preserving all existing fields)
	const nextProps = {
		...currentProps,
		tags: allTags,
		_classification: {
			classified_at: new Date().toISOString(),
			confidence: classification.confidence,
			model_used: classification.model_used,
			previous_type_key: existing.type_key
		}
	};

	// Step 4: Update entity
	const { error: updateError } = await supabase
		.from(tableName)
		.update({
			type_key: classification.type_key,
			props: nextProps,
			updated_at: new Date().toISOString()
		})
		.eq('id', entityId);

	if (updateError) {
		throw new Error(`Failed to update entity: ${updateError.message}`);
	}
}
```

---

## Modal Changes

### Before (Two-Step Flow)

```
Step 1: Select Type
┌────────────────────────────────────────┐
│  What type of task?                    │
│                                        │
│  [Execute] [Review] [Research]         │
│  [Plan] [Coordinate]                   │
└────────────────────────────────────────┘

Step 2: Fill Details
┌────────────────────────────────────────┐
│  Create Execute Task                   │
│                                        │
│  Title: [_______________]              │
│  Description: [_______________]        │
│  Priority: [3]                         │
│                                        │
│  [Cancel]              [Create Task]   │
└────────────────────────────────────────┘
```

### After (Single-Step Flow)

```
Create Task
┌────────────────────────────────────────┐
│  Create Task                           │
│                                        │
│  Title: [_______________]              │
│  Description: [_______________]        │
│  Priority: [3]                         │
│                                        │
│  (Type will be auto-classified)        │
│                                        │
│  [Cancel]              [Create Task]   │
└────────────────────────────────────────┘
```

### Modals to Update

| Modal                | File Path                                                           | Changes                             |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| TaskCreateModal      | `/apps/web/src/lib/components/ontology/TaskCreateModal.svelte`      | Remove template selection step      |
| OutputCreateModal    | `/apps/web/src/lib/components/ontology/OutputCreateModal.svelte`    | Remove type grid                    |
| PlanCreateModal      | `/apps/web/src/lib/components/ontology/PlanCreateModal.svelte`      | Remove plan type selection          |
| GoalCreateModal      | `/apps/web/src/lib/components/ontology/GoalCreateModal.svelte`      | Remove goal type selection          |
| RiskCreateModal      | `/apps/web/src/lib/components/ontology/RiskCreateModal.svelte`      | Remove risk category selection      |
| MilestoneCreateModal | `/apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte` | Remove milestone type selection     |
| DecisionCreateModal  | `/apps/web/src/lib/components/ontology/DecisionCreateModal.svelte`  | Already simple (minimal changes)    |
| DocumentModal        | `/apps/web/src/lib/components/ontology/DocumentModal.svelte`        | Remove type input, keep rich editor |

---

## Error Handling

### Classification Failure Strategy

Per requirements: **Keep default type_key, log error for debugging**

```typescript
try {
	const classification = await classifyEntity(entity, entityType);
	await updateEntityWithClassification(supabase, tableName, entityId, classification);
} catch (error) {
	// Log error for debugging
	console.error(`Classification failed for ${entityType}:${entityId}:`, error);

	// Log to activity/audit system
	await logClassificationFailure({
		entityType,
		entityId,
		error: error.message,
		timestamp: new Date().toISOString()
	});

	// Entity keeps default type_key - no user notification
	// Return success=false for job tracking
	return {
		success: false,
		entityType,
		entityId,
		error: error.message,
		kept_default: true
	};
}
```

### Skip Classification Conditions

Skip LLM call for entities that don't need classification:

```typescript
function shouldSkipClassification(entity: OntologyEntity): boolean {
	// Skip if title is too short to classify meaningfully
	if (!entity.title || entity.title.trim().length < 3) {
		return true;
	}

	// Skip if already classified (not a default type_key)
	if (entity.type_key && !entity.type_key.endsWith('.default')) {
		return true;
	}

	return false;
}
```

---

## Implementation Checklist

### Phase 1: Worker Infrastructure

- [ ] Add `ClassifyOntologyJobMetadata` type to `/packages/shared-types/src/queue-types.ts`
- [ ] Create `ontologyClassifier.ts` processor in `/apps/worker/src/workers/ontology/`
- [ ] Add `POST /queue/ontology/classify` endpoint to `/apps/worker/src/index.ts`
- [ ] Register processor in `/apps/worker/src/worker.ts`
- [ ] Add `queueOntologyClassification()` to `RailwayWorkerService`

### Phase 2: API Updates

- [ ] Update `/api/onto/tasks/create` - use default type_key, queue classification
- [ ] Update `/api/onto/outputs/create` - same pattern
- [ ] Update `/api/onto/plans/create` - same pattern
- [ ] Update `/api/onto/goals/create` - same pattern
- [ ] Update `/api/onto/risks/create` - same pattern
- [ ] Update `/api/onto/milestones/create` - same pattern
- [ ] Update `/api/onto/decisions` - same pattern (if POST exists)
- [ ] Update `/api/onto/documents` - same pattern

### Phase 3: Modal Simplification

- [ ] Simplify `TaskCreateModal.svelte` - remove template step
- [ ] Simplify `OutputCreateModal.svelte` - remove type grid
- [ ] Simplify `PlanCreateModal.svelte` - remove type selection
- [ ] Simplify `GoalCreateModal.svelte` - remove type selection
- [ ] Simplify `RiskCreateModal.svelte` - remove category selection
- [ ] Simplify `MilestoneCreateModal.svelte` - remove type selection
- [ ] Update `DecisionCreateModal.svelte` - ensure default type_key
- [ ] Update `DocumentModal.svelte` - remove type input

### Phase 4: Testing & Validation

- [ ] Unit tests for classification prompt/response parsing
- [ ] Integration tests for queue flow
- [ ] E2E test: create entity → verify classification updates
- [ ] Load test: multiple simultaneous classifications

---

## Recommendations

### 1. Consider Adding Classification Status Field

While silent update was chosen, consider adding a `classification_status` enum to track:

- `pending` - Just created, awaiting classification
- `classified` - LLM classification complete
- `failed` - Classification failed, using default
- `manual` - User manually set type_key

This enables future features like "reclassify" buttons or classification dashboards.

### 2. Store Classification Metadata in Props

Already included in spec - the `_classification` object in props provides:

- Audit trail of when classification occurred
- Model used for debugging
- Previous type_key for rollback if needed

### 3. Consider Batch Classification

For bulk imports or migrations, consider a batch endpoint:

```
POST /queue/ontology/classify-batch
Body: { entities: [{ entityType, entityId }], userId }
```

### 4. User Override Tracking

When users manually edit type_key or tags post-classification, consider tracking:

```typescript
props._classification.user_overridden = true;
props._classification.user_override_at = timestamp;
```

### 5. Classification Quality Monitoring

Add metrics to track:

- Classification success rate by entity type
- Average confidence scores
- Most common type_keys assigned
- Model fallback frequency

---

## Open Questions

1. **Reclassification trigger:** Should edits to title/description trigger reclassification?
    - **Recommendation:** No - keep it simple. User can manually trigger if needed (future feature).

2. **Classification for existing entities:** Should we backfill classifications for existing entities?
    - **Recommendation:** Future enhancement. Create a migration script but don't block launch.

3. **Project context:** Should classification consider project type/context?
    - **Recommendation:** Yes - include project type_key in classification prompt for better results.

---

## File Locations Summary

| Component               | Path                                                            |
| ----------------------- | --------------------------------------------------------------- |
| **Shared Types**        | `/packages/shared-types/src/queue-types.ts`                     |
| **Worker Processor**    | `/apps/worker/src/workers/ontology/ontologyClassifier.ts` (new) |
| **Worker API**          | `/apps/worker/src/index.ts`                                     |
| **Worker Registration** | `/apps/worker/src/worker.ts`                                    |
| **Web Service**         | `/apps/web/src/lib/services/railwayWorker.service.ts`           |
| **Create APIs**         | `/apps/web/src/routes/api/onto/*/create/+server.ts`             |
| **Create Modals**       | `/apps/web/src/lib/components/ontology/*CreateModal.svelte`     |
| **Type Key Taxonomy**   | `/apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md`         |
| **This Spec**           | `/docs/specs/ONTOLOGY_LLM_CLASSIFICATION_SPEC.md`               |

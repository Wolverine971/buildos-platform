---
title: 'Ontology System Implementation Roadmap'
date: 2025-02-11
status: active
priority: high
tags: [ontology, fsm, roadmap, implementation]
related:
    - buildos-ontology-master-plan.md
    - 2025-02-11_ontology-deliverable-to-output-migration.md
path: thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md
---

# Ontology System Implementation Roadmap

## Current Status

✅ **Completed**:

- Schema designed with faceted metadata (3 facets: context, scale, stage)
- Migration file with DROP statements for clean recreation
- FSM engine with guard evaluation and action execution
- Type definitions with Zod validation
- 4 production-ready FSM templates (writer.book, personal.routine, founder.startup, marketer.campaign)
- Consistent "output" terminology across codebase
- Template resolver service with inheritance merging + Vitest coverage
- Template catalog endpoints (`/api/onto/templates`, `/api/onto/templates/[type_key]`) and browse UI (`/ontology/templates`) with filters + detail modal
- Ontology project surfaces: list dashboard, project detail aggregation, DocumentEditor + Tiptap workflow
- Output creation/update/generation endpoints wired to Supabase + OpenAI, with UI integration
- Expanded FSM actions (`create_doc_from_template`, `create_research_doc`, `run_llm_critique`, `email_user`, `email_admin`, `schedule_rrule`, `create_output`) plus action unit tests

🚧 **In Progress**:

- Task 1.2 helper functions — regression tests + large dataset perf baselines outstanding
- Task 2.1 instantiation service — transaction boundary + unit/integration tests still pending
- Task 2.x project/outputs APIs — add RLS-aware permission checks and error hardening
- FSM UI polish — guard introspection, transition audit feed, optimistic state handling
- AI content generation safeguards — rate limiting, error reporting, cost telemetry

❌ **Upcoming**:

- Integration test suite + API docs (Phase 5)
- FSM visualizer + richer template browser analytics (Phase 4 follow-up)
- Production rollout tasks (Phase 6)

---

## Phase 1: Database Foundation & Verification (Week 1)

**Goal**: Get the database schema live and verified with seed data.

### Task 1.1: Run Migration

**Priority**: 🔴 Critical
**Effort**: 10 minutes
**Dependencies**: None

**Spec**:

```bash
# Option 1: Via Supabase CLI (recommended)
supabase db reset

# Option 2: Direct psql
psql -h localhost -U postgres -d buildos < supabase/migrations/20250601000001_ontology_system.sql
```

**Acceptance Criteria**:

- [ ] Migration runs without errors
- [ ] All DROP statements execute successfully
- [ ] All tables created with `onto_` prefix
- [ ] System actor seeded (id: 00000000-0000-0000-0000-000000000001)
- [ ] 25 templates seeded
- [ ] 3 facet definitions created
- [ ] All facet values seeded

**Verification Queries**:

```sql
-- Verify tables exist
\dt onto_*

-- Count templates by scope
SELECT scope, COUNT(*) FROM onto_templates GROUP BY scope;
-- Expected: project=13, plan=2, output=3, document=3

-- Verify facet definitions
SELECT key, name, array_length(allowed_values, 1) as value_count
FROM onto_facet_definitions;
-- Expected: context (9 values), scale (5 values), stage (6 values)

-- Verify enhanced FSM templates
SELECT type_key, jsonb_array_length(fsm->'transitions') as transition_count
FROM onto_templates
WHERE type_key IN ('writer.book', 'personal.routine', 'founder.startup', 'marketer.campaign');
-- Expected: 3, 4, 4, 5 transitions respectively
```

---

### Task 1.2: Create Database Helper Functions

**Priority**: 🟡 High
**Effort**: 2 hours
**Dependencies**: Task 1.1

**Spec**: Create utility functions for common ontology operations.

**File**: `supabase/migrations/20250601000002_ontology_helpers.sql`

**Functions to Create**:

1. **`get_project_with_template(project_id uuid)`**
    - Returns project with resolved template (FSM, schema, defaults)
    - Used by UI to display available transitions

2. **`get_allowed_transitions(object_kind text, object_id uuid)`**
    - Returns array of allowed events from current state
    - Evaluates guards in database (for quick UI updates)

3. **`get_template_catalog(scope text DEFAULT NULL)`**
    - Returns templates with metadata for discovery
    - Filters by scope if provided
    - Orders by realm, then name

4. **`validate_facet_values(facets jsonb)`**
    - Validates that facet values exist in onto_facet_values
    - Returns validation errors if any
    - Used before insert/update

**Example Implementation**:

```sql
-- Function: Get allowed transitions for an entity
CREATE OR REPLACE FUNCTION get_allowed_transitions(
  p_object_kind text,
  p_object_id uuid
)
RETURNS TABLE (
  event text,
  to_state text,
  guards jsonb,
  actions jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_state text;
  v_type_key text;
  v_fsm jsonb;
BEGIN
  -- Get current state and type_key based on object_kind
  CASE p_object_kind
    WHEN 'project' THEN
      SELECT state_key, type_key INTO v_current_state, v_type_key
      FROM onto_projects WHERE id = p_object_id;
    WHEN 'task' THEN
      SELECT state_key, type_key INTO v_current_state, v_type_key
      FROM onto_tasks WHERE id = p_object_id;
    -- Add other cases...
  END CASE;

  -- Get FSM from template
  SELECT fsm INTO v_fsm
  FROM onto_templates
  WHERE type_key = v_type_key
  LIMIT 1;

  -- Return transitions from current state
  RETURN QUERY
  SELECT
    t->>'event' as event,
    t->>'to' as to_state,
    COALESCE(t->'guards', '[]'::jsonb) as guards,
    COALESCE(t->'actions', '[]'::jsonb) as actions
  FROM jsonb_array_elements(v_fsm->'transitions') t
  WHERE t->>'from' = v_current_state;
END;
$$;
```

**Acceptance Criteria**:

- [x] All 4 functions created
- [x] Functions handle NULL inputs gracefully (runtime guard clauses in SQL)
- [ ] Regression tests cover null-handling + guard evaluation
- [ ] Performance tested with 1000+ projects
- [x] Documentation added to migration file

---

## Phase 2: Project Instantiation (Week 1-2)

**Goal**: Enable creation of projects from ProjectSpec with full graph instantiation.

### Task 2.1: Build Instantiation Service

**Priority**: 🔴 Critical
**Effort**: 8 hours
**Dependencies**: Task 1.1

**Spec**: Create service that takes ProjectSpec and creates all entities.

**File**: `apps/web/src/lib/services/ontology/instantiation.service.ts`

**Core Functions**:

```typescript
/**
 * Instantiate a project from a ProjectSpec
 * Creates: project, goals, requirements, plans, tasks, outputs, documents, edges
 * Returns: { project_id, entity_counts }
 */
export async function instantiateProject(
	spec: ProjectSpec,
	userId: string
): Promise<{
	project_id: string;
	counts: {
		goals: number;
		requirements: number;
		plans: number;
		tasks: number;
		outputs: number;
		documents: number;
		edges: number;
	};
}> {
	// Implementation steps:
	// 1. Validate spec against ProjectSpecSchema
	// 2. Ensure actor exists for user
	// 3. Get template and merge facet_defaults with spec facets
	// 4. Begin transaction
	// 5. Insert project
	// 6. Insert goals and create edges
	// 7. Insert requirements
	// 8. Insert plans and create edges
	// 9. Insert tasks (link to plans) and create edges
	// 10. Insert outputs and create edges
	// 11. Insert documents and create edges
	// 12. Insert sources and create edges
	// 13. Insert metrics, milestones, risks, decisions
	// 14. Insert any explicit edges from spec
	// 15. Commit transaction
	// 16. Return project_id and counts
}

/**
 * Resolve facets: template defaults + AI suggestions + user overrides
 */
function resolveFacets(
	templateDefaults: FacetDefaults | undefined,
	specFacets: Facets | undefined
): Facets {
	// User-specified facets win over template defaults
	return {
		context: specFacets?.context ?? templateDefaults?.context,
		scale: specFacets?.scale ?? templateDefaults?.scale,
		stage: specFacets?.stage ?? templateDefaults?.stage
	};
}

/**
 * Validate ProjectSpec and return structured errors
 */
export function validateProjectSpec(spec: unknown): { valid: boolean; errors: string[] } {
	// Use Zod validation from onto.ts
	const result = ProjectSpecSchema.safeParse(spec);
	if (result.success) return { valid: true, errors: [] };
	return {
		valid: false,
		errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
	};
}
```

**Status (2025-02-12)**:

- Service ensures actors via `ensure_actor_for_user`, merges template defaults, validates facets, and builds edges for goals/plans/tasks/outputs/documents/sources/metrics/milestones/risks/decisions.
- Counts + edge creation implemented; errors surface with contextual messages via `OntologyInstantiationError`.
- Outstanding: wrap inserts in an explicit transaction (or Supabase `rpc` wrapper) to guarantee all-or-nothing semantics; add idempotency guard (e.g., spec hash) for retry safety; add instrumentation for counts mismatch vs inserted arrays.
- No automated tests yet—need unit coverage around facet validation + plan/task linking plus integration test hitting the Supabase emulator.

**Error Handling**:

- Validate spec before starting
- Use database transaction for atomicity
- Roll back on any error
- Return detailed error messages with field paths

**Edge Cases**:

- Handle missing template (create with draft status?)
- Handle invalid facet values
- Handle duplicate names
- Handle orphaned tasks (plan_name not found)

**Acceptance Criteria**:

- [x] Function validates spec before proceeding
- [x] Creates all entity types from spec
- [x] Creates edges for relationships
- [x] Merges template facet_defaults with spec facets
- [ ] Uses database transaction (all-or-nothing)
- [x] Returns entity counts for verification
- [x] Handles errors gracefully with rollback
- [ ] Unit tests cover happy path and errors (currently only facet + schema helpers)

---

### Task 2.2: Create Instantiation API Endpoint

**Priority**: 🔴 Critical
**Effort**: 2 hours
**Dependencies**: Task 2.1

**Spec**: Create REST endpoint for project instantiation.

**File**: `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`

**Implementation**:

```typescript
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	instantiateProject,
	validateProjectSpec
} from '$lib/services/ontology/instantiation.service';
import { ProjectSpecSchema } from '$lib/types/onto';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Authenticate user
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	// 2. Parse request body
	const body = await request.json();

	// 3. Validate ProjectSpec
	const validation = validateProjectSpec(body);
	if (!validation.valid) {
		throw error(400, {
			message: 'Invalid ProjectSpec',
			errors: validation.errors
		});
	}

	const spec = body as ProjectSpec;

	// 4. Instantiate project
	try {
		const result = await instantiateProject(spec, user.id);

		return json({
			success: true,
			project_id: result.project_id,
			counts: result.counts
		});
	} catch (err) {
		console.error('[Instantiation] Failed:', err);
		throw error(500, {
			message: 'Project instantiation failed',
			details: err instanceof Error ? err.message : 'Unknown error'
		});
	}
};
```

**Request Example**:

```json
POST /api/onto/projects/instantiate

{
  "project": {
    "name": "My Science Fiction Novel",
    "description": "A thrilling story about AI consciousness",
    "type_key": "writer.book",
    "props": {
      "genre": "science fiction",
      "target_word_count": 90000,
      "deadline": "2025-12-31",
      "facets": {
        "context": "commercial",
        "scale": "large",
        "stage": "planning"
      }
    }
  },
  "goals": [
    { "name": "Complete first draft", "props": {} },
    { "name": "Submit to publisher", "props": {} }
  ],
  "tasks": [
    { "title": "Outline plot structure", "priority": 1 },
    { "title": "Develop main characters", "priority": 1 }
  ]
}
```

**Response Example**:

```json
{
	"success": true,
	"project_id": "uuid-here",
	"counts": {
		"goals": 2,
		"requirements": 0,
		"plans": 0,
		"tasks": 2,
		"outputs": 0,
		"documents": 0,
		"edges": 4
	}
}
```

> 2025-02-12 update: Implementation now uses shared templating helpers (`renderTemplate`, `stripHtml`), default body fallbacks, and returns explicit send failures via the Gmail-backed `sendEmail` utility. See `apps/web/src/lib/server/fsm/actions/email-user.ts`.

**Acceptance Criteria**:

- [x] Endpoint requires authentication
- [x] Validates ProjectSpec before instantiation
- [x] Returns 400 with errors for invalid spec
- [x] Returns 500 with details on instantiation failure
- [x] Returns 200 with project_id and counts on success
- [ ] Integration test covers full flow

---

### Task 2.3: Create Template Catalog Endpoint

**Priority**: 🟡 High
**Effort**: 1 hour
**Dependencies**: Task 1.1

**Spec**: API endpoint to fetch templates for discovery. Must power filters in `/ontology/templates` and support inheritance-aware detail views.

**Files**:

- `apps/web/src/routes/api/onto/templates/+server.ts`
- `apps/web/src/routes/api/onto/templates/[type_key]/+server.ts`
- `apps/web/src/lib/services/ontology/template-resolver.service.ts`

**Implementation (2025-02-12)**:

- Requires auth; reads query params for `scope`, `realm`, `search`, `primitive`, `context[]`, `scale[]`, `stage[]`, `sort`, and `direction`.
- If a scope is supplied, pulls concrete templates via `getAvailableTemplates(scope)` which resolves inheritance (merging schema, defaults, metadata) and filters in-memory.
- Special-cases text documents (`primitive=TEXT_DOCUMENT`) to reuse `getTextDocumentTemplates()` (children of `output.document`).
- Falls back to `get_template_catalog` RPC when scope is omitted (e.g., global search).
- Normalises sort order (`name`, `type_key`, `realm`, `scope`, `status`) and groups results by realm for the UI.
- Detail endpoint resolves a single template with inheritance chain, child templates, and sibling navigation.

```typescript
const scope = url.searchParams.get('scope');
const contexts = url.searchParams.getAll('context');
const sort = url.searchParams.get('sort') ?? 'name';
const direction = (url.searchParams.get('direction') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

if (primitive === 'TEXT_DOCUMENT' && scope === 'output') {
	templates = await getTextDocumentTemplates();
} else if (scope) {
	templates = await getAvailableTemplates(scope, false)
		.filter(byRealm(realm))
		.filter(byFacets({ contexts, scales, stages }))
		.filter(byPrimitive(primitive))
		.filter(bySearch(search));
} else {
	const { data } = await client.rpc('get_template_catalog', { p_scope: scope ?? undefined, ... });
	templates = data ?? [];
}

const grouped = sortTemplates(templates, sort, direction).reduce(...);
return json({ templates: sorted, grouped, count: sorted.length });
```

**Acceptance Criteria**:

- [x] Requires authentication
- [x] Returns active templates by default
- [x] Filters by scope and realm when provided
- [x] Supports keyword search (type_key, name, metadata description/keywords)
- [x] Supports facet filtering (context/scale/stage arrays)
- [x] Supports primitive-aware shortcuts (e.g., TEXT_DOCUMENT)
- [x] Supports sort + direction parameters
- [x] Groups templates by realm for UI consumption
- [x] Provides detail endpoint with inheritance chain + children
- [ ] Cache/paginate for large catalogs (>500 templates)
- [ ] Contract tests for resolver + endpoints (unit + integration)

---

### Task 2.4: Project Dashboard Summaries

**Priority**: 🟡 High  
**Effort**: 3 hours  
**Dependencies**: Task 2.1

**Spec**: Provide an authenticated API for dashboard views to load project summaries with derived counts and wire the `/ontology` page to use it (outputs instead of legacy deliverables).

**Files**:

- `apps/web/src/routes/api/onto/projects/+server.ts`
- `apps/web/src/routes/ontology/+page.server.ts`
- `apps/web/src/routes/ontology/+page.svelte`

**Acceptance Criteria**:

- [x] Endpoint requires authentication
- [x] Returns project metadata plus task/output counts
- [x] UI dashboard consumes API response
- [x] Dashboard supports search + facet filters with quick stats
- [ ] Add caching/perf guard rails for 1000+ projects
- [ ] Integration/regression test coverage

---

### Task 2.5: Output Management APIs

**Priority**: 🟡 High  
**Effort**: 4 hours  
**Dependencies**: Task 1.2, Task 2.3

**Spec**: Provide create/update/read + AI generation endpoints for outputs so the Document Editor and FSM actions share the same backend contract.

**Files**:

- `apps/web/src/routes/api/onto/outputs/create/+server.ts`
- `apps/web/src/routes/api/onto/outputs/[id]/+server.ts`
- `apps/web/src/routes/api/onto/outputs/generate/+server.ts`
- `apps/web/src/lib/services/ontology/template-resolver.service.ts`

**Status (2025-02-12)**:

- Create endpoint validates template via resolver, ensures actor via `ensure_actor_for_user`, merges template defaults, and inserts `onto_outputs` + `onto_edges`.
- GET/PATCH endpoint retrieves or updates outputs; update currently trusts any authenticated user (TODO: project membership check + RLS alignment).
- Generate endpoint resolves template + project context, builds tailored prompt, and calls OpenAI `gpt-4-turbo-preview`; feeds DocumentEditor AI panel.
- Outstanding: add rate limiting + cost telemetry for OpenAI usage, enforce ownership/organization checks on create/update, mock OpenAI for tests.

**Acceptance Criteria**:

- [x] Endpoints require authentication
- [x] Create merges template defaults, ensures actor, and links output to project
- [x] Update endpoint persists name/state/props changes
- [x] Generate endpoint returns HTML content based on template + instructions
- [ ] Enforce project/org permission checks (RLS-aware) on create/update
- [ ] Unit/integration tests with mocked Supabase + OpenAI
- [ ] Rate limiting + error telemetry for AI generation

---

## Phase 3: FSM Action Implementation (Week 2-3)

**Goal**: Implement all stub actions in the FSM engine.

### Task 3.1: Implement `notify` Action

**Priority**: 🔴 Critical
**Effort**: 3 hours
**Dependencies**: Task 1.1

**Spec**: Integrate FSM notify action with existing notification system.

**File**: `apps/web/src/lib/server/fsm/actions/notify.ts`

**Integration Point**: Your existing notification system at `/apps/web/src/lib/components/notifications/`

**Implementation**: Created `apps/web/src/lib/server/fsm/actions/notify.ts` and wired it into the FSM engine. The action:

- Resolves recipients from `action.to_actor_ids` with a fallback to the triggering actor
- Looks up each actor’s `user_id` via `onto_actors`
- Inserts rows into `user_notifications` with event/type `ontology.fsm_transition` and deep-links back to the project detail page
- Returns a descriptive string (`notify(n actors)`) for logging and diagnostics

**Acceptance Criteria**:

- [x] Creates notification in existing system
- [ ] Notification appears in UI (needs manual verification)
- [x] Supports multiple recipients via to_actor_ids
- [ ] Includes project/entity context in metadata (PAUSED – action URL provided, richer metadata requires schema change)
- [x] Falls back to actor_id if no recipients specified
- [x] Returns descriptive string for logging

---

### Task 3.2: Implement `create_output` Action

**Priority**: 🟡 High
**Effort**: 2 hours
**Dependencies**: Task 1.1

**Spec**: Create outputs (formerly deliverables) from FSM actions.

**File**: `apps/web/src/lib/server/fsm/actions/create-output.ts`

**Implementation**: Added `apps/web/src/lib/server/fsm/actions/create-output.ts` and replaced the stubbed branch in the FSM engine. Highlights:

- Loads the referenced output template (when present) to merge `default_props` and `facet_defaults` with action-supplied props
- Normalises facets (template defaults < action overrides) and strips any stray `state_key` from props, using it for the record’s `state_key` (default `draft`)
- Inserts the output row with the transition actor as `created_by` and creates a `produces` edge from the source entity
- Returns a descriptive string for transition logging (consistent with other actions)

**Acceptance Criteria**:

- [x] Creates output in `onto_outputs`
- [x] Merges template defaults with action props
- [x] Creates edge linking entity to output
- [ ] Returns output identifier for follow-up actions (currently only logged string)
- [x] Handles missing template gracefully (merges against empty defaults)
- [ ] Validates type_key exists (still relies on declarative guard/template setup)

---

### Task 3.3: Implement `schedule_rrule` Action

**Priority**: 🟡 High
**Effort**: 4 hours
**Dependencies**: Task 1.1

**Spec**: Parse RRULE and generate recurring tasks.

**File**: `apps/web/src/lib/server/fsm/actions/schedule-rrule.ts`

**Library**: Use `rrule` npm package for parsing

```bash
pnpm add rrule
```

**Implementation**:

```typescript
import { RRule } from 'rrule';

export async function executeScheduleRruleAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext
): Promise<string> {
	const rruleString = action.rrule;
	const taskTemplate = action.task_template;

	if (!rruleString || !taskTemplate) {
		throw new Error('schedule_rrule requires rrule and task_template');
	}

	// Parse RRULE
	const rule = RRule.fromString(rruleString);

	// Generate dates (limit to prevent infinite loops)
	const maxOccurrences = 365; // safety limit
	const dates = rule.all((date, i) => i < maxOccurrences);

	const client = createAdminSupabaseClient();

	// Create task for each occurrence
	const tasks = dates.map((date, index) => ({
		project_id: entity.project_id,
		plan_id: action.plan_id || null,
		title: `${taskTemplate.title} (${index + 1})`,
		state_key: 'todo',
		due_at: date.toISOString(),
		props: {
			...taskTemplate.props,
			recurrence_index: index,
			recurrence_date: date.toISOString()
		},
		created_by: ctx.actor_id
	}));

	const { error } = await client.from('onto_tasks').insert(tasks);

	if (error) {
		throw new Error(`Failed to schedule tasks: ${error.message}`);
	}

	return `schedule_rrule(${dates.length} tasks)`;
}
```

**RRULE Examples**:

```typescript
// Daily for 21 days (habit trial)
'FREQ=DAILY;COUNT=21';

// Weekly on Monday for 12 weeks
'FREQ=WEEKLY;BYDAY=MO;COUNT=12';

// Daily forever (ongoing habit)
'FREQ=DAILY';

// Daily for 30 days (campaign monitoring)
'FREQ=DAILY;COUNT=30';
```

**Acceptance Criteria**:

- [x] Parses RRULE string correctly
- [x] Generates task instances with due dates
- [x] Limits to 365 occurrences for safety
- [x] Links tasks to project and optional plan
- [x] Includes recurrence metadata in props
- [x] Returns count of tasks created (via log string)

---

### Task 3.4: Implement `email_user` Action

**Priority**: 🟠 Medium
**Effort**: 2 hours
**Dependencies**: Task 1.1

**Spec**: Send email to user via existing email infrastructure.

**File**: `apps/web/src/lib/server/fsm/actions/email-user.ts`

**Integration**: Connect to your existing email service (likely Nodemailer based on daily brief system)

**Implementation**:

```typescript
import { sendEmail } from '$lib/services/email.service';

export async function executeEmailUserAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext
): Promise<string> {
	const subject = action.subject || 'Project Update';
	const bodyTemplate = action.body_template || action.body || '';

	if (!ctx.user_id) {
		console.warn('[FSM] email_user: No user_id in context');
		return 'email_user(skipped - no user)';
	}

	// Get user email
	const client = createAdminSupabaseClient();
	const { data: user } = await client
		.from('users')
		.select('email, name')
		.eq('id', ctx.user_id)
		.single();

	if (!user?.email) {
		console.warn('[FSM] email_user: User has no email');
		return 'email_user(skipped - no email)';
	}

	// Render template with entity data
	const body = renderTemplate(bodyTemplate, {
		user_name: user.name,
		project_name: entity.name,
		project_id: entity.project_id,
		state: entity.state_key,
		...entity.props
	});

	// Send via existing email service
	await sendEmail({
		to: user.email,
		subject,
		html: body,
		metadata: {
			project_id: entity.project_id,
			entity_id: entity.id,
			trigger: 'fsm_transition'
		}
	});

	return `email_user(${user.email})`;
}

function renderTemplate(template: string, data: Record<string, any>): string {
	// Simple template rendering (replace {{key}} with data[key])
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return data[key] || match;
	});
}
```

> 2025-02-12 update: The production version merges template defaults via `mergeDeep`, supports research notes rendering, generates document versions, persists provenance edges, and shares templating helpers. See `apps/web/src/lib/server/fsm/actions/create-doc-from-template.ts`.

**Acceptance Criteria**:

- [x] Gets user email from database
- [x] Renders body_template with entity data
- [x] Sends email via existing service
- [x] Handles missing user gracefully (skip, don't fail)
- [x] Returns email address in log string
- [x] Supports template variables like {{user_name}}, {{project_name}}
- [x] Unit tests cover default template + token rendering (`email-user.test.ts`)

---

### Task 3.5: Implement `create_doc_from_template` Action

**Priority**: 🟠 Medium
**Effort**: 3 hours
**Dependencies**: Task 1.1

**Spec**: Generate documents from templates with variable substitution.

**File**: `apps/web/src/lib/server/fsm/actions/create-doc-from-template.ts`

**Implementation**:

```typescript
export async function executeCreateDocFromTemplateAction(
	action: FSMAction,
	entity: EntityRow,
	ctx: TransitionContext
): Promise<string> {
	const templateKey = action.template_key;
	const variables = action.variables || {};

	if (!templateKey) {
		throw new Error('create_doc_from_template requires template_key');
	}

	const client = createAdminSupabaseClient();

	// Get document template
	const { data: template } = await client
		.from('onto_templates')
		.select('name, default_props, schema')
		.eq('type_key', templateKey)
		.eq('scope', 'document')
		.single();

	if (!template) {
		throw new Error(`Document template not found: ${templateKey}`);
	}

	// Render title with variables
	const title = renderTemplate(template.name, variables);

	// Create document
	const { data: doc, error: docError } = await client
		.from('onto_documents')
		.insert({
			project_id: entity.project_id,
			title,
			type_key: templateKey,
			props: {
				...template.default_props,
				variables,
				generated_by_fsm: true
			},
			created_by: ctx.actor_id
		})
		.select('id')
		.single();

	if (docError) {
		throw new Error(`Failed to create document: ${docError.message}`);
	}

	// Create initial version with generated content
	const content = await generateDocumentContent(templateKey, entity, variables);

	await client.from('onto_document_versions').insert({
		document_id: doc.id,
		number: 1,
		storage_uri: `generated/${doc.id}/v1.md`,
		props: {
			content,
			generated_at: new Date().toISOString()
		},
		created_by: ctx.actor_id
	});

	// Create edge
	await client.from('onto_edges').insert({
		src_kind: getEntityKind(entity),
		src_id: entity.id,
		rel: 'produces',
		dst_kind: 'document',
		dst_id: doc.id,
		props: {}
	});

	return `create_doc_from_template(${title})`;
}

async function generateDocumentContent(
	templateKey: string,
	entity: EntityRow,
	variables: Record<string, any>
): Promise<string> {
	// Template-specific content generation
	switch (templateKey) {
		case 'doc.campaign_report':
			return generateCampaignReport(entity, variables);

		case 'doc.brief':
			return generateProjectBrief(entity, variables);

		default:
			return `# ${templateKey}\n\nGenerated from ${entity.name}`;
	}
}

function generateCampaignReport(entity: EntityRow, variables: Record<string, any>): string {
	const props = entity.props as any;
	return `
# Campaign Performance Report
## Campaign: ${variables.campaign_name || entity.name}

### Overview
- **Goal**: ${props.campaign_goal || 'N/A'}
- **Duration**: ${props.start_date} to ${props.end_date}
- **Budget**: $${props.budget || 0}
- **Channels**: ${(props.channels || []).join(', ')}

### Performance Metrics
- **Impressions**: ${props.performance_metrics?.impressions || 0}
- **Clicks**: ${props.performance_metrics?.clicks || 0}
- **Conversions**: ${props.performance_metrics?.conversions || 0}
- **ROI**: ${props.performance_metrics?.roi || 0}%

### Key Learnings
[Document key insights from the campaign]

### Recommendations
[List recommendations for future campaigns]
  `.trim();
}
```

**Acceptance Criteria**:

- [x] Fetches document template
- [x] Renders title with variables
- [x] Creates document record
- [x] Creates initial version with generated content
- [x] Content is template-specific (campaign report, brief, etc.)
- [x] Creates edge linking entity to document
- [x] Returns document title in log string
- [x] Regression tests cover content generators (`create-doc-from-template.test.ts`)

### Task 3.6: Implement `create_research_doc` Action

**Priority**: 🟠 Medium
**Effort**: 3 hours
**Dependencies**: Task 3.5

**Spec**: Generate research notes document with structured source summaries.

**File**: `apps/web/src/lib/server/fsm/actions/create-research-doc.ts`

**Acceptance Criteria**:

- [x] Requires `topic` and handles optional `sources` array (onto_sources IDs)
- [x] Loads sources and captures title/notes metadata
- [x] Generates merged summary + passes variables to doc template (`doc.notes`)
- [x] Leverages existing `create_doc_from_template` workflow for persistence
- [x] Stores sources + summary in document props for downstream UI
- [x] Unit tests cover summary builder (`create-research-doc.test.ts`)

### Task 3.7: Implement `run_llm_critique` Action

**Priority**: 🟠 Medium
**Effort**: 2 hours
**Dependencies**: Task 3.5

**Spec**: Produce automated critique metadata for outputs based on rubric + heuristics.

**File**: `apps/web/src/lib/server/fsm/actions/run-llm-critique.ts`

**Acceptance Criteria**:

- [x] Requires `output_id` (and optional `rubric_key`)
- [x] Fetches output record and appends critique entry to `props.critiques`
- [x] Generates checklist with state/content heuristics (no external API dependency)
- [x] Captures actor_id/user_id for audit trail
- [x] Returns deterministic log string for FSM logging
- [x] Unit tests cover critique payload builder (`run-llm-critique.test.ts`)

---

### Task 3.8: Implement `email_admin` Action

**Priority**: 🟠 Medium  
**Effort**: 2 hours  
**Dependencies**: Task 3.4

**Spec**: Notify BuildOS admins (or explicit recipients) when high-signal FSM transitions occur (e.g., project escalations, failed automations).

**File**: `apps/web/src/lib/server/fsm/actions/email-admin.ts`

**Implementation**:

- Resolves manual comma-separated `action.to` overrides; otherwise fetches all admin users (`is_admin = true`).
- Builds templated context with entity metadata, transition actor/user IDs, and project ID.
- Uses shared `renderTemplate` + `stripHtml` helpers and `sendEmail` utility; aggregates failures before throwing.
- Default template summarises entity/state and trigger context.

**Acceptance Criteria**:

- [x] Supports manual recipient override via `action.to`
- [x] Falls back to querying admin users when `action.to` missing
- [x] Renders template with entity + context metadata
- [x] Sends via shared email utility and returns descriptive log string
- [x] Unit tests cover default template + manual recipient path (`email-admin.test.ts`)
- [ ] Scope admin fetch by org/tenant once multi-org enabled
- [ ] Add structured logging/telemetry for delivery outcomes

---

## Phase 4: UI Components (Week 3-4)

**Goal**: Build user-facing components for template selection, project creation, and FSM visualization.

### Task 4.1: Template Catalog Experience

**Priority**: 🟡 High  
**Effort**: 8 hours  
**Dependencies**: Task 2.3

**Spec**: Deliver a discovery experience at `/ontology/templates` with faceted filtering, deep links to template details, and launch points for project creation.

**Files**:

- `apps/web/src/routes/ontology/templates/+page.server.ts`
- `apps/web/src/routes/ontology/templates/+page.svelte`
- `apps/web/src/lib/components/ontology/templates/TemplateCard.svelte`
- `apps/web/src/lib/components/ontology/templates/TemplateDetailModal.svelte`

**Status (2025-02-12)**:

- Server load layer proxies `/api/onto/templates`, forwards facets/scope/realm filters, and precomputes grouped views + filter options.
- Page implements searchable/filterable catalog with realm vs scope toggle, sort controls, and query-param-driven state (debounced to reduce fetch spam).
- Detail modal fetches inheritance-resolved template payload, lists child templates, and deep-links via `?detail=type_key`.
- CTA buttons hand off to `/ontology/create?template=…` for instantiation.
- Outstanding: skeleton states while fetching detail payloads, analytics for filter usage, Playwright regression.

**Acceptance Criteria**:

- [x] Loads grouped templates by realm with search/filter/sort controls
- [x] Facet filters (context/scale/stage) update URL query params and results
- [x] Template detail modal shows schema fields, FSM states, inheritance chain, and children
- [x] Supports scope vs realm view modes
- [x] Deep-linking works via `?detail=` on initial load
- [x] Allows launching project creation from catalog
- [ ] Skeleton/loading states + retry UI for detail modal/API failures
- [ ] Accessibility pass (focus management, ARIA roles) for modal + filters
- [ ] Component-level tests (Vitest/Playwright) for filter + detail flows

---

### Task 4.2: FSM State Controls

**Priority**: 🟡 High  
**Effort**: 6 hours (additional polish)  
**Dependencies**: Task 2.5, Phase 3

**Spec**: Surface FSM state + transitions on project detail pages (and eventually other entities), displaying available events, executing transitions, and reflecting results/guards.

**Files**:

- `apps/web/src/routes/ontology/projects/[id]/+page.server.ts`
- `apps/web/src/routes/ontology/projects/[id]/+page.svelte`

**Status (2025-02-12)**:

- Introduced reusable `FSMStateVisualizer` component (Svelte) that fetches transitions via new `/api/onto/fsm/transitions` endpoint, renders guard/action metadata, and executes transitions inline.
- Project detail page now embeds the component; success banner surfaces executed actions and refreshes data by dispatching `stateChange`.
- Outstanding: toast-level notifications/history feed, optimistic state sync with other tabs, and extending the component to tasks/outputs/documents.

**Acceptance Criteria**:

- [x] Displays current state prominently
- [x] Lists available transitions from `get_allowed_transitions`
- [x] Executes transitions via API and refreshes state afterwards
- [x] Disables buttons while request in-flight and shows error banner on failure
- [x] Display guard details (passed/failed) and action previews inline
- [ ] Toast/log success message with actions executed
- [x] Extract reusable component for other entity kinds (tasks/outputs/documents)
- [ ] Add optimistic UI + loading indicators beyond button disable
- [ ] Playwright/Vitest coverage for transition happy path + guard failure

---

### Task 4.3: Project Creation Flow

**Priority**: 🟡 High  
**Effort**: 6 hours (follow-up)  
**Dependencies**: Task 2.1, Task 4.1

**Spec**: Let users pick a template and instantiate a project with facet overrides and template-driven props.

**Files**:

- `apps/web/src/routes/ontology/create/+page.server.ts`
- `apps/web/src/routes/ontology/create/+page.svelte`

**Status (2025-02-12)**:

- Landing state shows catalog grouped by realm (reuses template resolver payload); selecting a template pre-fills facets and compiles the schema definition.
- Form now renders schema-driven inputs (string/enum/number/integer/boolean/array) with inline validation, taxonomy-backed facet selects, and optional goal/task seed sections; submissions normalise the payload before calling `/api/onto/projects/instantiate`.
- Outstanding: extend staging to plans/outputs/documents, add progress autosave + success toasts, and cover the flow with automated tests.

**Acceptance Criteria**:

- [x] Template selection state reuses catalog data and pre-fills defaults
- [x] Project form submits spec to instantiation API and redirects on success
- [x] Validation prevents submit without template/name
- [x] Dynamic form generation for schema fields (enum, arrays, booleans, required markers)
- [x] Optional sections to add goals/tasks before submission (plans/outputs/documents still pending)
- [x] Facet selectors use facet taxonomy (labels/descriptions) instead of raw values
- [x] Inline field-level validation + error messaging
- [ ] Loading/success toasts + optimistic disable states
- [ ] Tests covering happy path + validation errors

---

### Task 4.4: Document Editor & Output Workflow

**Priority**: 🟡 High  
**Effort**: 8 hours (follow-up)  
**Dependencies**: Task 2.5, Task 3.5

**Spec**: Rich text editing experience for text outputs with AI assistance, version metadata, and API-driven persistence.

**Files**:

- `apps/web/src/lib/components/ontology/DocumentEditor.svelte`
- `apps/web/src/routes/ontology/projects/[id]/outputs/[outputId]/edit/+page.{server,svelte}`
- `apps/web/src/routes/api/onto/outputs/[id]/+server.ts`
- `apps/web/src/routes/api/onto/outputs/generate/+server.ts`

**Status (2025-02-12)**:

- DocumentEditor wraps Tiptap with toolbar (bold/italic/lists/headings/alignment/link/image/color), word count, dirty/save state, and optional AI panel.
- Save handler issues `PATCH /api/onto/outputs/[id]` requests and updates props (content, word_count, etc.).
- AI panel posts to `/api/onto/outputs/generate` to stream HTML content (non-streaming response) and replaces editor content.
- Output edit page wires DocumentEditor, breadcrumbs, and project context.
- Outstanding: autosave with debounce, version history integration (currently updates props only), permission checks on API, undo-friendly diff view, offline guard rails, OpenAI cost telemetry.

**Acceptance Criteria**:

- [x] Renders Tiptap editor with toolbar + keyboard shortcuts
- [x] Tracks dirty state, disables save button while request in-flight, and reports errors
- [x] AI generation integrates with template resolver + project context
- [x] Save endpoint updates output props (content, word_count, content_type)
- [ ] Autosave and version history support (persist new version rows)
- [ ] Permission enforcement and audit logging on PATCH endpoint
- [ ] Streaming AI generation + cancellation UX
- [ ] Tests for DocumentEditor helpers + API routes (mock Supabase/OpenAI)
- [ ] Accessibility review (toolbar focus, announce save states)

---

## Phase 5: Testing & Documentation (Week 4)

**Goal**: Comprehensive testing and documentation for production readiness.

### Task 5.1: Integration Tests

**Priority**: 🟡 High
**Effort**: 6 hours

**Spec**: Write integration tests for end-to-end flows.

**File**: `apps/web/src/lib/tests/integration/ontology.test.ts`

**Test Scenarios**:

```typescript
describe('Ontology System Integration', () => {
	describe('Project Instantiation', () => {
		it('creates writer.book project with all entities', async () => {
			const spec: ProjectSpec = {
				project: {
					name: 'Test Novel',
					type_key: 'writer.book',
					props: {
						genre: 'sci-fi',
						target_word_count: 50000,
						facets: { context: 'personal', scale: 'large', stage: 'planning' }
					}
				},
				goals: [{ name: 'Complete draft' }],
				tasks: [{ title: 'Outline plot' }]
			};

			const result = await instantiateProject(spec, testUserId);

			expect(result.project_id).toBeDefined();
			expect(result.counts.goals).toBe(1);
			expect(result.counts.tasks).toBe(1);

			// Verify project in database
			const project = await getProject(result.project_id);
			expect(project.name).toBe('Test Novel');
			expect(project.facet_context).toBe('personal');
		});
	});

	describe('FSM Transitions', () => {
		it('executes writer.book start_writing transition', async () => {
			// Create project
			const project = await createTestProject('writer.book');

			// Execute transition
			const result = await runTransition(
				{
					object_kind: 'project',
					object_id: project.id,
					event: 'start_writing'
				},
				{ actor_id: testActorId, user_id: testUserId }
			);

			expect(result.ok).toBe(true);
			expect(result.state_after).toBe('writing');
			expect(result.actions_run).toContain('spawn_tasks(5 tasks)');
			expect(result.actions_run).toContain('update_facets({"stage":"execution"})');

			// Verify tasks were created
			const tasks = await getProjectTasks(project.id);
			expect(tasks.length).toBe(5);
			expect(tasks[0].title).toContain('Chapter');
		});

		it('rejects transition when guard fails', async () => {
			// Create project without target_word_count
			const project = await createTestProject('writer.book', {
				props: {} // missing target_word_count
			});

			const result = await runTransition(
				{
					object_kind: 'project',
					object_id: project.id,
					event: 'start_writing'
				},
				{ actor_id: testActorId, user_id: testUserId }
			);

			expect(result.ok).toBe(false);
			expect(result.error).toContain('Guard check failed');
			expect(result.guard_failures).toBeDefined();
		});
	});

	describe('Actions', () => {
		it('notify action creates notification', async () => {
			const project = await createTestProject('writer.book');

			// Execute transition with notify action
			await runTransition(
				{
					object_kind: 'project',
					object_id: project.id,
					event: 'start_writing'
				},
				{ actor_id: testActorId, user_id: testUserId }
			);

			// Verify notification created
			const notifications = await getUserNotifications(testUserId);
			expect(notifications.length).toBeGreaterThan(0);
			expect(notifications[0].message).toContain('Writing phase started');
		});

		it('schedule_rrule creates recurring tasks', async () => {
			const project = await createTestProject('personal.routine', {
				props: { frequency: 'daily', time_of_day: 'morning' }
			});

			await runTransition(
				{
					object_kind: 'project',
					object_id: project.id,
					event: 'start_trial'
				},
				{ actor_id: testActorId, user_id: testUserId }
			);

			// Verify 21 tasks created
			const tasks = await getProjectTasks(project.id);
			expect(tasks.length).toBe(21);

			// Verify tasks have sequential due dates
			expect(new Date(tasks[1].due_at).getTime()).toBeGreaterThan(
				new Date(tasks[0].due_at).getTime()
			);
		});
	});
});
```

**Acceptance Criteria**:

- [ ] Tests cover all 4 enhanced FSMs
- [ ] Tests verify guard evaluation
- [ ] Tests verify action execution
- [ ] Tests check database state after operations
- [ ] Tests use test database/transactions
- [ ] All tests pass

---

### Task 5.2: API Documentation

**Priority**: 🟠 Medium
**Effort**: 3 hours

**Spec**: Document all ontology API endpoints.

**File**: `docs/api/ontology-endpoints.md`

**Status (2025-02-12)**:

- Authenticated REST endpoints documented in `docs/api/ontology-endpoints.md`, covering projects, templates, FSM transitions, and outputs (request/response examples + error handling guidance).
- Outstanding: surface the page in the public docs navigation and add automated checks to keep examples in sync with schema changes.

**Acceptance Criteria**:

- [x] All endpoints documented
- [x] Request/response schemas included
- [x] Example requests provided
- [x] Error cases documented
- [ ] Published to docs site

---

## Phase 6: Production Deployment (Week 5)

**Goal**: Deploy ontology system to production.

### Task 6.1: Production Migration

**Priority**: 🔴 Critical
**Effort**: 2 hours

**Checklist**:

- [ ] Review migration file for production safety
- [ ] Test migration on staging database
- [ ] Backup production database
- [ ] Run migration on production
- [ ] Verify all tables created
- [ ] Verify all templates seeded
- [ ] Smoke test: Create sample project
- [ ] Monitor for errors

---

### Task 6.2: Monitoring & Observability

**Priority**: 🟡 High
**Effort**: 4 hours

**Metrics to Track**:

- Project creation rate
- FSM transition rate per template
- Guard failure rate
- Action execution failures
- Template usage by type_key
- Facet distribution

**Logging**:

- All FSM transitions logged with context
- Action execution results
- Guard failures with reasons
- API errors

---

## Summary

### Total Effort Estimate

- **Phase 1** (Database): 3 hours
- **Phase 2** (Instantiation): 11 hours
- **Phase 3** (Actions): 14 hours
- **Phase 4** (UI): 22 hours
- **Phase 5** (Testing): 9 hours
- **Phase 6** (Deployment): 6 hours

**Total**: ~65 hours (~2 weeks for one developer, ~1 week for two)

### Priority Order (If Time-Constrained)

1. 🔴 **Critical Path**: Tasks 1.1, 2.1, 2.2, 3.1 (Core functionality)
2. 🟡 **High Value**: Tasks 3.2, 3.3, 4.2 (User-facing features)
3. 🟠 **Medium Value**: Tasks 3.4, 3.5, 4.3 (Polish & extras)
4. 🔵 **Nice to Have**: Task 1.2, 4.1 (Optimizations)

### Success Metrics

- [ ] Users can create projects from templates
- [ ] FSM transitions execute with guards and actions
- [ ] Notifications appear in UI from FSM actions
- [ ] Recurring tasks created via schedule_rrule
- [ ] 4 enhanced templates fully functional
- [ ] < 500ms p95 latency for instantiation
- [ ] Zero data loss on failed transitions

---

## Notes & Considerations

### Security

- All endpoints require authentication
- RLS policies on onto\_\* tables
- Action runner checks permissions before side-effects
- Validate all user input with Zod schemas

### Performance

- Index all foreign keys (project_id, plan_id, etc.)
- Partial indexes on facet columns (WHERE NOT NULL)
- Consider materialized view for template catalog
- Limit schedule_rrule to 365 occurrences

### Future Enhancements (Post-v1)

- AI-assisted template creation
- Custom facets per org
- FSM version history
- Transition rollback
- Bulk operations
- Template marketplace
- Advanced guards (SQL queries, external APIs)
- Conditional actions (if-then logic)

---

## Questions to Resolve

1. **Q**: Should projects auto-advance states based on completion?
   **A**: No for v1. User explicitly triggers transitions. Consider auto-transitions in v2.

2. **Q**: How to handle template updates for existing projects?
   **A**: Projects snapshot template FSM at creation. Updates don't affect existing projects.

3. **Q**: Should we support custom actions per org?
   **A**: No for v1. Use built-in actions only. Consider plugins in v2.

4. **Q**: What happens if an action fails mid-transition?
   **A**: State change still persists (already committed). Failed actions logged but don't rollback state.

---

_This roadmap is a living document. Update as implementation progresses._

```

```

<!-- apps/web/docs/features/ontology/FIND_OR_CREATE_TEMPLATE_SPEC.md -->

# Find or Create Template Utility Specification

**Last Updated**: December 2, 2025
**Status**: ✅ Implemented
**Author**: Claude
**Purpose**: Unified utility for dynamically finding or creating ontology templates

---

## Implementation Status

| Phase   | Description              | Status      |
| ------- | ------------------------ | ----------- |
| Phase 1 | Core Service             | ✅ Complete |
| Phase 2 | Migration Integration    | ✅ Complete |
| Phase 3 | Agentic Chat Integration | ✅ Complete |
| Phase 4 | Cleanup & Documentation  | ✅ Complete |

### Files Created/Modified

- **Created**: `apps/web/src/lib/services/ontology/find-or-create-template.service.ts`
- **Modified**: `apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts`
- **Modified**: `apps/web/src/lib/services/ontology/migration/enhanced-task-migrator.ts`
- **Modified**: `apps/web/src/lib/services/ontology/migration/enhanced-plan-migrator.ts`
- **Modified**: `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts`
- **Modified**: `apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts`
- **Modified**: `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- **Cleaned**: `apps/web/src/lib/services/ontology/project-migration.service.ts`
- **Deprecated**: `apps/web/src/lib/services/ontology/project-template-inference.service.ts`
- **Deprecated**: `apps/web/src/lib/services/ontology/migration/template-discovery-engine.ts`
- **Deprecated**: `apps/web/src/lib/services/agentic-chat/template-creation/template-creation-service.ts`
- **Deprecated**: `apps/web/src/lib/services/agentic-chat/tools/core/template-generator-enhanced.ts`

### Key Features Implemented

1. **Unified API** - Single `findOrCreate()` method for all template operations
2. **All 8 Entity Scopes** - project, task, plan, goal, document, output, risk, event
3. **LLM-Powered Scoring** - Semantic matching with 70% threshold
4. **Abstract Template Penalty** - 0.8 multiplier for abstract templates
5. **Family-Based Taxonomy** - Consistent naming conventions
6. **Comprehensive Logging** - Duration tracking, match scores, outcomes
7. **In-Memory Caching** - 1-hour TTL for template lookups
8. **Agentic Chat Tool** - `find_or_create_template` tool available

---

## Executive Summary

This specification defines a unified `find_or_create_template` utility that provides intelligent template discovery and dynamic creation across all ontology entity types. The utility will:

1. Search existing templates using LLM-powered semantic matching
2. Score templates against a given context/narrative (70% threshold)
3. Dynamically create new templates with appropriate schemas when no match exists
4. Follow the family-based taxonomy naming conventions
5. Support all entity types: project, task, plan, goal, document, output, risk, event

---

## Problem Statement

### Current State

Template finding/creation logic is scattered across multiple places:

| Location                          | Entity Types      | Approach                                 |
| --------------------------------- | ----------------- | ---------------------------------------- |
| `TemplateDiscoveryEngine`         | Projects (mainly) | List → Score → Suggest → Ensure pattern  |
| `ProjectTemplateInferenceService` | Projects only     | Realm classification + template analysis |
| `TemplateAnalyzerService`         | Scope-agnostic    | Brain dump analysis with structured plan |
| `TemplateCreationService`         | Projects only     | Agentic chat fallback                    |
| `EnhancedTemplateGenerator`       | All scopes        | Direct LLM generation                    |
| Agentic chat tools                | Project + Plan    | Tool-based workflow                      |

### Issues

1. **Fragmentation**: Different implementations for migration vs. agentic chat
2. **Incomplete coverage**: Plans, goals, documents, outputs, risks don't have robust find-or-create
3. **Naming inconsistency**: Older code doesn't follow the new family-based taxonomy
4. **Duplication**: Similar LLM prompts and logic in multiple places
5. **No unified interface**: Callers must know which service to use for which scenario

---

## Proposed Solution

### Overview

Create a single, unified `FindOrCreateTemplateService` that:

```typescript
interface FindOrCreateResult {
	template: TemplateRow;
	created: boolean;
	matchScore?: number;
	matchRationale?: string;
}

async function findOrCreateTemplate(
	options: FindOrCreateTemplateOptions
): Promise<FindOrCreateResult>;
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  FindOrCreateTemplateService                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │   Template   │   │   Template   │   │      Template        │ │
│  │   Searcher   │──▶│   Scorer     │──▶│   Creator/Suggester  │ │
│  └──────────────┘   └──────────────┘   └──────────────────────┘ │
│         │                 │                      │               │
│         ▼                 ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LLM Service (SmartLLMService)                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             Template CRUD Service (existing)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Design

### Primary Interface

```typescript
// apps/web/src/lib/services/ontology/find-or-create-template.service.ts

export type EntityScope =
	| 'project'
	| 'task'
	| 'plan'
	| 'goal'
	| 'document'
	| 'output'
	| 'risk'
	| 'event';

export interface FindOrCreateTemplateOptions {
	/** Entity scope (required) */
	scope: EntityScope;

	/**
	 * Context describing what template is needed.
	 * Can be:
	 * - User brain dump text
	 * - Entity description/narrative
	 * - Keywords describing the work
	 */
	context: string;

	/** User ID for LLM logging and template ownership */
	userId: string;

	/** Optional: Specific type_key to look for first */
	preferredTypeKey?: string;

	/** Optional: Realm/domain hint (e.g., "writer", "developer") */
	realm?: string;

	/** Optional: Facet hints to narrow search */
	facets?: {
		context?: string;
		scale?: string;
		stage?: string;
	};

	/**
	 * Threshold for template match (0-1 scale).
	 * If best match < threshold, create new template.
	 * Default: 0.70 (70%)
	 */
	matchThreshold?: number;

	/**
	 * If false, only return suggestion without creating.
	 * Useful for dry-run/preview scenarios.
	 * Default: true
	 */
	allowCreate?: boolean;

	/**
	 * Optional: Additional schema properties to include
	 * Useful when caller knows specific fields needed
	 */
	additionalProperties?: Record<string, PropertyDefinition>;

	/**
	 * Optional: Example props from the entity being created
	 * Helps LLM infer schema structure
	 */
	exampleProps?: Record<string, unknown>;
}

export interface PropertyDefinition {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	required?: boolean;
	default?: unknown;
	enum?: string[];
	example?: unknown;
}

export interface FindOrCreateResult {
	/** The template (existing or newly created) */
	template: TemplateRow;

	/** Whether a new template was created */
	created: boolean;

	/** Match score (0-1) for best matching template */
	matchScore?: number;

	/** LLM rationale for match/creation decision */
	matchRationale?: string;

	/** If created, the suggestion that was used */
	suggestion?: TemplateSuggestion;

	/** Resolved template with inheritance applied */
	resolvedTemplate?: ResolvedTemplate;
}

export interface TemplateSuggestion {
	typeKey: string;
	name: string;
	description: string;
	parentTypeKey?: string | null;
	matchScore: number;
	rationale: string;
	properties: Record<string, PropertyDefinition>;
	workflowStates?: WorkflowState[];
	facetDefaults?: Record<string, string>;
}
```

### Usage Examples

```typescript
// Example 1: Find template for a book writing project
const result = await findOrCreateTemplate({
	scope: 'project',
	context: 'I want to write a fiction novel about AI consciousness',
	userId: user.id,
	realm: 'writer',
	facets: { context: 'personal', scale: 'large' }
});
// Returns: project.writer.book (existing) or creates project.writer.book.fiction

// Example 2: Find template for a sprint plan
const result = await findOrCreateTemplate({
	scope: 'plan',
	context: 'Two-week development sprint for mobile app features',
	userId: user.id,
	facets: { scale: 'medium' }
});
// Returns: plan.timebox.sprint (existing)

// Example 3: Create task template for code review
const result = await findOrCreateTemplate({
	scope: 'task',
	context: 'Code review task for pull request',
	userId: user.id,
	preferredTypeKey: 'task.review.code'
});
// Returns: task.review (existing) or creates task.review.code

// Example 4: Find goal template for revenue metric
const result = await findOrCreateTemplate({
	scope: 'goal',
	context: 'Track monthly recurring revenue growth to $100k MRR',
	userId: user.id
});
// Returns: goal.metric.revenue (existing)

// Example 5: Dry-run to preview what would be created
const result = await findOrCreateTemplate({
	scope: 'document',
	context: 'Technical specification for API design',
	userId: user.id,
	allowCreate: false // Only suggest, don't create
});
// Returns suggestion without creating
```

---

## Implementation Details

### Step 1: Template Search

```typescript
async function searchTemplates(
	scope: EntityScope,
	context: string,
	options: SearchOptions
): Promise<TemplateSearchResult[]> {
	// 1. Build base query
	let query = supabase
		.from('onto_templates')
		.select('*')
		.eq('scope', scope)
		.eq('status', 'active');

	// 2. Apply realm filter if provided
	if (options.realm) {
		query = query.or(`type_key.ilike.%${options.realm}%,metadata->>realm.eq.${options.realm}`);
	}

	// 3. Apply text search across name, type_key, description
	if (context) {
		const keywords = extractKeywords(context);
		query = query.or(
			keywords.map((k) => `name.ilike.%${k}%`).join(',') +
				',' +
				keywords.map((k) => `type_key.ilike.%${k}%`).join(',')
		);
	}

	// 4. Limit to reasonable number for scoring
	const { data: templates } = await query.limit(30);

	// 5. Return with placeholder scores (scoring happens next)
	return templates.map((t) => ({ template: t, score: 0 }));
}
```

### Step 2: LLM-Powered Scoring

```typescript
async function scoreTemplates(
	templates: TemplateSearchResult[],
	context: string,
	scope: EntityScope,
	userId: string
): Promise<TemplateSearchResult[]> {
	if (templates.length === 0) return [];

	const templateSummaries = templates.map((t) => ({
		type_key: t.template.type_key,
		name: t.template.name,
		description: (t.template.metadata as any)?.description ?? '',
		properties: Object.keys((t.template.schema as any)?.properties ?? {}),
		is_abstract: t.template.is_abstract
	}));

	const systemPrompt = `You score how well ontology templates match a user's needs.
Scope: ${scope}
Type key patterns: ${TYPE_KEY_PATTERNS[scope]}

Score each template 0-100 based on semantic fit.
Prefer concrete templates over abstract ones.
Consider both explicit matches and implied fit.`;

	const userPrompt = `User's context:
"""
${context}
"""

Templates to score:
${JSON.stringify(templateSummaries, null, 2)}

Return JSON: { "scores": [{ "type_key": "...", "score": 0-100, "rationale": "..." }] }`;

	const response = await llm.getJSONResponse<ScoreResponse>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		temperature: 0.1,
		operationType: 'template_scoring'
	});

	// Map scores back to results
	const scoreMap = new Map(
		response.scores.map((s) => [s.type_key, { score: s.score / 100, rationale: s.rationale }])
	);

	return templates
		.map((t) => ({
			...t,
			score: scoreMap.get(t.template.type_key)?.score ?? 0.3,
			rationale: scoreMap.get(t.template.type_key)?.rationale
		}))
		.sort((a, b) => b.score - a.score);
}
```

### Step 3: Template Suggestion/Creation

```typescript
async function suggestTemplate(
	scope: EntityScope,
	context: string,
	existingTemplates: TemplateSearchResult[],
	options: FindOrCreateTemplateOptions
): Promise<TemplateSuggestion> {
	const scopeInfo = SCOPE_DEFINITIONS[scope];

	const systemPrompt = `You suggest new ontology templates when existing ones don't fit.

Scope: ${scope}
Type key pattern: ${scopeInfo.typeKeyPattern}
Examples: ${scopeInfo.examples.join(', ')}

Naming rules:
- Use lowercase snake_case segments
- Follow family-based taxonomy: ${scopeInfo.familyDescription}
- Maximum 3 segments
- Be specific but not verbose

Include:
- Appropriate property schema for this entity type
- FSM workflow states matching the lifecycle
- Rationale for why new template is needed`;

	const userPrompt = `User's context:
"""
${context}
"""

Existing templates (none match >70%):
${existingTemplates
	.slice(0, 5)
	.map(
		(t) => `- ${t.template.type_key}: ${t.template.name} (${Math.round(t.score * 100)}% match)`
	)
	.join('\n')}

${options.exampleProps ? `Example props from entity:\n${JSON.stringify(options.exampleProps, null, 2)}` : ''}

Return JSON with:
- type_key: following ${scopeInfo.typeKeyPattern}
- name: Human-readable name (generic, reusable)
- description: When to use this template
- parent_type_key: Optional parent to inherit from
- match_score: 0-100 estimated fit
- rationale: Why a new template is needed
- properties: Schema properties with type, description, required
- workflow_states: FSM states with key, label, initial/final flags
- facet_defaults: Optional default facets`;

	return await llm.getJSONResponse<TemplateSuggestion>({
		systemPrompt,
		userPrompt,
		userId: options.userId,
		profile: 'balanced',
		temperature: 0.3,
		operationType: 'template_suggestion'
	});
}
```

### Step 4: Template Creation

```typescript
async function createTemplateFromSuggestion(
	suggestion: TemplateSuggestion,
	scope: EntityScope,
	userId: string
): Promise<TemplateRow> {
	// 1. Normalize type_key
	const typeKey = normalizeTypeKey(suggestion.typeKey, scope);

	// 2. Find parent template if specified
	let parentTemplateId: string | null = null;
	if (suggestion.parentTypeKey) {
		const parent = await fetchTemplateByTypeKey(suggestion.parentTypeKey);
		parentTemplateId = parent?.id ?? null;
	}

	// 3. Build JSON Schema
	const schema = buildSchema(suggestion.properties);

	// 4. Build FSM
	const fsm = buildFSM(suggestion.workflowStates, typeKey, scope);

	// 5. Create via CRUD service
	const result = await TemplateCrudService.createTemplate(supabase, {
		scope,
		type_key: typeKey,
		name: suggestion.name,
		status: 'active',
		parent_template_id: parentTemplateId,
		is_abstract: false,
		schema,
		fsm,
		default_props: {},
		default_views: [],
		facet_defaults: suggestion.facetDefaults ?? {},
		metadata: {
			description: suggestion.description,
			rationale: suggestion.rationale,
			created_by_find_or_create: true,
			created_at: new Date().toISOString()
		},
		created_by: userId
	});

	if (!result.success) {
		throw new Error(`Failed to create template: ${result.error}`);
	}

	return result.data;
}
```

---

## Scope-Specific Configuration

### Type Key Patterns by Scope

```typescript
const SCOPE_DEFINITIONS: Record<EntityScope, ScopeDefinition> = {
	project: {
		typeKeyPattern: 'project.{domain}.{deliverable}[.{variant}]',
		examples: ['project.writer.book', 'project.developer.app.mobile', 'project.coach.client'],
		familyDescription: 'Domain represents the actor role, deliverable the primary output',
		defaultStates: ['draft', 'active', 'paused', 'complete', 'archived'],
		defaultTransitions: [
			{ from: 'draft', to: 'active', event: 'start' },
			{ from: 'active', to: 'paused', event: 'pause' },
			{ from: 'paused', to: 'active', event: 'resume' },
			{ from: 'active', to: 'complete', event: 'finish' },
			{ from: 'complete', to: 'archived', event: 'archive' }
		]
	},

	task: {
		typeKeyPattern: 'task.{work_mode}[.{specialization}]',
		examples: ['task.execute', 'task.create', 'task.coordinate.meeting', 'task.research'],
		familyDescription:
			'Work modes: execute, create, refine, research, review, coordinate, admin, plan',
		defaultStates: ['todo', 'in_progress', 'blocked', 'done'],
		defaultTransitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'blocked', event: 'block' },
			{ from: 'blocked', to: 'in_progress', event: 'unblock' },
			{ from: 'in_progress', to: 'done', event: 'complete' }
		]
	},

	plan: {
		typeKeyPattern: 'plan.{family}[.{variant}]',
		examples: ['plan.timebox.sprint', 'plan.pipeline.sales', 'plan.phase.project'],
		familyDescription: 'Families: timebox, pipeline, campaign, roadmap, process, phase',
		defaultStates: ['draft', 'active', 'complete'],
		defaultTransitions: [
			{ from: 'draft', to: 'active', event: 'start' },
			{ from: 'active', to: 'complete', event: 'finish' }
		]
	},

	goal: {
		typeKeyPattern: 'goal.{family}[.{variant}]',
		examples: ['goal.outcome.project', 'goal.metric.revenue', 'goal.behavior.cadence'],
		familyDescription:
			'Families: outcome (binary), metric (quantitative), behavior (frequency), learning (skill)',
		defaultStates: ['proposed', 'active', 'achieved', 'abandoned'],
		defaultTransitions: [
			{ from: 'proposed', to: 'active', event: 'accept' },
			{ from: 'active', to: 'achieved', event: 'achieve' },
			{ from: 'active', to: 'abandoned', event: 'abandon' }
		]
	},

	document: {
		typeKeyPattern: 'document.{family}[.{variant}]',
		examples: [
			'document.context.project',
			'document.knowledge.research',
			'document.spec.technical'
		],
		familyDescription: 'Families: context, knowledge, decision, spec, reference, intake',
		defaultStates: ['draft', 'review', 'published', 'archived'],
		defaultTransitions: [
			{ from: 'draft', to: 'review', event: 'submit' },
			{ from: 'review', to: 'published', event: 'publish' },
			{ from: 'review', to: 'draft', event: 'revise' },
			{ from: 'published', to: 'archived', event: 'archive' }
		]
	},

	output: {
		typeKeyPattern: 'output.{family}[.{variant}]',
		examples: ['output.written.article', 'output.media.slide_deck', 'output.software.feature'],
		familyDescription: 'Families: written, media, software, operational',
		defaultStates: ['draft', 'in_progress', 'delivered', 'accepted'],
		defaultTransitions: [
			{ from: 'draft', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'delivered', event: 'deliver' },
			{ from: 'delivered', to: 'accepted', event: 'accept' }
		]
	},

	risk: {
		typeKeyPattern: 'risk.{family}[.{variant}]',
		examples: [
			'risk.technical.security',
			'risk.schedule.dependency',
			'risk.resource.skill_gap'
		],
		familyDescription:
			'Families: technical, schedule, resource, budget, scope, external, quality',
		defaultStates: ['identified', 'analyzing', 'mitigating', 'resolved', 'accepted'],
		defaultTransitions: [
			{ from: 'identified', to: 'analyzing', event: 'analyze' },
			{ from: 'analyzing', to: 'mitigating', event: 'mitigate' },
			{ from: 'mitigating', to: 'resolved', event: 'resolve' },
			{ from: 'analyzing', to: 'accepted', event: 'accept' }
		]
	},

	event: {
		typeKeyPattern: 'event.{family}[.{variant}]',
		examples: [
			'event.work.focus_block',
			'event.collab.meeting.standup',
			'event.marker.deadline'
		],
		familyDescription:
			'Families: work (individual), collab (coordination), marker (deadlines/reminders)',
		defaultStates: ['scheduled', 'in_progress', 'completed', 'cancelled'],
		defaultTransitions: [
			{ from: 'scheduled', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'completed', event: 'complete' },
			{ from: 'scheduled', to: 'cancelled', event: 'cancel' }
		]
	}
};
```

---

## Integration Points

### 1. Migration Service Integration

Replace current `TemplateDiscoveryEngine.ensureTemplate()` calls:

```typescript
// Before
const ensureResult = await discoveryEngine.ensureTemplate({
	typeKey: suggestion.typeKey,
	suggestion,
	allowCreate: true,
	userId,
	scope: 'project'
});

// After
const result = await findOrCreateTemplate({
	scope: 'project',
	context: projectNarrative,
	userId,
	preferredTypeKey: suggestion.typeKey
});
```

### 2. Agentic Chat Integration

Add as a new tool or integrate into existing workflow:

```typescript
// In tool-executor.ts, enhance create_onto_project to use findOrCreateTemplate
case 'create_onto_project':
  const templateResult = await findOrCreateTemplate({
    scope: 'project',
    context: args.project.description || args.project.name,
    userId,
    preferredTypeKey: args.project.type_key,
    facets: args.project.props?.facets
  });

  // Use templateResult.template.type_key for project creation
  args.project.type_key = templateResult.template.type_key;
  // ... continue with project creation
```

### 3. Direct API Usage

New endpoint for template operations:

```typescript
// apps/web/src/routes/api/onto/templates/find-or-create/+server.ts
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json();
	const service = new FindOrCreateTemplateService(locals.supabase, llmService);

	const result = await service.findOrCreate({
		scope: body.scope,
		context: body.context,
		userId: locals.user.id,
		...body.options
	});

	return ApiResponse.success(result);
};
```

---

## Migration Path

### Phase 1: Create Service (Week 1)

1. Implement `FindOrCreateTemplateService` in new file
2. Add comprehensive tests
3. Integrate with existing `TemplateCrudService`
4. Deploy behind feature flag

### Phase 2: Migrate Migration System (Week 2)

1. Update `EnhancedProjectMigrator` to use new service
2. Update `TemplateDiscoveryEngine` to delegate to new service
3. Deprecate direct template creation in migrators
4. Test with existing migration workflows

### Phase 3: Migrate Agentic Chat (Week 3)

1. Add internal helper using new service
2. Update `list_onto_templates` tool handler to use service
3. Update `suggest_template` tool handler to use service
4. Update `create_onto_project` to ensure templates
5. Add support for plan/task/goal/document templates

### Phase 4: Cleanup & Documentation (Week 4)

1. Remove deprecated code paths
2. Update documentation
3. Add monitoring/logging
4. Performance optimization (caching)

---

## Testing Strategy

### Unit Tests

```typescript
describe('FindOrCreateTemplateService', () => {
	describe('findOrCreate', () => {
		it('should return existing template when match >= threshold', async () => {
			// Create test template
			// Call findOrCreate with matching context
			// Verify existing template returned, created: false
		});

		it('should create new template when no match >= threshold', async () => {
			// Call findOrCreate with unique context
			// Verify new template created, created: true
		});

		it('should use preferredTypeKey when provided and exists', async () => {
			// Create template with specific type_key
			// Call findOrCreate with preferredTypeKey
			// Verify that template is returned
		});

		it('should not create when allowCreate is false', async () => {
			// Call findOrCreate with unique context and allowCreate: false
			// Verify suggestion returned but no template created
		});

		it('should follow naming conventions for each scope', async () => {
			for (const scope of SCOPES) {
				// Call findOrCreate for scope
				// Verify type_key matches pattern
			}
		});
	});
});
```

### Integration Tests

```typescript
describe('findOrCreate integration', () => {
	it('should work with migration workflow', async () => {
		// Run migration with findOrCreate
		// Verify templates created correctly
	});

	it('should work with agentic chat workflow', async () => {
		// Simulate chat project creation
		// Verify template resolution
	});
});
```

---

## Performance Considerations

### Caching

```typescript
class TemplateCache {
	private cache = new Map<string, { result: FindOrCreateResult; timestamp: number }>();
	private ttl = 60 * 60 * 1000; // 1 hour

	getCacheKey(options: FindOrCreateTemplateOptions): string {
		return `${options.scope}:${options.preferredTypeKey || hash(options.context)}`;
	}

	get(key: string): FindOrCreateResult | null {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			return null;
		}
		return entry.result;
	}

	set(key: string, result: FindOrCreateResult): void {
		this.cache.set(key, { result, timestamp: Date.now() });
	}
}
```

### LLM Call Optimization

- Batch template scoring when possible
- Use faster model profile for scoring
- Cache LLM responses for similar contexts
- Pre-compute template embeddings (future enhancement)

---

## Related Documentation

- **[NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)** - Template type_key patterns
- **[ONTOLOGY_NAMESPACES_CORE.md](./ONTOLOGY_NAMESPACES_CORE.md)** - Complete namespace reference
- **[DATA_MODELS.md](./DATA_MODELS.md)** - Database schema
- **[template-crud.service.ts](../../../src/lib/services/ontology/template-crud.service.ts)** - Template CRUD operations
- **[template-resolver.service.ts](../../../src/lib/services/ontology/template-resolver.service.ts)** - Template inheritance resolution

---

## Open Questions

1. **Caching strategy**: Should we use Redis/database caching for production?
2. **Template versioning**: How to handle updates to auto-generated templates?
3. **Multi-tenant**: Should templates be user-scoped or global?
4. **Fallback behavior**: What happens if LLM is unavailable?
5. **Batch operations**: Support for finding/creating multiple templates at once?

---

## Appendix: Current Implementation Inventory

### Files to Consolidate

| File                                    | Current Purpose              | Action                                        |
| --------------------------------------- | ---------------------------- | --------------------------------------------- |
| `template-discovery-engine.ts`          | Migration template discovery | Delegate to new service                       |
| `project-template-inference.service.ts` | Project-specific inference   | Deprecate, use new service                    |
| `template-analyzer.service.ts`          | Brain dump template analysis | Keep for UI flows, integrate with new service |
| `template-creation-service.ts`          | Agentic chat fallback        | Deprecate, use new service                    |
| `template-generator-enhanced.ts`        | Enhanced generation          | Merge logic into new service                  |

### Database Tables Used

- `onto_templates` - Template definitions
- `onto_projects`, `onto_tasks`, etc. - Entities using templates

### LLM Operations

- `template_scoring` - Score templates against context
- `template_suggestion` - Suggest new template spec
- `template_generation` - Generate schema/FSM (if needed)

---

## Changelog

### December 2, 2025 (Initial Draft)

- Created comprehensive specification
- Analyzed existing implementations
- Defined API interface
- Outlined implementation approach
- Documented scope-specific configurations

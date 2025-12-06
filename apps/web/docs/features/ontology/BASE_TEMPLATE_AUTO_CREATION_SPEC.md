# Base Template Auto-Creation Specification

**Last Updated**: December 2, 2025
**Status**: Draft
**Author**: Claude
**Related**: [FIND_OR_CREATE_TEMPLATE_SPEC.md](./FIND_OR_CREATE_TEMPLATE_SPEC.md)

---

## Executive Summary

This specification addresses a critical bug in the `FindOrCreateTemplateService` where variant templates are created without their required base templates, breaking the schema inheritance chain. The fix ensures that when a variant template is created, all ancestor base templates are automatically created first with appropriate default schemas.

---

## Problem Statement

### Current Behavior (Bug)

When creating a variant template like `project.writer.book.fiction`:

1. Service looks for base template `project.writer.book`
2. If base doesn't exist, `parentTemplateId` is set to `null`
3. Variant is created **without** inheritance
4. **Result**: Schema inheritance is broken

**Affected Code Locations:**

- `find-or-create-template.service.ts:1158-1172` (`createTemplateFromSuggestion`)
- `find-or-create-template.service.ts:567-572` (`ensureTemplateExists`)

### Impact

1. **No Schema Inheritance**: Variant templates don't inherit properties from base templates
2. **Inconsistent Behavior**: Some variants have parents (seeded), others don't (dynamically created)
3. **Broken Template Resolution**: `resolveTemplateWithClient()` returns incomplete inheritance chains
4. **Orphan Templates**: Variants exist without their logical parent templates

### Example Scenario

```
LLM suggests: project.writer.book.fiction

Expected template hierarchy:
  project.writer.book (base) ← should be created if missing
    └── project.writer.book.fiction (variant)

Actual result:
  project.writer.book.fiction (orphan, no parent)
```

---

## Solution Overview

### Core Principle

**Before creating any template, ensure all ancestor templates in its type_key hierarchy exist.**

### Algorithm

```
createTemplate(type_key):
  1. Parse type_key into segments
  2. Identify all ancestor type_keys
  3. For each ancestor (root to leaf):
     - If ancestor doesn't exist: create with defaults
  4. Create the requested template with parent_template_id set
```

### Type Key Hierarchy Rules

| Scope    | Base Pattern                     | Minimum Depth | Example Base          | Example Variant               |
| -------- | -------------------------------- | ------------- | --------------------- | ----------------------------- |
| project  | `project.{domain}.{deliverable}` | 3             | `project.writer.book` | `project.writer.book.fiction` |
| task     | `task.{work_mode}`               | 2             | `task.execute`        | `task.execute.deploy`         |
| plan     | `plan.{family}`                  | 2             | `plan.timebox`        | `plan.timebox.sprint`         |
| goal     | `goal.{family}`                  | 2             | `goal.metric`         | `goal.metric.revenue`         |
| document | `document.{family}`              | 2             | `document.spec`       | `document.spec.technical`     |
| output   | `output.{family}`                | 2             | `output.written`      | `output.written.article`      |
| risk     | `risk.{family}`                  | 2             | `risk.technical`      | `risk.technical.security`     |
| event    | `event.{family}`                 | 2             | `event.work`          | `event.work.focus_block`      |

---

## Detailed Design

### 1. Ancestor Type Key Resolution

**New Method: `getAncestorTypeKeys(typeKey: string, scope: EntityScope): string[]`**

Returns all ancestor type_keys from immediate parent up to (but not including) the minimum base level.

```typescript
// Example: project.writer.book.fiction.romance
getAncestorTypeKeys('project.writer.book.fiction.romance', 'project');
// Returns: ['project.writer.book.fiction', 'project.writer.book']
// Note: 'project.writer.book' is the minimum base, so we stop there

// Example: task.execute.deploy.kubernetes
getAncestorTypeKeys('task.execute.deploy.kubernetes', 'task');
// Returns: ['task.execute.deploy', 'task.execute']
// Note: 'task.execute' is the minimum base

// Example: task.execute (already at minimum)
getAncestorTypeKeys('task.execute', 'task');
// Returns: [] (no ancestors needed)
```

**Algorithm:**

```typescript
function getAncestorTypeKeys(typeKey: string, scope: EntityScope): string[] {
	const parts = typeKey.split('.');
	const minDepth = SCOPE_MIN_DEPTHS[scope]; // project=3, others=2
	const ancestors: string[] = [];

	// Start from one level up, stop at minDepth
	for (let depth = parts.length - 1; depth >= minDepth; depth--) {
		const ancestorKey = parts.slice(0, depth).join('.');
		ancestors.push(ancestorKey);
	}

	return ancestors; // Ordered: immediate parent first, then grandparents
}
```

### 2. Minimum Depth Configuration

```typescript
const SCOPE_MIN_DEPTHS: Record<EntityScope, number> = {
	project: 3, // project.domain.deliverable
	task: 2, // task.work_mode
	plan: 2, // plan.family
	goal: 2, // goal.family
	document: 2, // document.family
	output: 2, // output.family
	risk: 2, // risk.family
	event: 2 // event.family
};
```

### 3. LLM-Generated Base Template Schemas

Auto-created base templates use **LLM-generated schemas** that are semantically relevant to the type_key. This ensures each base template has meaningful properties specific to its domain.

**Why LLM-Generated Schemas:**

- `project.writer.book` should have: `genre`, `target_word_count`, `working_title`, `target_audience`
- `project.developer.app` should have: `tech_stack`, `platform`, `repository_url`
- `task.coordinate.meeting` should have: `attendees`, `agenda`, `meeting_link`

Static schemas can't capture this semantic richness.

**Schema Generation Method:**

```typescript
private async generateBaseTemplateSchema(
  typeKey: string,
  scope: EntityScope,
  userId: string
): Promise<LLMBaseTemplateSchemaResponse> {
  const scopeInfo = SCOPE_DEFINITIONS[scope];

  const systemPrompt = `You are an ontology schema designer. Generate a JSON schema for a base template.

  Your task is to generate appropriate schema properties that:
  1. Are semantically relevant to the type_key meaning
  2. Will be inherited by more specific variant templates
  3. Are generic enough to apply to all variants in this family

  Guidelines:
  - Generate 3-6 meaningful properties
  - Use snake_case for property names
  - Include clear descriptions`;

  const userPrompt = `Generate schema for base template: ${typeKey}

  Return JSON with:
  {
    "name": "Human-readable template name",
    "description": "When to use this template",
    "properties": {
      "property_name": {
        "type": "string|number|integer|boolean|array|object",
        "description": "What this property captures",
        "required": false,
        "enum": ["option1", "option2"] // optional
      }
    }
  }`;

  const response = await this.llm.getJSONResponse<LLMBaseTemplateSchemaResponse>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'balanced',
    temperature: 0.3,
    operationType: 'find_or_create_template.base_schema_generation'
  });

  return response;
}
```

**Example LLM-Generated Schemas:**

For `project.writer.book`:

```json
{
	"name": "Book Project",
	"description": "Template for book writing projects",
	"properties": {
		"genre": {
			"type": "string",
			"description": "The book's genre or category",
			"enum": ["fiction", "non-fiction", "memoir", "technical", "self-help", "other"]
		},
		"target_word_count": {
			"type": "integer",
			"description": "Target word count for the completed book"
		},
		"working_title": {
			"type": "string",
			"description": "Current working title"
		},
		"target_audience": {
			"type": "string",
			"description": "Primary intended readership"
		}
	}
}
```

For `task.coordinate.meeting`:

```json
{
	"name": "Meeting Coordination",
	"description": "Template for meeting coordination tasks",
	"properties": {
		"meeting_type": {
			"type": "string",
			"enum": ["standup", "planning", "review", "one_on_one", "brainstorm", "other"]
		},
		"attendees": {
			"type": "array",
			"items": { "type": "string" },
			"description": "List of meeting attendees"
		},
		"agenda_items": {
			"type": "array",
			"items": { "type": "string" },
			"description": "Meeting agenda topics"
		},
		"meeting_link": {
			"type": "string",
			"description": "Video conference or location link"
		}
	}
}
```

**Fallback Behavior:**

If LLM generation fails, a minimal fallback schema is used:

```typescript
private getMinimalFallbackSchema(typeKey: string): LLMBaseTemplateSchemaResponse {
  return {
    name: this.humanizeTypeKey(typeKey),
    description: `Base template for ${this.humanizeTypeKey(typeKey)}`,
    properties: {
      notes: {
        type: 'string',
        description: 'Additional notes or context'
      }
    }
  };
}
```

### 4. Base Template FSM Defaults

Use scope-specific default FSMs (already defined in `SCOPE_DEFINITIONS`):

```typescript
// Reuse existing SCOPE_DEFINITIONS for FSM defaults
const baseTemplateFSM = buildFSM(undefined, baseTypeKey, scope);
// This uses SCOPE_DEFINITIONS[scope].defaultStates and defaultTransitions
```

### 5. Base Template Metadata

Auto-created base templates should be clearly marked:

```typescript
const baseTemplateMetadata = {
	description: `Base template for ${humanizeTypeKey(baseTypeKey)}`,
	auto_created: true,
	auto_created_at: new Date().toISOString(),
	auto_created_reason: `Required as parent for ${originalTypeKey}`,
	category: getCategory(baseTypeKey, scope)
};
```

### 6. Abstract vs Concrete Base Templates

**Decision: Auto-created base templates should be `is_abstract: true`**

Rationale:

- Base templates are meant for inheritance, not direct instantiation
- Users should use concrete variants (e.g., `task.execute.deploy` not `task.execute`)
- Matches the pattern in seed migrations

Exception: If the type_key is at minimum depth AND is being directly created (not as a parent), it should be `is_abstract: false`.

---

## Implementation

### New Method: `ensureAncestorTemplatesExist`

```typescript
/**
 * Ensures all ancestor templates exist for a given type_key.
 * Creates missing ancestors from root to leaf.
 *
 * @returns The immediate parent template (or null if at minimum depth)
 */
private async ensureAncestorTemplatesExist(
  typeKey: string,
  scope: EntityScope,
  userId: string
): Promise<TemplateRow | null> {
  const ancestors = this.getAncestorTypeKeys(typeKey, scope);

  if (ancestors.length === 0) {
    // At minimum depth, no ancestors needed
    return null;
  }

  // Process ancestors from root to leaf (reverse order)
  // This ensures parents exist before children
  const ancestorsRootFirst = [...ancestors].reverse();

  let lastCreatedOrFound: TemplateRow | null = null;

  for (const ancestorKey of ancestorsRootFirst) {
    // Check if ancestor exists
    let ancestor = await this.fetchTemplateByTypeKey(ancestorKey);

    if (!ancestor) {
      // Find parent for this ancestor (if any)
      const ancestorAncestors = this.getAncestorTypeKeys(ancestorKey, scope);
      let parentId: string | null = null;

      if (ancestorAncestors.length > 0 && lastCreatedOrFound) {
        parentId = lastCreatedOrFound.id;
      }

      // Create the ancestor template
      ancestor = await this.createBaseTemplate({
        scope,
        typeKey: ancestorKey,
        parentTemplateId: parentId,
        userId,
        createdForVariant: typeKey
      });

      console.info(
        `[FindOrCreateTemplate] AUTO_CREATED_BASE typeKey=${ancestorKey} ` +
        `parentId=${parentId ?? 'none'} forVariant=${typeKey}`
      );
    }

    lastCreatedOrFound = ancestor;
  }

  // Return the immediate parent (first in original order)
  return lastCreatedOrFound;
}
```

### New Method: `createBaseTemplate`

```typescript
/**
 * Creates a base template with appropriate defaults.
 * Used for auto-creating missing ancestor templates.
 */
private async createBaseTemplate(params: {
  scope: EntityScope;
  typeKey: string;
  parentTemplateId: string | null;
  userId: string;
  createdForVariant: string;
}): Promise<TemplateRow> {
  const { scope, typeKey, parentTemplateId, userId, createdForVariant } = params;

  // Generate schema using LLM based on type_key semantics
  const llmResult = await this.generateBaseTemplateSchema(typeKey, scope, userId);

  // Build the JSON schema from LLM response
  const schema = this.buildSchemaFromLLMResponse(llmResult);

  // Build FSM from scope defaults
  const fsm = this.buildFSM(undefined, typeKey, scope);

  // Create the template
  const result = await TemplateCrudService.createTemplate(this.client, {
    scope,
    type_key: typeKey,
    name: llmResult.name || this.humanizeTypeKey(typeKey),
    status: 'active',
    parent_template_id: parentTemplateId,
    is_abstract: true, // Base templates are abstract
    schema,
    fsm,
    default_props: {},
    default_views: [],
    facet_defaults: {},
    metadata: {
      description: llmResult.description || `Base template for ${this.humanizeTypeKey(typeKey)}`,
      auto_created: true,
      auto_created_at: new Date().toISOString(),
      auto_created_for_variant: createdForVariant,
      category: this.inferCategory(typeKey, scope),
      llm_generated_schema: true
    } as Json,
    created_by: userId
  });

  if (!result.success || !result.data) {
    throw new Error(
      `[FindOrCreateTemplate] Failed to create base template ${typeKey}: ${result.error}`
    );
  }

  const created = result.data as TemplateRow;

  // Cache the new template
  this.cache.setByTypeKey(typeKey, created);

  return created;
}
```

### New Method: `getAncestorTypeKeys`

```typescript
/**
 * Get all ancestor type_keys for a given type_key.
 * Returns ancestors from immediate parent to root (exclusive of minimum base).
 */
private getAncestorTypeKeys(typeKey: string, scope: EntityScope): string[] {
  const parts = typeKey.split('.');
  const minDepth = SCOPE_MIN_DEPTHS[scope];
  const ancestors: string[] = [];

  // Start from one level up, stop at minDepth
  for (let depth = parts.length - 1; depth >= minDepth; depth--) {
    const ancestorKey = parts.slice(0, depth).join('.');
    ancestors.push(ancestorKey);
  }

  return ancestors;
}
```

### New Method: `inferCategory`

```typescript
/**
 * Infer a category from the type_key structure.
 */
private inferCategory(typeKey: string, scope: EntityScope): string {
  const parts = typeKey.split('.');

  if (scope === 'project' && parts.length >= 2) {
    // project.writer.book -> "Writer"
    return this.humanizeSlug(parts[1]);
  }

  if (parts.length >= 2) {
    // task.execute -> "Execute", plan.timebox -> "Timebox"
    return this.humanizeSlug(parts[1]);
  }

  return 'General';
}

private humanizeSlug(slug: string): string {
  return slug
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

### Updated: `createTemplateFromSuggestion`

```typescript
private async createTemplateFromSuggestion(
  suggestion: TemplateSuggestion,
  options: FindOrCreateTemplateOptions
): Promise<TemplateRow> {
  const { scope, userId } = options;

  // 1. Normalize type_key
  const typeKey = this.normalizeTypeKey(suggestion.typeKey, scope);
  if (!typeKey) {
    throw new Error(
      `[FindOrCreateTemplate] Invalid type_key for creation: ${suggestion.typeKey}`
    );
  }

  // 2. CRITICAL: Ensure all ancestor templates exist first
  let parentTemplateId: string | null = null;

  // First check if suggestion explicitly specifies a parent
  if (suggestion.parentTypeKey) {
    const parent = await this.fetchTemplateByTypeKey(suggestion.parentTypeKey);
    if (parent) {
      parentTemplateId = parent.id;
    } else {
      // Parent specified but doesn't exist - we might need to create it
      // Check if it's a valid ancestor
      const ancestors = this.getAncestorTypeKeys(typeKey, scope);
      if (ancestors.includes(suggestion.parentTypeKey)) {
        // Let ensureAncestorTemplatesExist handle it
        const immediateParent = await this.ensureAncestorTemplatesExist(typeKey, scope, userId);
        parentTemplateId = immediateParent?.id ?? null;
      }
    }
  }

  // 3. If no parent yet, ensure ancestors exist
  if (!parentTemplateId && this.hasVariant(typeKey)) {
    const immediateParent = await this.ensureAncestorTemplatesExist(typeKey, scope, userId);
    parentTemplateId = immediateParent?.id ?? null;
  }

  // 4. Build JSON Schema (variant adds to inherited schema)
  const schema = this.buildSchema(suggestion.properties, options.additionalProperties);

  // 5. Build FSM
  const fsm = this.buildFSM(suggestion.workflowStates, typeKey, scope);

  // 6. Filter facet defaults
  const validatedFacetDefaults = this.filterValidFacetDefaults(suggestion.facetDefaults);

  // 7. Create via CRUD service
  const result = await TemplateCrudService.createTemplate(this.client, {
    scope,
    type_key: typeKey,
    name: suggestion.name,
    status: 'active',
    parent_template_id: parentTemplateId,
    is_abstract: false, // Variants are concrete
    schema,
    fsm,
    default_props: {},
    default_views: [],
    facet_defaults: validatedFacetDefaults,
    metadata: {
      description: suggestion.description,
      rationale: suggestion.rationale,
      match_score: suggestion.matchScore,
      created_by_find_or_create: true,
      created_at: new Date().toISOString()
    } as Json,
    created_by: userId
  });

  if (!result.success || !result.data) {
    throw new Error(
      `[FindOrCreateTemplate] Failed to create template: ${result.error}`
    );
  }

  const createdTemplate = result.data as TemplateRow;

  // Invalidate and cache
  this.cache.invalidateTypeKey(typeKey);
  this.cache.setByTypeKey(typeKey, createdTemplate);

  return createdTemplate;
}
```

### Updated: `ensureTemplateExists`

```typescript
async ensureTemplateExists(params: {
  scope: EntityScope;
  typeKey: string;
  userId: string;
  nameHint?: string;
  props?: Record<string, unknown>;
}): Promise<TemplateRow> {
  const { scope, typeKey, userId, nameHint, props } = params;

  // Normalize type_key
  const normalized = this.normalizeTypeKey(typeKey, scope);
  if (!normalized) {
    throw new Error(`[FindOrCreateTemplate] Invalid type_key: ${typeKey}`);
  }

  // Check cache first
  const cached = this.cache.getByTypeKey(normalized);
  if (cached) {
    return cached;
  }

  // Check database
  const existing = await this.fetchTemplateByTypeKey(normalized);
  if (existing) {
    return existing;
  }

  // CRITICAL: Ensure ancestor templates exist first
  let parentTemplateId: string | null = null;
  if (this.hasVariant(normalized)) {
    const immediateParent = await this.ensureAncestorTemplatesExist(
      normalized,
      scope,
      userId
    );
    parentTemplateId = immediateParent?.id ?? null;
  }

  // Create the template
  console.info(`[FindOrCreateTemplate] Creating template: ${normalized}`);

  const schema = this.buildSchemaFromProps(scope, props);
  const fsm = this.buildFSM(undefined, normalized, scope);

  const result = await TemplateCrudService.createTemplate(this.client, {
    scope,
    type_key: normalized,
    name: nameHint ?? this.humanizeTypeKey(normalized),
    status: 'active',
    parent_template_id: parentTemplateId,
    is_abstract: false,
    schema,
    fsm,
    default_props: {},
    default_views: [],
    facet_defaults: {},
    metadata: {
      created_by_ensure_template: true,
      created_at: new Date().toISOString()
    } as Json,
    created_by: userId
  });

  if (!result.success || !result.data) {
    throw new Error(
      `[FindOrCreateTemplate] Failed to create template ${normalized}: ${result.error}`
    );
  }

  const created = result.data as TemplateRow;
  this.cache.setByTypeKey(normalized, created);

  return created;
}
```

---

## Edge Cases

### 1. Creating at Minimum Depth

```typescript
// task.execute is at minimum depth (2 for tasks)
// No ancestors needed
ensureAncestorTemplatesExist('task.execute', 'task', userId);
// Returns: null (no parent needed)
```

### 2. Deep Nesting (4+ levels)

```typescript
// project.writer.book.fiction.romance (5 levels)
// Ancestors: ['project.writer.book.fiction', 'project.writer.book']
ensureAncestorTemplatesExist('project.writer.book.fiction.romance', 'project', userId);
// Creates (if missing):
//   1. project.writer.book (abstract base)
//   2. project.writer.book.fiction (abstract intermediate)
// Returns: project.writer.book.fiction template
```

### 3. Partial Hierarchy Exists

```typescript
// project.writer.book exists, but project.writer.book.fiction doesn't
// Creating project.writer.book.fiction.romance
ensureAncestorTemplatesExist('project.writer.book.fiction.romance', 'project', userId);
// Finds: project.writer.book (exists)
// Creates: project.writer.book.fiction (with parent = project.writer.book)
// Returns: project.writer.book.fiction template
```

### 4. Concurrent Creation Race Condition

Handle case where two requests try to create the same base template:

```typescript
try {
  ancestor = await this.createBaseTemplate({ ... });
} catch (error) {
  if (isUniqueConstraintViolation(error)) {
    // Another process created it, fetch it
    ancestor = await this.fetchTemplateByTypeKey(ancestorKey);
    if (!ancestor) {
      throw error; // Something else went wrong
    }
  } else {
    throw error;
  }
}
```

### 5. Invalid Type Key Structure

```typescript
// Type key doesn't follow pattern
// project.writer (only 2 segments, needs 3 for project)
getAncestorTypeKeys('project.writer', 'project');
// Returns: [] (can't determine valid ancestors)
// Template creation should fail validation separately
```

---

## Schema Inheritance Verification

After implementation, the template resolver should return proper inheritance chains:

```typescript
// Before fix:
resolveTemplateWithClient(client, 'project.writer.book.fiction', 'project');
// Returns: {
//   inheritance_chain: ['project.writer.book.fiction'], // WRONG - orphan
//   schema: { properties: { /* only variant props */ } }
// }

// After fix:
resolveTemplateWithClient(client, 'project.writer.book.fiction', 'project');
// Returns: {
//   inheritance_chain: [
//     'project.writer.book',         // base (auto-created)
//     'project.writer.book.fiction'  // variant
//   ],
//   schema: {
//     properties: {
//       /* base props + variant props merged */
//     }
//   }
// }
```

---

## Logging

### New Log Events

```
[FindOrCreateTemplate] AUTO_CREATED_BASE typeKey=project.writer.book parentId=none forVariant=project.writer.book.fiction
[FindOrCreateTemplate] AUTO_CREATED_BASE typeKey=task.execute parentId=none forVariant=task.execute.deploy
[FindOrCreateTemplate] ANCESTOR_CHAIN_ENSURED variant=project.writer.book.fiction ancestors=["project.writer.book"] created=1 found=0
```

### Enhanced Metrics

Track auto-creation statistics:

- `auto_created_base_templates_total` - Counter of auto-created base templates
- `ancestor_chain_depth_histogram` - Distribution of ancestor chain depths
- `auto_creation_duration_ms` - Time spent ensuring ancestors exist

---

## Testing Strategy

### Unit Tests

```typescript
describe('ensureAncestorTemplatesExist', () => {
  it('should return null for type_key at minimum depth', async () => {
    const result = await service.ensureAncestorTemplatesExist(
      'task.execute',
      'task',
      userId
    );
    expect(result).toBeNull();
  });

  it('should create missing base template for variant', async () => {
    // Setup: no templates exist
    const result = await service.ensureAncestorTemplatesExist(
      'task.execute.deploy',
      'task',
      userId
    );

    expect(result).not.toBeNull();
    expect(result!.type_key).toBe('task.execute');
    expect(result!.is_abstract).toBe(true);
  });

  it('should create entire ancestor chain for deep nesting', async () => {
    const result = await service.ensureAncestorTemplatesExist(
      'project.writer.book.fiction.romance',
      'project',
      userId
    );

    // Should have created project.writer.book and project.writer.book.fiction
    const book = await fetchTemplate('project.writer.book');
    const fiction = await fetchTemplate('project.writer.book.fiction');

    expect(book).not.toBeNull();
    expect(book!.is_abstract).toBe(true);
    expect(fiction).not.toBeNull();
    expect(fiction!.parent_template_id).toBe(book!.id);
    expect(result!.type_key).toBe('project.writer.book.fiction');
  });

  it('should reuse existing ancestors', async () => {
    // Setup: create base template
    await createTemplate({ type_key: 'project.writer.book', ... });

    const result = await service.ensureAncestorTemplatesExist(
      'project.writer.book.fiction',
      'project',
      userId
    );

    expect(result!.type_key).toBe('project.writer.book');
    // Should not have created a duplicate
    const count = await countTemplates('project.writer.book');
    expect(count).toBe(1);
  });
});

describe('getAncestorTypeKeys', () => {
  it('should return empty array for minimum depth', () => {
    expect(service.getAncestorTypeKeys('task.execute', 'task')).toEqual([]);
    expect(service.getAncestorTypeKeys('project.writer.book', 'project')).toEqual([]);
  });

  it('should return immediate parent for one level above minimum', () => {
    expect(service.getAncestorTypeKeys('task.execute.deploy', 'task'))
      .toEqual(['task.execute']);
    expect(service.getAncestorTypeKeys('project.writer.book.fiction', 'project'))
      .toEqual(['project.writer.book']);
  });

  it('should return full chain for deep nesting', () => {
    expect(service.getAncestorTypeKeys('project.writer.book.fiction.romance', 'project'))
      .toEqual(['project.writer.book.fiction', 'project.writer.book']);
  });
});

describe('createTemplateFromSuggestion with ancestor creation', () => {
  it('should create base template before variant', async () => {
    const suggestion = {
      typeKey: 'task.execute.deploy',
      name: 'Deploy Task',
      description: 'Deployment task',
      properties: { environment: { type: 'string' } },
      matchScore: 85,
      rationale: 'New deployment template'
    };

    const result = await service.findOrCreate({
      scope: 'task',
      context: 'Deploy to production',
      userId
    });

    // Base should exist
    const base = await fetchTemplate('task.execute');
    expect(base).not.toBeNull();

    // Variant should have parent
    expect(result.template.parent_template_id).toBe(base!.id);
  });
});

describe('schema inheritance after auto-creation', () => {
  it('should properly inherit schema from auto-created base', async () => {
    // Create variant (which auto-creates base)
    await service.findOrCreate({
      scope: 'task',
      context: 'Deploy to kubernetes',
      userId,
      preferredTypeKey: 'task.execute.deploy'
    });

    // Resolve template
    const resolved = await resolveTemplateWithClient(
      client,
      'task.execute.deploy',
      'task'
    );

    // Should have base properties
    expect(resolved.schema.properties).toHaveProperty('notes');
    expect(resolved.schema.properties).toHaveProperty('acceptance_criteria');

    // Should have inheritance chain
    expect(resolved.inheritance_chain).toContain('task.execute');
    expect(resolved.inheritance_chain).toContain('task.execute.deploy');
  });
});
```

### Integration Tests

```typescript
describe('full template lifecycle with auto-creation', () => {
	it('should handle migration creating variant templates', async () => {
		// Simulate migration scenario
		const migrator = new EnhancedTaskMigrator(client, llm);

		// Migrate a task that needs task.execute.deploy
		await migrator.migrateTask({
			id: 'task-1',
			name: 'Deploy to production'
			// ... task data
		});

		// Verify template hierarchy
		const base = await fetchTemplate('task.execute');
		const variant = await fetchTemplate('task.execute.deploy');

		expect(base).not.toBeNull();
		expect(variant).not.toBeNull();
		expect(variant!.parent_template_id).toBe(base!.id);
	});

	it('should handle agentic chat creating new project templates', async () => {
		// Simulate agentic chat creating a project
		const result = await toolExecutor.execute('create_onto_project', {
			project: {
				name: 'My Novel',
				type_key: 'project.writer.book.fiction',
				description: 'Writing a fiction novel'
			}
		});

		// Verify template hierarchy exists
		const base = await fetchTemplate('project.writer.book');
		expect(base).not.toBeNull();
		expect(base!.is_abstract).toBe(true);
	});
});
```

---

## Migration Considerations

### Existing Orphan Templates

After implementing this fix, there may be existing variant templates without parents. Consider a migration to:

1. Identify orphan variants:

    ```sql
    SELECT t1.*
    FROM onto_templates t1
    WHERE t1.parent_template_id IS NULL
    AND ARRAY_LENGTH(STRING_TO_ARRAY(t1.type_key, '.'), 1) >
        CASE t1.scope
          WHEN 'project' THEN 3
          ELSE 2
        END;
    ```

2. Create missing base templates for orphans

3. Update orphan `parent_template_id` values

### Backwards Compatibility

The fix is backwards compatible:

- Existing templates with parents continue to work
- Existing orphan templates work but don't inherit (existing behavior)
- New templates get proper inheritance

---

## Appendix: Configuration Constants

```typescript
// Minimum type_key depth by scope (at this depth, no parent needed)
const SCOPE_MIN_DEPTHS: Record<EntityScope, number> = {
	project: 3, // project.domain.deliverable
	task: 2, // task.work_mode
	plan: 2, // plan.family
	goal: 2, // goal.family
	document: 2, // document.family
	output: 2, // output.family
	risk: 2, // risk.family
	event: 2 // event.family
};

// LLM response type for schema generation
interface LLMBaseTemplateSchemaResponse {
	name: string;
	description: string;
	properties: Record<
		string,
		{
			type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
			description: string;
			required?: boolean;
			enum?: string[];
			items?: { type: string };
		}
	>;
}
```

---

## Changelog

### December 3, 2025 (Implementation)

- Implemented LLM-based schema generation for base templates
- Each base template now gets semantically relevant properties based on type_key
- Added fallback schema for LLM failures
- Removed static `BASE_TEMPLATE_SCHEMAS` in favor of dynamic generation

### December 2, 2025 (Initial Draft)

- Identified bug in variant template creation
- Designed solution for automatic ancestor creation
- Created comprehensive test strategy
- Documented edge cases and migration path

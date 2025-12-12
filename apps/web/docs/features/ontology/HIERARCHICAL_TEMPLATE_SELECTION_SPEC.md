<!-- apps/web/docs/features/ontology/HIERARCHICAL_TEMPLATE_SELECTION_SPEC.md -->

# Hierarchical Template Selection Specification

**Created**: December 9, 2025
**Status**: Proposed
**Author**: Claude Code
**Related**: [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md), [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)

## Overview

This specification defines a two-phase hierarchical approach for template selection during migration and entity creation. Instead of searching through all templates at once (max 30), the system will:

1. **Phase 1**: Select the family/work_mode using a fast, cached lookup
2. **Phase 2**: Select the specific variant within that family

This approach improves accuracy, reduces token usage, and scales with taxonomy growth.

---

## Problem Statement

### Current Implementation Issues

1. **Flat Search Limitation**: `FindOrCreateTemplateService` limits to 30 templates via keyword matching
2. **No Taxonomy Awareness**: LLM evaluates semantically unrelated templates together
3. **Scalability**: As templates grow beyond 30, matches may be missed
4. **Token Inefficiency**: Sending 30 template descriptions per LLM call

### Current Flow (Flat)

```
User Context → Search 30 Templates → LLM Scores All → Best Match or Create
                     ↓
              Keyword-based filter
              May miss relevant families
```

### Impact

| Scope    | Templates | Families | Problem                                                      |
| -------- | --------- | -------- | ------------------------------------------------------------ |
| plan     | 20+       | 6        | May miss `plan.roadmap.*` if keywords match `plan.timebox.*` |
| task     | 12+       | 8        | Specializations compete with base work modes                 |
| output   | 25+       | 4        | Written/media/software/operational mixed together            |
| document | 20+       | 6        | Context/knowledge/spec families conflated                    |

---

## Proposed Solution

### Two-Phase Hierarchical Selection

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: FAMILY SELECTION                        │
│                    (Fast Model + Cached Families)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User Context ──► Cached Family List ──► Fast LLM ──► Selected     │
│                   (6-8 options)          (haiku)      Family       │
│                                                                     │
│  Example: "Sprint planning for Q1" → plan.timebox                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PHASE 2: VARIANT SELECTION                        │
│                   (Balanced Model + Family Templates)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Selected Family ──► Query Variants ──► LLM Score ──► Best Match   │
│                      (3-10 options)     (balanced)    or Create    │
│                                                                     │
│  Example: plan.timebox → [sprint, weekly, daily] → plan.timebox.sprint │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Family Taxonomy Reference

### Plans (`plan.{family}[.{variant}]`)

| Family     | Description          | Example Variants                    |
| ---------- | -------------------- | ----------------------------------- |
| `timebox`  | Fixed time windows   | sprint, weekly, daily, monthly      |
| `pipeline` | Stage-based funnels  | sales, kanban, hiring               |
| `campaign` | Multi-channel pushes | marketing, content_calendar, launch |
| `roadmap`  | Long-term direction  | product, strategy, technical        |
| `process`  | Repeatable workflows | client_onboarding, release, review  |
| `phase`    | Project phases       | project, discovery, execution       |

### Tasks (`task.{work_mode}[.{specialization}]`)

| Work Mode    | Description            | Example Specializations             |
| ------------ | ---------------------- | ----------------------------------- |
| `execute`    | Action tasks (default) | deploy, migration, setup, checklist |
| `create`     | Produce new artifacts  | design, prototype, draft            |
| `refine`     | Improve existing work  | edit, optimize, polish              |
| `research`   | Investigate & gather   | competitor, user, market            |
| `review`     | Evaluate & feedback    | code, design, document              |
| `coordinate` | Sync with others       | meeting, standup, interview         |
| `admin`      | Administrative tasks   | reporting, cleanup, filing          |
| `plan`       | Strategic thinking     | sprint, roadmap, backlog            |

### Goals (`goal.{family}[.{variant}]`)

| Family     | Description           | Example Variants              |
| ---------- | --------------------- | ----------------------------- |
| `outcome`  | Binary completion     | project, milestone, launch    |
| `metric`   | Quantitative targets  | revenue, usage, retention     |
| `behavior` | Frequency/consistency | cadence, habit, practice      |
| `learning` | Skill progression     | skill, certification, mastery |

### Documents (`document.{family}[.{variant}]`)

| Family      | Description           | Example Variants              |
| ----------- | --------------------- | ----------------------------- |
| `context`   | Big picture/intent    | project, product, team        |
| `knowledge` | Research/findings     | research, analysis, notes     |
| `decision`  | Decisions/commitments | adr, meeting_notes, rfc       |
| `spec`      | Formalized what/how   | technical, product, api       |
| `reference` | Reusable guides       | handbook, playbook, guide     |
| `intake`    | Information at start  | client, project, requirements |

### Outputs (`output.{family}[.{variant}]`)

| Family        | Description           | Example Variants                    |
| ------------- | --------------------- | ----------------------------------- |
| `written`     | Long-form text        | chapter, article, blog_post, report |
| `media`       | Visual/audio/video    | design_mockup, slide_deck, video    |
| `software`    | Code/releases         | feature, release, api, component    |
| `operational` | Business deliverables | report, dashboard, analysis         |

### Risks (`risk.{family}[.{variant}]`)

| Family      | Description       | Example Variants                   |
| ----------- | ----------------- | ---------------------------------- |
| `technical` | Tech/architecture | security, scalability, reliability |
| `schedule`  | Timing/deadlines  | dependency, delay, milestone       |
| `resource`  | People/skills     | skill_gap, bandwidth, turnover     |
| `budget`    | Money-related     | overrun, funding, vendor           |
| `scope`     | Scope issues      | creep, ambiguity, change           |
| `external`  | Outside factors   | regulatory, market, vendor         |
| `quality`   | Quality issues    | bugs, ux, performance              |

### Events (`event.{family}[.{variant}]`)

| Family   | Description         | Example Variants                       |
| -------- | ------------------- | -------------------------------------- |
| `work`   | Individual sessions | focus_block, time_block, deep_work     |
| `collab` | Coordination        | meeting, standup, workshop, one_on_one |
| `marker` | Deadlines/reminders | deadline, reminder, milestone          |

---

## Technical Design

### 1. Family Cache System

#### Cache Structure

```typescript
interface FamilyCache {
	/** Scope → Family definitions */
	families: Map<EntityScope, FamilyCacheEntry[]>;
	/** Last refresh timestamp */
	lastRefreshed: number;
	/** Cache TTL in milliseconds */
	ttlMs: number;
}

interface FamilyCacheEntry {
	/** Family key (e.g., "timebox", "execute") */
	key: string;
	/** Human-readable name */
	name: string;
	/** Description for LLM context */
	description: string;
	/** Example type_keys in this family */
	examples: string[];
	/** Number of templates in this family */
	templateCount: number;
}
```

#### Cache Population

```typescript
// Populate from onto_templates table
async function populateFamilyCache(
	client: TypedSupabaseClient,
	scope: EntityScope
): Promise<FamilyCacheEntry[]> {
	// Query distinct families from templates
	const { data } = await client
		.from('onto_templates')
		.select('type_key, name, metadata')
		.eq('scope', scope)
		.eq('status', 'active');

	// Extract families from type_keys
	const familyMap = new Map<string, FamilyCacheEntry>();

	for (const template of data ?? []) {
		const family = extractFamily(template.type_key, scope);
		if (!familyMap.has(family)) {
			familyMap.set(family, {
				key: family,
				name: getFamilyDisplayName(family, scope),
				description: getFamilyDescription(family, scope),
				examples: [],
				templateCount: 0
			});
		}
		const entry = familyMap.get(family)!;
		entry.examples.push(template.type_key);
		entry.templateCount++;
	}

	return Array.from(familyMap.values());
}
```

#### Cache Configuration

| Setting              | Value                | Rationale                                |
| -------------------- | -------------------- | ---------------------------------------- |
| **TTL**              | 1 hour               | Templates rarely change during migration |
| **Refresh Strategy** | Lazy                 | Refresh on first access after TTL        |
| **Scope**            | Per-service instance | Shared across batch operations           |
| **Invalidation**     | On template CRUD     | Clear relevant scope on template changes |

### 2. Phase 1: Family Selection

#### Fast Model Configuration

```typescript
const FAMILY_SELECTION_CONFIG = {
	profile: 'fast' as const, // Uses fastest available model
	temperature: 0.1, // Low temperature for consistent selection
	maxTokens: 150, // Small response (just family + rationale)
	operationType: 'template_selection.family'
};
```

#### Family Selection Prompt

```typescript
function buildFamilySelectionPrompt(
	scope: EntityScope,
	context: string,
	families: FamilyCacheEntry[]
): { system: string; user: string } {
	const familyList = families
		.map((f) => `- ${f.key}: ${f.description} (${f.templateCount} templates)`)
		.join('\n');

	return {
		system: `You select the best ${scope} family for a given context.
Choose ONLY from the provided families. Be decisive.`,

		user: `## Context
${context}

## Available Families
${familyList}

## Output Format (JSON)
{ "family": "selected_family_key", "confidence": 0-100, "rationale": "brief reason" }

Select the single best matching family.`
	};
}
```

#### Response Schema

```typescript
interface FamilySelectionResponse {
	family: string; // e.g., "timebox"
	confidence: number; // 0-100
	rationale: string; // Brief explanation
}
```

### 3. Phase 2: Variant Selection

#### Variant Query

```typescript
async function queryFamilyVariants(
	client: TypedSupabaseClient,
	scope: EntityScope,
	family: string
): Promise<TemplateRow[]> {
	const familyPrefix = `${scope}.${family}`;

	const { data } = await client
		.from('onto_templates')
		.select('*')
		.eq('scope', scope)
		.eq('status', 'active')
		.like('type_key', `${familyPrefix}%`)
		.order('type_key');

	return data ?? [];
}
```

#### Variant Scoring

Uses existing `scoreTemplates()` logic but with a narrowed template set:

```typescript
async function scoreVariants(
	templates: TemplateRow[],
	context: string,
	scope: EntityScope,
	family: string,
	userId: string
): Promise<TemplateSearchResult[]> {
	// Reuse existing scoring logic with focused template set
	// Templates array is now 3-10 items instead of 30
	return this.scoreTemplates(
		templates.map((t) => ({ template: t, score: 0 })),
		context,
		scope,
		userId
	);
}
```

### 4. Integration with Existing Services

#### FindOrCreateTemplateService Changes

```typescript
// New method signature
async findOrCreate(options: FindOrCreateTemplateOptions): Promise<FindOrCreateResult> {
  // Check if hierarchical selection applies
  if (this.shouldUseHierarchicalSelection(options.scope)) {
    return this.findOrCreateHierarchical(options);
  }

  // Fall back to existing flat approach for project scope
  return this.findOrCreateFlat(options);
}

// New hierarchical implementation
private async findOrCreateHierarchical(
  options: FindOrCreateTemplateOptions
): Promise<FindOrCreateResult> {
  // Phase 1: Family Selection (fast model, cached families)
  const families = await this.getFamiliesFromCache(options.scope);
  const familyResult = await this.selectFamily(
    options.context,
    options.scope,
    families,
    options.userId
  );

  // Phase 2: Variant Selection (balanced model, family templates)
  const variants = await this.queryFamilyVariants(options.scope, familyResult.family);
  const scoredVariants = await this.scoreVariants(
    variants,
    options.context,
    options.scope,
    familyResult.family,
    options.userId
  );

  // Existing logic: check threshold, create if needed
  const bestMatch = scoredVariants[0];
  if (bestMatch && bestMatch.score >= threshold) {
    return { template: bestMatch.template, created: false, ... };
  }

  // Suggest new variant within selected family
  return this.suggestVariant(familyResult.family, options);
}

// Determine which scopes use hierarchical selection
private shouldUseHierarchicalSelection(scope: EntityScope): boolean {
  // Projects use domain.deliverable pattern (different structure)
  // All other scopes use family.variant pattern
  return scope !== 'project';
}
```

#### BatchTaskMigrationService Changes

```typescript
// Modified classification to use two-phase approach
private async classifyBatchHierarchical(
  tasks: LegacyTask[],
  projectId: string,
  userId: string
): Promise<TaskClassification[]> {
  // Phase 1: Classify work modes (fast model)
  const workModeClassifications = await this.classifyWorkModes(tasks, userId);

  // Phase 2: Classify specializations by work mode group (balanced model)
  const tasksByWorkMode = this.groupBy(workModeClassifications, c => c.workMode);
  const finalClassifications: TaskClassification[] = [];

  for (const [workMode, tasksInMode] of Object.entries(tasksByWorkMode)) {
    const specializations = await this.classifySpecializations(
      tasksInMode,
      workMode,
      userId
    );
    finalClassifications.push(...specializations);
  }

  return finalClassifications;
}
```

---

## API Design

### New Types

```typescript
// Add to find-or-create-template.service.ts

export interface HierarchicalSelectionOptions extends FindOrCreateTemplateOptions {
	/** Skip Phase 1 and use this family directly */
	preselectedFamily?: string;
	/** Force flat selection (skip hierarchical) */
	useFlat?: boolean;
}

export interface FamilySelectionResult {
	family: string;
	confidence: number;
	rationale: string;
	cached: boolean;
	durationMs: number;
}

export interface HierarchicalSelectionResult extends FindOrCreateResult {
	/** Phase 1 result */
	familySelection?: FamilySelectionResult;
	/** Number of variants evaluated in Phase 2 */
	variantsEvaluated?: number;
}
```

### Cache Interface

```typescript
// New file: template-family-cache.service.ts

export interface TemplateFamilyCache {
	/** Get cached families for a scope */
	getFamilies(scope: EntityScope): Promise<FamilyCacheEntry[]>;

	/** Force refresh cache for a scope */
	refreshCache(scope: EntityScope): Promise<void>;

	/** Invalidate cache (called on template CRUD) */
	invalidate(scope?: EntityScope): void;

	/** Get cache stats */
	getStats(): CacheStats;
}

export interface CacheStats {
	hitCount: number;
	missCount: number;
	refreshCount: number;
	lastRefreshByScope: Record<EntityScope, number>;
}
```

---

## Performance Expectations

### Token Usage Comparison

| Phase            | Current (Flat)              | Proposed (Hierarchical)     |
| ---------------- | --------------------------- | --------------------------- |
| Template Search  | N/A                         | N/A                         |
| Family Selection | N/A                         | ~200 tokens (fast model)    |
| Template Scoring | ~3000 tokens (30 templates) | ~600 tokens (5-10 variants) |
| **Total**        | ~3000 tokens                | ~800 tokens                 |
| **Reduction**    | -                           | **~73% fewer tokens**       |

### Latency Comparison

| Phase           | Current              | Proposed                         |
| --------------- | -------------------- | -------------------------------- |
| Search          | 50ms                 | 10ms (cached families)           |
| LLM Call 1      | 800ms (30 templates) | 200ms (fast model, 6-8 families) |
| LLM Call 2      | N/A                  | 400ms (5-10 variants)            |
| **Total**       | ~850ms               | ~610ms                           |
| **Improvement** | -                    | **~28% faster**                  |

### Accuracy Improvement

| Metric            | Current                            | Proposed                      |
| ----------------- | ---------------------------------- | ----------------------------- |
| Family Coverage   | Partial (keyword-dependent)        | 100% (all families evaluated) |
| False Positives   | Higher (unrelated families scored) | Lower (focused evaluation)    |
| Template Creation | May create in wrong family         | Always in correct family      |

---

## Migration Path

### Phase 1: Add Caching Layer (Low Risk)

1. Create `TemplateFamilyCacheService`
2. Populate cache from existing templates
3. Add cache invalidation hooks to template CRUD
4. No behavior change yet

### Phase 2: Add Family Selection (Medium Risk)

1. Add `selectFamily()` method to `FindOrCreateTemplateService`
2. Add fast model configuration
3. Create family selection prompts
4. Test with dry-run mode

### Phase 3: Integrate Hierarchical Flow (Higher Risk)

1. Modify `findOrCreate()` to use hierarchical for non-project scopes
2. Update `BatchTaskMigrationService.classifyBatch()`
3. Add `useFlat` escape hatch for rollback
4. Update logging and metrics

### Phase 4: Optimize & Monitor

1. Tune cache TTL based on usage patterns
2. Monitor token usage reduction
3. Track accuracy improvements
4. Remove flat fallback after confidence

---

## Testing Strategy

### Unit Tests

```typescript
describe('TemplateFamilyCacheService', () => {
	it('should cache families by scope');
	it('should refresh after TTL expires');
	it('should invalidate on template CRUD');
	it('should handle empty scope gracefully');
});

describe('HierarchicalTemplateSelection', () => {
	it('should select correct family for plan context');
	it('should select correct work_mode for task context');
	it('should fall back to flat for project scope');
	it('should use cached families');
	it('should create variant in selected family');
});
```

### Integration Tests

```typescript
describe('BatchTaskMigration with Hierarchical Selection', () => {
	it('should classify tasks with two-phase approach');
	it('should group specializations by work_mode');
	it('should handle mixed work_modes in batch');
});

describe('EnhancedPlanMigrator with Hierarchical Selection', () => {
	it('should select plan family before variant');
	it('should create new variant in correct family');
});
```

### LLM Tests (Real API)

```typescript
describe('Family Selection Accuracy', () => {
	it('should select timebox for sprint-related context');
	it('should select campaign for marketing context');
	it('should select execute for action tasks');
	it('should select coordinate for meeting tasks');
});
```

---

## Rollback Strategy

### Feature Flag

```typescript
const FEATURE_FLAGS = {
  useHierarchicalTemplateSelection: boolean; // Default: false initially
};
```

### Gradual Rollout

1. **Week 1**: Enable for dry-run only
2. **Week 2**: Enable for 10% of migrations
3. **Week 3**: Enable for 50% of migrations
4. **Week 4**: Enable for 100%

### Rollback Trigger

If any of these occur, disable feature flag:

- Family selection accuracy < 80%
- Overall migration success rate drops > 5%
- Template creation in wrong family > 2%

---

## Success Metrics

| Metric              | Target | Measurement                             |
| ------------------- | ------ | --------------------------------------- |
| Token Reduction     | >60%   | Compare before/after per migration      |
| Latency Improvement | >20%   | Measure P50/P95 template selection time |
| Family Accuracy     | >90%   | Manual review of 100 migrations         |
| Variant Accuracy    | >85%   | Compare with human selection            |
| Cache Hit Rate      | >95%   | Track cache hits vs misses              |

---

## Open Questions

1. **Should project scope also use hierarchical?**
    - Project uses `domain.deliverable` pattern which is more varied
    - May need different approach (domain → deliverable)

2. **How to handle new families not in cache?**
    - Option A: Refresh cache on cache miss
    - Option B: Allow LLM to suggest new family

3. **Batch optimization for Phase 1?**
    - Could classify multiple entities' families in single LLM call
    - Trade-off: latency vs accuracy for diverse batches

---

## References

- [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md) - Family definitions
- [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) - Template naming patterns
- `find-or-create-template.service.ts` - Current implementation
- `batch-task-migration.service.ts` - Batch task migration

---

## Changelog

### December 9, 2025 - Initial Draft

- Created specification based on assessment of current implementation
- Defined two-phase hierarchical approach
- Added caching layer design
- Specified fast model usage for Phase 1
- Outlined migration path and testing strategy

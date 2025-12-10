# Project Template Classification Spec

**Last Updated**: December 10, 2025
**Status**: Draft Specification
**Author**: AI Assistant
**Purpose**: Define a robust, failure-proof system for classifying projects into the correct `project.{domain}.{deliverable}[.{variant}]` template

---

## Problem Statement

The current `FindOrCreateTemplateService.suggestTemplate()` method generates invalid or overly-generic type_keys like:
- `project.migration.generic` (meaningless)
- `project.trainer.marksmanship` (may duplicate existing patterns)
- `project.coach.client` (valid, but may not align with existing templates)

### Root Causes

1. **No domain awareness**: LLM doesn't know what domains already exist
2. **No hierarchical guidance**: LLM tries to generate full type_key in one shot
3. **No validation**: No enforcement of the `project.{domain}.{deliverable}` pattern
4. **No blocklist**: No prevention of generic terms like "migration", "generic", "base"

### Goals

1. **Zero garbage type_keys**: Every generated type_key must be valid and meaningful
2. **Maximize reuse**: Prefer existing templates over creating new ones
3. **Smart creation**: When new templates are needed, create them following taxonomy rules
4. **Fail gracefully**: If classification fails, fail that migration with clear logging

---

## Architecture Overview

### Conditional Multi-Phase Selection

```
                    ┌──────────────────────────────────┐
                    │  Extract Project Taxonomy        │
                    │  (domains → deliverables → vars) │
                    └───────────────┬──────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │  Count Total Project Templates   │
                    └───────────────┬──────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
    ┌─────────▼─────────┐                     ┌───────────▼───────────┐
    │  <= 30 templates  │                     │  > 30 templates       │
    │  SINGLE-PHASE     │                     │  MULTI-PHASE          │
    └─────────┬─────────┘                     └───────────┬───────────┘
              │                                           │
    ┌─────────▼─────────┐               ┌─────────────────▼─────────────────┐
    │  LLM: Pick from   │               │  Phase 1: Select/Create Domain    │
    │  full list OR     │               │  Phase 2: Select/Create Deliv.    │
    │  create new       │               │  Phase 3: Select/Create Variant   │
    └─────────┬─────────┘               └─────────────────┬─────────────────┘
              │                                           │
              └─────────────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼──────────────────┐
                    │  Validate & Return Type Key      │
                    └──────────────────────────────────┘
```

---

## Data Structures

### Project Taxonomy Tree

Extract from existing templates to build a hierarchical view:

```typescript
interface ProjectTaxonomy {
  domains: DomainEntry[];
  totalTemplates: number;
}

interface DomainEntry {
  domain: string;                    // e.g., "writer", "coach", "developer"
  templateCount: number;             // Total templates in this domain
  deliverables: DeliverableEntry[];
}

interface DeliverableEntry {
  deliverable: string;               // e.g., "book", "client", "app"
  baseTypeKey: string;               // e.g., "project.writer.book"
  templateId: string;                // UUID of the template
  variants: VariantEntry[];          // Optional variants
}

interface VariantEntry {
  variant: string;                   // e.g., "fiction", "mobile", "executive"
  typeKey: string;                   // e.g., "project.writer.book.fiction"
  templateId: string;
}
```

### Example Taxonomy

```typescript
{
  totalTemplates: 45,
  domains: [
    {
      domain: "writer",
      templateCount: 8,
      deliverables: [
        {
          deliverable: "book",
          baseTypeKey: "project.writer.book",
          templateId: "uuid-1",
          variants: [
            { variant: "fiction", typeKey: "project.writer.book.fiction", templateId: "uuid-2" },
            { variant: "nonfiction", typeKey: "project.writer.book.nonfiction", templateId: "uuid-3" }
          ]
        },
        {
          deliverable: "article",
          baseTypeKey: "project.writer.article",
          templateId: "uuid-4",
          variants: []
        }
      ]
    },
    {
      domain: "coach",
      templateCount: 6,
      deliverables: [
        {
          deliverable: "client",
          baseTypeKey: "project.coach.client",
          templateId: "uuid-5",
          variants: [
            { variant: "executive", typeKey: "project.coach.client.executive", templateId: "uuid-6" }
          ]
        }
      ]
    },
    // ... more domains
  ]
}
```

---

## SQL Query: Extract Taxonomy

```sql
-- Extract domain/deliverable/variant hierarchy from existing project templates
WITH parsed_templates AS (
  SELECT
    id,
    type_key,
    name,
    -- Extract segments from type_key
    split_part(type_key, '.', 2) as domain,
    split_part(type_key, '.', 3) as deliverable,
    CASE
      WHEN array_length(string_to_array(type_key, '.'), 1) >= 4
      THEN split_part(type_key, '.', 4)
      ELSE NULL
    END as variant,
    -- Depth: 3 = base (project.x.y), 4 = variant (project.x.y.z)
    array_length(string_to_array(type_key, '.'), 1) as depth
  FROM onto_templates
  WHERE type_key LIKE 'project.%'
    AND scope = 'project'
    AND status = 'active'
)
SELECT
  domain,
  deliverable,
  variant,
  type_key,
  id as template_id,
  name,
  depth
FROM parsed_templates
WHERE domain IS NOT NULL
  AND domain != ''
  AND deliverable IS NOT NULL
  AND deliverable != ''
ORDER BY domain, deliverable, variant NULLS FIRST;
```

### TypeScript Implementation

```typescript
interface TaxonomyRow {
  domain: string;
  deliverable: string;
  variant: string | null;
  type_key: string;
  template_id: string;
  name: string;
  depth: number;
}

async function extractProjectTaxonomy(client: TypedSupabaseClient): Promise<ProjectTaxonomy> {
  const { data, error } = await client
    .from('onto_templates')
    .select('id, type_key, name')
    .like('type_key', 'project.%')
    .eq('scope', 'project')
    .eq('status', 'active');

  if (error) throw new Error(`Failed to extract taxonomy: ${error.message}`);

  const domainMap = new Map<string, DomainEntry>();

  for (const template of data ?? []) {
    const parts = template.type_key.split('.');
    if (parts.length < 3) continue; // Invalid, skip

    const [, domain, deliverable, variant] = parts;
    if (!domain || !deliverable) continue;

    // Get or create domain entry
    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        templateCount: 0,
        deliverables: []
      });
    }
    const domainEntry = domainMap.get(domain)!;
    domainEntry.templateCount++;

    // Find or create deliverable entry
    let deliverableEntry = domainEntry.deliverables.find(d => d.deliverable === deliverable);
    if (!deliverableEntry) {
      deliverableEntry = {
        deliverable,
        baseTypeKey: `project.${domain}.${deliverable}`,
        templateId: variant ? '' : template.id, // Only set if this is the base
        variants: []
      };
      domainEntry.deliverables.push(deliverableEntry);
    }

    // If this is a variant, add it
    if (variant) {
      deliverableEntry.variants.push({
        variant,
        typeKey: template.type_key,
        templateId: template.id
      });
    } else {
      // This is the base template
      deliverableEntry.templateId = template.id;
    }
  }

  return {
    domains: Array.from(domainMap.values()),
    totalTemplates: data?.length ?? 0
  };
}
```

---

## Classification Algorithms

### Single-Phase Classification (≤30 templates)

When there are 30 or fewer project templates, use a single LLM call:

```typescript
async function classifyProjectSinglePhase(
  context: ProjectContext,
  taxonomy: ProjectTaxonomy,
  llm: SmartLLMService,
  userId: string
): Promise<ClassificationResult> {

  // Build flat list of all templates
  const allTemplates = taxonomy.domains.flatMap(d =>
    d.deliverables.flatMap(del => [
      { typeKey: del.baseTypeKey, templateId: del.templateId },
      ...del.variants.map(v => ({ typeKey: v.typeKey, templateId: v.templateId }))
    ])
  ).filter(t => t.templateId); // Only include templates that exist

  const existingDomainsText = taxonomy.domains
    .map(d => `- ${d.domain}: ${d.deliverables.map(del => del.deliverable).join(', ')}`)
    .join('\n');

  const templatesText = allTemplates
    .map(t => `- ${t.typeKey}`)
    .join('\n');

  const systemPrompt = `You classify projects into ontology templates.

Format: project.{domain}.{deliverable}[.{variant}]

- domain: The actor/role (writer, coach, developer, marketer, trainer, consultant, etc.)
- deliverable: The primary output (book, client, app, campaign, course, etc.)
- variant: Optional specialization (fiction, executive, mobile, etc.)

EXISTING DOMAINS AND DELIVERABLES:
${existingDomainsText}

EXISTING TEMPLATES:
${templatesText}

RULES:
1. PREFER existing templates when they fit (even 70%+ match is fine)
2. If creating new, the domain should represent WHO is doing the work
3. The deliverable should represent WHAT they're producing
4. NEVER use generic terms: "migration", "generic", "base", "default", "misc", "other"
5. Use lowercase snake_case for all segments
6. Maximum 4 segments total (project.domain.deliverable.variant)`;

  const userPrompt = `Classify this project:

Name: ${context.name}
Description: ${context.description}
Tags: ${context.tags?.join(', ') || 'none'}
Context: ${context.context?.substring(0, 1500) || 'none'}

Return JSON:
{
  "type_key": "project.domain.deliverable" or "project.domain.deliverable.variant",
  "is_existing": true/false,
  "confidence": 0-100,
  "rationale": "Why this template fits"
}

If an existing template fits >= 70%, use it. Only create new if truly needed.`;

  const response = await llm.getJSONResponse<{
    type_key: string;
    is_existing: boolean;
    confidence: number;
    rationale: string;
  }>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'balanced',
    temperature: 0.2,
    validation: { retryOnParseError: true, maxRetries: 2 },
    operationType: 'project_classification.single_phase'
  });

  if (!response) {
    throw new Error('[ProjectClassification] LLM returned empty response');
  }

  // Validate the type_key
  const validation = validateProjectTypeKey(response.type_key);
  if (!validation.valid) {
    throw new Error(`[ProjectClassification] Invalid type_key "${response.type_key}": ${validation.error}`);
  }

  // Check if it matches an existing template
  const existingTemplate = allTemplates.find(t => t.typeKey === response.type_key);

  return {
    typeKey: response.type_key,
    existingTemplateId: existingTemplate?.templateId ?? null,
    needsCreation: !existingTemplate,
    confidence: response.confidence,
    rationale: response.rationale
  };
}
```

### Multi-Phase Classification (>30 templates)

When there are more than 30 project templates, use a 3-phase approach:

#### Phase 1: Domain Selection

```typescript
async function selectDomain(
  context: ProjectContext,
  taxonomy: ProjectTaxonomy,
  llm: SmartLLMService,
  userId: string
): Promise<{ domain: string; isNew: boolean }> {

  const domainsText = taxonomy.domains
    .map(d => `- ${d.domain} (${d.templateCount} templates): ${d.deliverables.slice(0, 5).map(del => del.deliverable).join(', ')}${d.deliverables.length > 5 ? '...' : ''}`)
    .join('\n');

  const systemPrompt = `You select the domain for a project template.

The domain represents WHO is doing the work - their role/profession.

EXISTING DOMAINS:
${domainsText}

RULES:
1. PREFER existing domains when they fit
2. Domain should be the actor/role: writer, coach, developer, marketer, trainer, consultant, designer, etc.
3. NEVER use: "migration", "generic", "base", "default", "misc", "other", "project"
4. Use lowercase snake_case
5. Be specific but not overly narrow (e.g., "trainer" not "rifle_trainer")`;

  const userPrompt = `Select domain for this project:

Name: ${context.name}
Description: ${context.description}
Tags: ${context.tags?.join(', ') || 'none'}

Return JSON:
{
  "domain": "domain_name",
  "is_existing": true/false,
  "rationale": "Why this domain fits"
}`;

  const response = await llm.getJSONResponse<{
    domain: string;
    is_existing: boolean;
    rationale: string;
  }>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'fast',
    temperature: 0.1,
    operationType: 'project_classification.phase1_domain'
  });

  if (!response?.domain) {
    throw new Error('[ProjectClassification] Phase 1 failed: no domain returned');
  }

  const normalized = normalizeSlug(response.domain);
  if (!normalized || BLOCKED_TERMS.has(normalized)) {
    throw new Error(`[ProjectClassification] Phase 1 failed: invalid domain "${response.domain}"`);
  }

  const existingDomain = taxonomy.domains.find(d => d.domain === normalized);

  return {
    domain: normalized,
    isNew: !existingDomain
  };
}
```

#### Phase 2: Deliverable Selection

```typescript
async function selectDeliverable(
  context: ProjectContext,
  domain: string,
  taxonomy: ProjectTaxonomy,
  llm: SmartLLMService,
  userId: string
): Promise<{ deliverable: string; isNew: boolean }> {

  const domainEntry = taxonomy.domains.find(d => d.domain === domain);
  const existingDeliverables = domainEntry?.deliverables ?? [];

  const deliverablesText = existingDeliverables.length > 0
    ? existingDeliverables.map(d =>
        `- ${d.deliverable}${d.variants.length > 0 ? ` (variants: ${d.variants.map(v => v.variant).join(', ')})` : ''}`
      ).join('\n')
    : '- None yet (this is a new domain)';

  const systemPrompt = `You select the deliverable for a project template.

Domain: ${domain}
The deliverable represents WHAT is being produced - the primary output.

EXISTING DELIVERABLES FOR "${domain}":
${deliverablesText}

RULES:
1. PREFER existing deliverables when they fit
2. Deliverable should be the output: book, client, app, campaign, course, product, etc.
3. NEVER use: "migration", "generic", "base", "default", "project", "work"
4. Use lowercase snake_case
5. Be specific but reusable (e.g., "client" for coaching clients, "app" for software)`;

  const userPrompt = `Select deliverable for:

Domain: ${domain}
Name: ${context.name}
Description: ${context.description}

Return JSON:
{
  "deliverable": "deliverable_name",
  "is_existing": true/false,
  "rationale": "Why this deliverable fits"
}`;

  const response = await llm.getJSONResponse<{
    deliverable: string;
    is_existing: boolean;
    rationale: string;
  }>({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'fast',
    temperature: 0.1,
    operationType: 'project_classification.phase2_deliverable'
  });

  if (!response?.deliverable) {
    throw new Error('[ProjectClassification] Phase 2 failed: no deliverable returned');
  }

  const normalized = normalizeSlug(response.deliverable);
  if (!normalized || BLOCKED_TERMS.has(normalized)) {
    throw new Error(`[ProjectClassification] Phase 2 failed: invalid deliverable "${response.deliverable}"`);
  }

  const existingDeliverable = existingDeliverables.find(d => d.deliverable === normalized);

  return {
    deliverable: normalized,
    isNew: !existingDeliverable
  };
}
```

#### Phase 3: Variant Selection (Optional)

```typescript
async function selectVariant(
  context: ProjectContext,
  domain: string,
  deliverable: string,
  taxonomy: ProjectTaxonomy,
  llm: SmartLLMService,
  userId: string
): Promise<{ variant: string | null; typeKey: string; existingTemplateId: string | null }> {

  const domainEntry = taxonomy.domains.find(d => d.domain === domain);
  const deliverableEntry = domainEntry?.deliverables.find(d => d.deliverable === deliverable);
  const existingVariants = deliverableEntry?.variants ?? [];
  const baseTypeKey = `project.${domain}.${deliverable}`;

  // If base template exists and context doesn't suggest specialization, use base
  if (deliverableEntry?.templateId && existingVariants.length === 0) {
    // No variants exist - check if we need one or base is fine
    const systemPrompt = `Determine if this project needs a specialized variant or if the base template is sufficient.

Base template: ${baseTypeKey}

A variant is ONLY needed if:
1. The project has a clear specialization that differs from the general case
2. The specialization is reusable (not just this one project)
3. The specialization affects the schema/workflow significantly

Return JSON:
{
  "needs_variant": true/false,
  "variant": "variant_name" or null,
  "rationale": "Why"
}`;

    const response = await llm.getJSONResponse<{
      needs_variant: boolean;
      variant: string | null;
      rationale: string;
    }>({
      systemPrompt,
      userPrompt: `Project: ${context.name}\n${context.description}`,
      userId,
      profile: 'fast',
      temperature: 0.1,
      operationType: 'project_classification.phase3_variant'
    });

    if (!response?.needs_variant) {
      return {
        variant: null,
        typeKey: baseTypeKey,
        existingTemplateId: deliverableEntry.templateId
      };
    }

    if (response.variant) {
      const normalized = normalizeSlug(response.variant);
      if (normalized && !BLOCKED_TERMS.has(normalized)) {
        return {
          variant: normalized,
          typeKey: `${baseTypeKey}.${normalized}`,
          existingTemplateId: null // New variant
        };
      }
    }

    // Variant suggested but invalid, fall back to base
    return {
      variant: null,
      typeKey: baseTypeKey,
      existingTemplateId: deliverableEntry.templateId
    };
  }

  // Variants exist - let LLM choose or create
  const variantsText = existingVariants.length > 0
    ? existingVariants.map(v => `- ${v.variant}: ${v.typeKey}`).join('\n')
    : '- None yet';

  const systemPrompt = `Select or create a variant for this project.

Base: ${baseTypeKey}
Existing variants:
${variantsText}

Return JSON:
{
  "use_base": true/false,
  "variant": "variant_name" or null,
  "is_existing_variant": true/false,
  "rationale": "Why"
}`;

  const response = await llm.getJSONResponse<{
    use_base: boolean;
    variant: string | null;
    is_existing_variant: boolean;
    rationale: string;
  }>({
    systemPrompt,
    userPrompt: `Project: ${context.name}\n${context.description}`,
    userId,
    profile: 'fast',
    temperature: 0.1,
    operationType: 'project_classification.phase3_variant_select'
  });

  if (response?.use_base || !response?.variant) {
    return {
      variant: null,
      typeKey: baseTypeKey,
      existingTemplateId: deliverableEntry?.templateId ?? null
    };
  }

  const normalized = normalizeSlug(response.variant);
  const existingVariant = existingVariants.find(v => v.variant === normalized);

  return {
    variant: normalized,
    typeKey: existingVariant?.typeKey ?? `${baseTypeKey}.${normalized}`,
    existingTemplateId: existingVariant?.templateId ?? null
  };
}
```

---

## Validation Rules

### Type Key Format Validation

```typescript
const BLOCKED_TERMS = new Set([
  'migration', 'generic', 'base', 'default', 'misc', 'other',
  'project', 'template', 'type', 'undefined', 'null', 'none',
  'test', 'example', 'sample', 'demo', 'tmp', 'temp'
]);

const PROJECT_TYPE_KEY_PATTERN = /^project\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateProjectTypeKey(typeKey: string): ValidationResult {
  // Check basic format
  if (!PROJECT_TYPE_KEY_PATTERN.test(typeKey)) {
    return {
      valid: false,
      error: `Does not match pattern project.{domain}.{deliverable}[.{variant}]`
    };
  }

  const parts = typeKey.split('.');
  if (parts.length < 3 || parts.length > 4) {
    return {
      valid: false,
      error: `Must have 3-4 segments, got ${parts.length}`
    };
  }

  const [scope, domain, deliverable, variant] = parts;

  // Check for blocked terms
  if (BLOCKED_TERMS.has(domain)) {
    return {
      valid: false,
      error: `Domain "${domain}" is a blocked term`
    };
  }

  if (BLOCKED_TERMS.has(deliverable)) {
    return {
      valid: false,
      error: `Deliverable "${deliverable}" is a blocked term`
    };
  }

  if (variant && BLOCKED_TERMS.has(variant)) {
    return {
      valid: false,
      error: `Variant "${variant}" is a blocked term`
    };
  }

  // Check minimum length
  if (domain.length < 2 || deliverable.length < 2) {
    return {
      valid: false,
      error: `Domain and deliverable must be at least 2 characters`
    };
  }

  return { valid: true };
}
```

---

## Main Entry Point

```typescript
interface ProjectClassificationOptions {
  context: ProjectContext;
  llm: SmartLLMService;
  client: TypedSupabaseClient;
  userId: string;
}

interface ProjectClassificationResult {
  typeKey: string;
  existingTemplateId: string | null;
  needsCreation: boolean;
  confidence: number;
  rationale: string;
  method: 'single_phase' | 'multi_phase';
  phases?: {
    domain: { value: string; isNew: boolean };
    deliverable: { value: string; isNew: boolean };
    variant?: { value: string | null; isNew: boolean };
  };
}

async function classifyProject(
  options: ProjectClassificationOptions
): Promise<ProjectClassificationResult> {
  const { context, llm, client, userId } = options;
  const startTime = Date.now();

  console.info(`[ProjectClassification] START project="${context.name}"`);

  try {
    // 1. Extract current taxonomy
    const taxonomy = await extractProjectTaxonomy(client);
    console.info(`[ProjectClassification] Taxonomy: ${taxonomy.totalTemplates} templates, ${taxonomy.domains.length} domains`);

    // 2. Choose classification method based on template count
    const MULTI_PHASE_THRESHOLD = 30;

    if (taxonomy.totalTemplates <= MULTI_PHASE_THRESHOLD) {
      // Single-phase classification
      console.info(`[ProjectClassification] Using SINGLE_PHASE (${taxonomy.totalTemplates} <= ${MULTI_PHASE_THRESHOLD})`);

      const result = await classifyProjectSinglePhase(context, taxonomy, llm, userId);

      console.info(
        `[ProjectClassification] RESULT typeKey=${result.typeKey} ` +
        `existing=${!!result.existingTemplateId} confidence=${result.confidence} ` +
        `duration=${Date.now() - startTime}ms`
      );

      return {
        ...result,
        method: 'single_phase'
      };
    }

    // Multi-phase classification
    console.info(`[ProjectClassification] Using MULTI_PHASE (${taxonomy.totalTemplates} > ${MULTI_PHASE_THRESHOLD})`);

    // Phase 1: Domain
    const domainResult = await selectDomain(context, taxonomy, llm, userId);
    console.info(`[ProjectClassification] Phase 1 DOMAIN=${domainResult.domain} isNew=${domainResult.isNew}`);

    // Phase 2: Deliverable
    const deliverableResult = await selectDeliverable(
      context,
      domainResult.domain,
      taxonomy,
      llm,
      userId
    );
    console.info(`[ProjectClassification] Phase 2 DELIVERABLE=${deliverableResult.deliverable} isNew=${deliverableResult.isNew}`);

    // Phase 3: Variant
    const variantResult = await selectVariant(
      context,
      domainResult.domain,
      deliverableResult.deliverable,
      taxonomy,
      llm,
      userId
    );
    console.info(
      `[ProjectClassification] Phase 3 VARIANT=${variantResult.variant ?? 'none'} ` +
      `typeKey=${variantResult.typeKey} existingTemplate=${!!variantResult.existingTemplateId}`
    );

    const duration = Date.now() - startTime;
    console.info(`[ProjectClassification] RESULT typeKey=${variantResult.typeKey} duration=${duration}ms`);

    return {
      typeKey: variantResult.typeKey,
      existingTemplateId: variantResult.existingTemplateId,
      needsCreation: !variantResult.existingTemplateId,
      confidence: 85, // Multi-phase is generally high confidence
      rationale: `Domain: ${domainResult.domain}, Deliverable: ${deliverableResult.deliverable}${variantResult.variant ? `, Variant: ${variantResult.variant}` : ''}`,
      method: 'multi_phase',
      phases: {
        domain: { value: domainResult.domain, isNew: domainResult.isNew },
        deliverable: { value: deliverableResult.deliverable, isNew: deliverableResult.isNew },
        variant: variantResult.variant
          ? { value: variantResult.variant, isNew: !variantResult.existingTemplateId }
          : undefined
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[ProjectClassification] FAILED project="${context.name}" ` +
      `duration=${duration}ms error=${error instanceof Error ? error.message : 'Unknown'}`
    );
    throw error; // Re-throw to fail the migration
  }
}
```

---

## Integration with FindOrCreateTemplateService

Replace the current `suggestTemplate` call for projects with:

```typescript
// In findOrCreate() method, before calling suggestTemplate for projects:

if (options.scope === 'project') {
  // Use specialized project classification
  const classification = await classifyProject({
    context: options.context,
    llm: this.llm,
    client: this.client,
    userId: options.userId
  });

  if (classification.existingTemplateId) {
    // Existing template found - use it
    const template = await this.fetchTemplateById(classification.existingTemplateId);
    if (template) {
      return {
        template,
        created: false,
        matchScore: classification.confidence / 100,
        matchRationale: classification.rationale,
        usedHierarchical: false
      };
    }
  }

  // Need to create new template
  const suggestion: TemplateSuggestion = {
    typeKey: classification.typeKey,
    name: this.humanizeTypeKey(classification.typeKey),
    description: classification.rationale,
    // ... generate schema and FSM for new template
  };

  return this.createTemplateFromSuggestion(suggestion, options);
}

// For non-project scopes, use existing suggestTemplate logic
```

---

## Error Handling

### Migration-Level Error Handling

```typescript
// In the migration orchestrator:

try {
  const classification = await classifyProject({
    context: projectData,
    llm,
    client,
    userId
  });

  // Continue with migration...

} catch (error) {
  // Log detailed error
  console.error('[Migration] Project classification failed', {
    projectId: projectData.id,
    projectName: projectData.name,
    error: error instanceof Error ? error.message : 'Unknown',
    stack: error instanceof Error ? error.stack : undefined
  });

  // Record failure in migration log
  await recordMigrationFailure(client, {
    entityType: 'project',
    entityId: projectData.id,
    phase: 'classification',
    error: error instanceof Error ? error.message : 'Unknown',
    context: {
      projectName: projectData.name,
      projectDescription: projectData.description?.substring(0, 500)
    }
  });

  // Return failure result (don't throw - allow other projects to continue)
  return {
    status: 'failed',
    projectId: projectData.id,
    error: `Classification failed: ${error instanceof Error ? error.message : 'Unknown'}`
  };
}
```

---

## Testing Considerations

### Test Cases

1. **Existing template match**: Project clearly matches `project.writer.book` → uses existing
2. **New domain needed**: Dog grooming business → creates `project.groomer.client`
3. **New deliverable needed**: Writer doing newsletters → creates `project.writer.newsletter`
4. **Variant needed**: Executive coaching → `project.coach.client.executive`
5. **Blocked term rejection**: LLM suggests `project.migration.generic` → fails validation
6. **Edge case**: Very short description → still produces valid classification

### Performance Benchmarks

- Single-phase: ~1-2 seconds
- Multi-phase: ~3-5 seconds (3 LLM calls)
- Taxonomy extraction: ~100ms (cached)

---

## Open Questions / Future Improvements

1. **Caching**: Should we cache the taxonomy for the duration of a migration run?
2. **Batch classification**: Could we classify multiple similar projects in one LLM call?
3. **Human review**: Should uncertain classifications (<70% confidence) be flagged for review?
4. **Domain synonyms**: Should we map similar domains? (e.g., "instructor" → "trainer")

---

## Changelog

### December 10, 2025 - Initial Spec
- Defined 3-phase classification architecture
- Created taxonomy extraction query
- Defined validation rules with blocked terms
- Specified error handling for migrations

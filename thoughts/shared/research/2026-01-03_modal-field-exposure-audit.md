<!-- thoughts/shared/research/2026-01-03_modal-field-exposure-audit.md -->
# Modal Field Exposure Audit for /projects/[id]

---
title: "Modal Field Exposure Audit - Ontology Entity Modals"
date: 2026-01-03
type: research
status: complete
tags: [modals, ontology, tags, props, classification, audit]
---

## Executive Summary

This audit analyzes all modals used in `/projects/[id]` to determine which database columns are exposed for editing versus which are missing. **Critical finding:** The recently added `classifyOntologyEntity` function stores tags in `props.tags`, but **no modal currently exposes tags for viewing or editing**.

### Key Gaps Identified

1. **Tags not visible or editable** in any modal (stored in `props.tags`)
2. **`type_key` not editable** in most modals (auto-classified but not user-correctable)
3. **Facet columns missing** from Plans (has DB columns but saves to props instead)
4. **Output modal severely limited** - cannot edit name, only description
5. **Completion timestamps read-only** - no auto-set on state transitions

---

## Classification System Analysis

### How Tags Work (`classifyOntologyEntity`)

**Location:** `apps/worker/src/workers/ontology/ontologyClassifier.ts`

The classification system is a **background worker process** that:

1. Triggers via `apps/web/src/lib/server/ontology-classification.service.ts`
2. Runs on entity creation (source: `create_modal`)
3. Uses LLM to generate:
   - `type_key` - semantic classification (e.g., `task.execute`, `goal.outcome.project`)
   - `tags` - 3-7 keywords for discoverability (stored in `props.tags`)
   - `confidence` - classification confidence score
   - `reasoning` - explanation of classification

**Tag Storage Structure:**
```typescript
// In props column (JSON)
{
  tags: ["frontend", "api-design", "user-research"],
  _classification: {
    classified_at: "2026-01-03T...",
    confidence: 0.85,
    model_used: "openrouter",
    previous_type_key: "task.default"
  }
}
```

**Supported Entity Types:**
- task, output, plan, goal, risk, milestone, decision, document

**Current Issue:** Tags are generated but **never shown to users** in any modal.

---

## Entity-by-Entity Analysis

### 1. TASK (`onto_tasks`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `title` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `priority` | number | ✅ Yes | |
| `state_key` | string | ✅ Yes | |
| `start_at` | datetime | ✅ Yes | |
| `due_at` | datetime | ✅ Yes | |
| `plan_id` | uuid (via edge) | ✅ Yes | |
| `goal_id` | uuid (in props) | ✅ Yes | |
| `milestone_id` | uuid (in props) | ✅ Yes | |
| `type_key` | string | ❌ **No** | Auto-classified, not editable |
| `facet_scale` | string | ❌ **No** | Column exists, never used |
| `completed_at` | datetime | ❌ **No** | Read-only, not auto-set |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**File:** `apps/web/src/lib/components/ontology/TaskEditModal.svelte`

---

### 2. GOAL (`onto_goals`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `name` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `goal` | string | ✅ Yes | Goal details field |
| `state_key` | string | ✅ Yes | |
| `target_date` | date | ✅ Yes | |
| `props.priority` | string | ✅ Yes | Stored in props |
| `props.measurement_criteria` | string | ✅ Yes | |
| `type_key` | string | ❌ **No** | Auto-classified, not editable |
| `completed_at` | datetime | ❌ **No** | Read-only |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**File:** `apps/web/src/lib/components/ontology/GoalEditModal.svelte`

---

### 3. PLAN (`onto_plans`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `name` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `plan` | string | ✅ Yes | Plan body content |
| `state_key` | string | ✅ Yes | |
| `props.start_date` | date | ✅ Yes | Stored in props, not DB column |
| `props.end_date` | date | ✅ Yes | Stored in props, not DB column |
| `type_key` | string | ❌ **No** | Auto-classified |
| `facet_context` | string | ❌ **No** | **DB column exists!** |
| `facet_scale` | string | ❌ **No** | **DB column exists!** |
| `facet_stage` | string | ❌ **No** | **DB column exists!** |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**Critical Issue:** Plans have facet columns in the database but modal saves dates to `props` instead of using actual columns.

**File:** `apps/web/src/lib/components/ontology/PlanEditModal.svelte`

---

### 4. MILESTONE (`onto_milestones`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `title` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `milestone` | string | ✅ Yes | Milestone body |
| `state_key` | string | ✅ Yes | |
| `due_at` | datetime | ✅ Yes | |
| `type_key` | string | ❌ **No** | Auto-classified |
| `completed_at` | datetime | ❌ **No** | Should auto-set on state=completed |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**File:** `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`

---

### 5. RISK (`onto_risks`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `title` | string | ✅ Yes | |
| `content` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `impact` | string | ✅ Yes | |
| `probability` | number | ✅ Yes | |
| `state_key` | string | ✅ Yes | |
| `props.mitigation_strategy` | string | ✅ Yes | |
| `props.owner` | string | ✅ Yes | |
| `type_key` | string | ❌ **No** | Auto-classified |
| `mitigated_at` | datetime | ❌ **No** | Should auto-set on state=mitigated |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**File:** `apps/web/src/lib/components/ontology/RiskEditModal.svelte`

---

### 6. PROJECT (`onto_projects`)

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `name` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `state_key` | string | ✅ Yes | |
| `start_at` | date | ✅ Yes | As `start_date` |
| `end_at` | date | ✅ Yes | As `end_date` |
| `facet_context` | string | ✅ Yes | |
| `facet_scale` | string | ✅ Yes | |
| `facet_stage` | string | ✅ Yes | |
| `next_step_short` | string | ✅ Yes | |
| `next_step_long` | string | ✅ Yes | |
| `type_key` | string | ❌ **No** | Never editable |
| `is_public` | boolean | ❌ **No** | Sharing toggle missing |
| `org_id` | uuid | ❌ **No** | Org assignment |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**File:** `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`

---

### 7. OUTPUT (`onto_outputs`) - **CRITICAL GAPS**

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `state_key` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `name` | string | ❌ **No** | **Cannot edit name!** |
| `type_key` | string | ❌ **No** | Auto-classified |
| `facet_stage` | string | ❌ **No** | DB column exists |
| `source_document_id` | uuid | ❌ **No** | |
| `source_event_id` | uuid | ❌ **No** | |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**Critical Issue:** Output modal is the MOST limited - users cannot even edit the name!

**File:** `apps/web/src/lib/components/ontology/OutputEditModal.svelte`

---

### 8. DECISION (`onto_decisions`) - Complete

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `title` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `outcome` | string | ✅ Yes | |
| `rationale` | string | ✅ Yes | |
| `state_key` | string | ✅ Yes | |
| `type_key` | string | ✅ Yes | Editable! |
| `decision_at` | datetime | ✅ Yes | |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**Status:** Most complete modal - only missing tags display.

**File:** `apps/web/src/lib/components/ontology/DecisionEditModal.svelte`

---

### 9. DOCUMENT (`onto_documents`) - Complete

**Database Columns:**
| Column | Type | Modal Exposed | Notes |
|--------|------|---------------|-------|
| `title` | string | ✅ Yes | |
| `description` | string | ✅ Yes | |
| `content` | string | ✅ Yes | Full body editor |
| `state_key` | string | ✅ Yes | |
| `type_key` | string | ✅ Yes | Editable! |
| `props.tags` | string[] | ❌ **No** | Classification tags hidden |

**Status:** Complete except for tags display.

**File:** `apps/web/src/lib/components/ontology/DocumentModal.svelte`

---

## Summary of Missing Fields

### Priority 1: Tags (Affects All Entities)

Tags are generated by the classification worker but **never displayed** to users.

**Recommendation:** Add a read-only tags display section to all modals showing `props.tags` with chips/badges.

```svelte
{#if output?.props?.tags?.length}
  <div class="flex flex-wrap gap-2">
    {#each output.props.tags as tag}
      <span class="px-2 py-1 text-xs bg-muted rounded-full text-muted-foreground">
        {tag}
      </span>
    {/each}
  </div>
{/if}
```

### Priority 2: type_key (Semi-Editable)

Only Decision and Document modals allow editing `type_key`. All others auto-classify but don't let users correct mistakes.

**Recommendation:** Add a type_key selector dropdown using the valid taxonomy from the classifier:
- Tasks: `task.{execute|create|refine|research|review|coordinate|admin|plan}`
- Outputs: `output.{written|media|software|operational}`
- Plans: `plan.{timebox|pipeline|campaign|roadmap|process|phase}`
- Goals: `goal.{outcome|metric|behavior|learning}`
- Risks: `risk.{technical|schedule|resource|budget|scope|external|quality}`
- Milestones: `milestone.{delivery|phase_complete|review|deadline|release|launch}`

### Priority 3: Output Modal Name Field

Users cannot edit the name of outputs - only the description.

**Recommendation:** Add `name` field to OutputEditModal form.

### Priority 4: Plan Facet Columns

Plans have `facet_context`, `facet_scale`, `facet_stage` columns in the database but the modal only saves dates to `props`.

**Recommendation:** Either:
- Remove unused facet columns from plans table, OR
- Add facet selectors to PlanEditModal (matching ProjectEditModal)

### Priority 5: Auto-Set Completion Timestamps

When state transitions to "completed" or "mitigated", the corresponding timestamp columns (`completed_at`, `mitigated_at`) should be auto-populated.

**Recommendation:** Add logic to API PATCH handlers:
```typescript
if (state_key === 'done' || state_key === 'completed') {
  updates.completed_at = new Date().toISOString();
}
```

---

## Implementation Checklist

### Immediate Actions

- [ ] Add tags display (read-only chips) to all modals
- [ ] Add `name` field to OutputEditModal
- [ ] Add `type_key` selector to Task, Goal, Plan, Risk, Milestone modals

### Secondary Actions

- [ ] Add facet selectors to PlanEditModal (or remove unused columns)
- [ ] Auto-set `completed_at` on Tasks, Goals, Milestones when state = completed
- [ ] Auto-set `mitigated_at` on Risks when state = mitigated
- [ ] Add `is_public` toggle to ProjectEditModal

### Future Consideration

- [ ] Allow users to manually add/remove tags (not just display)
- [ ] Show classification confidence and reasoning in a tooltip
- [ ] Add "Re-classify" button to trigger fresh classification

---

## Files Referenced

### Modal Components
- `/apps/web/src/lib/components/ontology/TaskEditModal.svelte`
- `/apps/web/src/lib/components/ontology/GoalEditModal.svelte`
- `/apps/web/src/lib/components/ontology/PlanEditModal.svelte`
- `/apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`
- `/apps/web/src/lib/components/ontology/RiskEditModal.svelte`
- `/apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`
- `/apps/web/src/lib/components/ontology/OutputEditModal.svelte`
- `/apps/web/src/lib/components/ontology/DecisionEditModal.svelte`
- `/apps/web/src/lib/components/ontology/DocumentModal.svelte`

### Classification System
- `/apps/web/src/lib/server/ontology-classification.service.ts`
- `/apps/worker/src/workers/ontology/ontologyClassifier.ts`
- `/packages/shared-types/src/queue-types.ts`

### Database Schema
- `/packages/shared-types/src/database.schema.ts` (lines 965-1298)

---

## Conclusion

The classification system is working and generating useful tags, but users have no visibility into them. The immediate fix is to add a read-only tags display to all modals. Secondary priorities include exposing `type_key` for manual correction and fixing the severely limited Output modal.

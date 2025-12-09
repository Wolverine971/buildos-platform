<!-- apps/web/docs/features/ontology/ONTOLOGY_TAXONOMY_UPDATE_TASKS.md -->

# Ontology Taxonomy Update Task List

**Created**: December 1, 2025
**Status**: Complete
**Purpose**: Track updates to ontology naming conventions and templates

---

## Overview

This task list tracks the implementation of the new family-based taxonomy pattern for Plans, Goals, Documents, Outputs, Risks, and Events as defined in `missing_data_model_taxonomy_conventions.md`.

### Key Pattern Change

**Old Pattern**: `{scope}.{type}[.{variant}]`
**New Pattern**: `{data_type}.{family}[.{variant}]`

With abstract bases:

- `{data_type}.base` - Root abstract type
- `{data_type}.{family}.base` - Abstract family type

---

## Task Checklist

### Phase 1: Documentation Updates

| #   | Task                                  | File                          | Status      |
| --- | ------------------------------------- | ----------------------------- | ----------- |
| 1   | Update naming conventions reference   | `NAMING_CONVENTIONS.md`       | ✅ Complete |
| 2   | Update type key taxonomy architecture | `TYPE_KEY_TAXONOMY.md`        | ✅ Complete |
| 3   | Update data models documentation      | `DATA_MODELS.md`              | ✅ Complete |
| 4   | Update API endpoints documentation    | `API_ENDPOINTS.md`            | ✅ Complete |
| 5   | Create core namespaces reference      | `ONTOLOGY_NAMESPACES_CORE.md` | ✅ Complete |

### Phase 2: Code Updates

| #   | Task                                     | File                                           | Status                                            |
| --- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| 6   | Update Zod validation schemas            | `apps/web/src/lib/types/onto.ts`               | ✅ Complete                                       |
| 7   | Update template scope definitions        | `apps/web/src/lib/constants/template-scope.ts` | ✅ Complete                                       |
| 8   | Add type inference rules (if applicable) | `services/type_inference/`                     | ⏭️ Deferred (documented in NAMING_CONVENTIONS.md) |

### Phase 3: Database Migrations

| #    | Task                                                                                      | File                                                           | Status      |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------- |
| 9-15 | Create all template seeds (plans, goals, documents, outputs, risks, events, requirements) | `supabase/migrations/20251201_family_based_templates_seed.sql` | ✅ Complete |

---

## New Taxonomy Summary

### Plans (`plan.*`)

| Family   | Base                 | Example Variants                                             |
| -------- | -------------------- | ------------------------------------------------------------ |
| timebox  | `plan.timebox.base`  | `.sprint`, `.weekly`, `.daily_focus`                         |
| pipeline | `plan.pipeline.base` | `.sales`, `.content`, `.feature`                             |
| campaign | `plan.campaign.base` | `.marketing`, `.product_launch`, `.content_calendar`         |
| roadmap  | `plan.roadmap.base`  | `.product`, `.strategy`                                      |
| process  | `plan.process.base`  | `.client_onboarding`, `.support_runbook`, `.hiring_pipeline` |
| phase    | `plan.phase.base`    | `.project`, `.discovery`, `.execution`, `.migration`         |

### Goals (`goal.*`)

| Family   | Base                 | Example Variants         |
| -------- | -------------------- | ------------------------ |
| outcome  | `goal.outcome.base`  | `.project`, `.milestone` |
| metric   | `goal.metric.base`   | `.usage`, `.revenue`     |
| behavior | `goal.behavior.base` | `.cadence`, `.routine`   |
| learning | `goal.learning.base` | `.skill`, `.domain`      |

### Documents (`document.*`)

| Family    | Base                      | Example Variants                                                   |
| --------- | ------------------------- | ------------------------------------------------------------------ |
| context   | `document.context.base`   | `.project`, `.brief`                                               |
| knowledge | `document.knowledge.base` | `.research`, `.market_research`, `.user_research`, `.brain_dump`   |
| decision  | `document.decision.base`  | `.meeting_notes`, `.rfc`, `.proposal.client`, `.proposal.investor` |
| spec      | `document.spec.base`      | `.product`, `.technical`, `.requirement`                           |
| reference | `document.reference.base` | `.handbook`, `.sop`, `.checklist`                                  |
| intake    | `document.intake.base`    | `.client`, `.user`, `.project`                                     |

### Outputs (`output.*`)

| Family      | Base                      | Example Variants                                                                                            |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| written     | `output.written.base`     | `.chapter`, `.article`, `.blog_post`, `.case_study`, `.whitepaper`, `.newsletter`, `.sales_page`, `.script` |
| media       | `output.media.base`       | `.design_mockup`, `.slide_deck`, `.video`, `.audio`, `.asset_pack`                                          |
| software    | `output.software.base`    | `.feature`, `.release`, `.api`, `.integration`                                                              |
| operational | `output.operational.base` | `.report`, `.dashboard`, `.contract`, `.playbook`                                                           |

### Risks (`risk.*`)

| Family    | Base                  | Example Variants               |
| --------- | --------------------- | ------------------------------ |
| technical | `risk.technical.base` | `.security`, `.scalability`    |
| schedule  | `risk.schedule.base`  | `.dependency`, `.deadline`     |
| resource  | `risk.resource.base`  | `.headcount`, `.skill_gap`     |
| budget    | `risk.budget.base`    | `.overrun`                     |
| scope     | `risk.scope.base`     | (none yet)                     |
| external  | `risk.external.base`  | `.regulatory`, `.market_shift` |
| quality   | `risk.quality.base`   | `.defects`, `.usability`       |

### Events (`event.*`)

| Family | Base                | Example Variants                                                                                                                           |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| work   | `event.work.base`   | `.focus_block`, `.time_block`, `.buffer`                                                                                                   |
| collab | `event.collab.base` | `.meeting.base`, `.meeting.one_on_one`, `.meeting.standup`, `.meeting.review`, `.meeting.workshop`, `.meeting.client`, `.meeting.internal` |
| marker | `event.marker.base` | `.deadline`, `.reminder`, `.out_of_office`, `.travel`, `.hold`                                                                             |

### Requirements (`requirement.*`)

| Type Key                     | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `requirement.base`           | Root abstract requirement template               |
| `requirement.functional`     | Functional requirements (what system must do)    |
| `requirement.non_functional` | Non-functional requirements (quality attributes) |
| `requirement.constraint`     | Technical/business constraints                   |
| `requirement.assumption`     | Project assumptions                              |
| `requirement.dependency`     | External dependencies and integrations           |

---

## Updated Regex Validators

```typescript
// Validation patterns by scope
const TYPE_KEY_PATTERNS = {
	// Existing (unchanged)
	project: /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
	task: /^task\.[a-z_]+(\.[a-z_]+)?$/,
	requirement: /^requirement\.[a-z_]+(\.[a-z_]+)?$/,

	// Updated with family pattern
	plan: /^plan\.[a-z_]+(\.[a-z_]+)?$/,
	goal: /^goal\.[a-z_]+(\.[a-z_]+)?$/,
	document: /^document\.[a-z_]+(\.[a-z_]+)?$/,
	output: /^output\.[a-z_]+(\.[a-z_]+)?$/,
	risk: /^risk\.[a-z_]+(\.[a-z_]+)?$/,
	event: /^event\.[a-z_]+(\.[a-z_]+)?$/
};
```

---

## Notes

### Entities with Different Patterns

- **Projects** - Use `project.{domain}.{deliverable}[.{variant}]` (domain-based)
- **Tasks** - Use `task.{work_mode}[.{specialization}]` (work mode-based)
- **Requirements** - Use `requirement.{type}` (flat, no families) - types: functional, non_functional, constraint, assumption, dependency

### Migration Strategy

1. Abstract base templates (`*.base`) are created first
2. Family base templates (`*.{family}.base`) reference the root abstract
3. Concrete variants reference their family base via `parent_template_id`
4. Abstract templates have `is_abstract: true` and cannot be instantiated

---

## Cross-Cutting Query Examples

```sql
-- All written outputs
SELECT * FROM onto_outputs
WHERE type_key LIKE 'output.written.%';

-- All campaign-style plans
SELECT * FROM onto_plans
WHERE type_key LIKE 'plan.campaign.%';

-- All knowledge-oriented docs
SELECT * FROM onto_documents
WHERE type_key LIKE 'document.knowledge.%';

-- All collaboration events this week
SELECT * FROM onto_events
WHERE type_key LIKE 'event.collab.%'
  AND start_at >= $week_start
  AND start_at < $week_end;

-- All technical risks across all projects
SELECT * FROM onto_risks
WHERE type_key LIKE 'risk.technical.%';
```

---

**Last Updated**: December 1, 2025

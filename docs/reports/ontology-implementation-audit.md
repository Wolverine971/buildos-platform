# Ontology Implementation Audit

_Date: 2025-11-05_

This document summarizes a code-level review of the ontology implementation against the **BuildOS Ontology Master Plan** (`thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md`). The audit focused on the Supabase schema/migrations, application services, and API endpoints that manage templates, facets, and project instantiation.

## Summary

- ✅ The schema establishes the required core entities (`onto_templates`, `onto_projects`, `onto_tasks`, `onto_outputs`, etc.) and seeds the three canonical facets (context, scale, stage) as described in the master plan.
- ⚠️ Several service-layer contracts diverge from the master plan (e.g., FSM shape, template enforcement), which can lead to silent data corruption or bypass critical safeguards.
- ⚠️ DB helper functions do not fully enforce facet applicability, allowing invalid combinations of scope and facet keys.
- ⚠️ Template lifecycle safeguards (deletion checks, default data) contain logic errors that can leave the ontology catalog in an inconsistent state.

The high-priority issues are listed below with file references and recommended remediation.

## Findings

### 1. Template deletion guard never detects projects in use

- **Location:** `apps/web/src/lib/services/ontology/template-validation.service.ts:485`
- **Issue:** `TemplateValidationService.canDelete` checks `onto_projects.type_key` against a template **UUID** (`templateId`). Because `type_key` stores the string identifier (e.g., `writer.book`), the query never matches and templates can be deleted or deprecated while still referenced by live projects.
- **Impact:** Violates the master plan’s requirement that templates act as canonical blueprints; allows destructive changes without safety checks.
- **Fix:** Fetch the template’s type key first (or join on `template_id` if modeled) and compare projects against that string.

### 2. Template CRUD defaults persist malformed JSON

- **Location:** `apps/web/src/lib/services/ontology/template-crud.service.ts:51-57`
- **Issue:** `createTemplate` seeds `default_views` with `{}` and injects a default FSM that lacks `type_key`. The database column expects an array (`jsonb[]` semantics) and downstream resolvers assume `default_views` is an array. The missing `type_key` also contradicts the typed schema.
- **Impact:** Newly created templates via API/UI ship with inconsistent defaults, confusing consumers that rely on `default_views` array semantics or FSM metadata.
- **Fix:** Default `default_views` to `[]`, and include a `type_key` (or drop the unused field consistently) in the default FSM payload.

### 3. FSM validation schema conflicts with seeded data

- **Locations:**
    - `apps/web/src/lib/types/onto.ts:120-132` – `FSMDefSchema` requires `states: z.array(z.string())`
    - `apps/web/src/lib/services/ontology/template-validation.service.ts:283-313` – validation treats each state as an object with `name/initial/final`
    - Seeded templates in `supabase/migrations/20250601000001_ontology_system.sql:662` store `states` as simple string lists
- **Issue:** Internal contracts disagree on the FSM structure. The validation service demands object states and flags missing `initial` markers, while the master plan and seed data use string literals (e.g., `"states":["planning","writing","editing","published"]`).
- **Impact:** Legitimate FSM definitions (including the seeded catalog) fail service-layer validation, blocking template authoring through the app/API and inviting inconsistent data.
- **Fix:** Decide on a single representation (string list vs. object list) and update both the Zod schema and validator accordingly. If richer metadata is needed, update the seeds and migrations to match.

### 4. Project instantiation does not enforce template availability or status

- **Locations:**
    - `apps/web/src/lib/services/ontology/instantiation.service.ts:100` – continues even when `getProjectTemplate` returns `null`
    - `apps/web/src/lib/services/ontology/instantiation.service.ts:712-720` – `getProjectTemplate` omits `status='active'` and `is_abstract=false` filters
- **Issue:** Projects can be instantiated with arbitrary `type_key` values, even if no active, concrete template exists. This contradicts the master plan’s “type-first” guarantee and bypasses schema/FSM validation.
- **Impact:** Creates orphaned project types without blueprint enforcement, undermining the ontology’s consistency and AI guidance.
- **Fix:** Make template lookup mandatory (`throw` if not found) and restrict selection to active, non-abstract templates only.

### 5. Facet validator ignores scope applicability

- **Location:** `supabase/migrations/20250601000002_ontology_helpers.sql` (`validate_facet_values`)
- **Issue:** The helper ensures facet keys and values exist but does **not** verify the target entity scope is listed in `onto_facet_definitions.applies_to`. For example, tasks can persist a `stage` facet even though the taxonomy restricts stage to `{project, plan, output}`.
- **Impact:** Breaks the master plan’s “three orthogonal facets” contract and leads to inconsistent analytics/filtering.
- **Fix:** Extend `validate_facet_values` to accept the entity scope (or look it up) and reject facet keys that do not apply.

## Additional Observations

- The master plan’s simplified three-facet system is seeded correctly, and generated columns (`facet_context`, `facet_scale`, `facet_stage`) align with the plan’s reporting requirements.
- The graph admin page (`apps/web/src/routes/admin/ontology/graph/+page.server.ts`) loads raw tables without pagination; consider adding limits/filters for large datasets, although this is a performance rather than correctness issue.
- `TemplateValidationService.validateFacetDefaults` already cross-checks the taxonomy; once `validate_facet_values` enforces scope, both layers will be aligned.

## Recommendations

1. Patch the five high-priority issues above and add regression tests (unit + integration) to lock the corrected behavior.
2. Add database constraints or unique indexes where critical (e.g., `onto_templates(type_key)` or `(scope, type_key)`) to backstop application logic.
3. Update documentation to reflect the final FSM payload structure once the contract is unified.
4. Consider adding automated seeding tests comparing seed JSON to the validation logic to catch drift early.

Addressing these items will realign the implementation with the master plan and prevent silent drift in the ontology layer.

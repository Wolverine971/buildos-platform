<!-- docs/technical/ontology-remediation-plan.md -->

# Ontology Remediation Plan

_Author: Codex (GPT-5)_  
_Date: 2025-11-05_

## 1. Context

The “Ontology Implementation Audit” (`docs/reports/ontology-implementation-audit.md`) surfaced several defects that weaken template governance, facet integrity, and FSM metadata alignment. These gaps allow destructive template changes, inconsistent defaults, and invalid facet usage—all of which diverge from the BuildOS Ontology Master Plan.

## 2. Objectives

1. **Restore template safety rails** so templates cannot be deleted or instantiated outside validated contracts.
2. **Normalize ontology metadata** (FSM, defaults, facet usage) to match the master plan and typed schemas.
3. **Harden validation surfaces** so future violations are caught at service and database layers.
4. **Document the resolution** to keep architecture and operations guides current.

## 3. Scope & Non‑Goals

### In scope

- `TemplateValidationService` lifecycle checks.
- Template creation defaults (`TemplateCrudService`) and schema consistency.
- FSM schema/validation alignment and seeded data updates.
- Project instantiation guardrails and facet validation (service + RPC).
- Follow‑up documentation (audit report, relevant guides).

### Out of scope

- UI redesigns or brand-new ontology features.
- Performance optimizations unrelated to the identified defects.
- Broader Supabase RLS/policy changes (only touched if required by fixes).

## 4. Implementation Phases

| Phase | Focus                           | Key Deliverables                                                            | Status                  |
| ----- | ------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| P1    | Template lifecycle guard        | Correct `canDelete`, add regression tests, migrate existing data if needed. | ✅ Completed 2025-11-05 |
| P2    | Template defaults normalization | Fix creation defaults, audit existing rows, extend CRUD tests.              | ✅ Completed 2025-11-05 |
| P3    | FSM contract reconciliation     | Align Zod schema, service validator, and seed data; update tests/docs.      | ✅ Completed 2025-11-05 |
| P4    | Instantiation enforcement       | Enforce template existence + status checks, tighten facet validation.       | ✅ Completed 2025-11-05 |
| P5    | Facet RPC hardening             | Pass entity scope, extend `validate_facet_values`, add coverage.            | ✅ Completed 2025-11-05 |
| P6    | Documentation & verification    | Update audit report, changelog, spec closure summary.                       | ✅ Completed 2025-11-05 |

## 5. Detailed Tasks

### P1 – Template Lifecycle Guard

- Fetch template `type_key` before project check or join on template ID if modeled.
- Update `TemplateValidationService.canDelete` to compare against `onto_projects.type_key`.
- Add regression test covering allowed/blocked deletions.
- Optional migration/one-off script: detect templates whose `type_key` is still referenced (report only).

### P2 – Template Defaults Normalization

- Replace `default_views: {}` with `default_views: []`.
- Ensure default FSM includes required fields (or omit consistently) and aligns with schema.
- Review existing `onto_templates` rows; patch rows with null or object defaults if present.
- Update template creation/update unit tests.

### P3 – FSM Contract Reconciliation

- Decide on canonical representation (string list vs. object map).  
  _Proposal_: use string arrays (matches seed + master plan) and track metadata separately if needed.
- Update `FSMDefSchema`, service validation (`TemplateValidationService`), and instantiation/tests accordingly.
- Adjust seeded templates in `20250601000001_ontology_system.sql` to the chosen format if necessary.
- Document the final contract in `docs/features/ontology/...` or similar.

### P4 – Instantiation Enforcement

- Modify `getProjectTemplate` to require `status='active'` and `is_abstract=false`.
- `instantiateProject` should throw when no template is found; add integration test.
- Propagate new validation errors to API responses (if surfaced).

### P5 – Facet RPC Hardening

- Extend `validate_facet_values` to accept entity scope (e.g., JSON payload `{facets, scope}`) or call helper per entity.
- Update service callers (project/plan/task/output instantiation) to provide scope.
- Add tests covering allowed/forbidden facet combinations.

### P6 – Documentation & Verification

- Update `docs/reports/ontology-implementation-audit.md` with remediation status.
- Add changelog entry to `BUGFIX_CHANGELOG.md`.
- Summarize completion in this spec (checklist).

## 6. Testing & Verification

| Area               | Tests                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Template lifecycle | Unit tests for `TemplateValidationService.canDelete`; integration test for deletion attempt via service. |
| Template creation  | Unit tests for defaults; snapshot of inserted row shape.                                                 |
| FSM contract       | Schema tests; ensure seeded FSMs parse; run lint/check.                                                  |
| Instantiation      | Integration test ensuring missing template fails; success path with valid template.                      |
| Facet validation   | Unit tests for RPC helper (SQL tests or supabase migration tests), service-level tests per scope.        |

## 7. Rollout & Risk Mitigation

- Changes are internal (no external API versioning).
- Run `pnpm test` (unit + integration) and lint after each phase.
- Perform manual sanity check in dev environment:
    - Create project from template.
    - Attempt to delete in-use template.
    - Try invalid facet combination (expect failure).

## 8. Communication

- Update audit report with resolved items.
- Notify ontology stakeholders (engineering + product) via project channel once completed.
- If migrations touch production data, coordinate with DevOps for safe deployment window.

## 9. Completion Checklist

- [x] P1 – Template lifecycle guard fixed & tested.
- [x] P2 – Template defaults normalized & data audited.
- [x] P3 – FSM contract aligned (code + seeds).
- [x] P4 – Instantiation enforcement hardened.
- [x] P5 – Facet validation respects scope.
- [x] P6 – Documentation + changelog updated.

> This living document will be updated as each phase completes.

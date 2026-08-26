<!-- tasker/46-legacy-project-generation-retirement.md -->

# 46 — Finish and retire the legacy project/task/phase generation

**Created:** 2026-08-04  
**Status:** Open — migration completeness and dependency cutover required  
**Mission:** Make ontology projects/tasks/plans the only project model, then archive and remove the legacy project generation safely.

**Last verified:** 2026-08-04 after Phase 2 deployment. The migration gaps below are unchanged; every recorded ontology target still exists, while the search RPC and admin migration dependencies remain active.

## Blocking evidence

The migration ledger does not prove complete migration as of 2026-08-04:

| Relation   | Legacy rows | Mapped rows | Unmapped rows |
| ---------- | ----------: | ----------: | ------------: |
| `projects` |          64 |          63 |             1 |
| `tasks`    |         650 |         436 |           214 |
| `phases`   |         113 |          70 |            43 |

All recorded target IDs exist and there are zero failed migration-log rows. The missing set is still material:

- The unmapped project is paused and was last updated in 2025.
- Unmapped tasks: 185 done, 28 backlog, 1 in progress; 29 are deleted, 12 are marked outdated, and all were last updated in 2025.
- 213 unmapped tasks belong to projects that _were_ migrated; one has no project.
- 37 unmapped phases belong to mapped projects; six belong to the unmapped project.

This means “old” and “probably inactive” may explain the omissions, but it does not make deletion equivalent to migration.

## Runtime and data dependencies already confirmed

- The current `search_all_content` / `search_by_type` definitions still query legacy `projects` and `tasks`.
- The admin ontology migration UI, endpoints, services, mapping ledger, and migration logs still form an active control plane.
- `phases` and `phase_tasks` retain the old plan/task relationship.
- Additional legacy foreign keys exist from project briefs/drafts/questions/synthesis, recurring-task records, SMS/calendar records, time blocks, project history tables, and observability records.
- `projects_history` and `project_kept_versions` each contain 545 rows and need an explicit retention decision.

## Required work

### W1 — Resolve the 258 unmapped rows

- Produce a row-level classification keyed by UUID only: migrate, duplicate, intentionally excluded, or safe historical archive.
- For the 213 tasks and 37 phases whose project is already mapped, migrate/remap them unless a deterministic exclusion rule is documented.
- Resolve the one project and its six phases explicitly.
- Require `legacy_entity_mappings` and `migration_log` receipts for every migrated row.
- End with zero unexplained legacy rows.

### W2 — Cut remaining product dependencies

- Replace global-search RPCs with ontology entities only.
- Rewire every dependent FK to `onto_projects`, `onto_tasks`, or `onto_plans` where semantics match.
- Where semantics do not match, migrate the dependent table, archive it, or retain an intentionally unconstrained historical UUID with a column comment.
- Remove the admin migration UI/API/services only after W1 is complete and independently verified.

### W3 — History and archive policy

- Decide whether `projects_history` / `project_kept_versions` become ontology document/project version history or external-only archives.
- Export the entire retirement bundle (including mappings/logs needed to reconnect IDs) as canonical JSONL with checksums.
- Freeze legacy writes before the final export.

### W4 — Guarded drop and contracts

- Use exact locked row-count guards from the verified archive.
- Drop child relations before parents and omit `CASCADE`.
- Remove legacy enums, views, RPCs, generated contracts, prompt models, and operational scripts only after caller searches are clean.
- Regenerate types from the post-migration database and run all repository gates.

## Exit gate

- [ ] Zero unexplained project/task/phase migration gaps.
- [ ] No active runtime/API/RPC reads or writes use legacy projects/tasks/phases.
- [ ] All dependent FKs are migrated or intentionally documented.
- [ ] History/version retention decision is implemented.
- [ ] Verified external archive exists for every non-empty dropped relation.
- [ ] Guarded migration succeeds without `CASCADE`.
- [ ] Generated types and current docs describe ontology-only project modeling.

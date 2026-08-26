<!-- docs/operations/security/PHASE2_SCHEMA_RETIREMENT_2026-08-04.md -->

# Phase 2 Schema Retirement — 2026-08-04

**Status:** Production retirement and modeling migrations verified on 2026-08-04 at 15:34 EDT.

## Scope

Migration `20260804030000_phase2_retire_decisions_notes_braindumps.sql` retires:

- `onto_decisions` (87 rows) and its 110 polymorphic `onto_edges` rows;
- legacy `notes` (136 rows);
- legacy `brain_dumps` (520 rows) and `brain_dump_links` (494 rows);
- the now-unused `brain_dump_status` enum.

The application no longer exposes the legacy notes routes or queries the legacy notes table. Current brain-dump product paths use `onto_braindumps`; the old campaign-draft script was updated to ontology projects, tasks, documents, and brain dumps.

## Production verification

The post-deployment, non-mutating catalog verification passed for all eight Phase 2 invariants:

- `onto_decisions`, `notes`, `brain_dumps`, and `brain_dump_links` are absent;
- all four Question Tree tables have the intended admin-read/service-write access model;
- PostgREST resolves `onto_projects_created_by_fkey` and all three run-scoped Question Tree node relationships by their exact constraint names;
- the live RPC surface matches the generated contract at 240 function names;
- live REST type regeneration reports 239 tables and 13 views;
- the configured production app returns HTTP 404 for `/api/notes`, `/api/notes/{id}`, and `/api/projects/{id}/notes`;
- the published route reference, route summary, and static OpenAPI artifact no longer advertise the four deleted legacy-note routes.

The regenerated TypeScript contract initially exposed a generator defect: three preserved relationship blocks still named the retired `brain_dumps` table. The generator now prunes preserved relationships when their referenced public relation no longer exists, and a regression test covers that behavior. Regeneration removed all three stale relationships.

## Archive receipt

The verified external package is:

`/Users/djwayne/Documents/BuildOS Database Archives/phase2/retired-schema-2026-08-04T15-24-36-082Z`

Every file is mode `0600`; both package directories are mode `0700`. The manifest and independently recomputed checksums agree:

| Dataset               | Rows | SHA-256                                                            |
| --------------------- | ---: | ------------------------------------------------------------------ |
| `onto_decisions`      |   87 | `81c2c295c7be6642c0c427cfa30ed913aef3b48ecfda343c2b3bb9173ade2c25` |
| `onto_decision_edges` |  110 | `130269f04faf2de436dd8e14fb9b9176ab2933a078a655841cb89206ee494dc0` |
| `notes`               |  136 | `e9ee3bdd42db08f98fd6c56d9dc64fd2cd146842d87a0123719e940da9184e3a` |
| `brain_dumps`         |  520 | `5f6a1dfd6b0eba8880e9b417ae17e5777488a658c466bf030492d098d8611cf0` |
| `brain_dump_links`    |  494 | `0b38579aa1e7a4c3bd82909f43c7a5b5399644b6b866916a205102bf6c7a1386` |

The reusable exporter is `scripts/security/export-phase2-retired-data.mjs`. It writes outside the repository and does not mutate the database.

## Historical references

Six `error_logs.brain_dump_id` values and two `project_questions.answer_brain_dump_id` values point to archived legacy brain dumps. The migration removes their foreign keys but retains the UUID values as archive correlation identifiers. `llm_usage_logs.brain_dump_id` currently has no populated values; its legacy foreign key is also removed so the parent table can be retired.

## Completed run order

1. Application cleanup deployed so no route can create or update legacy notes.
2. `20260804030000_phase2_retire_decisions_notes_braindumps.sql` applied.
3. `20260804031000_model_integrity_hardening.sql` applied.
4. Database types regenerated from production.
5. Phase 2 catalog verification and RPC drift verification passed.

The Phase 2 migration locks every source table, compares its live row count with the verified archive, verifies the decision-edge count, and performs the delete/drop work in one transaction. It intentionally omits `CASCADE`, so any unknown database dependency aborts the migration and rolls the entire cleanup back.

If any count changed after the archive was created, rerun the exporter, independently verify the new package, and update the embedded receipt in a new migration. Do not weaken the count guard.

## Explicitly not removed

Legacy `projects`, `tasks`, `phases`, and their dependent bundle are not safe to drop yet. The migration ledger is missing one project, 214 tasks, and 43 phases; many dependent tables and the current global-search RPCs still use the legacy generation. See `tasker/46-legacy-project-generation-retirement.md`.

Legacy agent-chat tables are also deferred to their dedicated cutover package in `tasker/45-legacy-agent-chat-retirement.md`.

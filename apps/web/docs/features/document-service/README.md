<!-- apps/web/docs/features/document-service/README.md -->

# BuildOS Document Service

> Last updated: 2026-09-07

**Status:** Vision written, design-reviewed against production, scope revised, direction ratified
2026-08-26. **Step 1 and Step 1.5 are complete. The Step 2 signature-interaction vertical slice is
implemented, its production migrations are deployed, and its generated types and database contract
are validated; visual/E2E rollout and production observation remain. Step 3 now has a live START
HERE projection, completed production coverage backfill, and explicit missing-index recovery in the
project Overview.** Steps 4–7 are unstarted. The base ontology migration already contains the
canonical `(document_id, number)` uniqueness constraint; there is no P0 index prerequisite for
WS-1.

**2026-09-07 correction:** Ordinary saves were falsely conflicting because the proposal-era generated
`content_hash` was missing from the timestamp trigger's cache exclusions. The recovery review below
records the reproduced cause, migration, and editor safeguards. The earlier completion labels are
historical implementation milestones, not evidence of a finished end-to-end editor.
The corrected trigger and search-path hardening are now verified in production, and their migration
ledger entries are reconciled. Application rollout and full live-flow verification remain.

**2026-09-07 continuation:** Step 2 now has save/apply serialization, functional reselection,
request cancellation, voice-state guards, and keyboard-focus recovery. Focused regression tests
and desktop/phone browser checks cover the local interaction; live model, microphone, and
live persistence acceptance remain. Local restore, history, and comparison acceptance are recorded below.

> **Step 3 continuation:**
> [`STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md`](./STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md).
> It records the completed production backfill, live and missing-index slices, canonical-source
> rules, and the next bounded pieces of Step 3.

This folder is the home and navigation point for the BuildOS document-service feature effort.

**Thesis:** Google Drive stores your files; BuildOS knows what they are for. Not a better Drive —
a _project drive_, where documents live inside real project structure, an agent keeps the index
true, and the work is safe enough to hold things you cannot afford to lose.

## Start here

- [History reliability and migration verification, Sept 7](./HISTORY_RELIABILITY_AND_MIGRATIONS_2026-09-07.md) —
  **latest continuation.** Fixes stale history/comparison responses, snapshot caching, refresh
  selection, and shortcut scope. Records verified production migrations and the remaining
  application rollout gates.
- [Restore safety and acceptance, Sept 7](./RESTORE_SAFETY_AND_ACCEPTANCE_2026-09-07.md) —
  **restore pass.** Adds a recovery checkpoint before restore, guarded writes, reviewed
  snapshot checks, sealed restore history, and restore/refresh locking. Records the observed
  production timestamp-trigger fix and the remaining deployment verification.
- [Step 2 editor acceptance, Sept 7](./STEP_2_EDITOR_ACCEPTANCE_2026-09-07.md) —
  **interaction pass.** Fixes the save → ask → review → apply interaction and records automated
  and synthetic browser evidence, with the remaining production acceptance gates.
- [Editor status and autosave recovery, Sept 7](./EDITOR_STATUS_AND_RECOVERY_2026-09-07.md) —
  **initial audit.** Restores the header Brain Bolt and reproduces the timestamp-trigger
  regression introduced by the generated content hash. Records the seven-step status and the
  first conflict-pause safeguards; the later migration and acceptance notes above supersede its
  rollout status.

- [Step 3 START HERE live-index handoff](./STEP_3_START_HERE_LIVE_INDEX_HANDOFF_2026-08-26.md) —
  **in progress, updated 2026-08-27.** Production snapshot coverage is complete. The project
  Overview projects freshness, current state, next step, orientation, canonical-document access,
  missing-index recovery, and a project-agent update action from START HERE. Before automatic
  creation expands, resolve the audited duplicate live-context rows and enforce atomic one-live-
  START-HERE-per-project creation.
- [Step 2 signature-interaction handoff](./STEP_2_SIGNATURE_INTERACTION_HANDOFF_2026-08-26.md) —
  **implemented and migrated 2026-08-26; visual/E2E rollout pending.** Exact selection,
  typed/voice instruction, immutable proposal, anchored diff/apply, forced revision, conflict
  handling, server-owned mutation privileges, and telemetry.
- [Step 1.5 structural handoff](./STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md) — **complete
  2026-08-26.** Shared guarded writes, the ratified patch/anchor contract, and per-turn
  document-scoped mutation events are all in place. Step 2 is now unblocked.
- [Switching Bar and revised roadmap](./SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md) — **the
  current plan.** Closed 24-item Switching Bar, deferral list, revised 7-step sequence, the P0
  trust fix, the missing-import finding, and the self-migration eval. Supersedes the workstream
  list and phase sequence in the vision doc below.
- [Original vision and system design](./ORIGINAL_VISION_AND_SYSTEM_DESIGN_2026-08-26.md) — the
  founder vision, 2026-08-26 implementation audit, target architecture, and risks. Its domain
  model (§4), relationship authorities (§5), risks (§15), and non-goals (§17) still govern; its
  workstreams (§11) and phases (§12) do not.

## Existing related material

- [Document patch and anchor contract](../../../../../docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md)
  — **ratified by DJ 2026-08-26.** Defines the hybrid patch payload, exact re-anchoring rules,
  generated head hash, conflict contract, and proposal-first threshold for Step 2.
- [Document Interact v0](../../../../../docs/specs/DOCUMENT_INTERACT_V0_2026-08-04.md) — the first
  implemented document-scoped chat and voice interaction slice.
- [Document version comparison spec](../../../../../docs/specs/DOCUMENT_VERSION_DIFF_COMPARISON_SPEC.md)
  — existing history, comparison, and restore behavior.
- [Project Knowledge Layer design](../../technical/architecture/PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md)
  — outline, section retrieval, project knowledge, and maintenance-agent background.
- [Current Document Modal UI audit](../../technical/components/hyperplexed/DOCUMENT_MODAL_AUDIT_2026-07-06.md)
  — current editor, Details drawer, and docked Document Interact design decisions.

## Documentation policy for this effort

- Keep this README current as the index and high-level implementation status.
- Preserve dated vision, audit, research, evidence, and handoff documents as point-in-time records.
- Put formal cross-cutting ADRs in `docs/architecture/decisions/` and link them here.
- Put execution plans in `docs/plans/` when they span more than this web feature and link them here.
- Update current-reference documents in the same change that materially changes the system they
  describe.

## Next expected artifacts

Ordered by the revised sequence (roadmap §8).

1. ~~**P0 trust fix**~~ — ✅ done 2026-08-26. The canonical uniqueness constraint was verified in
   `20250601000001_ontology_system.sql`; the later add/drop migrations have no net schema effect.
2. **Step 1.5** — ✅ complete 2026-08-26: WS-1 unified document writes, WS-2 ratified the
   patch/anchor contract, and WS-3 added per-turn document mutation events with dirty-editor
   conflict protection.
3. **Step 2 proposal interaction** — 🟡 vertical slice implemented, migrated, and database-validated
   2026-08-26. Anchors, typed/voice instruction, immutable persistence, diff review, deterministic
   apply, conflict handling, revision boundary, server-owned mutations, and telemetry are present.
   The Sept 7 continuation fixes client lifecycle gaps and adds local interaction acceptance.
   Complete visual/E2E rollout before calling Switching Bar item 3.3 shipped.
4. **START HERE live index** — 🟡 projection, production coverage, and missing recovery implemented
   by 2026-08-27. The maintained project README uses the existing `<!-- managed:* -->` primitive;
   duplicate cleanup/atomic uniqueness, the structured current/stale/missing index, and the
   mutation-trigger audit remain.
5. **Managed-region ratification** is included in the ratified patch/anchor ADR rather than a
   separate artifact. Per-checklist-item identity remains a separate Step 5 decision.
6. **Document import contract** — `.md` / `.txt` / `.docx` preview-then-commit, modelled on
   `apps/web/src/routes/api/profile/contacts/import/` (Step 6, per founder sequencing).
7. **Collaboration spike** — presence and section claims before any CRDT commitment (Step 7).
8. **Migration eval evidence doc** — results of the self-migration gate in roadmap §9.

<!-- apps/web/docs/features/document-service/README.md -->

# BuildOS Document Service

> Last updated: 2026-08-26

**Status:** Vision written, design-reviewed against production, scope revised, direction ratified
2026-08-26. **Step 1 and all three Step 1.5 structural prerequisites are implemented; the WS-2
patch/anchor ADR was ratified by DJ on 2026-08-26. Step 2 is next.** Steps 2–7 are unstarted. The
base ontology migration already contains the canonical `(document_id, number)` uniqueness
constraint; there is no P0 index prerequisite for WS-1.

> **Implementing agent, start here:**
> [`STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md`](./STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md).
> It is self-contained: scope boundaries, verified file:line references, implementation steps,
> tests, landmines, and definition of done. Read its §0 before touching code.

This folder is the home and navigation point for the BuildOS document-service feature effort.

**Thesis:** Google Drive stores your files; BuildOS knows what they are for. Not a better Drive —
a _project drive_, where documents live inside real project structure, an agent keeps the index
true, and the work is safe enough to hold things you cannot afford to lose.

## Start here

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
3. **Proposal-and-apply contract** — ✅ ratified 2026-08-26. Anchors, patch representation, and the
   direct-apply threshold (none in v1 — every LLM-authored interactive edit is a proposal) are
   settled by the WS-2 ADR. **Implementing the Step 2 interaction is next.**
4. **START HERE index design** — the maintained project README, built on the existing
   `<!-- managed:* -->` region primitive (Step 3).
5. **Managed-region ratification** is included in the ratified patch/anchor ADR rather than a
   separate artifact. Per-checklist-item identity remains a separate Step 5 decision.
6. **Document import contract** — `.md` / `.txt` / `.docx` preview-then-commit, modelled on
   `apps/web/src/routes/api/profile/contacts/import/` (Step 6, per founder sequencing).
7. **Collaboration spike** — presence and section claims before any CRDT commitment (Step 7).
8. **Migration eval evidence doc** — results of the self-migration gate in roadmap §9.

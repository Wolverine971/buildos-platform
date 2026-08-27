<!-- apps/web/docs/features/document-service/STEP_2_SIGNATURE_INTERACTION_HANDOFF_2026-08-26.md -->

# Step 2 signature interaction — implementation handoff

**Date:** 2026-08-26
**Status:** Vertical slice implemented; production migrations, generated types, security contract,
and database lifecycle validated. Visual/E2E rollout and production observation remain.
**Governing contract:**
[`2026-08-26-document-patch-anchor-contract.md`](../../../../../docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md)

## Outcome

The first complete BuildOS document proposal loop now exists:

1. Select exact Markdown in the document editor.
2. Choose **Ask** and type or speak an instruction.
3. Generate a bounded, replacement-only agent proposal.
4. Review the selected passage and the proposed Markdown in the existing split-diff UI.
5. Apply only after the current editor buffer is saved and the stored patch is revalidated.
6. Commit through the guarded document write with an explicit version boundary.

Every model-authored edit in this flow remains a proposal. There is no direct-apply shortcut.

## Implemented architecture

### Document head and proposal persistence

- `20260827022436_add_document_content_hash.sql` adds a stored generated SHA-256
  `onto_documents.content_hash`, so every current and future writer gets an exact head hash without
  application cooperation.
- `20260827022510_create_document_proposals.sql` adds an RLS-protected proposal table whose
  instruction, patch, hashes, scope, provenance, and creation time are immutable after insert.
- Proposal lifecycle is explicit: `pending`, `applied`, `conflict`, or `dismissed`. Stable conflict
  reasons are enforced in the database, and an immutable exact-result hash repairs the receipt if
  the process fails after the head write but before lifecycle finalization.
- `20260827022735_restrict_document_proposal_mutations.sql` removes default client mutation grants,
  preserves authenticated read access, and makes proposal creation/lifecycle mutation explicitly
  server-owned through `service_role`.
- Shared database types were regenerated from the migrated production target.

All three migrations are recorded in the linked production migration ledger.

### Shared patch kernel

`packages/shared-agent-ops/src/ontology/document-patch.ts` is the one browser-safe and server-safe
implementation of the ratified patch contract. It provides:

- canonical recursive JSON and patch hashing;
- exact raw-Markdown SHA-256 content semantics;
- UTF-16 range capture compatible with JavaScript and CodeMirror;
- heading paths, base and section offsets, exact 256-character context windows, and before hashes;
- unchanged-head fast apply and deterministic exact-text re-anchoring;
- insertion boundary resolution, duplicate/overlap rejection, and descending all-or-nothing apply;
- managed `START HERE` region protection; and
- stable, fail-closed conflict reasons with no fuzzy or model-assisted merge.

The generic patch path cannot edit managed regions.

### Generation and apply services

`apps/web/src/lib/server/document-proposal.service.ts` owns the server contract:

- Generation sends only the selected Markdown plus 1,200 characters of adjacent context in each
  direction. Document excerpts are explicitly treated as untrusted source material.
- The model must return one JSON `replacement_markdown` value. An unchanged or malformed response
  is rejected rather than persisted.
- The persisted `patch_hash` binds apply to the exact payload shown during review.
- Apply reloads the live document, verifies patch integrity, uses the exact fast path or deterministic
  re-anchoring, and performs one bounded CAS retry.
- Concurrent requests that observe the exact already-applied result converge on one applied receipt
  instead of turning success into a false conflict.
- A successful apply calls the shared guarded head/version writer with
  `forceCreateVersion: true` and `changeSource: document_proposal_apply`.
- PostHog events record generation/regeneration, fast-path versus re-anchored apply, version
  warnings, and conflicts by stable reason. No document content is included in telemetry.

Routes live under:

- `POST/GET /api/onto/documents/:id/proposals`
- `POST /api/onto/documents/:id/proposals/:proposalId/apply`

Both routes resolve the canonical ontology actor and require project membership; mutation routes
require write access.

### Editor interaction

- `CodeMirrorEditor.svelte` publishes exact selection offsets.
- `RichMarkdownEditor.svelte` exposes **Ask** only when proposal handling is available and enables it
  only for a non-empty selection.
- `DocumentProposalReview.svelte` provides typed or voice instruction, selected-Markdown context,
  split diff, revise, apply, and explicit conflict recovery.
- `DocumentModal.svelte` saves dirty content before proposal creation. A proposal may remain open
  through unrelated editing; immediately before apply, any newer buffer is saved, the editor is
  temporarily locked, and the server revalidates against the new head. A target edit conflicts;
  unrelated edits can re-anchor. A successful apply reloads content, restores editor view state,
  refreshes version history, and surfaces success.

This closes the local-overwrite race between autosave and proposal apply.

## Verification completed

- 16 focused patch-kernel tests pass.
- 5 proposal-service tests pass, including explicit version creation and idempotent concurrent
  apply.
- 4 CodeMirror selection/voice tests pass.
- 4 route-boundary tests prove that project-access denial is checked before an admin client is
  created and that apply conflicts keep a stable API/telemetry contract.
- The full shared-agent-ops suite passes: 33 files, 163 tests.
- The broader web run passed all 597 non-Postgres files and 3,908 tests. Its 27 Postgres-contract
  suites could not bind `127.0.0.1` in the sandbox (`EPERM`); this is an environment limitation,
  not a feature assertion.
- `svelte-check` reports 0 errors and 0 warnings.
- Shared-agent-ops and shared-types typechecks pass.
- The server-route size guard reports no new violations.
- The required Svelte analyzer reports no issues in the new review component or CodeMirror change.
  It only repeats pre-existing `{@html}`, effect, `Map`/`Set`, and `bind:this` findings in the two
  large existing editor/modal components.
- PostgreSQL 15.8 production metadata was checked read-only for UTF-8, `pgcrypto` location, and
  immutable `digest`/`encode` functions. A read-only transaction proved the generated hash
  expression against empty, null, Unicode, CRLF, and large-Unicode fixtures.
- Production contains 560 live document rows with zero null or mismatched generated hashes.
- A transaction-scoped database lifecycle test proved temporary proposal insert, payload
  immutability, `pending → conflict`, terminal-state immutability, and cleanup.
- RLS and grants were checked after migration: `authenticated` can select but cannot insert, update,
  or delete proposals; `service_role` owns mutation. Relevant security-advisor findings are zero.

## Rollout checklist

1. ✅ Apply and ledger-align the three production migrations.
2. ✅ Regenerate Supabase database/schema types and build shared types.
3. ✅ Verify generated hashes, proposal lifecycle, RLS/grants, and security advisors against the
   linked target.
4. Run the Postgres contract suite somewhere permitted to bind localhost.
5. Exercise selection → voice/type → diff → unrelated edit → apply in a migrated development
   environment.
6. Perform desktop, narrow-screen, keyboard, focus, and scroll-preservation visual QA.
7. Confirm PostHog receives generation, regeneration, apply-strategy, and conflict events without
   content payloads.
8. Observe proposal generation latency, conflict rate by reason, and version-warning rate before
   marking Switching Bar item 3.3 shipped.

## Deliberately deferred

- The ratified ADR explicitly leaves the existing head/version transactional gap in place; apply
  still uses the visible `versionWarning` contract.
- Pending-proposal restoration after closing and reopening the document is supported by the list
  endpoint but not yet hydrated into the UI.
- A dedicated dismiss endpoint, multi-operation generation UI, inline ghost decorations, and broad
  Document Interact conversion to proposals are follow-on hardening, not hidden inside this slice.
- `DocumentWorkspace` extraction remains a nearby maintainability task; the visible vertical slice
  did not require a risky modal-wide refactor first.

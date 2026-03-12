<!-- docs/reports/document-modal-rich-markdown-editor-audit-2026-03-10.md -->

# DocumentModal and RichMarkdownEditor Audit

Date: 2026-03-10

## Scope

- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte`

## High-Priority Findings

- [x] Mobile title editing is broken. Fixed with a mobile-first title input in the main editing flow.
- [x] Unsaved work can be discarded with no confirmation. Fixed with guarded close behavior and swipe-dismiss disabled for this modal.
- [x] Voice refinement is misleading. Fixed by reconciling later transcript updates back into the editor body.
- [x] Voice state is effectively global. Fixed for this editor path with client-aware voice service registration and cleanup.

## Medium Findings

- [x] Desktop comments no longer load or mark threads read while the panel stays collapsed. Fixed by adding a lightweight comment-count path and only mounting full comments when the panel is actually opened.
- [x] `Cmd/Ctrl+S` exists in the editor stack but is not wired from `DocumentModal`.
- [x] Existing-document open no longer eagerly fans out into comments, admin access, public-page state, and doc-tree fetches during the critical open path. These now load lazily or in deferred background work.

## Fix Plan

- [x] Add a mobile-first title input in the main document flow.
- [x] Add guarded close behavior for unsaved work and disable swipe-dismiss for this modal.
- [x] Wire `Cmd/Ctrl+S` to modal save.
- [x] Reconcile final voice transcripts into the editor body.
- [x] Make the voice service client-aware so nested editors do not clobber each other.
- [x] Add targeted tests for the new voice transcript reconciliation helpers.
- [x] Add lightweight comment-count fetching so collapsed comments stay cheap and do not mark threads read.
- [x] Defer non-critical document modal loads after the main document content is ready.

## Verification Log

- [x] Existing `voice-widget` vitest passes.
- [x] Re-run targeted tests after fixes.
- [x] Run a targeted lint pass on the edited files.
- [ ] Run broader project validation if a usable check path is available.

## Current Round: 2026-03-11

- `DocumentModal` now starts with the heavy side panels collapsed again on fresh open, including images.
- Desktop comments use a count-only fetch for the badge and only load full threads after expansion.
- Public page state and doc tree loading now happen in deferred background work after document content is loaded.
- Version-history admin access is now checked on demand when history is opened instead of on every document open.
- `DocumentVersionHistoryPanel` no longer double-fetches its version list on initial mount.

## Notes

- A full `svelte-check` attempt in `apps/web` aborted with a Node OOM in this workspace, so it is not a clean verification signal right now.

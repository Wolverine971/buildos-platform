<!-- tasker/48-document-modal-decomposition.md -->

# 48 — Decompose `DocumentModal` around a document session controller

**Created:** 2026-08-04  
**Updated:** 2026-08-26  
**Status:** Deferred by owner direction — ready, but intentionally skipped in the current cleanup pass  
**Mission:** Make the document editor safe to change by separating document-session state, typed API operations, feature workflows, and presentation while preserving the current component contract and desktop/mobile experience.

> Do not start this task as incidental cleanup. The owner explicitly chose to defer it on
> 2026-08-26 and continue with worker ownership decomposition. Resume only when
> `DocumentModal` is selected as its own focused workstream.

## Why this work exists

`apps/web/src/lib/components/ontology/DocumentModal.svelte` is 4,561 lines with 43 imports, 91 `$state` declarations/usages, 33 `$derived` declarations/usages, five effects, and 19 direct `fetch` calls. Its script currently owns:

- create/load/save/autosave/conflict/archive/restore/delete document lifecycle;
- request cancellation and stale-continuation protection using request IDs, `AbortController`, mutation IDs, and a document-session epoch;
- inline asset link synchronization and document export;
- public-page preview, review, confirmation, publishing, unpublishing, and live sync;
- document tree loading, breadcrumbs, move/create-child flows, versions, comparison, voice notes, comments, activity, and admin checks;
- dynamic nested task/plan/goal/document/chat modals;
- the desktop editor/details layout and mobile tabs/panels.

This component also contains good craft that must survive the split. The 11 focused tests prove details-panel behavior, menu portaling, subtle stale-load behavior, close/unmount cancellation, stale-save, version warnings, stale-delete, and deferred-response isolation. The refactor is successful only if those invariants become easier to see and test—not if the file merely becomes shorter.

`DocumentModal` is a shared product boundary loaded from project pages, task pages, the project modal host, document trees, and several entity modals. Its props and callbacks are therefore an API.

## Decisions locked before implementation

1. Preserve the existing `Props` contract, including bindable `isOpen`, create/edit modes, optional task/parent IDs, and callback timing.
2. Keep one canonical `DocumentModal.svelte` entry point. Callers should not choose between old/new modal variants.
3. Put pure parsing, normalization, URL, payload, and snapshot functions in ordinary `.ts` modules. Use `.svelte.ts` only where reactive state genuinely belongs in a controller.
4. Keep `$effect` blocks thin and limited to synchronization with external state/lifecycle. Business transitions such as save, publish, move, and conflict handling must be explicit controller actions.
5. Prefer `$derived` for computed state and `$state.raw` for API records/collections that are replaced as units. Do not recreate the current 93-state surface as one giant exported mutable object.
6. Preserve the sanitized markdown path. `{@html renderMarkdown(...)}` is acceptable only while `renderMarkdown` continues to sanitize; do not bypass it during component extraction.
7. No visual redesign is bundled into this refactor.

## Target shape

Create a feature directory such as `apps/web/src/lib/components/ontology/document-modal/`:

```text
DocumentModal.svelte                         public shell and composition root
document-modal/
  document-modal.types.ts                   shared contracts and typed outcomes
  document-modal.client.ts                  document/tree/asset API boundary
  document-session-controller.svelte.ts     load/edit/save/autosave/conflict/session epoch
  public-page-controller.svelte.ts           publish/review/live-sync state machine
  DocumentEditorSurface.svelte               header/editor/footer and save status
  DocumentDetailsPanel.svelte                desktop/mobile-compatible detail content
  DocumentPublicPagePanel.svelte             public-page presentation and actions
  DocumentModalDialogs.svelte                confirmations and feature modals
```

The final names and grouping may change. A boundary earns a file when it owns a lifecycle/invariant or a coherent rendered surface; avoid prop-drilling dozens of individual booleans just to satisfy a line-count target.

## Work packages

### W0 — Expand behavioral characterization first

Keep all 11 current focused tests and add coverage for unprotected seams before extraction:

- create → first save → edit-mode transition and the exact `onSaved`/`onLoaded` behavior;
- autosave debounce, one-save-at-a-time queuing, saved feedback, and close blocking during a blocking save;
- optimistic-concurrency conflict reload and overwrite;
- discard confirmation for unsaved edits and new-document drafts;
- public-page preview/confirm/review/live-sync with obsolete responses ignored;
- archive/restore/delete callback behavior and stale session results;
- document move, version restore, nested-modal close, and project/document prop changes;
- task-scoped versus project-scoped create endpoints and inline asset link synchronization.

Use public behavior and rendered state in tests. Do not freeze private variable names or current DOM nesting.

### W1 — Establish typed API and data contracts

- Move document/public-page/tree response types and normalizers out of the component.
- Add a small injectable `document-modal.client.ts` boundary for the 19 fetch sites. It should own method/URL construction, response decoding, abort signals, and the existing error payload rules—not UI toasts or modal state.
- Return discriminated outcomes for success, conflict, aborted, and server failure where those states affect UI behavior.
- Separate document CRUD/tree/assets from public-page operations if one client becomes a grab bag.
- Preserve the current endpoints and request payloads; this work does not change server contracts.
- Test malformed/partial responses and abort behavior at the client boundary.

### W2 — Extract the document session and autosave controller

- Create `document-session-controller.svelte.ts` to own the active document ID, editable fields, last-saved snapshot, load/save state, autosave timer, conflict state, request IDs/controllers, and session epoch.
- Give the controller explicit lifecycle/actions such as `open`, `updateIdentity`, `load`, `markChanged`, `save`, `reloadConflict`, `overwriteConflict`, `requestClose`, and `destroy`. Exact names are flexible; hidden effect-driven business transitions are not.
- Preserve create-to-edit transition without copying the `documentId` prop into local state from an effect on every reactive pass.
- Preserve the invariant that every async continuation verifies its originating document session before mutating state, closing the modal, firing callbacks, or showing success feedback.
- Keep autosave serialization: a change during a save queues the next save rather than running overlapping writes or losing the edit.
- Let `DocumentModal.svelte` translate controller outcomes into callbacks/toasts so the controller remains testable without rendering the entire modal.

### W3 — Extract the public-page workflow as its own state machine

- Move public-page state/preview/review normalizers and publish/unpublish/live-sync actions into a dedicated controller and client boundary.
- Keep public-page mutations scoped to both the document session and the latest mutation ID.
- Extract the panel and confirmation/review UI into `DocumentPublicPagePanel.svelte` plus a focused dialog component if needed.
- Preserve content-review blocking, admin decision messaging, slug normalization/preview, visibility/noindex, live-sync status, and copy/open URL behavior.
- Coordinate “save before publish” explicitly through the document controller; do not make the public-page controller reach into editor internals.

### W4 — Separate supporting workflows

- Extract document tree loading/breadcrumb/move state into a focused controller or helper shared with the existing doc-tree components.
- Move inline asset ID extraction/link synchronization and export payload construction into pure services with focused tests.
- Isolate nested entity-modal coordination in one typed session-aware owner so stale lazy imports or close callbacks cannot mutate a replacement document.
- Keep version comparison/restore, voice-note refresh, comments counts, admin access, and deferred loads in small feature adapters. Reuse the existing specialized components rather than wrapping each in another trivial component.
- Every asynchronous feature action must accept/capture a document-session token and expose cancellation cleanup.

### W5 — Split presentation along stable UX seams

- Keep `DocumentModal.svelte` as the public shell: props, controller construction/lifecycle, modal composition, and callback translation.
- Extract the editor/header/footer surface, details content, public-page panel, and dialog host where each can receive a cohesive typed model plus callbacks.
- Preserve the shared desktop/mobile snippets or replace them with one shared component API. Do not fork business logic or state between responsive render paths.
- Avoid mounting duplicate stateful panels merely to hide one with CSS; confirm voice-note/comment/version child instances and `bind:this` refs still have one authoritative owner.
- Preserve keyboard behavior, focus/close guards, ARIA relationships, mobile roving tabs, loading/error/empty states, and the Inkprint styling contract.

### W6 — Remove compatibility scaffolding and ratchet complexity

- Delete the moved inline types, fetch calls, normalizers, effects, and handlers only after their replacement tests pass.
- Target `DocumentModal.svelte` at no more than 1,200 lines and no extracted component/controller/client above 600 lines without a documented cohesive reason.
- Target no direct `fetch` calls in `DocumentModal.svelte`; network access belongs to the typed client boundary.
- Keep effects small enough that each has one external synchronization purpose and returns cleanup when it establishes timers/listeners/requests.
- End with no new `any`-typed component props and no broad mutable store that exposes every controller field.

## Safe landing order

Land W0 first. W1 can land behind the unchanged modal. Then land W2 and W3 separately, each keeping the public component contract stable. Land W4 feature by feature. Extract markup in W5 only after controller boundaries are proven; otherwise markup churn will hide state regressions. Apply W6 last.

## Landmines to preserve

- Request-ID, abort-controller, mutation-ID, and document-session epoch checks.
- Create mode's transition to the newly persisted document ID.
- Autosave debounce/queueing, optimistic conflict detection, force-version behavior, and close blocking.
- Callback exactness: an obsolete request must not invoke `onLoaded`, `onSaved`, `onDeleted`, or close a replacement document.
- Task-scoped and project-scoped document creation endpoints.
- Public-page review gates, live-sync semantics, and save-before-publish ordering.
- Deferred comments/public-page/tree loads and their cancellation on close/document switch.
- Nested document/entity modals and lazy component resolution scoped to the originating session.
- Desktop and mobile surfaces, focus/keyboard behavior, and one authoritative child-component ref per feature.
- Markdown HTML sanitization and safe inline asset rendering.

## Non-goals

- No UI restyle, content redesign, or change to desktop/mobile information architecture.
- No backend endpoint or database-schema redesign.
- No public-page policy changes.
- No editor replacement, markdown format migration, or export format redesign.
- No stream-route, SmartLLMService, or OpenRouter work.
- No rewrite of already-specialized version, voice-note, comments, linked-entity, asset, or doc-tree components unless a concrete contract bug is found.

## Exit gate

- [ ] Every existing `DocumentModal` caller works through the unchanged component contract.
- [ ] The original 11 focused tests and the W0 characterization additions pass.
- [ ] Document CRUD, autosave/conflict, public-page, and supporting async actions are session-scoped and independently testable.
- [ ] `DocumentModal.svelte` contains no direct `fetch` calls and is at most 1,200 lines.
- [ ] No extracted component/controller/client exceeds 600 lines without a documented cohesive reason.
- [ ] Desktop and mobile smoke checks show no visual, keyboard, focus, or close-guard regression.
- [ ] Markdown remains sanitized and no new raw-HTML path is introduced.
- [ ] Svelte analysis and the full web typecheck are green.

## Verification

```bash
pnpm --filter @buildos/web exec vitest run src/lib/components/ontology/DocumentModal.test.ts
pnpm --filter @buildos/web exec vitest run src/lib/components/ontology/DocumentVersionHistoryPanel.test.ts
npx --yes @sveltejs/mcp svelte-autofixer apps/web/src/lib/components/ontology/DocumentModal.svelte
pnpm --filter @buildos/web check
```

Manual smoke at desktop and mobile widths:

1. Create a project document and a task document; save, close, reopen, and verify callbacks/list refreshes.
2. Edit rapidly through an autosave, switch documents, and confirm no old response overwrites or closes the new session.
3. Exercise conflict reload/overwrite and discard-on-close.
4. Publish, copy/open the URL, toggle live sync, trigger review messaging, and unpublish.
5. Move, compare/restore a version, add an image, open a linked entity/chat, and return to the same document.

## Deferral receipt — 2026-08-26

- Confirmed the public component remains 4,561 lines with 19 direct `fetch` calls.
- Confirmed the focused suite currently contains 11 behavior tests.
- Ran the Svelte 5 autofixer against `DocumentModal.svelte`; it reported no findings.
- Deferred implementation by explicit owner direction in favor of P1.4 worker ownership decomposition.

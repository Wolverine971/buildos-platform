<!-- docs/technical/reviews/SVELTE_PATTERN_AUDIT_2026-07-14.md -->

# Svelte Pattern Audit Tracker

**Audit date:** 2026-07-14
**Scope:** `apps/web` Svelte components and Svelte modules
**Purpose:** Track risky or unnecessarily complex Svelte patterns, their evidence, and remediation progress.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and validated
- `[-]` Accepted or deferred with rationale

## Findings

### SV-001 — Unsanitized HTML reaches browser rendering APIs

**Priority:** High
**Status:** `[x]` Completed and validated

`apps/web/src/lib/components/email/EmailPreview.svelte` renders generated email content with `{@html}` and writes it into a same-origin preview document with `document.write()`. `apps/web/src/lib/utils/emailTemplate.ts` interpolates subject and content into the generated document without an explicit sanitization boundary.

Why this matters:

- A compromised or unexpectedly user-controlled email field can become executable markup in the application origin.
- Having multiple rendering paths makes it easier for one path to miss a future sanitization fix.

Planned direction:

- Define which email fields may contain trusted HTML.
- Sanitize untrusted rich text at one explicit boundary.
- Prefer an isolated preview document and avoid `document.write()` where practical.

Implemented:

- Browser previews now pass through one explicit sanitizer boundary.
- Inline previews render in a scriptless, opaque-origin iframe.
- New-window previews use a sanitized Blob document with an isolated opener relationship.
- Subject text is escaped before it reaches the generated document title.

### SV-002 — Effects cause duplicate and race-prone requests

**Priority:** High
**Status:** `[x]` Completed and validated

Several components let multiple lifecycle/reactivity paths own the same request. Requests do not consistently use cancellation or request-version protection, so a slower response can overwrite newer state.

First remediation batch:

- `[x]` `apps/web/src/routes/admin/beta/+page.svelte`
    - Multiple effects can load the same signup/member list.
    - The general active-tab effect overlaps the filter-specific effects.
    - Search changes issue requests on every keystroke.
- `[x]` `apps/web/src/lib/components/email/EmailManager.svelte`
    - Initial loading and filter loading are split across `onMount` and an effect.
    - Pagination, refresh, and mutation handlers also invoke the loader directly.
    - Requests have no cancellation or stale-response guard.
- `[x]` `apps/web/src/lib/components/email/RecipientSelector.svelte`
    - `onMount` and an open-state effect both load recipients and initialize selection.
    - User and member requests run sequentially and have no cancellation.

Admin list remediation batch (batch 4):

- `[x]` `apps/web/src/routes/admin/feedback/+page.svelte`
    - The list effect implicitly tracked pagination through synchronous reads in `loadFeedback()` while pagination handlers also called the loader directly.
    - Search requests were neither debounced nor cancelled.
- `[x]` `apps/web/src/routes/admin/users/+page.svelte`
    - The list effect implicitly tracked pagination through `loadUsers()` while pagination and server-sort handlers also called the loader directly.
    - The effect reset `currentPage` after pagination changes, making page navigation ordering-dependent.
    - Client-sort pagination and server-sort pagination did not have clearly separated request ownership.

Acceptance criteria for this batch:

- One reactive owner starts each list request.
- Each effect returns cleanup that cancels its timer and/or request.
- Loaders consume a stable request snapshot rather than reading changing component state after an `await`.
- Search-driven requests are debounced; pagination and explicit refresh remain immediate.
- Event handlers change state or increment a refresh token instead of invoking a competing loader.
- Aborted requests never replace newer results or clear the newer request's loading state.

Follow-on remediation:

- `[x]` `TaskEditModal.svelte` and `ProjectCollaborationModal.svelte`
    - Read and mutation continuations are scoped to the task/project identity that started them.
    - Reopened task delete confirmation uses per-attempt cancellation so an older status response cannot win.
- `[x]` `DocumentModal.svelte`
    - Primary, deferred, mutation, lazy-import, clipboard, move, restore, and image-insertion continuations are scoped to a document session.
    - Deferred comments, public-page, and tree requests are cancellable and cannot cross document/project views.
- `[x]` `TimePlayCalendar.svelte`
    - One latest-range owner controls external event requests.
    - Late filtering uses the current block collection without making block-only updates refetch the range.
- `[x]` `LinkedEntities.svelte`
    - Primary, available-entity, picker, unlink, and link continuations are scoped to the current source identity.
    - Shared primary transports retain request deduplication with reference-counted cancellation.

### SV-003 — Effects mirror state that should have a single owner

**Priority:** Medium
**Status:** `[~]` In progress

Examples:

- `[x]` `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`
    - Seven effects copied private voice state into seven bindable props after each update.
    - The nested textarea binding and a second `oninput` assignment both wrote the same draft value.
- `[x]` `apps/web/src/lib/components/profile/AccountTab.svelte`
    - An effect reset the editable name/email draft whenever the same user's prop data refreshed.
- `[x]` `apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte`
    - Four effects copied private recording state into four bindable props.
    - A second input writer compensated for passing the nested textarea value one-way.
- `[x]` `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte`
    - Four effects copied private recording state into four bindable props.
- `[x]` `apps/web/src/routes/blogs/+page.svelte`
    - An effect copied the URL `q` parameter into an otherwise writable search draft.
- `[x]` `apps/web/src/lib/components/landing/public-project-preview/PublicDocsTree.svelte`
    - An effect replaced all folder-toggle state whenever the parsed structure invalidated.
- `[ ]` `apps/web/src/lib/components/ontology/DocumentModal.svelte`
    - An effect mirrors `documentId` into a mutable internal ID used for create-to-edit transitions.
- `[ ]` `apps/web/src/lib/components/ontology/EventCreateModal.svelte`
    - A guarded effect performs a one-time copy from `initialTaskId` into the editable task draft.
- `[ ]` `apps/web/src/lib/components/time-blocks/TimeBlockCreateModal.svelte`
    - Initial dates are already snapshotted at creation, then replayed into the draft by another effect.

Why this matters:

- Bidirectional synchronization creates feedback loops and ordering-dependent behavior.
- It becomes unclear whether the prop, internal field, or effect is authoritative.

Planned direction:

- Establish a single source of truth.
- Use explicit event/commit boundaries for editable drafts.
- Reserve effects for synchronization with systems outside Svelte.

Implemented in `TextareaWithVoice.svelte`:

- The existing bindable props now directly own recording, initialization, stopping, transcription,
  error, duration, and live-transcript capability state.
- The public binding and status-snippet APIs remain unchanged.
- The nested `Textarea` remains the sole DOM-input writer for the bindable draft value and continues
  to forward consumer `oninput` handlers.
- The component now has three effects instead of ten; the remaining effects synchronize with the
  recording service or document event system and retain their cleanup/guard behavior.

Implemented in `AccountTab.svelte`:

- The profile draft is initialized once from the authenticated user at component creation using an
  explicit untracked snapshot.
- Same-user prop refreshes no longer overwrite in-progress name or email edits.
- Successful submission is the explicit commit boundary and normalizes the submitted values.
- The effect that wrote into the draft has been removed.

Implemented in the follow-up scan:

- `CommentTextareaWithVoice.svelte` and `RichMarkdownEditor.svelte` now mutate their existing bindable
  recording, transcription, error, and duration states directly. Their public APIs and external
  recording-service/document lifecycle effects remain intact.
- `CommentTextareaWithVoice.svelte` now binds the nested textarea value instead of maintaining a
  compensating input writer; consumer `oninput` callbacks are still forwarded exactly once.
- The blogs search draft is an overridable derived value: typing remains local, while a changed URL
  query establishes a new draft without an effect.
- Public document folder defaults are overridable derived state keyed by top-level folder identity.
  User toggles survive equivalent rerenders and reset when the actual folder identities change.

### SV-004 — Dynamic lists are frequently unkeyed

**Priority:** Medium
**Status:** `[ ]` Not started

Audit snapshot: 679 of 935 `{#each}` blocks were unkeyed. Dynamic examples include all 17 loops in `CalendarView.svelte` and 15 loops in the task-detail surface.

Why this matters:

- When items are inserted, removed, or reordered, Svelte may reuse component/DOM identity by position.
- Stateful child components, focus, animation, and local input state can attach to the wrong item.

Planned direction:

- Prioritize sortable, editable, animated, and component-bearing lists.
- Add stable domain keys; do not use the array index unless positional identity is intentional.

### SV-005 — Very large components concentrate unrelated responsibilities

**Priority:** Medium
**Status:** `[ ]` Not started

Examples from the audit snapshot:

- `DocumentModal.svelte`: approximately 4,092 lines.
- `AgentChatModal.svelte`: approximately 2,959 lines.
- `AgentKeysTab.svelte`: approximately 2,429 lines.
- Voice-enabled editor components repeat substantial recording/transcription behavior across `TextareaWithVoice.svelte`, `CommentTextareaWithVoice.svelte`, and `RichMarkdownEditor.svelte`.

Planned direction:

- Extract behavior by responsibility, not just markup size.
- Share voice capture/transcription state through a focused Svelte module or composable controller.
- Keep orchestration in the parent and isolate independently testable UI/state units.

### SV-006 — Replace-only collections use unnecessarily deep reactive state

**Priority:** Low
**Status:** `[ ]` Not started

Collections such as sessions, signups, and project summaries appear to be replaced wholesale after requests but are stored in deeply reactive `$state` arrays. `$state.raw` is rarely used.

Planned direction:

- Verify that no item-level mutation is required.
- Use `$state.raw` for large replace-only response collections to avoid proxying every nested object.

### SV-007 — Supabase context is weakly typed and string-keyed

**Priority:** Low
**Status:** `[ ]` Not started

The Supabase context path uses a string key and `getContext<any>`. This loses compile-time guarantees and makes key collisions/refactors harder to detect.

Planned direction:

- Replace the ad hoc key with Svelte's typed `createContext` pattern.
- Remove `any` from the consumer boundary.

### SV-008 — Lint passes with a large warning backlog

**Priority:** Low
**Status:** `[ ]` Not started

The audit lint run completed with 215 warnings. `svelte-check` completed with 0 errors and 0 warnings at the time of the audit.

Planned direction:

- Group warnings by rule and fix high-signal categories first.
- Establish a warning budget so new warnings do not silently accumulate.

## Positive baseline

The application is already broadly on modern Svelte 5 conventions. The audit did not find meaningful use of legacy `export let`, `on:` directives, component event dispatchers, or legacy slots in active application components.

## Work log

### 2026-07-14 — Request-effect remediation, batch 1

- Recorded the audit findings in this tracker.
- Selected the beta admin page, email manager, and recipient selector as the first request-lifecycle batch.
- Consolidated beta signup/member loading from four competing list effects plus direct handler calls into one snapshot-driven request owner.
- Consolidated email loading into one request owner; refresh and pagination now change state rather than invoking a competing loader.
- Removed the recipient selector's duplicate `onMount`/effect load and parallelized its two recipient-source requests.
- Added abort cleanup and stale-response checks to all three surfaces.
- Added a 250 ms debounce only for search changes; pagination, filters, tab changes, and explicit refreshes remain immediate.
- Added request-lifecycle regression tests for the email manager and recipient selector.

Validation:

- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Focused request-lifecycle tests: 2 passed.
- Focused ESLint: 0 errors; 2 pre-existing unused-function warnings remain in the beta page.
- `git diff --check`: passed.
- The local `svelte-autofixer` binary was unavailable at the time; later MCP-backed validation is recorded in the subsequent batches below.

### 2026-07-14 — High-priority safety and identity remediation

- Replaced direct email HTML rendering and `document.write()` with a sanitized, isolated preview boundary.
- Added latest-request-wins loading to task and collaboration modals.
- Extended identity protection to task saves/deletes/title generation/series work and collaboration settings, invites, members, role profiles, and leave-project mutations.
- Captured task/project identity at operation start so stale responses cannot update, toast, close, or invoke callbacks for a newer modal identity.
- Added regression coverage for stale reads, stale mutations, close-time cancellation, and preview isolation.

Validation:

- Focused safety and request-identity tests: 12 passed.

### 2026-07-14 — Request-effect remediation, batch 2

- Added cancellation and monotonic request ownership to primary and deferred document loads.
- Keyed document ancillary state by project and document identity so comments, public-page state, and document-tree data cannot cross views.
- Added one latest-range owner for external calendar event requests and clear-on-disconnect/empty-range behavior.
- Kept calendar requests independent of block-only updates and used `$state.raw` for the replace-only event collection.
- Added regression coverage for stale transports, close/unmount cancellation, disconnects, empty ranges, and block-only updates.

Validation:

- Focused document and calendar tests: 7 passed.

Follow-up:

- Completed in request-effect remediation batch 3 below.

Integrated validation:

- Focused remediation suite: 19 passed.
- Full web suite: 2,483 passed across 393 test files.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Targeted ESLint, Prettier, and `git diff --check`: passed.

### 2026-07-14 — Request-effect remediation, batch 3 and independent recheck

- Independently re-reviewed the completed safety and request-lifecycle work before moving on.
- Added per-attempt cancellation to task calendar-link status loading so close/reopen races cannot let an older response win.
- Changed calendar event filtering to use the latest block snapshot after the range request resolves, while preserving the no-refetch behavior for block-only updates.
- Added document-session ownership to save/create, public-page actions, archive/restore/delete, move, restore reloads, lazy modal imports, clipboard feedback, inline-image synchronization feedback, and image insertion.
- Exercised deferred document comments, public-page, and tree callbacks instead of leaving the idle work unexecuted in tests.
- Added source-session ownership to `LinkedEntities.svelte`, including stale picker and mutation continuations.
- Preserved linked-entity request deduplication with reference-counted consumers: one caller may cancel without terminating a transport still used by another, while the final cancellation retires the transport safely.
- Added stable domain keys to the touched dynamic lists identified by the official Svelte analyzer.

Validation:

- Integrated focused remediation suite: 32 passed across 8 files.
- Full web suite: 2,498 passed across 395 test files.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Targeted ESLint, Prettier, and `git diff --check`: passed.
- Official Svelte autofixer: no actionable issues in the touched components. Its remaining effect suggestions describe intentional external request synchronization; the `DocumentModal.svelte` `{@html}` warning is a false positive because `renderMarkdown` sanitizes through `sanitize-html` before rendering.

### 2026-07-14 — Request-effect remediation, batch 4 — admin feedback and users

- Re-verified batch 1 before continuing: focused tests passed, `svelte-check` remained at 0 errors and 0 warnings, and `git diff --check` passed.
- Consolidated feedback loading into one snapshot-driven request effect with abort cleanup and search debouncing.
- Consolidated user-list loading into one request effect and removed competing pagination, sort, refresh, and mutation reload calls.
- Kept computed user sorts local: switching or paginating within client-sort mode reuses the fetched result instead of issuing another request.
- Added stable domain keys to the dynamic feedback and user lists flagged by the official analyzer.
- Added regression coverage for feedback stale responses, users server pagination, and users client-sort pagination.

Validation:

- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Focused batch-4 request-lifecycle tests: 3 passed; combined batch-1 and batch-4 request-lifecycle tests: 5 passed.
- Focused ESLint: 0 errors; 3 pre-existing unused-symbol warnings remain in the feedback page.
- Prettier and `git diff --check`: passed.
- Official Svelte MCP autofixer: 0 issues in both touched pages after keyed-list cleanup. Its remaining suggestions describe the intentional external request synchronization effects.

Next slice:

- Continue SV-003 with `DocumentModal.svelte`, `EventCreateModal.svelte`, and
  `TimeBlockCreateModal.svelte`. `CalendarView.svelte` remains the first SV-004 slice once the
  confirmed state mirrors are closed.

### 2026-07-14 — State-ownership remediation, batch 1 — voice textarea

- Independently re-ran the combined batch-1 and batch-4 request-lifecycle suite before continuing;
  all 5 regressions passed.
- Confirmed that `TextareaWithVoice.svelte` did not have two opposing synchronization effects as
  the initial audit wording suggested. It had seven effects publishing duplicated private state to
  seven bindable props.
- Made the existing bindable voice props the authoritative state and removed the duplicated private
  fields plus all seven publishing effects.
- Removed the redundant draft `oninput` writer; the nested `Textarea` binding now owns DOM-to-value
  updates while still forwarding consumer input handlers.
- Added a component harness and regression tests covering parent/child draft updates plus recording,
  initialization, stopping, transcription, error, duration, and capability bindings.

Validation:

- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Focused voice/component suite: 36 passed across 5 files.
- Focused `TextareaWithVoice` binding tests: 2 passed.
- Focused ESLint, Prettier, and `git diff --check`: passed.
- Official Svelte MCP autofixer: 0 issues in the component and test harness. Its remaining component
  suggestions describe intentional external recording-service/document synchronization effects and
  non-reactive `Map` registries that do not participate in rendering.

### 2026-07-14 — State-ownership remediation, batch 2 — account profile draft

- Corrected the audit path from the nonexistent `components/settings/AccountTab.svelte` to
  `components/profile/AccountTab.svelte`.
- Replaced effect-driven name/email resets with a one-time, explicitly untracked draft snapshot.
- Preserved unsaved edits across same-user prop refreshes and made successful submission the explicit
  normalized commit boundary.
- Added a stable error-message key and a literal pattern attribute for the two unrelated analyzer
  findings in the touched component.
- Added component regressions for same-user refresh preservation and successful normalized commits.

Validation:

- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Combined state-ownership/voice suite: 38 passed across 6 files.
- Focused `AccountTab` tests: 2 passed.
- Prettier and `git diff --check`: passed.
- Focused ESLint: 0 errors; 1 pre-existing unused `onerror` callback warning remains in
  `AccountTab.svelte`.
- Official Svelte MCP autofixer: 0 issues and 0 suggestions in `AccountTab.svelte`.

### 2026-07-14 — State-ownership remediation, follow-up scan and batches 3–5

- Re-ran all 38 completed state-ownership/voice regressions before continuing.
- Reopened SV-003 after a broader effect-assignment scan found four publishing effects in both
  `CommentTextareaWithVoice.svelte` and `RichMarkdownEditor.svelte`, plus smaller URL/prop-to-local
  mirrors that the initial audit missed.
- Made the existing bindable recording, transcription, error, and duration props authoritative in
  both remaining voice editors, removing eight publishing effects and eight duplicate private fields.
- Changed the comment editor's nested value boundary to `bind:value` and removed its compensating
  input assignment while preserving one consumer callback per DOM input.
- Replaced the blogs search synchronization effect with writable derived state sourced from the URL.
- Replaced the public document tree's folder-reset effect with writable derived defaults keyed by
  top-level folder identity. The first regression exposed that raw parsed-object invalidation was too
  broad, so the final implementation resets only on semantic folder-identity changes.
- Added stable action/category/post keys to the dynamic loops encountered in the touched editor and
  blogs surfaces.
- Classified navigation-driven panel closes, modal-open resets, browser/service synchronization, and
  animation timers as intentional event or external-system boundaries rather than state mirrors.
- Confirmed three remaining SV-003 targets: `DocumentModal.svelte`, `EventCreateModal.svelte`, and
  `TimeBlockCreateModal.svelte`.

Validation:

- Combined state-ownership/voice suite: 43 passed across 10 files.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings.
- Focused ESLint: 0 errors; Prettier and `git diff --check`: passed.
- Official Svelte MCP autofixer: no issues in the new harnesses, state module, comment editor, or public
  docs tree. `RichMarkdownEditor.svelte` retains only the known sanitized-markdown `{@html}` false
  positive. The blogs page's JSON-LD markup now follows the parser-safe split-script pattern used by
  the skill routes; its remaining `{@html}` warning is a false positive because the serialized JSON is
  escaped by `escapeSerializedJsonLd` before rendering.

## Validation notes

- Validation should include focused linting for every touched file and `pnpm --filter @buildos/web check`.
- The official Svelte MCP documentation and autofixer are part of the required workflow for component changes. The MCP-backed tool remains usable even when a local `npx` package download is unavailable.

<!-- apps/web/docs/features/document-service/STEP_1_5_STRUCTURAL_HANDOFF_2026-08-26.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time implementation handoff.** Written 2026-08-26. Describes work that was **not yet
> started** at the time of writing. Every file path and line number below was verified against the
> repository on 2026-08-26 — **re-verify line numbers before editing**, they drift.

# Step 1.5 — Structural Prerequisites for the Proposal Interaction

**Status:** In progress. **WS-1 implemented 2026-08-26; WS-2 ADR ratified by DJ 2026-08-26;
WS-3 not started.**
**Owner:** unassigned (written for an implementing agent).
**Blocks:** roadmap Step 2 (select → propose → apply → revision).
**Roadmap:** [`SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md`](./SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md) §8.
**Estimated size:** 2–4 focused days across three independent workstreams.

---

## 0. Read this first

### What this is

Step 2 of the document-service roadmap is the signature interaction: select a passage, speak or
type an instruction, review an anchored diff, apply it, get a sealed revision. Before that can be
built, three structural facts about the current system have to change. This document specifies all
three.

**WS-1 is also a live correctness bug** and is worth doing on its own merits even if Step 2 is
never built.

### Scope boundary — do NOT do these

The temptation on this work is to keep going. Do not:

- **Do not build the full document mutation service.** WS-1 extracts one shared guarded write. The
  complete mutation service (edit sessions, change events, outbox) is deliberately deferred — see
  roadmap §4.1.
- **Do not extract `DocumentWorkspace`.** `DocumentModal.svelte` is 4,479 lines and that is a real
  problem, but it is a maintainability problem, not a correctness one. The extraction happens under
  the pressure of Step 2, not before it.
- **Do not build the proposal UI, patch application, or diff overlay.** WS-2 produces a _decision
  document_, not code.
- **Do not add realtime collaboration, CRDT, presence, or anchored comments.** Roadmap Step 7.
- **Do not change the 60-minute version coalescing window.** That decision was settled as Option A
  on 2026-08-26; see roadmap §5.3.
- **Do not refactor `op-execution-gateway.core.ts` broadly.** Touch the three document write sites
  named in WS-1 and nothing else in that file.

### Decisions that are not yours to make

Four questions inside this work are **DJ's calls, not the implementing agent's.** Each has a stated
default so nothing blocks waiting on an answer — build the default, flag it in the PR description,
and let DJ overrule. Do not quietly pick differently, and do not stall.

| Question                                                                   | Build this unless told otherwise                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Is `updateOntoDocument` live in production? (sets WS-1 urgency)            | Assume yes — do WS-1 first                                                                                 |
| Shared guarded-write helper, or CAS patched into the gateway alone?        | The shared helper, as specified in WS-1                                                                    |
| Should the PATCH route keep allowing writes with no `expected_updated_at`? | Yes — keep it, change nothing                                                                              |
| Which agent edits may skip proposal review (direct-apply threshold)?       | **Decided 2026-08-26: none** — every LLM-authored interactive edit is a proposal in v1 (ratified WS-2 ADR) |

The full ledger, including decisions deferred to later steps, is roadmap §11.
**If you hit a fifth decision not listed there, stop and add it to §11.1 rather than deciding it.**

### Prerequisite already shipped

The P0 trust fix (roadmap §5) landed 2026-08-26: bounded retry on a version-number collision,
blocking version writes on the two web routes, and `isVersionWindowOpen()` / `is_open` for
open-window labelling. The canonical uniqueness guarantee was already present as
`unique (document_id, number)` in the base ontology migration
`20250601000001_ontology_system.sql:303–312`. Migration `20260826150000` added a redundant index;
`20260826190000` removes only that duplicate. **WS-1 has no pending index prerequisite.**

---

## WS-1 — Unify the document write path

**This is the live bug. Do this one first.**

### Current state

Document content is written by two paths with different safety guarantees.

**Path A — the safe one.** `apps/web/src/routes/api/onto/documents/[id]/+server.ts`
Used by the editor and by the _web_ agentic chat (the chat's `ontology-write-executor.ts` calls the
HTTP route at `:1742`, so it inherits the route's guarantees). At `:567–577` it builds a
compare-and-swap:

```ts
const guardedUpdateQuery = expectedWriteVersion
	? updateQuery.eq('updated_at', expectedWriteVersion)
	: updateQuery;
// …
if (expectedWriteVersion && updateMatchedNoRows) {
	return ApiResponse.conflict(DOCUMENT_CONFLICT_MESSAGE);
}
```

**Path B — the unsafe one.** `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts`
Used by the **worker agentic chat**, external agent calls, and agent runs, all via
`runGatewayWriteOp`. At `:799–803` it writes:

```ts
const { data, error } = await context.admin
	.from('onto_documents')
	.update(updateData)
	.eq('id', documentId) // ← no updated_at guard
	.select(ONTO_DOCUMENT_SELECT)
	.single();
```

No concurrency guard. An agent write through this path silently overwrites whatever the user typed
since the agent read the document.

Worker routing is confirmed at:

- `apps/worker/src/workers/agentic-chat/gatewayEntityMutationAdapter.ts:38` and `:228`
  (`update_onto_document`)
- `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts:76` (capability `updateOntoDocument`)

⚠️ **Confirm the live capability flag state before assuming production impact.** The Phase 4 battery
evidence docs list `updateOntoDocument` among enabled mutation capabilities, but verify against the
current rollout config rather than trusting this document. What _is_ verified in code: the gateway
write at `:799` has no concurrency guard, and the worker routes `update_onto_document` to it. What is
**not** verified: whether that capability is enabled in production. This is a DJ decision — roadmap
§11.1, default "assume yes, fix first".

### Why the fix is small

The gateway **already performs a read-modify-write.** `existingDocument` is loaded at `:643–656`
using `ONTO_DOCUMENT_SELECT`, which includes `updated_at`
(`op-execution-gateway.config.ts:42–43`). The read is required anyway — `append`/`merge` strategies
and START HERE managed-region preservation both depend on current content.

So the guard value is already in hand at the write site. It is simply not used.

### Target state

One shared guarded-write helper, used by both paths, that:

1. Applies the update with `.eq('updated_at', <value read during this operation>)`.
2. Treats a zero-row result as a conflict, not a success.
3. Retries once on conflict by re-reading and re-deriving content **only for content-only,
   intent-preserving `append` / current `merge_llm` operations**. Replace, metadata, archive, and
   props conflicts surface immediately; auto-retrying those could overwrite a concurrent human
   edit and defeat the guard.
4. Raises `ExternalToolGatewayError('CONFLICT', …)` if the retry also loses. `CONFLICT` already
   exists in the error union (`op-execution-gateway.responses.ts:10–14`,
   `op-execution.ts:201`) and already degrades correctly through the response layer.
5. Writes the version **blocking**, matching what the web routes now do.

### Implementation steps

1. **Create the shared helper.** Suggested home:
   `packages/shared-agent-ops/src/ontology/document-write.service.ts` — it must be reachable from
   both the web app (via the existing `$lib/services/ontology/*` re-export shim pattern, see
   `apps/web/src/lib/services/ontology/versioning.service.ts`) and the worker.

    Suggested contract:

    ```ts
    export type GuardedDocumentUpdateResult =
    	| { status: 'updated'; document: OntoDocumentRow; versionWarning: string | null }
    	| { status: 'conflict' };

    export async function updateDocumentGuarded(params: {
    	supabase: Supabase;
    	documentId: string;
    	projectId: string;
    	actorId: string;
    	/** The `updated_at` this update is based on. Zero-row result ⇒ conflict. */
    	expectedUpdatedAt: string;
    	updatePayload: Record<string, unknown>;
    	previousSnapshot: DocumentSnapshot;
    	changeSource?: string | null;
    	forceCreateVersion?: boolean;
    }): Promise<GuardedDocumentUpdateResult>;
    ```

    It owns: the guarded update, the zero-row conflict detection, and the blocking
    `createOrMergeDocumentVersion` call with `versionWarning` on failure.

    It must **not** own: `doc_structure` sync, mention notification, public-page sync, auto-organize,
    or project-loop bursts. Those stay with their callers and stay background where they already are.

2. **Wire the gateway update** (`op-execution-gateway.core.ts:799`) to the helper, passing
   `existingDocument.updated_at` as `expectedUpdatedAt`. On `conflict`, re-run the read at `:643`
   and the content derivation at `:730–775`, then retry once; on a second conflict throw
   `ExternalToolGatewayError('CONFLICT', 'Document changed while the agent was editing it. Re-read and retry.')`.

3. **Harden the other two gateway document writes.** Both are inserts, so they need no CAS, but both
   still swallow version failures with `console.warn`:
    - `:535` insert + `:547` version (create document)
    - `:1159` insert + `:1190` version (create task document)

    Bring them in line with the web create route: keep the write, surface the failure rather than
    only logging it.

4. **Refactor the web PATCH route** (`documents/[id]/+server.ts:567`) to call the same helper.
   Behavior must not change — this route's contract is already correct, and the point is to have one
   implementation, not to alter it.
   ⚠️ Preserve the existing `expectedWriteVersion == null` case: the route currently allows an
   unguarded write when the client sends no `expected_updated_at`. Do **not** silently start
   rejecting those; keep that branch and decide it separately.

### Tests to write

- Gateway update loses the CAS → returns `CONFLICT`, does **not** write.
- Gateway update conflicts once, succeeds on retry → document updated, exactly one version created.
- Gateway `append` strategy under a concurrent edit → retry re-reads and appends to the _new_
  content, not the stale content. **This is the test that matters most.**
- Web PATCH route behavior is unchanged: existing suites must stay green, especially
  `apps/web/src/routes/api/onto/documents/[id]/document-patch-concurrency.test.ts`.
- Version write failure → `versionWarning` surfaced, document still updated.

Existing suites to keep green:
`packages/shared-agent-ops/src/gateway/op-execution-gateway.*.test.ts`,
`apps/web/src/routes/api/onto/documents/**/*.test.ts`,
`packages/shared-agent-ops/src/ontology/versioning.service.test.ts`.

### Implementation result — 2026-08-26

WS-1 is complete:

- `packages/shared-agent-ops/src/ontology/document-write.service.ts` now owns the optional CAS,
  zero-row conflict result, awaited version write, and version-warning contract.
- The web PATCH route uses the shared helper while preserving its permissive no-token branch and
  existing response contract.
- The worker/external gateway uses the same helper. Content-only append/merge conflicts re-read
  current content, re-derive the update, and retry once; replace/metadata conflicts do not auto-retry.
- Gateway document and task-document creates now return `version_warning` instead of only logging a
  version failure.
- Focused coverage lives in `document-write.service.test.ts` and
  `op-execution-gateway.documents.test.ts`; the existing web concurrency, mention, replay, and route
  suites remain green.

---

## WS-2 — The patch and anchor ADR

**Deliverable: a decision document, not code.** ⚠️ If this workstream produces patch-application
code, anchor-resolution code, or diff UI, it has overstepped — the patch format falls out of the
anchor decision, and settling that in code first means rewriting Step 2. Write it to
`docs/architecture/decisions/` per this folder's documentation policy, and link it from the
document-service README.

**Result — ratified by DJ 2026-08-26:**
[`2026-08-26-document-patch-anchor-contract.md`](../../../../../docs/architecture/decisions/2026-08-26-document-patch-anchor-contract.md)
is the governing contract. It selects a hybrid exact-text patch, heading and bounded-context
anchors, deterministic re-anchoring with no fuzzy apply, a stored generated `content_hash`,
all-or-nothing multi-operation apply, stable conflict reasons, and proposal review for every
LLM-authored interactive content edit in v1.

### The problem it must solve

`onto_documents` has **no `head_revision_id` and no `content_hash`.** Verified against
`packages/shared-types/src/database.types.ts` — the columns are: `archived_at`, `children`,
`content`, `created_at`, `created_by`, `deleted_at`, `description`, `id`, `outline`, `project_id`,
`props`, `search_vector`, `state_key`, `title`, `type_key`, `updated_at`.

The only concurrency token is `updated_at`. That is adequate for CAS on a single write, and
**inadequate as a proposal base**, because:

> Autosave bumps `updated_at` roughly every two seconds of typing. A proposal the user reviews for
> thirty seconds would be invalidated by their own keystrokes — in a paragraph they were not even
> editing.

A proposal-first flow where every proposal conflicts on arrival is worse than no proposal flow.

### Recommended direction

Validate on **anchor-local hashes**, not whole-document identity:

- A patch anchors to a heading path plus a hash of the text it replaces and a bounded window of
  surrounding context.
- Apply revalidates _those hashes_, so unrelated edits elsewhere in the document do not invalidate
  the proposal.
- A head-level content hash serves only as a cheap "did anything change at all" fast path, letting
  apply skip re-anchoring entirely in the common case.

This matches the original vision doc §4.6 ("bounded surrounding context and hashes") and is why
whole-document CAS is the wrong tool here despite being the right tool for WS-1.

### What the ADR must specify

1. Anchor format — heading path, offsets, context window size, hash algorithm.
2. Revalidation rule — what constitutes a still-valid anchor, and what triggers re-anchoring.
3. Re-anchor strategy and when to give up and show the user a conflict.
4. Whether `content_hash` is added to `onto_documents` (recommended: yes, as a fast path) and
   whether it is a generated column or written by the mutation path.
5. The direct-apply threshold — which operations are unambiguous enough to skip proposal review.
   Original vision §14.8.
6. Patch representation — heading-anchored text patches, Markdown AST patches, or hybrid. Original
   vision §14.3.

### Existing primitive to ratify — do not replace

**Agent-owned block identity is settled.** `packages/shared-agent-ops/src/ontology/start-here.ts`
already implements managed regions inside portable Markdown:

```text
<!-- managed:status v=1 -->…<!-- /managed:status -->
```

with a version field, `renderStartHereManagedRegion` (`:155`), `managedRegionRegex` (`:349`),
`insertManagedRegion` (`:453`), and tests in `start-here.test.ts`. The ADR should **ratify this as
the canonical mechanism** for any agent-owned block, not invent a competing one. It does not give
arbitrary human-authored paragraphs or checklist items durable identity. Stable checklist-item
identity remains a Step 5 decision.

---

## WS-3 — Per-turn document mutation events

### Current state

The document surface only learns about agent changes when the chat **closes**.

- `apps/web/src/lib/components/ontology/DocumentInteractDock.svelte:81` — `onClose?.(summary)` is
  the only outbound signal; the file is 166 lines and has no per-turn hook.
- `apps/web/src/lib/stores/projectDataMutations.ts` — the global signal, whose own doc comment
  states it fires "whenever a chat session closes (or a staged change set is applied)". The payload
  is coarse: `hasChanges` plus `affectedProjectIds`. There is no document id and no patch detail.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte:1960` and `:2011` — the two
  `notifyDataMutation(summary)` call sites, both on teardown paths.

### Target state

A per-turn, document-scoped event carrying enough detail for the open editor to refresh in place
without losing scroll position or selection.

### Hook point — this already exists

`apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts` already tracks mutations per tool
call. At `:145–153` there is a registry marking tools with `trackMutation: true`, including
`update_onto_document`. The presenter accumulates these and `buildMutationSummary()` (`:121`) drains
them at close.

The work is to **emit at accumulation time as well as at drain time** — not to build new tracking.

### Implementation steps

1. Add a per-turn emission alongside the existing accumulation in the presenter, carrying at
   minimum: entity kind, entity id, tool name, and turn id.
2. Add a document-scoped channel — either a new store beside `projectDataMutations.ts` or an
   optional `onDocumentMutated` callback threaded through `DocumentInteractDock` — carrying
   `{ documentId, turnId, toolName }`.
3. Subscribe from the document surface and refresh that document only.

⚠️ **Preserve the existing close-time broadcast.** Other surfaces (project page, dashboard,
embedded modals) depend on it, as the store's comment explains. This is additive.

⚠️ **Refresh must not clobber a dirty editor.** The document may have unsaved local edits when the
event arrives. Reuse the existing conflict-detection behavior rather than force-replacing the
buffer.

---

## Definition of done

- [x] The web PATCH and gateway update paths go through one guarded helper with blocking versioning.
- [x] A concurrent user edit during an agent write produces a detected conflict, never a silent
      overwrite.
- [x] Agent `append` under concurrent edit appends to current content after retry.
- [x] Patch/anchor ADR written, reviewed, and linked from the document-service README.
- [ ] A document-scoped mutation event fires per turn, and the close-time broadcast still works.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test:run` green.
- [ ] `node scripts/docs/check-doc-health.mjs --strict` green.
- [ ] Switching Bar rows in the roadmap updated to reflect what actually shipped.

---

## Landmines

1. **Line numbers drift.** Every reference here was verified 2026-08-26. Re-grep before editing.
2. **`shared-agent-ops` must be rebuilt for the web app to see new exports.** The web app resolves
   `$lib/services/ontology/*` through re-export shims that point at _built declarations_. After
   adding an export, run `pnpm --filter=@buildos/shared-agent-ops build` or `svelte-check` will fail
   with "has no exported member". This cost a debugging cycle during the P0 fix.
3. **Four document test files time out under full-parallel runs** at the default 5s vitest timeout —
   they pass individually and pass 28/28 with `--no-file-parallelism`. This is module-import
   contention on heavy SvelteKit route graphs, not a correctness signal. Do not "fix" it by changing
   product code.
4. **`context.admin` in the gateway bypasses RLS.** It is a service-role client. Authorization there
   is enforced by `assertVisibleEntityProject` / `assertProjectWriteAccess` (`:669–670`), not by the
   database. Do not drop those checks while refactoring.
5. **START HERE documents have special update handling.** `preserveCurrentStartHereManagedRegions`
   runs inside the gateway content derivation (`:764–771`). A retry after conflict must re-run that
   derivation against the _new_ content, not reuse the previously computed value.
6. **The gateway sets `origin: 'external_agent'` in props** (`:787`). Preserve it.
7. **Do not use `git stash` in this repo.** There is substantial uncommitted work in the tree and a
   pre-existing stash entry. Use `git worktree` for isolation instead.

---

## Reference map

| What                                         | Where                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Safe write path (editor + web chat)          | `apps/web/src/routes/api/onto/documents/[id]/+server.ts:567`                                  |
| Unsafe write path (worker + agents)          | `packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts:799`                      |
| Gateway document read (has `updated_at`)     | same file `:643–656`                                                                          |
| Gateway create document / version            | same file `:535`, `:547`                                                                      |
| Gateway create task document / version       | same file `:1159`, `:1190`                                                                    |
| Gateway select column list                   | `op-execution-gateway.config.ts:42`                                                           |
| Gateway error codes (incl. `CONFLICT`)       | `op-execution-gateway.responses.ts:10`                                                        |
| Worker routing for `update_onto_document`    | `apps/worker/src/workers/agentic-chat/gatewayEntityMutationAdapter.ts:228`                    |
| Web chat → HTTP route                        | `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts:1742` |
| Versioning service                           | `packages/shared-agent-ops/src/ontology/versioning.service.ts`                                |
| Managed-region primitive                     | `packages/shared-agent-ops/src/ontology/start-here.ts`                                        |
| Per-tool mutation tracking                   | `apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts:145`                          |
| Close-time mutation broadcast                | `apps/web/src/lib/stores/projectDataMutations.ts`                                             |
| Document Interact dock                       | `apps/web/src/lib/components/ontology/DocumentInteractDock.svelte:81`                         |
| CodeMirror decoration precedent (for Step 2) | `apps/web/src/lib/components/ui/codemirror/voice-widget.ts`                                   |
| Diff renderer (for Step 2)                   | `apps/web/src/lib/utils/document-diff.ts`                                                     |

## What is already in place for Step 2

Recorded so the implementing agent does not rebuild these:

- **The editor can host an anchored diff.** `codemirror/voice-widget.ts` is a working
  `StateField` + `StateEffect` + `Decoration` + `WidgetType` implementation with tests, and
  `codemirror/sticky-scroll.ts` is a second precedent.
- **Diff rendering exists.** `document-diff.ts` exposes `createDocumentDiff` and
  `createDocumentFieldDiff`, already used by version comparison.
- **A review/apply pipeline exists.** `packages/shared-agent-ops/src/proposal-context/` has
  build/decode/verify with risk tiers, evidence refs, preview, and status. It is _entity-operation_
  shaped rather than text-patch shaped — borrow its lifecycle and review UX, do not force document
  patches into `LoopOperation`.

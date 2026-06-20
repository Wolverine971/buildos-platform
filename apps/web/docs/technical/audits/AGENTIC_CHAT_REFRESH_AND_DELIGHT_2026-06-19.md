<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_REFRESH_AND_DELIGHT_2026-06-19.md -->

# Agentic Chat — Post-Mutation Refresh Bugs & Delight Opportunities

**Date:** 2026-06-19
**Status:** 🚧 Phases 1–5 done (refresh bugs fixed; "new entity appears" entrance across tasks,
documents, goals, milestones, plans, risks; task-completion delight in list + kanban); Phase 6
(project-creation reveal, first-project celebration, inline chat entity cards) needs direction
**Author:** DJ + Claude
**Scope:** What happens in the UI when the agentic chat creates/updates entities, whether
those changes show up after the chat closes, and where we can add moments of delight.

---

## TL;DR

The moment we want to make delightful — _"create a doc in chat → close → watch it appear nicely
in the documents area"_ — is currently **blocked by a real refresh bug**. On the two highest-traffic
surfaces (the global nav chat launcher and the entity edit-modal chats), the underlying page **never
refreshes** when the chat closes, so new entities only appear after a full page reload.

So this is two layers of work:

1. **Fix the stale-UI bug** so new entities actually appear. _(do first)_
2. **Add the entry animation** so they appear _nicely_. _(the delight)_

---

## Findings

### Layer 1 — Refresh / stale-UI bugs

The intended contract is: **"the surface that opens the chat refreshes itself on close, using the
`DataMutationSummary` (`hasChanges` / `affectedProjectIds`)."** Most surfaces honor it; the busiest
two do not.

| #   | Severity    | Bug                                                                                                                                                                                                                                                                                         | Evidence                                                                                 |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | 🔴 CRITICAL | **Global nav launcher → project page doesn't refresh.** Main way to open chat on a project page; close handler shows a toast and refreshes nothing.                                                                                                                                         | `Navigation.svelte:330-344`                                                              |
| 2   | 🔴 CRITICAL | **Chat embedded in any entity edit modal refreshes nothing.** All 7 `*EditModal.svelte` close handlers are bare `showChatModal = false`.                                                                                                                                                    | `TaskEditModal.svelte:756`, `DocumentModal.svelte:2021`, etc.                            |
| 3   | 🟠 HIGH     | **Modal's built-in invalidation is dead code.** `createProjectInvalidation(id).all()` fires `invalidate('projects:<id>:tasks')` etc., but no load function registers those `depends()` keys, and the project `[id]` page is client-refetch driven (re-hydrates only on `projectId` change). | `AgentChatModal.svelte:1880`, `invalidation.ts:90`, `projects/[id]/+page.svelte:491-499` |
| 4   | 🟠 HIGH     | **Workspace/global-context writes never invalidate at all** (guarded by `isProjectContext`).                                                                                                                                                                                                | `AgentChatModal.svelte:1880`                                                             |
| 5   | 🟠 HIGH     | **Staged change-set commit invalidates nothing.** `ChangeSetReview` exposes `onApplied` but it's never passed at the call site.                                                                                                                                                             | `AgentRunModalContent.svelte:384`, `ChangeSetReview.svelte:107`                          |
| 6   | 🟡 MED      | On-project brief chat refreshes briefs but not entity lists.                                                                                                                                                                                                                                | `EntityTabStrip.svelte:246`                                                              |
| 7   | 🟡 MED      | History page ignores entity mutations unless a message was also sent.                                                                                                                                                                                                                       | `history/+page.svelte:337`                                                               |

**Root cause:** the call-site refresh contract is sound, but (a) the global launcher and embedded
edit-modal launchers opt out, and (b) the intended fallback (`invalidate()`) is inert because the
project detail page never subscribed to those dependency keys and refreshes via its own
`refreshSilently()` instead.

**Key architectural fact driving the fix:** the project `[id]` page keeps `tasks`/`documents`/etc.
as local `$state` and only re-hydrates when `data.projectId` changes (`+page.svelte:491-499`).
`invalidate()`/`invalidateAll()` therefore can't refresh the same project's lists. The reliable
mechanism is a **global "data mutated" signal** that surfaces subscribe to and respond to with their
own refetch (`refreshSilently()`).

### Layer 2 — Feedback gaps inside the chat

- **Silent entity types:** `create_onto_milestone` / `create_onto_risk` (and delete variants for
  milestone/risk/project) have display formatters but **no `TOOL_CATALOG` entry** → no toast, not
  even counted as a mutation. `agent-chat-tool-presenter.ts:124` vs `:930`.
- **Toast can be silently dropped** if a `tool_result` arrives without a matched `tool_call`.
  `agent-chat-sse-handler.ts:385`.
- **No clickable link / entity card** to a just-created entity in the conversation — only a
  past-tense text line in the collapsed ThinkingBlock.
- The richer dedup-aware `operation` activity rows are **dead for normal chat** (v2 stream emits
  only `tool_call`/`tool_result`).

### Layer 3 — Delight opportunities (ranked)

Existing motion vocabulary to reuse (no new primitives needed): `animate-ink-in`/`ink-out`,
`scale-in`, `pulse-glow`, `tx-bloom` (texture = _newness_), `animate:flip` (toasts only today),
View Transitions (`project-title` morph). See `tailwind.config.js:110-153`, `inkprint.css`.

1. 🥇 **"New entity appears" entry animation** — once refresh works, newly created rows
   `animate-ink-in` + a brief `tx-bloom`/`pulse-glow` halo that fades (~1s), list reorders with
   `animate:flip`. Needs `affectedEntityIds` plumbed through. `EntityListItem.svelte:183`.
2. 🥈 **Task marked done** — most frequent action, least delightful (just strikethrough via
   `transition-colors`). Checkmark draw + `scale-in` pop. `EntityListItem.svelte:185-199`.
3. 🥉 **Project creation reveal** — header glimmer shipped; add View-Transition `project-title`
   morph on landing + one-time first-project celebration.
4. **Inline entity cards in chat** — replace text line with tappable card entering via `ink-in`.
5. **Brief "ready" reveal** — `BriefChatModal` animates open, not generation-complete.

---

## Fix plan & progress

### Phase 1 — Universal refresh signal (fixes bugs #1, #2, #4) ✅ DONE

- [x] New store `src/lib/stores/projectDataMutations.ts` — `notifyDataMutation(summary)` +
      subscribable `dataMutationEvents` + `mutationAffectsProject()` helper.
- [x] `AgentChatModal.handleClose()` broadcasts `notifyDataMutation(summary)` for **all** contexts;
      removed inert `createProjectInvalidation().all()` (and its now-unused import).
- [x] Project `[id]` page subscribes → `refreshSilently()` when `affectedProjectIds` is empty or
      includes the current project; dropped now-redundant explicit refresh in recent-chat close.

> Because `AgentChatModal.handleClose()` runs in **both** modal and embedded modes
> (`AgentChatModal.svelte:1232-1236`), this single broadcast also fixes the embedded edit-modal
> chats (bug #2) with no per-modal change.

### Phase 2 — Staged commit refresh (fixes bug #5) ✅ DONE

- [x] `ChangeSetReview` broadcasts `notifyDataMutation` on successful apply, scoping
      `affectedProjectIds` from the change set (`collectAffectedProjectIds`).

### Phase 3 — Chat feedback gaps (Layer 2) ✅ (high-value part done)

- [x] Registered `create_onto_milestone`, `delete_onto_milestone`, `create_onto_risk`,
      `delete_onto_risk`, `delete_onto_project` in `TOOL_CATALOG` (toast + track). Formatters already
      existed, so these now toast and count as mutations (→ also trigger refresh).
- [ ] _Deferred (low priority):_ harden toast emission when `tool_result` arrives before its
      `tool_call`. Rare (server emits call before result), and the mutation is still tracked at
      `agent-chat-sse-handler.ts:403` so **refresh is unaffected** — only a toast is lost.

### Phase 4 — "New entity appears" entrance ✅ DONE (tasks + documents)

Instead of plumbing `affectedEntityIds` through the whole chat/SSE/summary chain, the project page
**diffs entity IDs before/after** a mutation-driven `refreshSilently()` and marks whichever IDs are
newly present. Those flow to descendant rows via Svelte **context** (set once at the page), so even
deeply nested surfaces opt in with one line and no prop-threading.

- [x] `recentlyCreatedContext.ts` — context provider/consumer (`has(id)`), closes over reactive
      `$state` so membership stays live.
- [x] Project `[id]` page computes newly-appeared IDs after a mutation refresh
      (`refreshAndHighlight`), with a skeleton-race guard, ~2.4s clear timer, and a `get()`-based
      nonce baseline so stale events from a prior page don't fire on mount.
- [x] Reusable `.entity-just-created` entrance in `app.css` — rises in + a brief accent ink-bloom
      ring, then settles. Covered by the global reduced-motion guard.
- [x] Wired: `TaskKanbanBoard`, `MobileTaskBoard` (tasks), `DocTreeNode` (documents).

### Phase 5 — completion delight + wider entrance coverage ✅ DONE

- [x] Extended the "new entity appears" entrance to **goals / milestones / plans / risks** rows in
      `EntityTabStrip` (context was already in place; one `getRecentlyCreatedContext()` + class per row).
- [x] **Task-done checkmark pop** in `EntityListItem` — the checkmark pops (`entity-check-pop`) when a
      task transitions into completion (not on mount of an already-done task).
- [x] **Kanban "task completed" pulse** — dragging a task to Done and getting server confirmation
      pulses the card in success-green (`task-just-completed`), the highest-traffic completion path.

> **Bug found & fixed while here:** `EntityListItem` has a prop named `state`, which collides with
> the `$state` rune (`$state(...)` was parsed as store-subscription of the `state` prop → type error).
> Renamed the local binding to `taskState` (public prop name unchanged).

### Phase 6+ — remaining delight (needs product direction)

- [ ] **Project-creation reveal.** The list↔detail `project-title` morph already works via the View
      Transitions API default (elements carry unique `view-transition-name`s). _Pre-existing minor bug:_
      the custom-timing rule in `app.css` targets `project-title` but the real names are
      `project-title-<id>`, so the custom 200ms cubic-bezier never applies (default UA timing is used).
      Fixing needs either a per-id rule strategy or accepting the default.
- [ ] **One-time first-project celebration** — needs a "first project ever" signal + a celebration UI.
- [ ] **Inline tappable entity cards in the chat conversation** (replaces the text-only "Created X"
      line; also closes the Layer-2 "no link to created entity" gap).

### Known follow-ups (not blocking)

- Bugs #6 (brief chat on project refreshes briefs only) and #7 (history ignores entity mutations)
  remain. The dashboard could also subscribe to `dataMutationEvents` so the **global** nav launcher
  refreshes it too (today only its own launcher refreshes it).

---

## Verification

- `svelte-check`: **0 errors, 0 warnings** (whole web app).
- ESLint on changed files: clean (1 pre-existing unrelated warning).
- `agent-chat-tool-presenter.test.ts` + `agent-chat-sse-handler.test.ts`: **86/86 pass**.
- Broader suite has pre-existing failures (search-telemetry, tool-executor, ontology-read-executor,
  etc. — all already-modified WIP files at session start); none are files touched here.

## Files changed

_Phase 1–3 (refresh):_

- `src/lib/stores/projectDataMutations.ts` _(new)_
- `src/lib/components/agent/AgentChatModal.svelte`
- `src/routes/projects/[id]/+page.svelte`
- `src/lib/components/notifications/types/agent-run/ChangeSetReview.svelte`
- `src/lib/components/agent/agent-chat-tool-presenter.ts`

_Phase 4 (delight — entity entrance):_

- `src/lib/stores/recentlyCreatedContext.ts` _(new)_
- `src/app.css` (`.entity-just-created`)
- `src/routes/projects/[id]/+page.svelte` (diff + context provider)
- `src/lib/components/project/v2/TaskKanbanBoard.svelte`
- `src/lib/components/project/v2/MobileTaskBoard.svelte`
- `src/lib/components/ontology/doc-tree/DocTreeNode.svelte`

_Phase 5 (delight — wider entrance + completion):_

- `src/lib/components/project/v2/EntityTabStrip.svelte` (entrance for goals/milestones/plans/risks)
- `src/lib/components/ontology/EntityListItem.svelte` (checkmark pop; fixed `state`/`$state` collision)
- `src/lib/components/project/v2/TaskKanbanBoard.svelte` (drag-to-Done completion pulse)

---

## Changelog

- **2026-06-19** — Audit complete (3 research agents). Doc created.
- **2026-06-19** — Phases 1–3 implemented (universal refresh signal, staged-commit refresh, silent
  entity-type registration). Type-clean, touched tests green.
- **2026-06-19** — Phase 4 shipped: "new entity appears" entrance for tasks + documents via a
  before/after refresh diff + Svelte context + reusable `.entity-just-created` ink-bloom. Cleanup:
  mount nonce baseline, skeleton-race guard, highlight-timer teardown. 0 errors / 0 warnings.
- **2026-06-19** — Phase 5 shipped: entrance extended to goals/milestones/plans/risks; task-completion
  delight (checkmark pop in lists, success pulse on kanban drag-to-Done). Fixed a `state`/`$state`
  rune collision in `EntityListItem`. 0 errors / 0 warnings; 61 component tests pass.

<!-- tasker/153-threads-in-real-chat.md -->

# 153 — Threads in real chat (cards, carry, project split)

**Opened 2026-11-05 (DJ).** Move the lab's three ideas onto the real agentic chat engine instead of
growing the lab engine. Plan v2 (after four step reviews):
[`docs/architecture/THREADS_IN_REAL_CHAT_2026-11-05.md`](../docs/architecture/THREADS_IN_REAL_CHAT_2026-11-05.md).
This supersedes the lab-engine work in [151](151-carry-turn-context-forward.md) and
[152](152-robust-threads.md); their pieces move into the shared runtime.

## Status (2026-11-05) — A, C1 committed (be960b5b2); B carry BUILT, UNCOMMITTED (needs Railway var + deploys)

**DJ's decisions (2026-11-05):** order A → B → C1, C2 gated on data; "Continue in X" as a chip;
phone later; old chats left to Claude. Cards for 7 days (live), then today's view; no permanent
card summary for now.

**Phase A lean, built:**

- `apps/web/src/lib/components/agent/agent-chat-turn-cards.ts` (+ test): `deriveTurnCards` is
  pure. A step's project comes from its args, then its result, then the chat's project. Names
  come from the chat, the finder's picks and the results. A step with no project folds into the
  only card, otherwise it goes to "Across projects". It is in web for now (move it to
  `agentic-chat-client` when mobile adopts it).
- The SSE handler keeps the finder's `context_selection` (when visible and injected) as a
  hidden `ontology_loaded` activity, so it never shows in the step log.
- `ThinkingBlock.svelte`: a `turnCards` prop. One card per project, a "Pulled in N of M ·
  labels" row, the same step rows (a shared snippet), 6 rows per card with "Show N more", and
  the header badge "2 projects · 5 steps".
- `AgentMessageList.svelte`: cards are on for **admins only** (`page.data.user.is_admin`); the
  chat's project comes from `resolvedProjectFocus`.
- Checks:
    - 98 tests across 4 files pass (7 new);
    - web `check` reports 0 errors;
    - lint is clean;
    - a fixture page was viewed on local dev (project chat, global chat, old look) with no
      console errors, then deleted.
- **Not yet:**
    - change cards inside the card;
    - a real signed-in turn.

**"Pulled in" after a reload (built):** the session GET returns `contextSelections` (parsed
`context_selection` turn events that are visible and injected; turn events last 7 days).
`buildRestoredToolBlock` adds the turn's selection as the same hidden activity. It applies only to
turns that ran tools; a turn that only pulled context still restores with no block.

**C1 "Continue in X" (built, admin-only):**

- `continueInProjectTarget()`: offered when a global turn's finder picked exactly one project with
  p ≥ 0.7.
- `AgentMessageList` shows a chip under the latest finished global turn.
- `AgentChatModal.handleContinueInProject` calls `POST /api/chat/sessions/[id]/move-to-project`:
    - checks member access (`requireProjectMemberAccess`);
    - accepts global chats only;
    - refuses while a turn is queued or running;
    - is a no-op if the chat is already there;
    - sets `context_type='project'` and `entity_id`.

    The client then mirrors a context shift (selected context, project focus, session). The
    session's messages stay; the next turn runs as a project chat.

- **Not verified live:** what the first project turn after a move feels like (history and prompt
  prewarm). Needs one real turn.

**Checks:**

- 9 new tests: turn-card rule, move endpoint (5), chip render (2), restore (1);
- the affected suites pass;
- web `check` reports 0 errors across 10,037 files;
- lint is clean.

**B, steps 1–2 (built, uncommitted; no finder files touched):**

- The working set moved to `packages/agentic-chat-runtime/src/working-set/` (new subpath
  `@buildos/agentic-chat-runtime/working-set`: package exports, build entries, source aliases).
  The lab file re-exports it and keeps only its keep and cont line parsers.
- `buildTurnWorkingSetV1()` turns a finished turn's tool calls into pointers:
    - carried: sections read (`read_document_section` anchors), records opened in detail and
      short docs read whole, and records created or updated (not docs);
    - only the chat's own project;
    - searches and lists don't count.

    `readTurnWorkingSetV1()` validates a stored set.

- The worker finalizer adds `working_set` to `last_turn_context` on project-chat turns
  (`LastTurnContext.working_set?: Json` in shared-types). It stays inert until step 3 reads it.
  **Needs a worker deploy.**
- Checks:
    - 9 runtime tests;
    - lab 56;
    - worker executor and control 184;
    - the worker typecheck is clean;
    - web `check` reports 0 errors.
- **Next (step 3, blocked):** reload in `ChatContextFinder.find` once tracker 150/152 commits
  `finder.ts`/`select.ts`/`evidence.ts`/`load.ts`; then pass `carriedIn` from the loaded set
  into the finalizer so unused items fade.

**B, step 3 (built, uncommitted): carry is live behind `AGENTIC_CHAT_CARRY_USER_IDS`.**

- **Worker `ChatContextFinder`:**
    - reads the session's latest `last_turn_context.working_set` beside the project load
      (`loadSessionWorkingSet` in bootstrap);
    - checks its ids against the project index (`planTurnCarry`; titles and anchors come from
      the index, never from the stored set);
    - reloads the section and record text (`loadContextFinderPlanText` extraIds), beside the
      Jev ranking;
    - puts "Carried from last turn" first in the injection (`renderTurnCarry`, 10k-char budget);
    - passes carried ids as `skipIds`, so Jev doesn't rank them again.
- **`context_selection`:** carried items are chips with `carried: true` (shared-types parser),
  plus `carry_in` pointers. The executor keeps `carry_in` on `terminalContext.carriedIn`, and the
  finalizer fades items the turn didn't touch (`buildTurnWorkingSetV1` carriedIn). Item versions
  aren't tracked, because text always reloads from the current index.
- **Turn card:** a "Carried from last turn · Worklist › Group 1" row (↻). "Pulled in" counts only
  this turn's picks.
- **Checks:**
    - runtime working-set 11;
    - worker finder 17 (2 new);
    - executor, control, global and config 215;
    - bootstrap and composition 50;
    - web cards and block 26;
    - lab and sort 69;
    - worker typecheck clean;
    - web `check` 0 errors;
    - lint clean.
- **To turn on:** set `AGENTIC_CHAT_CARRY_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435` (DJ) on
  the Railway chat worker, then deploy the worker and web.
- **Known limits:**
    - the carry sits inside the finder's 2.5 s deadline (a timeout drops it for that turn);
    - project chat only;
    - a Stop or failed turn writes no new set (the next turn reads the last good one);
    - no finder-skip on pure follow-ups yet (v2: Jev `continues_prior`).
- **Not yet verified live:** the two-turn follow-up (paid, needs DJ's OK). Compare time and prompt
  tokens with the flag on and off.

## Phases

- [x] **A. Cards** (lean; built 11-05, uncommitted): `deriveTurnCards()` in web, cards inside
      `ThinkingBlock` (admin-only), finder row "Pulled in N of M". Web only.
- [x] **B. Carry** (built 11-05, uncommitted; off until `AGENTIC_CHAT_CARRY_USER_IDS` is set): the working set moves to the runtime; it is built at finalize into
      `last_turn_context` and reloaded in the worker's `ChatContextFinder` with
      `carried: true` items. Waits for the tracker 150/152 commit.
- [ ] **A+. Restore + changes in card** (~2 d).
- [x] **C1. Global pick visible** (chip built 11-05, uncommitted; `pieces` deferred to C2): `pieces` on the workspace finder output and a "Continue
      in X" handoff. No new plan call.
- [ ] **C2. Parallel read-only scouts** (~4.5 d, gated on data): `prepareChild` reads, pinned
      access, ordinal `threadKey`, a child pool, findings handed to the parent's normal loop.
- [ ] C3. Writing children (12–15 d): not planned.

<!-- tasker/153-threads-in-real-chat.md -->

# 153 — Threads in real chat (cards, carry, project split)

**Opened 2026-11-05 (DJ).** Move the lab's three ideas onto the real agentic chat engine instead of
growing the lab engine. Plan v2 (after four step reviews):
[`docs/architecture/THREADS_IN_REAL_CHAT_2026-11-05.md`](../docs/architecture/THREADS_IN_REAL_CHAT_2026-11-05.md).
This supersedes the lab-engine work in [151](151-carry-turn-context-forward.md) and
[152](152-robust-threads.md); their pieces move into the shared runtime.

## Status (2026-11-06) — A, C1 (be960b5b2) and B carry + 4 s deadline (024d1eb5d) committed; `AGENTIC_CHAT_CARRY_USER_IDS` set on the chat worker 11-06 (DJ only); live two-turn check pending (paid)

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
    - the carry sits inside the finder's 4 s deadline (a timeout drops it for that turn);
    - project chat only;
    - a Stop or failed turn writes no new set (the next turn reads the last good one);
    - no finder-skip on pure follow-ups yet (v2: Jev `continues_prior`).
- **Not yet verified live:** the two-turn follow-up (paid, needs DJ's OK). Compare time and prompt
  tokens with the flag on and off.

**Live carry check (2026-11-06, DJ approved, $0.014, Wishlist Finder chat `4a741cb4…`):**

- **Turn 1** ("freshly inspected leads?"): 5.2 s, 2 passes.
- **Turn 2** (follow-up): 7.2 s, 3 passes.
- **Worked:**
    - the task carried in;
    - the card showed "↻ Carried from last turn · Review graphics cards…";
    - the finder took 550 ms;
    - the task faded to idle 1.
- **Bug:**
    - The document carried as "whole, 0 chars". `read_document_section` answers one section as a
      top-level `anchor`/`heading`/`content` (also when the other anchor was nested inside it),
      and the builder only read `sections[]` and a nonexistent `text`.
    - On turn 2 that bad item merged with the new section read and wiped its anchors.
    - Turn 2 re-read "Freshly inspected leads".
- **Fixed (uncommitted, runtime `working-set.ts`):**
    - all three tool shapes are parsed;
    - a carried doc whose anchors no longer exist is dropped, not widened to the whole doc;
    - a merge over budget keeps this turn's sections;
    - nested carried sections send their text once.
- **Checks:**
    - replaying the real tool rows now gives turn 1 → the scan section (7,841 chars) and
      turn 2 → leads + gaps (5,111);
    - runtime 15, worker finder 17, lab 55.
- **Rerun after the worker deploy** (needs DJ's OK, about 1.5¢). Superseded by the hard test below.

**Hard carry test (2026-11-06, DJ approved, $0.208, fix live in e1a011d73):**

- **Setup:**
    - test project "Carry test — GPU research" `c9fdce72…` with a copy of the GPU doc (`15c6452a…`) and task (`4c664047…`);
    - every RTX 3090 mention was removed, so the used 3090 is the planted answer for the research step;
    - chat `af9c5088…`.
- **Results:**

    | #   | Message                                   | Time   | Cost   | Result                                                                                                                                                                                                                         |
    | --- | ----------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | 1   | freshly inspected leads?                  | 8.4 s  | 0.56¢  | right answer; finder injected only 934 of 5,000 chars for the 2 picked sections, and the chat said it "couldn't open that section" without trying; carry = task                                                                |
    | 2   | best VRAM per dollar of those?            | 5.0 s  | 0.63¢  | pass; the task carried in; carried out 4 revised sections                                                                                                                                                                      |
    | 3   | compare to the first time?                | 10.6 s | 0.88¢  | pass: kept the old and new lists apart; carried in all 4 sections; also opened the whole doc for no reason; the revised sections were dropped by the 10k overflow rule                                                         |
    | 4   | note on the task that "it's" my top pick  | 32.3 s | 2.17¢  | **fail**: asked which card instead of resolving "it" ($350 4060 Ti); no wrong write                                                                                                                                            |
    | 4b  | "The $350 4060 Ti."                       | 10.4 s | 0.87¢  | correct task update; the task carried in                                                                                                                                                                                       |
    | 5   | why did the MSI one get dropped?          | 9.2 s  | 0.78¢  | pass: "wasn't dropped for failing the requirement" (it's a conditional alternative); re-read 3 times                                                                                                                           |
    | 6   | web search for missed options, add to doc | 47.7 s | 14.95¢ | **partial**: 8 searches; found the planted used 3090 ("cheapest path to 24GB"); saved a clean new section (original intact); **broke NVIDIA-only**: led with AMD/Intel (RX 9060 XT "default pick"); called A5000 "not cheaper" |

- **Carry:** works across messages (doc sections 2→3, 5→6; task 1→2, 4→5).
- **Cost:**
    - 8 Tavily searches = 12.8¢;
    - models = 8¢;
    - the estimate was about 12¢.
- **Open:**
    - msg 1 finder under-injection;
    - the NVIDIA rule lives only in the old "Confirmed request" section, which msg 6 never loaded;
    - "it" resolution on short write follow-ups.
- **Scripts:** `report.sh`/`wait.sh` in the session scratchpad (not in repo).

**Follow-ups (2026-11-06, uncommitted):**

- **NVIDIA miss = the rule never reached the model:**
    - The rule's only explicit statement ("Add a standalone desktop NVIDIA RTX graphics card") is in the old "Confirmed request" section, under the H1 marked "superseded".
    - Msg 3 read it, but it had faded from the carry by msg 6; msg 6 carried only the revised scan + held/excluded (7,559 chars, rebuilt offline).
    - In that text NVIDIA appears only as the "NVIDIA comparison" link; every target is RTX, but nothing says NVIDIA-only.
    - Msg 6 opened the outline and saw the heading but didn't read it.
    - The prompt snapshot can't show this, because it is taken before the finder injects.
    - Side finding: the appended research section landed at the end of the doc, i.e. under the "superseded" H1.
- **Msg 1 bug fixed:**
    - Chat finder docs are cards by design (tracker 152: 934 chars = the card, which says to read the flagged sections with `read_document_section`).
    - Jev tool selection runs before the finder returns and scored that tool 0.24 (< 0.3), so it was never mounted. The chat honestly "couldn't open that section".
    - Fix:
        - `ChatContextFinding.toolPins` (project + workspace finders set `get_document_outline`/`read_document_section` when any injected item is a document);
        - `mountToolPins()` in `jev-tool-selector.ts`, called in `turn-provider.ts` after the injection (canonical order, held writes stay held, one system line).
    - Tests: worker selector + finders + turn provider 182 + 30 pass; typecheck clean. **Needs a worker deploy.**
- **Turn cards opened to every user:** dropped the admin check in `AgentMessageList.svelte`. "Continue in X" stays admin-only (new test). Web list/block tests 27 pass. **Needs a web deploy.**

**Finder deadline raised from 2.5 s to 4 s (DJ, 2026-11-05):** the carry rides inside it. Worker
finder tests: 26 pass.

**C2 data gate (2026-11-05), result: don't build now.**

- **Last 30 days, completed turns:** 17 global (all DJ), 16 project.
- **Global turns touching 2 or more projects:** 4 (p50 41.9 s, p90 51.3 s), 0 with writes.
    - 3 were cross-project restructuring ("merge my Cadre projects", combine/parent proposals):
      the job is comparing projects side by side, which isolated per-project scouts can't do.
    - 1 was "where am I at with things?" (portfolio).
- The lab's case (a brain dump across several projects with changes in each) doesn't appear in
  real traffic yet. Revisit if it does.
- **Where the slow global turns spend time** (`llm_usage_logs` by turn):
    - about 5–6 model calls, with model time ≈ turn time;
    - the acting passes on DeepSeek V4.1 Flash/BaseTen write **2.5k–6.5k completion tokens each**
      (8–18 s per pass), most likely hidden reasoning;
    - prompts are 25–39k tokens per pass.
- **Output length is the bottleneck, not threads.** The reasoning A/B on 10-17 kept the default.
  This is a separate decision for DJ.
- **Correction (11-06):** those slow multi-project turns all ran 10-16 to 10-19, before the 10-17/18
  speed waves. Since 10-25 (14 turns): global p50 10.5 s, project p50 11.6 s. The slow ones left
  are big jobs (research plus three new docs, 61 s, 9 passes; a long pasted doc written out, 91 s,
  2 passes). Reasoning is about 55% of chat output on Together and 80% on BaseTen
  (`llm_usage_logs.reasoning_tokens`), but the 10-17 A/B already tested less reasoning
  (`off_after_reads` lost a real case). There's no speed project to open here now.

**A+ "change cards inside the turn card": skipped.** Write steps already show in the card's rows,
and doc/table cards keep their Undo below the reply. Moving them would detach Undo state
(per-message) for mostly cosmetic gain.

## Phases

- [x] **A. Cards** (lean; built 11-05, uncommitted): `deriveTurnCards()` in web, cards inside
      `ThinkingBlock` (admin-only), finder row "Pulled in N of M". Web only.
- [x] **B. Carry** (built 11-05, uncommitted; off until `AGENTIC_CHAT_CARRY_USER_IDS` is set): the working set moves to the runtime; it is built at finalize into
      `last_turn_context` and reloaded in the worker's `ChatContextFinder` with
      `carried: true` items. Waits for the tracker 150/152 commit.
- [x] **A+.** Restore of "Pulled in" done; changes-in-card skipped (low value, Undo risk).
- [x] **C1. Global pick visible** (chip built 11-05, uncommitted; `pieces` deferred to C2): `pieces` on the workspace finder output and a "Continue
      in X" handoff. No new plan call.
- [ ] **C2. Parallel read-only scouts** (gate ran 11-05: NOT NOW, 4 multi-project turns/30 d, mostly comparisons): `prepareChild` reads, pinned
      access, ordinal `threadKey`, a child pool, findings handed to the parent's normal loop.
- [ ] C3. Writing children (12–15 d): not planned.

**Battery on the new flow (2026-11-06, commit 7fe44502c, DeepSeek V4.1 Flash, paid with DJ's OK):**

- Setup: harness account (`76c04859…`) added to `AGENTIC_CHAT_CARRY_USER_IDS` on the chat worker
  (DJ approved), so its follow-ups run with carry. Case 4's follow-up loaded the task from carry
  in all 3 repetitions and passed.
- **Main (Cedar House): 49/52, 23.4¢.** 12 of 13 cases 4/4, including calendar (10) and time
  zones (11), which failed on 10-19. Case 1 rep 2 failed "found 2 projects": the chat made one
  create in every rep (same receipts); rep 1's project was still in the account when rep 2
  started (rep 2 `before` lists it; earlier runs always started rep 2 empty). The harness
  teardown of rep 1 didn't take, with no warning logged; cause not found. Not a chat regression.
- **Workspace: 22/24, 10.5¢.** Case 5 (broad opener "where am I at with things?") scored 2/5 in
  all 3 reps. Every rep got the overdue lease, oven due tomorrow and passport due today right.
  Marked down for:
  (a) listing the account's real Google Calendar events: the rubric's fact list has no
  calendar, so the judge calls them invented (rubric gap);
  (b) made-up dependencies ("the oven and menu sit behind the lease");
  (c) "three days old";
  (d) rep 1 raising an earlier test chat's community-garden request as possible open work.
- The harness account's calendar is DJ's own Google Calendar; DJ is fine with that (11-06).

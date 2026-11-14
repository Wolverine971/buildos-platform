<!-- docs/architecture/THREADS_IN_REAL_CHAT_2026-11-05.md -->

# Threads in real chat: cards, carry, project split (2026-11-05)

**Status:** plan v2, revised after four step reviews (§9). Nothing is built. Tracker:
[153](../../tasker/153-threads-in-real-chat.md).

## 0. The decision this plan follows

The `/lab/chat` prototype grew its own small chat engine: 2 read tools, unsaved "decision lines",
and its own budgets, retries and timeouts. Real chat already has about 50 read tools (calendar,
email, web, tables) and 43 write tools, with crash-safe saves and Undo. Each robustness fix in the
lab was rebuilding what real chat already has.

DJ agreed (2026-11-05): **stop growing the lab engine and move its three ideas onto real chat.**

1. **Cards.** Each turn shows what it carried, what it looked through, what it read and what it
   changed, grouped by project.
2. **Carry.** The next turn starts from what the last turn actually used, without re-reading it.
3. **Project split.** A message about several projects gets one focused agent per project, in
   parallel.

Real chat keeps one engine. The lab stays as the free replay harness and design sandbox.

**Evidence behind the order:**

- **Most chats are inside one project.** In the last 30 days, 89 of 101 real chats were
  project-scoped, 11 were global and 1 was project-create. Cards and carry help every chat. The
  split only helps the global ones.
- **The lab thread lacked the right tools.** DJ's calendar question in the lab read goals and
  milestones, because a lab thread has no calendar tool. Real chat has one.
- **Global chat already picks projects.** It runs a fast project-picking call on every turn: the
  workspace finder, about 0.66 s at p50 and 96% correct
  (`docs/architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md`). The lab planner misrouted 2 of 8 pieces.
  The split builds on that existing pick and doesn't add a second planner.

**Sources:**

- two read-only code investigations (step streaming, UI and carry; the worker loop for children);
- four adversarial step reviews (§9);
- `TURN_ENGINE_2026-11-05.md`.

Paths are `apps/worker/src/workers/agentic-chat/…` unless they start with `packages/`, `apps/` or
`supabase/`.

## 1. What real chat has today (the parts we plug into)

- **Every step, live and saved.**
    - Each event is written to `chat_turn_events` and broadcast on the user's private channel, in
      one envelope, `AgentStreamEventV1`.
    - Every tool call is also kept in `chat_tool_executions`.
    - Turn events are deleted 7 days after a turn ends; tool executions after 30 days.
- **What the browser gets on reload.** Step rows are rebuilt from `chat_tool_executions` plus
  the message's tool trace (`buildRestoredToolBlock`,
  `apps/web/src/lib/components/agent/agent-chat-session.ts:659-812`). Turn events never reach the
  browser after a reload.
- **The finder's picks.** A `context_selection` event: in project chat, the items it pulled in;
  in global chat, the projects it picked (`projects[]` with id and name). The web hides it today
  (`agent-chat-sse-handler.ts:899-902`).
- **Step rows.**
    - `agent-chat-tool-presenter.ts` turns calls into `{verb, target}`.
    - It already resolves each step's project from the arguments, then the nested result, then
      the session (`resolveProjectId`, `:2147-2170`).
    - `tool_result` carries a structured `tool_category`.
- **Change cards.**
    - Document and table cards have Undo, and there are created-entity chips. They are separate
      messages added when the turn ends.
    - Proposal cards (7-day Undo) can name several projects.
- **Context into the next turn.**
    - `last_turn_context` holds a short summary, entity ids and tool names.
    - Earlier read results are dropped, so documents are re-read every turn.
    - The project context finder runs **in the worker** on every turn's opening pass
      (`provider/turn-provider.ts:413`).
- **Write safety.**
    - The effect ledger, write fence, lease, 300 s budget and Stop.
    - One write contract and one completion receipt per turn, both derived from the turn's
      ordered tool executions at finalize.
    - Recovery requeues a turn only if it never started. A started turn that dies is marked
      failed and never replayed.
- **Mobile** uses the same event contract. New event types and new optional fields are ignored.

## 2. Phase A: cards (about 2.5 days lean, 4–5 days full)

**Goal:** the lab's card look on real chat turns, built from data that already exists. Web only,
with no worker change.

```
┌ Wayne Strategies ─────────────────────────────────────────┐
│ Carried from last turn   Worklist › Group 1 · Griffin     │  ← Phase B
│ Pulled in 3 of 9         Worklist, Griffin, Q4 plan        │  ← context_selection
│ Searched "Cutlass reminder"                      2 found   │
│ Read     Worklist › Group 1                                │
│ Checked  calendar, Mon–Fri                      4 events   │
│ Changed  Griffin → in progress, due Mon                    │
└──────────────────────────────────────── Worked 6.2 s ──────┘
```

**How:**

1. **A pure function,** `deriveTurnCards(activities, selection, sessionProject)`, in
   `packages/agentic-chat-client` so mobile can reuse it later.
    - Live and restored step blocks both carry the arguments and results, so one function
      serves both.
    - It is tested on recorded fixtures.
2. **Grouping rules:**
    - A project chat (89% of chats) gets exactly one card.
    - A global chat seeds its cards from the finder's `selection.projects`, which arrive before
      any tool runs.
    - Each step goes to the card of the project the presenter's `resolveProjectId` finds.
    - When there is only one card, steps with no project (web, calendar, email) fold into it.
    - Steps that span projects (`search_all_projects`, unscoped lists, workspace overview) go to
      an "Across projects" row.
3. **Row kind** comes from the structured `tool_category`, not tool-name patterns.
4. **Labels:**
    - the finder row says "Pulled in M of N" (not "used", which Phase B defines differently);
    - one time per turn, not per card;
    - rows fold to one summary line per card by default.
5. **A new real-chat `TurnCard.svelte` on Inkprint tokens.** It isn't extracted from the lab,
   whose card is a snippet over lab-only types and is being edited by another session.
6. **Flag** `…_TURN_CARDS`, DJ first. The old ThinkingBlock stays as the fallback.

**Lean v1 (2.5 days):**

- The "Pulled in" row is live only.
- Change cards stay where they render today, below the reply.

**Full (adds 1.5–2.5 days):**

- **Restore.** The session GET returns `contextSelections` keyed by turn id, so the row survives a
  reload for 7 days. Optionally, save a compact card summary on the assistant message so it
  survives indefinitely; that's about 1 day plus a worker deploy.
- **Changes inside the card.** Built from the turn's receipts, with Undo state in a map. Proposal
  cards stay below the reply, since they can span projects.

**Mobile:** later. The contract is unchanged.

## 3. Phase B: carry, in the worker (about 4 days)

**Goal:** a follow-up starts from what the last turn used, shown as "Carried from last turn", and
the agent doesn't re-read it. The lab measured turn 2 dropping from 22 s to 11 s and from $0.0049
to $0.0013. Most of the time win comes from fewer reading rounds by the acting model.

**Where:** inside the worker's `ChatContextFinder.find`. It isn't in web prep, because:

- the finder runs in the worker;
- the web hook only runs on prepared-prompt misses;
- `applyContextPlanEdits` can't carry section anchors.

**How:**

1. **Move the lab's pure working set into `packages/agentic-chat-runtime/src/working-set/`:**
   `buildWorkingSet`, `planRehydrate`, the budgets and their tests. The lab imports it from there.
   _1 day._
2. **Build it at finalize** (`turn/turn-finalizer.ts`, which has every execution and its
   arguments). Store it as an extra key in `last_turn_context`. The SQL only checks size,
   `entities` and `summary`, so there is no migration. "Used" means:
    - sections read (document id plus anchors from the arguments);
    - records written;
    - the answer's own entity chips.

    The `entities` map doesn't count, because it includes every search result. A document read
    whole carries its outline only. _0.5 day._

3. **Reload on the next turn, in `ChatContextFinder.find`:**
    - start a working-set loader beside the project index load (the latest `last_turn_context`
      for the session and user, outside the Jev deadline);
    - run `planRehydrate` against the index, which drops any id not in this project;
    - load the carried text with `loadContextFinderPlanText({extraIds})`;
    - render the lab's carried block ahead of the evidence, with no 2,000-character section cap
      and a note that says "already loaded, don't re-read";
    - pass the carried ids as `skipIds` so nothing loads twice.

    _1–1.5 days._

4. **Show it through the existing event:** carried items get `carried: true` in the
   `context_selection` payload, and Phase A's card shows the "Carried from last turn" row. No new
   event type. _0.5 day, with the flag `…_CARRY`._
5. **Decay rule:**
    - a carried item stays while it is re-read, written or named in the answer;
    - otherwise it drops after 2 turns;
    - budget 10k characters;
    - a Stop or failed turn keeps the previous working set instead of wiping it.
6. **"Updated since last turn"** uses the project index's `version`. Carried text is always
   reloaded from the database, so it is never stale.

**Not in v1:** skipping the finder's search when the subject continues. No structured signal
exists, and the search runs alongside tool selection, so skipping saves money, not time. v2 can add
a `continues_prior` field to the Jev tool-selector output and measure it.

**Scope:** project chat only. Global chat already carries its project focus (`loadPreviousFocus`).

**Order:** after the tracker 150/152 commit, because `finder.ts`, `select.ts`, `evidence.ts` and
`load.ts` have uncommitted edits from that session.

**Paid check (needs DJ's OK):** a DJ-only two-turn follow-up on the acting model, comparing time
and prompt tokens before and after.

## 4. Phase C: project split, staged

### C1: the global pick becomes visible and actionable (about 2 days)

- **No new plan call.** The workspace finder's pick (up to 3 projects) is the split.
- **Pieces:** add an optional `pieces` field (`{project_id, quote}`) to the same finder call and
  to `context_selection.projects`, so cards and C2 know which part of the message went where. Old
  clients ignore it.
- **One project picked with high confidence:** offer **"Continue in Wayne Strategies"**, which
  moves the session into a real project chat through the existing handoff
  (`persistSessionHandoff`, `turn/turn-run-services.ts:225`, plus the context shift). The next
  turn gets that project's prompt, tools (about 22 more than global) and finder.
- **Pinning a global turn in place is out.** The tool list is fixed when the web admits the turn,
  so a pin only narrows it. Searches bypass the access port, and the global prompt lists every
  project.
- **To verify:** that the handoff keeps the conversation history.

### C2: parallel read-only project scouts (about 4–5 days, gated on data)

**What:**

- When the finder picks 2 or more projects, the worker runs one **scout per project** in
  parallel. The trigger is code, not a tool the model may skip.
- Each scout is the **same provider loop** (`prepareChild`, as in `TURN_ENGINE` §5.3 steps 1–3)
  with:
    - ontology and calendar reads only;
    - its own `ProjectPinnedAccess`;
    - trimmed history: its pieces, the message and `last_turn_context`.
- Scouts return `{answer, refs, proposals, questions}`. The parent's **normal loop** then runs
  with those findings as a system block. It answers, writes, reviews and records Undo under
  **one** contract, exactly as today. The parent's reply replaces the lab's `composeTurnReply`.

**Why read-only first.** Writing children would need:

- a write contract and completion receipt per child;
- per-child access caching;
- splitting the event stream.

The review estimated that at 12–15 days. It also turns a misroute into a write to the wrong
project.

**Plumbing scouts need:**

- **Ids:** an ordinal `threadKey` in usage and prompt-dump ids. It isn't derived from the project
  id, because a hand-back child can target a project that already ran.
- **Pool and timing:** a child sub-pool that bypasses `capacity.acquire`, using the workflow
  lane's group abort and `allSettled`. Each child gets its own deadline: the earlier of start +
  120 s and the parent deadline − 60 s. No live preview for children.
- **Saving steps:** each scout is saved as one synthetic read execution (the parent reserves its
  sequence) holding its step list, so its card survives a reload. Live scout steps are broadcast
  as progress with `thread_key` and `project_id`.
- **Failure:** one scout failing or timing out leaves a "couldn't check X" line. The parent
  continues.
- **Unchanged turns:** single-project and no-project turns must stay byte-identical, proven by a
  recorded-request test.

**Gate:** ship A + B + C1 first. Then count, over real global chats, how many touch 2 or more
projects and how slow they are today.

### C3: writing children (12–15 days)

Only if C2's data shows the parent's serial writes are the bottleneck. It is not planned.

## 5. Order and size

| Phase                   | Days | The person sees                                                    | Depends on                |
| ----------------------- | ---- | ------------------------------------------------------------------ | ------------------------- |
| A. Cards (lean)         | 2.5  | Card UI on every real chat, DJ first                               | nothing                   |
| B. Carry                | 4    | Faster, cheaper follow-ups; the "Carried from last turn" row       | A, tracker 150/152 commit |
| A+. Restore + changes   | 2    | Cards look the same after a reload; Undo inside the card           | A                         |
| C1. Global pick visible | 2    | Per-project cards in global chat; "Continue in X"                  | A                         |
| C2. Parallel scouts     | 4.5  | Multi-project messages checked in parallel, each with its own card | C1 + data gate            |

- **A + B (about 6.5 days)** is the first real ship: every chat gets cards, and follow-ups get
  faster.
- **The whole plan through C2 is about 15 days.**
- Flags work as kill switches per phase, DJ first.
- Free fixture and replay tests cover every phase.
- Live checks are DJ-only and need an OK each time; so does `agentic:prod-battery` (about $0.29
  on DeepSeek).

## 6. What happens to the lab

- It freezes as an engine: no new tools, budgets or retries.
- Its working set moves to the runtime in B.
- Its plan prompt and hand-back are retired; the finder's pick and the parent loop replace them.
- It stays as the free replay harness and design sandbox until C2, then runs on the real engine
  or is deleted.

## 7. Risks

- **Card noise:** rows fold by default, with one line per card.
- **Old chats:** the "Pulled in" row disappears after 7 days unless A+ saves a card summary.
  Cards for chats older than 30 days fall back to today's view.
- **Carry and tasker 150/152:** they share files, so B waits for that commit. Carried text needs
  its own "already loaded" note, separate from 152's "read flagged sections first".
- **C2 cost:** about N × (Jev + finder + 3–4 passes) + the parent. That's roughly 15–20 calls for
  3 projects, and each fanned-out turn counts as about N turns against the database and Realtime
  budgets. Fine at today's traffic.
- **Unconfirmed:**
    - that the handoff keeps history (C1);
    - that a hand-built read-only child surface decodes without artifact changes (C2);
    - the publisher's per-turn event limits under scouts (C2).

## 8. Decisions for DJ

1. **Order:** A → B → C1, then C2 only after the data gate?
2. **Global chat about one project:** show a "Continue in Wayne Strategies" chip, or move
   automatically?
3. **Old chats:** accept that the "Pulled in" row disappears after 7 days, or add about 1 day to
   save a card summary permanently?
4. **Mobile:** later? The contract stays compatible.

## 9. Review notes (2026-11-05)

Four read-only reviewers each checked one phase against the code.

- **A (cards):**
    - Restore doesn't use turn events, and turn events are deleted after 7 days.
    - The presenter already resolves projects, so the worker `project_id` field was dropped.
    - Change cards are separate messages with their own Undo state, so moving them is real work.
    - The lab card can't be shared.
    - Lean 2.5 days, full 4–5.
- **B (carry):**
    - The finder runs in the worker, not web prep.
    - `applyContextPlanEdits` drops anchors and the web hook misses prepared hits.
    - No "same subject" signal exists, so the skip moves to v2.
    - "Used" must exclude search results.
    - Built in the worker, it's about 4 days.
- **C1:**
    - Global chat already has a 96%-accurate project pick, so the plan call was dropped.
    - The worker can't turn a global turn into a project turn, so "Continue in project" replaces
      pinning.
    - Recovery never replays a started turn, so the "crash-safety" reason for `turn_plan` was
      wrong.
- **C2:**
    - The biggest collision is one write contract and receipt per turn.
    - It also missed the access-cache flip, event ids, shared read receipts, turn-fatal child
      errors, publisher limits, live preview, and `threadKey` collisions on hand-backs.
    - Writing children are 12–15 days; read-only scouts are 4–5.
    - Capacity throws instead of deadlocking.

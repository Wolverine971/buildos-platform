<!-- docs/architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-23; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Jev global context: know what we're talking about, across projects

Status (2026-09-23, evening): **built end to end, behind flags that default off; not deployed.**
DJ chose the ambitious route and added the dig gate: hop 1 always decides which projects, and
"are we looking for something specific that requires a search inside a project?" decides whether
hop 2 runs. Paid runs, both approved: $0.1356 (two-hop eval) + $0.0398 by receipts / $0.0207 by
credit counter (dig check). `pnpm agentic:gate` **not run** (needs DJ approval before injection
goes `on` for anyone).

## The problem

Project chat now gets Jev-selected evidence. Global chat, where DJ starts about 30% of sessions,
gets one line per project and nothing else.

- The real global messages are exactly the ones where "which project?" is the hard part:
    - "Logan wants a pistol shooting website… what project might this refer to?"
    - "Rod Chamberlain, Beyond Exit Planning, the Cody Shooting Complex, the Tacemus
      proposals… I don't know which project these fall under."
    - "the cadre newsletter introducing Erica Obisido", a voice transcription of "Eric
      Avvisato".
- Today's prompt names 0 of the 20 must-have records. The model spends 1–14 tool calls
  finding them.

## Design: two hops

```
message ─┬─ Jev tool selection (exists, ~0.35 s) ─────────────────────────┐
         └─ HOP 1: cards for every accessible project (titles, no bodies)  │
              one Jev call: scope choice + one score per project  ~0.45 s  │
              ├─ none      → load nothing (calendar, email, web, thanks)   │
              ├─ portfolio → pulse: START HERE "Current state" of top ≤8   │
              └─ projects  → zoom ≤3 at p ≥ max(0.3, 0.6 × top)            │
                   chips: "Looking in: Redline Training"  ◀── shown now ───┤
                   HOP 2: project finder inside each zoomed project,        │
                   in parallel, one evidence budget split by rank           │
                   (14K / 9K+6K / 7K+5K+4K chars) ──▶ evidence + record chips
```

- **Hop 1 is the "what are we talking about" moment.**
    - It routes on meaning: misspelled names, aliases ("Samos" → DJ Wayne Studio) and people
      who appear only in a task title.
    - The scope question keeps "thanks" and calendar turns from loading anything.
- **Hop 2 is the zoom.** It is the shipped project finder, unchanged, with a budget share.
- **Access.** Hop 2 can only load project ids that came back from the access-checked card load.
- **Fail-open.** Any failure keeps today's global prompt.

## Measured (full detail: the research README)

- **Quality, when Jev answers:**
    - scope 100% right;
    - must project zoomed 96%;
    - must records named 89%, loaded in full 72% (the labels undercount; see README).
- **Cost:** about $0.0015 per turn. It adds about 1.8K tokens of main-model input on average,
  and 0 on `none` turns.
- **Latency is the constraint.**
    - About 26% of Jev calls land in a 2–3 s slow lane, independent of size and of each other.
    - Built as-is (hop 2 = 2 sequential calls), the finder adds about **+1.3 s p50 / +3.3 s p90**
      to time-to-first-token, even hedged.

## Decisions

### DJ, 2026-09-23

- **Ambitious route.** Chips, the "Continue in <project>" button and global capture are all built.
- **Hop 1 is mandatory; hop 2 is optional and Jev decides.** The hop-1 call carries one more
  question, `dig`: _"Is `current_request` looking for something specific that requires a search
  inside a project…?"_
    - Hop 2 runs at `dig ≥ 0.5`.
    - Otherwise each focused project gets a **brief**: START HERE's current state, the next step,
      and a 14-record index with ids, so the model can open any record in one step.
- **"Another hop?" is already the shape.** Hop 3 exists inside hop 2 as the headings stage
  (sections of the top documents), so no new hop was added.

### Measured for the dig gate ($0.04, 16 scenarios × 3 reps, hop 1 re-asked with hedging)

- **Dig scores are stable across reps and separate cleanly:**
    - the 7 "search inside" scenarios scored 0.63–0.92;
    - the "project only" scenarios scored 0.11 (Phil demo), 0.09–0.14 (calendar, thanks and the
      web lookup);
    - "what's going on with 9takes" sat on the line at 0.49–0.51.
- **Default policy** (`floor 0.4`, `60% of top`, `≤3`, `dig ≥ 0.5`):
    - scope right 100%;
    - dig right 97%;
    - must project focused 95%;
    - controls clean 100%;
    - hop 2 ran on 46% of turns instead of 69%.
- **Hedged hop 1 on real calls:** 48/48 answered; p50 662 ms, p90 1,151 ms, max 1,312 ms.
  Unhedged it was 7 × 3 s timeouts.

### Decided here (technical, vetoable)

- **Hedging on.** The finder's Jev client sends a duplicate after 700 ms
  (`JevClient.hedgeAfterMs`; a fast 5xx hedges at once, a 4xx never does).
- **Timings.**
    - Hop 1 has a 2.0 s timeout.
    - Hop 2 calls have 1.3 s each, and hop 2 as a whole a 1.6 s window after hop 1; missing the
      window falls back to the brief.
    - The whole global finder has 3.5 s, then fails open.
- **Speculation.** Hop 2 for the previous turn's project starts alongside hop 1 (read from the
  last `context_selection` receipt), so follow-ups don't wait for two hops in a row.
- **Record titles stay in the cards, and the floor is 0.4.** See the first eval.
- **No embedding lane on the hot path.** Unchanged.

## What was built

| Piece                                                            | Where                                                                                                                            | Tests                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Hop 1 + dig + briefs + hop-2 deadline                            | `packages/agentic-chat-runtime/src/context-finder/workspace.ts`                                                                  | `workspace.test.ts` (33 in the folder)             |
| Card loader (accessible-projects RPC, titles, START HERE bodies) | `context-finder/load.ts` `loadWorkspaceFinderProjects`                                                                           | same                                               |
| Hedged Jev calls                                                 | `packages/smart-llm/src/jev-client.ts` `hedgeAfterMs`                                                                            | `jev-client.test.ts` (+3)                          |
| Worker global branch + chips payload + previous focus            | `apps/worker/.../provider/chat-workspace-finder.ts`; shared helpers in `chat-context-finder.ts`                                  | `tests/agenticChatContextFinderGlobal.test.ts` (9) |
| Flag                                                             | `AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL=off\|shadow\|chips\|on` (worker), same allowlist `AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS` | config/consumer tests                              |
| Payload fields                                                   | `packages/shared-types/src/context-selection.ts`: `workspace`, `projects`, item `project_id` (additive)                          | `context-selection-chips.test.ts` (+4)             |
| "Looking in" row + "Continue in <project>"                       | `ContextSelectionChips.svelte`, `AgentMessageList.svelte`, `AgentChatModal.handleContinueInProject`                              | web check 0/0                                      |
| Global chats feed projects                                       | `apps/worker/src/workers/chat/checkpoint/globalAttribution.ts`, `attributeProject` port, global sweep                            | `chatGlobalCaptureAttribution.test.ts`, capture +2 |

**"Continue in <project>"** needs no server route. It mirrors a server context shift on the
client: the next message carries the project context, `resolveSession` moves the session, and
the project RPC stays the authorization boundary.

**Global capture rule.** A batch of global turns feeds a project only when:

- every turn Jev tied to saved work named the **same top project at ≥ 0.7**;
- no turn had a second project that high.

Turns that needed no saved work are neutral. A portfolio turn, a mixed batch or a missing receipt
means no capture, as before. It is gated by `CHAT_CHECKPOINT_GLOBAL_USER_IDS` on the **general
worker**, which runs the sweep.

## Rollout (DJ first)

1. Deploy web + both workers at the same SHA. The payload is additive: an old web ignores the new
   fields and an old worker never sends them.
2. On the `agentic-chat-worker`, set:
    - `AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL=chips`
    - `AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS=255735ad-a34b-4ca9-942c-397ed8cc1435`

    Chips only, no injection yet.

3. Watch `llm_usage_logs` operation `agentic_chat_context_finder_global`, and `context_selection`
   rows (`elapsed_ms`, `workspace.dig`, `projects`).
4. With gate approval, set `on`: the model gets the block.
5. On the general worker, set `CHAT_CHECKPOINT_GLOBAL_USER_IDS=<DJ>` to let global chats feed
   projects. Check the first few Thinking log entries by hand.

## Other Jev opportunities in the global context

These are ranked by user value per unit of work. Each reuses hop 1's per-turn project attribution.

1. **Global chats feed projects.**
    - Checkpoint capture skips sessions with no project (`checkpointCapture.ts:253`).
    - Next-step regeneration skips global sessions (`chatSessionActivityProcessor.ts:195`).
    - So what DJ says in global chat never reaches START HERE. With hop 1's attribution per
      turn, capture can route each turn's learnings to the right project. "Talk anywhere; it
      lands in the right place" is the thinking-environment promise.
2. **Dedupe before create.**
    - The job-search to-do dump would re-create tasks that already exist; hop 2 names them first.
    - The same guard fits brain-dump capture and project creation (the tasker 92
      duplicate-project incident).
3. **"Continue in <project>".**
    - When hop 1 is confident about one project for two turns, offer a one-click move into
      project focus with START HERE loaded.
    - Today, switching resets the conversation; `persistSessionHandoff` already moves a session
      after project creation.
4. **Portfolio pulse.**
    - "What's going on with my projects?" is DJ's most common global message (12+ sessions).
    - `portfolio` scope returns START HERE current state for the most relevant projects instead
      of index lines.
5. **Honest "not found".**
    - When nothing clears the floor, the block says so, so the model reports it instead of
      running 5+ searches.
6. **Calendar and email attribution.**
    - Hop 1 over a calendar event or email subject links it to a project. The NAACCC lunch
      scored DJ Wayne Studio highest, because its next step is the chamber luncheon.
    - The Gmail relevance code already builds per-project profiles.

## Landmines

- **`onto_search_semantic` doesn't scale.** It orders the HNSW scan over all users' embeddings
  (`LIMIT 400`, `ef_search` 200) before filtering to the caller's projects. As the corpus grows,
  a small user's hits get crowded out. It needs iterative scan or a per-tenant prefilter before
  anything relies on it for recall.
- **The card load has no worker path yet.** The worker's service client bypasses RLS, so the card
  query must scope to accessible projects itself (owner or active member), mirroring
  `get_onto_project_summaries_v1`.
- **Jev 5xx.** 3 of about 290 calls returned 5xx. The production client's `retryOnce` covers them,
  and hedging supersedes it.

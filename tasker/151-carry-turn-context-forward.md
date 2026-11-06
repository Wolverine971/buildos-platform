<!-- tasker/151-carry-turn-context-forward.md -->

# 151 — Carry turn context forward (a working set between chat turns)

**Opened 2026-11-05 (DJ).** Found trying the "chat with threads" lab (`/lab/chat`,
`apps/web/src/lib/server/thread-chat/`). Builds on [150](150-outline-first-document-context.md)
(documents load as outlines; text only on request). 150's files belong to another session.

## Status (2026-11-05, end of day) — LEAN BUILT + LIVE-VERIFIED, UNCOMMITTED

**Result (DJ's two 9takes messages, live, DeepSeek V4 Flash):** message 1 **40 s → 20.1 s**;
follow-up **22.4 s → 10.9 s**, 7 → 4 calls, $0.0049 → **$0.0013**, 72k → 20k prompt tokens.
Exit target (follow-up ~15 s, 4–5 calls, no rereads of unchanged items) is met.

What shipped in the working tree (lab only, `/lab/chat`):

1. Carry between turns: used sections and records carry as text, everything else is a "looked
   at before" note; visible on each thread card. Search skipped on pure follow-ups.
2. Fast zero-retention providers (Relace first; SiliconFlow, Mancer, Wafer ignored) and the
   decide round asked in words, so it stays on Relace with a warm cache.
3. Shared `streamText` now honors `providerRouting` (`packages/smart-llm`; it was silently dropped).
4. Reply: one-project turns show the thread's whole answer directly (no reply call); answers are
   never clipped; multi-project replies are told to copy answers word for word.

**Before it's done:**

- [ ] Commit (pathspec) and deploy web. The smart-llm change rides the web build.
- [ ] Optional ~$0.01 live rerun to see the direct reply on the 9takes follow-up (needs DJ's OK).
- [ ] Then decide whether to bring the working set to real project chat (Phase 2 below).
- Known: what gets carried depends on the thread's keep line, which varies run to run. The
  multi-project reply can still slip; it's a prompt rule, not a guarantee.
- Not built: tap to drop or pin a carried item.

Files: `apps/web/src/lib/server/thread-chat/` (`thread-chat-carry.ts` new + test,
`-thread`, `-core`, `.service`, `-replay`), `apps/web/src/lib/server/dump-sort/dump-sort-thread-core.ts`
(answer cap), `apps/web/src/routes/api/lab/thread-chat/+server.ts`,
`apps/web/src/routes/lab/chat/+page.svelte`, `packages/smart-llm/src/smart-llm-service.ts` (+test).
Checks: 25 lab tests + 14 sort tests, web check 0 errors, lint clean, smart-llm 76 tests.

## What DJ wants (owner spec)

> In the next turn, because we already made those data model calls, we pulled that information
> forward. I shouldn't have to reread those different things if I just had them on the previous
> turn. It should be like, "This is what we had last turn, this is what we loaded, and this is what
> we messaged. In this follow-on turn, do we need more information? Do we need less?"

> For the previous chat message, we scanned 5 documents … we only got information from these last 2
> documents. Pull those forward, and then just have a note: "We scanned 5 documents." … To answer
> the current chat, it might pull in more information, or it might even reread a previous document
> that it didn't need for the previous message.

> We should be building context and saving tokens as we get more specific about what we're doing.

Each turn ends by recording a **working set**:

- **Used:** the records and document sections the answer or the changes actually drew on. They
  come with their text to the next turn.
- **Scanned:** everything else the turn looked at. The next turn sees these as a one-line note,
  and can reread any of them.

The next turn starts with the used items already loaded and the scanned ones as a note. It can then
read more or drop items. Over a conversation, the context gets narrower; it doesn't reload from
scratch each turn.

## Measured: a live lab run on 2026-11-05 (DeepSeek V4 Flash; the baseline to beat)

| Turn                                                          | Threads | Calls | Cost    | Prompt chars | Time   |
| ------------------------------------------------------------- | ------- | ----- | ------- | ------------ | ------ |
| 1: 9takes + BuildOS                                           | 2       | 12    | $0.0074 | 44k          | 40 s   |
| 2: "Which of those five High priority posts is next after …?" | 1       | 7     | $0.0049 | 31k          | 23.4 s |

**Worked example: scanned vs used.**

- **Turn 1, 9takes thread.** The context finder picked 10 related records. The thread read 3: the
  Start Here doc (7.6k), the 01 — Worklist doc (50.5k, read whole and clipped to 9k) and the
  plan "Generic Content Rewrite" (4.2k). It **scanned 10 and used 3**.
- **Turn 2 (follow-up).** The thread:
    - rebuilt the index (70 tasks, 32 docs);
    - reran the context-finder pick (0.7 s);
    - **reread the same plan (4.2k), Worklist › Group 1 (4.8k) and Start Here › How to work a
      post (1.2k)**.

    That is about 10k characters of rereads, all of it read in turn 1. The decide step took 12.3 s.

- **Turn 1, BuildOS thread.** It read **the same task twice**, in two rounds (1.7k each). That's
  a duplicate inside a single turn.

Target: the same follow-up with **0 rereads of unchanged items, no context-finder call, and one
fewer model round**. Expect roughly 4–5 calls instead of 7, about 15 s instead of 23 s, and
prompt chars flat or lower.

## What each lab turn redoes today (code)

- **Index rebuilt per thread per turn.** `loadProjectIndex` runs 7 queries: project plus 6 record
  families, up to 300 docs and 400 tasks (`thread-chat-index.ts:82-106`). It is started from
  `startLoad` with no cache (`thread-chat.service.ts:243-257`).
- **Context-finder (Jev) pick rerun per thread per turn.** `findProjectContext` makes 1–2 ranking
  calls (`thread-chat-thread.ts:172-196`). Its input is only this turn's pieces, with no memory of
  what was picked before.
- **Reads redone.** Up to 4 reads, each clipped at 9k (`thread-chat-reads.ts:18`,
  `THREAD_MAX_READS`, `thread-chat-core.ts:34`). Nothing remembers reads across turns or within a
  turn, which is why the duplicate task read happened (`runRead`, `thread-chat-thread.ts:264-330`).
- **Memory is labels only.** `ThreadReport.read` holds strings like
  `"Channel plan › Schedule (Xk of Yk chars)"` (`thread-chat-core.ts:43-54`, `:298-300`).
  `projectHistory` passes the thread only saved / asked / answered, not what was read
  (`:83-98`). `buildReport` throws away the structured "used" data the decisions carried: an
  answer's `records` (resolved from `refs`) and each update/archive/covered `record`
  (`dump-sort-thread-core.ts:50`, `thread-chat-core.ts:469-498`).
- **Refs are positional.** `d0` and `t3` come from load order (`packets.ts:350-428`), and load
  order is `updated_at desc` (`thread-chat-index.ts:102`). An edit between turns can shift every
  ref. **Anything carried forward must be keyed by id** and mapped to the current refs.
- **History comes from the client.** The page sends the last 6 turns of reports, and the
  endpoint clips the strings (`api/lab/thread-chat/+server.ts:27-66`). Any text carried this way
  is text the browser could rewrite.
- **The stats line undercounts.** `promptChars` counts only round 0's system + user prompt
  (`thread-chat-thread.ts:229`). Tool results sent again in rounds 2–3 (up to 36k) are left out.
  Fix this before measuring anything.
- **Replay shows the same thing.** Turn 2 reruns Jev and rereads `Channel plan` whole after
  turn 1 read its Schedule section (`thread-chat-replay.ts:63`, `:146`).

## What real agentic chat carries today

| Mechanism                                                                                                                                                                                                       | Carries                                                                                                                                               | Gap                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `last_turn_context` event in `chat_turn_events`, written at finalize (`turn-finalizer.ts`) and read on the server (`last-turn-context.server.ts`)                                                               | 180-char summary, entity **ids + names** (≤8 per kind, the hint shows 4), tool **names**; budget 30k (`last-turn-context.ts:523-727`, `-budget.ts:7`) | No text, no sections, no used-vs-scanned distinction. Rendered as an "untrusted" hint, so the model rereads.                          |
| History window (`worker-turn-preparation.server.ts:645`, `history-composer.ts`)                                                                                                                                 | user/assistant text; tool results only for continuity tools (skill loads, clarifications, cards: `CHAT_CONTINUITY_EXECUTION_FILTER`)                  | **Earlier read results are dropped.**                                                                                                 |
| `context_selection` event per turn (`chat-context-finder.ts:280-330`)                                                                                                                                           | the finder's picks: ids, tier, p, section headings. This is already a "scanned" record.                                                               | The next project turn never reads it. Only the global finder uses the last one (`loadPreviousFocus`, `chat-workspace-finder.ts:118`). |
| Context finder every project turn (`chat-context-finder.ts:103-130`)                                                                                                                                            | reloads the listing and reruns Jev with the last 6 messages                                                                                           | Nothing remembers the earlier picks. The evidence block (5k, policy B from 150) is rebuilt each turn.                                 |
| **Phase C pins (designed, never wired):** `applyContextPlanEdits` (`context-finder/edit.ts`) plus session edits in `chat_sessions.agent_metadata.context_finder_edits` (`CONTEXT_FINDER_2026-09-22.md:181-188`) | pins load first and are exempt from the budget; drops are excluded                                                                                    | Used only by the Workflow Lab panel. **This is the hook a working set should reuse.**                                                 |
| Materialized prompt context cache (`materialized-context-cache.server.ts`, 2-min session cache)                                                                                                                 | the base project context                                                                                                                              | Not per-turn reads.                                                                                                                   |

**Prod data is thin.** In the last 60 days there were 53 read-tool executions; only 8 came after
a session's first turn, and 1 of those was a reread (read-only query, 2026-11-05). There were
11 context-finder turns in the 7-day event window, and 1 session had more than one turn. Real
chat can't show the problem with today's traffic, so the measurements come from the lab and from
DJ's own sessions.

## Proposed design

**1. Shape (per project, keyed by id, never by ref)**

```ts
type WorkingSetItem = {
	id: string;
	kind: 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';
	title: string;
	status: 'used' | 'scanned';
	anchors?: string[]; // document sections read; empty = whole/preview
	hash: string | null; // documents: content_hash; records: updated_at
	chars: number; // size of what was read
	lastUsedTurn: number;
};
type WorkingSet = {
	v: 1;
	turn: number;
	projects: Record<string, { items: WorkingSetItem[]; scannedCount: number }>;
};
```

**Store pointers, not text.** At the start of the next turn the server rehydrates the text for
used items. That costs one DB read (`read_document_section` by anchors, or the details tool),
run beside the index load, as the signed-in user. The expensive part is the model round (S8:
about 4 s each) plus the Jev call, not the database read. Storing pointers also means:

- a client can't inject text;
- no new copy of user text goes into an event table (check against `docs/privacy/DATA_INVENTORY.md`);
- the budget stays small.

**2. Deciding what was "used" (structured fields only, no regex over prose)**

- A record or section is **used** when one of the turn's decision lines names it:
    - an answer's `refs`;
    - the `ref` of an update, archive or covered line;
    - a doc it created.
- A read that no decision line cites becomes **scanned** (its note says "read, not used").
- Jev picks that were never read or cited are also **scanned**.
- **Optional:** the thread writes one more line, `{"op":"carry","keep":["d0"],"drop":["t4"]}`, to
  keep or let go of items itself. This is the "do we need more or less?" step, and the model
  makes it through a field it controls.
- **Real chat has no per-piece refs.** There, used = records the turn wrote to, plus entity
  chips in the answer (structured link markup), plus documents read this turn. Everything else
  in `context_selection` counts as scanned.

**3. Storage**

- **Lab:** a server-signed `carry` blob in the turn's `done` event, which the page sends back.
  Only ids, anchors and hashes; the server verifies each id through the user's RLS client.
- **Real chat:** a `working_set` event in `chat_turn_events`, written at finalize next to
  `last_turn_context` and read by the server like `loadSessionLastTurnContext`. Retention follows
  the turn events (7 days); after that the next turn simply starts cold.

**4. Staleness.** The index load already returns `content_hash` / `updated_at` for every record
(`thread-chat-index.ts:23`).

- **Hash matches:** rehydrate the text and mark it "unchanged since last turn".
- **Hash differs:** don't rehydrate. Mark it "changed since last turn, reread if needed". The
  turn's own writes cause this too.
- **Gone or archived:** drop it.

**5. Budgets and decay.**

- Carried text: **≤ 6k chars per project, ≤ 10k per turn.** Most recently used first; overflow
  becomes a note.
- An item not used for **2 turns** drops to the scanned note.
- The note is capped at 12 titles plus a count ("scanned 10, 3 shown").
- In the within-turn read cache, a repeated read returns "already read above" and doesn't count
  against the 4 reads.

**6. Who sees it.**

- **Planner:** one line per project in `historyBlock` ("working on: Worklist › Group 1, plan
  Generic Content Rewrite"). Each piece gets `"cont":true` when it continues that thread's work
  (a structured planner field).
- **Thread:** a `Carried from last turn` block with the text, before the index.
    - In the index, carried items show `↺` and scanned items show `·seen`.
    - The prompt says: don't reread carried sections; read new ones, or a scanned one, when the
      piece needs it.
- **Jev:** skipped when every piece in a thread is `cont`. Otherwise it runs, and the carried ids
  go in as pins (`applyContextPlanEdits`), so it only has to rank the new parts.
- **Real chat:** carried items become Phase C pins in the evidence block, and the scanned note
  rides the continuity hint.

## Lean vs ambitious (DJ picks)

- **Lean — lab only.**
    - The carry blob rides the lab's client history and the server rehydrates it.
    - Planner `cont`, the thread carry block, Jev skip, the within-turn read cache, and a fixed
      stats line.
    - About 1 day. On DJ's turn 2 it should remove about 10k of rereads, 1 Jev call and 1–2
      model rounds (about 23 s → about 15 s, 7 → 4–5 calls).
- **Ambitious — a shared runtime working set.**
    - `buildWorkingSet` / `rehydrateWorkingSet` go in `packages/agentic-chat-runtime`. The lab
      and real agentic chat both use them; real chat stores them as a `working_set` turn event
      and finally wires Phase C pins.
    - Every project follow-up in production chat stops redoing acting rounds for reads it already
      made (about 4 s per avoided round), and the evidence block narrows turn by turn.
    - About 3–4 days, worker + web deploy. A paid battery run is needed at the end (DJ's OK).

## Checklist

**Phase 0 — measure honestly (lab)**

- [x] `promptChars` counts every round's messages, including resent tool results
      (`thread-chat-thread.ts:229`).
- [x] The stats line adds: `carried Xk · rereads N (Yk) · new reads M · Jev skipped/ran`.
- [x] Per-thread step `Carried from last turn: 3 used · 7 scanned` shown on the page.

**Phase 1 — lab carry (lean)**

- [x] `ThreadReport` keeps the structured used set: ids from answer `records` and change
      `record`s, plus read anchors and hashes.
- [x] Within-turn read cache in `runRead` (same id + same anchors → "already read above").
- [x] `buildWorkingSet(report, reads, picks)` → used/scanned, with decay and budget (pure, in
      `thread-chat-core.ts`).
- [x] Endpoint: accept `carry`, verify ids against the user's projects, and drop anything unknown.
- [x] `rehydrate` in `thread-chat-reads.ts` (live + replay ports), run beside `loadProjectIndex`.
      Check the hash and mark changed items.
- [x] Thread prompt: carried block + `↺`/`·seen` markers in the index + the optional `carry` line.
- [x] Planner: working-on line + per-piece `cont`. Skip Jev when every piece is `cont`.

**Phase 2 — shared runtime + real chat (ambitious)**

- [ ] Move build/rehydrate/budget into `packages/agentic-chat-runtime/src/working-set/`.
- [ ] Worker finalize writes a `working_set` event (from tool executions + writes + answer chips +
      `context_selection`).
- [ ] Web turn preparation reads it (like `loadSessionLastTurnContext`), rehydrates, and passes
      pins to `ChatContextFinder` via `applyContextPlanEdits`.
- [ ] Continuity hint gains the scanned note. Check prompt-cache placement (stable prefix).
- [ ] Privacy doc line for the new event (pointers only).

**Free tests to add** (`thread-chat.test.ts`, replay, no model calls)

- [x] **Turn 2 reads fewer things:** replay turn 2 with turn 1's carry → 0 rereads of
      `Channel plan › Schedule`, Jev not called, `calls` lower than today's run.
- [x] **A stale doc is reread:** change the doc's `content_hash` between turns → the carried
      item is marked changed, the thread rereads it, and the stats show 1 reread.
- [ ] **A new doc comes in:** turn 3 asks about something new → Jev runs with pins, a new doc is
      read, and the old unused items decay to the note after 2 turns.
- [x] **Refs shift:** reorder records between turns → carried ids map to the new refs.
- [x] **Within-turn duplicate:** the same `read_record` twice → one read executed.
- [x] **Forged carry:** an unknown or other-user id in `carry` is dropped and no text is loaded.
- [ ] (Phase 2) runtime unit tests for build/rehydrate/budget, and a worker finalize test that
      the `working_set` event is written.

**Validate**

- `pnpm --filter @buildos/web exec vitest run src/lib/server/thread-chat` (free).
- Live lab rerun of DJ's two-turn 9takes conversation (paid, about $0.01; **ask DJ first**).
  Compare with the table above.
- Phase 2: `pnpm agentic:prod-battery` once (paid; ask DJ, name the acting model from
  `--preflight-only`).

## Exit

A follow-up turn on the same project rereads nothing it already had, unless that item changed.
Scanned items show as a note and can still be read. The stats line proves the savings against the
2026-11-05 baseline. DJ has picked lean or ambitious; if ambitious, real chat is deployed with the
`working_set` event and the battery is no worse.

## Check: does it save tokens and time? (2026-11-05, from `llm_usage_logs`)

Real per-call logs for the two baseline turns (all DeepSeek V4 Flash except Jev).

**Turn 2 (22.4 s, 71.6k prompt tokens, $0.0049), where the time and tokens went:**

| Step                                                 | Time       | Prompt tokens   | Cost              | Carry removes it?                        |
| ---------------------------------------------------- | ---------- | --------------- | ----------------- | ---------------------------------------- |
| Plan                                                 | 0.8 s      | 1.8k            | $0.0001           | no                                       |
| Jev, 2 stages                                        | 0.5 s      | **43.5k (61%)** | **$0.0018 (37%)** | yes, if every piece is `cont`            |
| Thread round 0 (asked for reads)                     | 1.4 s      | 6.5k            | $0.0009           | yes                                      |
| Thread round 1 (asked for more)                      | 5.5 s      | 9.4k            | $0.0006           | yes                                      |
| Thread round 2 (decide), **SiliconFlow at 18 tok/s** | **12.3 s** | 9.8k            | $0.0013           | no, but a fast provider takes it to ~3 s |
| Answer                                               | 0.7 s      | 0.5k            | $0.0001           | no                                       |

- **Tokens: yes, a big win.** When the carry covers what the turn needs, the thread drops to one
  round (~6.5k + ~3.2k carried ≈ 9.7k tokens instead of 25.7k), and skipping Jev removes 43.5k.
  Turn 2 goes from ~72k to ~12k prompt tokens (−83%) and ~$0.0049 to ~$0.0013.
- **Time: yes, ~8 s per follow-up** (two read rounds plus Jev). **But the biggest time cost is
  provider tail latency, not rereads.** Turn 1's 9takes decide round took 31.1 s on SiliconFlow
  (15 tok/s); turn 2's took 12.3 s (18 tok/s). Over 14 days of DeepSeek Flash calls, SiliconFlow's
  p10 is 15 tok/s vs Relace 68 and Crusoe 110. Real chat already pins a provider order
  (`apps/worker/src/workers/agentic-chat/host/config.ts:57-63`); the lab's `streamText` calls pass
  no `providerRouting`, so every round lands on a random provider. That also kills prompt caching:
  turn 2 got 0 cache hits on all three rounds because each round hit a different provider
  (Parasail → Relace → SiliconFlow). Rounds that stayed on one provider got 54–86% cache hits.
  **Pinning the lab to fast providers helps every turn, including the first; carry only helps
  follow-ups.** Do both.
- **When carry misses** (the follow-up needs something new), carried text rides every round as
  overhead: ~3k tokens × rounds, no time saved. Decay + budget keep that small.

**Design issues the numbers expose:**

1. **The 6k-per-project budget can't hold the motivating example.** Turn 1 read whole docs
   (Start Here 7.6k, Worklist clipped 9k, plan 4.2k = 20.8k). Turn 2 read narrower, different
   slices (Worklist › Group 1, Start Here › one section). Only the plan (4.2k) was a true
   reread; the other two were turn 2 narrowing in, which is the behavior we want. Carrying turn 1's
   whole reads would have sent 20.8k to replace 10.2k of targeted reads. **Carry sections, not
   whole documents:** decision lines cite records, not sections, so make the `carry` line the
   main signal (the model names `d0#group-1`, `p2` to keep) rather than optional. A doc read
   whole and not narrowed carries as its outline plus "read whole last turn", not its text.
   Raise the budget to ~10k per project once it's section-level.
2. **Prompt order blocks caching.** `buildThreadPrompt` puts history and pieces before the index
   (`thread-chat-core.ts:305-328`), so the stable part can't be a cached prefix. Order it system →
   index → carried block → history → pieces.
3. **The index rebuild isn't worth caching.** It loads in parallel with the plan call (0.8 s), so
   it's off the critical path.
4. **No signing needed for the lab carry blob.** It holds pointers only and the server checks
   every id through the user's RLS client; a tampered blob can only carry the user's own records.
5. **Measure with real usage, not chars.** `usage.prompt_tokens` and cache hits are already on
   each `done` event; put those on the stats line instead of fixing the `promptChars` estimate.

**Real chat payoff is small today:** 8 post-first-turn reads in 60 days of prod (1 reread). The
lab's follow-ups are where the win shows up now.

## Built 2026-11-05 (lean, lab only; DJ picked it) — UNCOMMITTED

- **Providers:** `LAB_PROVIDER_ROUTING` in `thread-chat-core.ts` (Relace → Parasail → DeepInfra →
  Venice → DigitalOcean; ignore SiliconFlow, Mancer, Wafer) on plan, thread and answer calls.
  Shared `streamText` silently dropped `providerRouting` before; it now sends it (ZDR still
  written last). Test in `packages/smart-llm/src/smart-llm-service.test.ts`; dist rebuilt.
  Real chat's `DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER` still lists `nextbit` and `open-inference`,
  which no longer serve V4 Flash under ZDR; not changed (lab first).
- **Carry:** `thread-chat-carry.ts` (pure). Rule: the thread's last line
  `{"op":"keep","items":[{"ref":"d1","sections":["Group 1"]}]}` decides; without it, what the
  decisions cited carries. A long doc read whole never carries as text (≤4k docs can); sections
  do. 10k chars per project; unused items fade after 2 turns; scanned note capped at 12.
  Pointers only; next turn reloads by id through the user's client, skips edited records.
- **Skips:** search skipped when every piece has the planner's `"cont":true` and something
  loaded; reads of carried or already-read sections return "already loaded" and don't count
  against the 4 reads; parallel duplicate reads are claimed before they start.
- **Visible:** each thread card shows "Carried N from last turn — …" and "Carrying N to the
  next turn — …"; the stats line shows real prompt tokens (cached), carried chars, rereads and
  searches skipped. Not built: tap to drop/pin an item.
- **Checks:** 21 lab tests (10 new in `thread-chat-carry.test.ts`), web check 0 errors, lint
  clean, replay clicked through on local dev. **Live rerun of the 9takes two-turn conversation
  not run yet (paid, ~$0.01, needs DJ's OK).** Not done: "new doc in turn 3" replay test.

## Live rerun 2026-11-05 15:04 ET (DJ approved; same two messages, all projects)

| Turn                      | Before (morning)                                      | After                                             | Change                                |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 1: 9takes + BuildOS       | 40 s · 12 calls · $0.0074                             | **28.8 s** · 11 calls · $0.0062                   | −28% time, −16% cost                  |
| 2: "Which of those five…" | 22.4 s · 7 calls · $0.0049 · 71.6k tokens (incl. Jev) | **22.2 s** · 5 calls · **$0.0028** · 36.4k tokens | time flat, **−43% cost, −49% tokens** |

- Worked: search skipped on turn 2 (−43.5k Jev tokens), 2 items carried, no rereads of carried
  sections, rounds on Relace hit its prompt cache (10.2k of 11.4k cached).
- Turn 2 still took 3 thread rounds: it read the plan record (turn 1 read it but its keep line
  didn't keep it) and then the Wings guide task (new, needed).
- **Why time stayed flat: the last round's `tool_choice: "none"`.** Relace, Parasail, DeepInfra
  and DigitalOcean don't support it (OpenRouter ZDR endpoint list), so every decide round fell
  through to Venice (13.1 s and 4.2 s, cold cache) — this morning to SiliconFlow. Also Relace
  itself was slow on two rounds (8.7 s for 219 tokens; 10.9 s for 734).
- Rerun bugs: reply step saw answers clipped at 400 chars and invented the rest ("All Types
  Overview 19%"; thread said "All 18 Wing Combinations 42%"); reply also said "No changes were
  made. / No questions." and turn 1's reply turned an answer into numbered question "1." (answer
  prompt rules ignored). Carried text hit 12.4k (cap 10k checked against estimates).
- **Fixed after the rerun (UNCOMMITTED, 23 tests + check green, not yet rerun live):** last round
  asks in words ("No more reads…", `tool_choice: auto`) and forces `none` only if the model still
  calls a tool; answers kept to 1,500 chars; carry cap enforced on real text.
- Next rerun (~$0.01) should show the decide round on Relace with a warm cache.

## Live rerun 2 2026-11-05 15:25 ET (after the decide-round fix)

| Turn | Morning                                   | Rerun 1                  | **Rerun 2**                                                  |
| ---- | ----------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| 1    | 40 s · 12 calls · $0.0074                 | 28.8 s · $0.0062         | **20.1 s** · 11 calls · $0.0057 · 22.5k of 40k tokens cached |
| 2    | 22.4 s · 7 calls · $0.0049 · 71.6k tokens | 22.2 s · $0.0028 · 36.4k | **10.9 s** · 4 calls · **$0.0013** · 19.9k tokens            |

- Every model call ran on Relace (no Venice/SiliconFlow); rounds 2+ hit its cache (64–89%).
- Turn 2: search skipped, plan carried (4.2k), 2 new section reads, decided in round 2 (2 thread
  calls instead of 3). Exit target (follow-up ~15 s, 4–5 calls) met.
- What the thread keeps varies run to run (rerun 1 kept Worklist + Start Here; rerun 2 kept the
  plan). Not a bug, but the carry is only as good as the keep line.
- **Open: the reply step is the weak link.** The thread answered correctly (Toxic Traits is Medium;
  next in Group 1 is the Wings guide); the reply said "the next High priority post after Toxic
  Traits is Neurodivergence". The thread's answer text is also clipped at 600 chars when its line
  is read (`dump-sort-thread-core.ts:164`, shared with /lab/sort).

## Reply fix 2026-11-05 (DJ picked ambitious) — UNCOMMITTED

- "High priority" is the task's own `priority` field (2 = High, 3 = Medium), not Jev. The thread
  read it right; the reply step paraphrased "next in Group 1" into "next High priority".
- One thread in a turn → no reply call: `composeThreadReply` shows the thread's answer word for
  word, then saved changes in plain words, then its numbered questions (saves ~1 s and a call).
- Answers are no longer clipped (600 in `dump-sort-thread-core.ts` → 4,000 safety cap; report
  and endpoint keep them whole). Multi-project replies are told to copy answers word for word.
- 25 lab tests + check green. Not rerun live.

## Open questions for DJ (answered 2026-11-05)

- **What you see:** visible (built as steps on each thread card; tap to drop/pin not built).
- **How quickly old context fades:** 2 turns, as proposed (no objection).
- **Lab first or both:** lab first; reassess real chat after it looks good.

### Original questions

1. **What you see.** Should the lab (and later chat) show "Carried from last turn: Worklist ›
   Group 1, plan Generic Content Rewrite · scanned 7 more" as a visible line you can tap to drop
   or pin an item? Or should the carry stay invisible and show only in the stats?
2. **How quickly old context fades.** Items drop to the note after **2 turns** unused. Is that
   right, or should anything you've worked on stay loaded for the whole conversation (bigger
   prompts, fewer rereads)?
3. **Lab first or both.** Lean (lab only, about 1 day) or ambitious (the same working set in real
   project chat, about 3–4 days, worker + web deploy + one paid battery run)?

## Real chat providers (2026-11-05)

**Headline: production chat does not use the V4 Flash host list.** Every
`agentic_chat_worker_stream` call in the last 30 days asked for `deepseek/deepseek-v4.1-flash`
(742 calls; 0 on V4 Flash). For V4.1 the worker sends `sort: 'throughput'` across all ZDR
hosts, ignoring only Azure, Morph and Modal (`host/config.ts`, chosen 2026-09-11 after a
fixed order had long-tail misses). So real chat already uses dozens of ZDR hosts and lands on
the fastest. The 4-host list only governs V4 Flash: the local worker (`apps/worker/.env`),
the lab, and the web's `openrouter-v2-service` (document proposals, next step, task titles).

**Why the V4 Flash list was short (history):**

- 2026-07-09 (web speed audit): price routing put chat on GMICloud, which barely cached; order
  by hosts that cache.
- 2026-08-22 (project loop timeouts): `zdr: true` removes the cheapest hosts, so price
  routing lands on DigitalOcean (~18 tok/s). DigitalOcean, Phala, Morph and Mancer were the
  timeout hosts; Venice rejected `response_format` without fallbacks; AtlasCloud dropped V4 Flash.
- 2026-09-08 audit (F76–F78): DeepInfra 429s, Alibaba-pinned 404s, cache falls from 80% to
  4% when a turn changes host; Azure is slow and costly and the snapshot id detoured to it, so
  Azure is ignored. Wafer continuations missed the cache despite the pin (route-health.ts).
- 2026-09-24 (tasker 103): ZDR became mandatory everywhere, so the order shrank to the V4
  Flash ZDR hosts of that day: DeepInfra, NextBit, Open Inference, Parasail. That is the whole
  reason it was four. No note anywhere says "don't add X" beyond the hosts above.
- Still applies: keep one fixed order (cache); keep Azure out of the acting route; keep
  DigitalOcean/Mancer behind faster hosts.

**OpenRouter today (V4 Flash, ZDR list + endpoints) and our 30 days of V4 Flash calls:**

| Host           | ZDR | $/M in / out / cached | tok/s p50 / p10 (n)  | tool_choice none | Verdict                                       |
| -------------- | --- | --------------------- | -------------------- | ---------------- | --------------------------------------------- |
| Relace (fp4)   | yes | 0.045 / 0.45 / 0.045  | 133 / 65 (183)       | no               | **add, first**: fastest; cheapest input       |
| Parasail       | yes | 0.14 / 0.28 / 0.07    | 74 / 40 (268)        | no               | keep, 2nd                                     |
| DeepInfra      | yes | 0.09 / 0.18 / 0.018   | 38 / 26 (36)         | no               | keep, 3rd (cheapest overall)                  |
| Fireworks      | yes | 0.105 / 0.21 / 0.021  | no calls yet         | **yes**          | **add, 4th**: unmeasured; 79% uptime (1 day)  |
| Venice         | yes | 0.097 / 0.19 / 0.020  | 30 / 20 (140)        | yes              | add, 5th (slow but serves `none`)             |
| DigitalOcean   | yes | 0.098 / 0.20 / 0.020  | 26 / 16 (114)        | no               | add, last (2026-08 timeout host)              |
| SiliconFlow    | yes | 0.13 / 0.28 / 0.028   | 54 / 25 (149)        | yes              | **ignore**: 15–18 tok/s tails (31 s rounds)   |
| Wafer          | yes | 0.60 / 0.17 / 0.20    | 58 / 24 (71)         | yes              | **ignore**: $0.60/M input; missed cache in QA |
| Mancer         | yes | 0.19 / 0.50 / none    | —                    | no               | **ignore**: no prompt cache; 2026-08 timeouts |
| Azure          | yes | 0.21 / 0.56 / 0.031   | 24 / 6 (36)          | yes              | ignore (worker; unchanged)                    |
| NextBit        | —   | not listed            | last call 2026-09-27 | —                | **drop** (dead preference)                    |
| Open Inference | —   | not listed            | last call 2026-10-19 | —                | **drop** (dead preference)                    |
| Novita, Crusoe | —   | not listed            | 104 / 74; 203 / 110  | —                | gone; re-add if they return to the ZDR list   |

Latency p50/p90 per call mixes workloads (briefs vs entity extraction), so tok/s is the fair
comparison. Failures were JSON `invalid_response` spread across hosts (Parasail 4.7%, Relace
3.5%, Venice 3.8%); nothing host-specific beyond the above.

**Real chat (V4.1 Flash, sort throughput), 30 days:**

| Host      | Calls | Fail | p50 / p90 s | tok/s p50 | Cached | $/call |
| --------- | ----- | ---- | ----------- | --------- | ------ | ------ |
| Together  | 452   | 2.5% | 2.0 / 5.0   | 231       | 51%    | 0.0024 |
| BaseTen   | 266   | 2.3% | 2.6 / 6.6   | 213       | 22%    | 0.0037 |
| CoreWeave | 15    | 7%   | 2.2 / 5.8   | 298       | 12%    | 0.0016 |

- **The synthesis pass (`tool_choice: none`, passRole `final_response`) is not hitting slow
  hosts:** 21 passes, all on Together/BaseTen/CoreWeave, p50 0.6–0.75 s, p90 ≤ 2.0 s. Nearly
  every V4.1 ZDR host serves `none`. 4 hedge stalls in 742 calls.
- The `none` problem is real only on V4 Flash, where Relace, Parasail, DeepInfra and
  DigitalOcean don't serve it. With the new order a V4 Flash `none` pass goes to Fireworks,
  then Venice, never SiliconFlow. A code fix (send no `tool_choice` when no tools are mounted,
  so the turn stays on its warm host) was not made: it changes every prod request and some
  hosts may reject tool-call history without `tools`; prod doesn't need it.
- Cost note: throughput sort picks the $0.30/$1.20 tier (Together, BaseTen). Cheaper ZDR V4.1
  hosts exist (DeepInfra $0.14/$0.42, CoreWeave $0.13/$0.65). At ~742 calls/month it's ~$2,
  so not worth touching without a battery.

**Changed (UNCOMMITTED, no deploy):**

- `packages/smart-llm/src/model-config.ts`: `DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER` = Relace,
  Parasail, DeepInfra, Fireworks, Venice, DigitalOcean; new `DEEPSEEK_V4_FLASH_ZDR_PROVIDER_IGNORE`
  = SiliconFlow, Mancer, Wafer; evidence in the comment. dist rebuilt.
- `apps/worker/.../host/config.ts`: V4 Flash ignores Azure + that list (other models keep
  Azure only).
- `apps/web/.../thread-chat-core.ts`: `LAB_PROVIDER_ROUTING` now reuses the shared lists (adds
  Fireworks as 4th).
- Web `openrouter-v2-service` picks up the new order automatically.
- Tests: smart-llm `model-config.test.ts` 16/16 (2 new); worker `agenticChatConfig` +
  `agenticChatBootstrap` 57/57, `agenticChatLatencyRecovery` 45/45; web thread-chat +
  `openrouter-v2-service.test.ts` 65/65 (one expectation updated: an ignored host leaves the
  order).

**Needs DJ:** deploy web (lab + v2 service) and worker (only matters if the chat worker runs
V4 Flash). Optional paid checks: one `/lab/chat` rerun to see Fireworks/Relace hold (~$0.01,
DeepSeek V4 Flash); a battery is only worth it if you want to try cheaper V4.1 routing
(`pnpm agentic:prod-battery`, acting model `deepseek/deepseek-v4.1-flash`, ~$0.30–0.35).
Free follow-up in a week: rerun the per-host tok/s SQL to see Fireworks' real speed.

- 2026-11-05 review: DigitalOcean moved from last in the order to the ignore list (it was a 2026-08-22 project-loop timeout host and is the slowest left, 16 tok/s p10). Order: relace, parasail, deepinfra, fireworks, venice. smart-llm 16, worker 102, web 65 tests green.

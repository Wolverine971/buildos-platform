<!-- tasker/152-robust-threads.md -->

# 152 — Robust threads (chat with threads, sturdier underneath)

**Opened 2026-11-05 (DJ).** DJ turned down the `explore_project` tool plan in
`docs/architecture/TURN_ENGINE_2026-11-05.md` §5. A new tool doesn't guarantee the model calls it.
He kept the lab's design (plan call → parallel project threads → reply) and asked for the threads
to be **more robust**. Builds on [151](151-carry-turn-context-forward.md). The code is
`/lab/chat` (`apps/web/src/lib/server/thread-chat/`).

## Status (2026-11-05) — ROUND 1 BUILT, UNCOMMITTED, live run not done (paid, needs OK)

## What changed (round 1)

**Budgets the thread earns** (`thread-chat-budget.ts`, replaces the fixed 3 rounds / 4 reads):

- Starts with 2 read rounds and 4 reads, the old limit.
- Gets +2 rounds and +3 reads each time its last read round brought in text it didn't already have.
- Hard ceilings per thread: 6 read rounds, 12 reads, 60k chars read.
- A **turn-wide pool** shared by every thread: 20 read rounds and 160k chars. One greedy thread
  can't starve the others.
- When anything runs out (time, budget, pool, size), the thread gets a "decide now" round with
  the reason. It always reports.
- Nobody upstream sets numbers; the orchestrator never guesses.

**Time limits per thread:**

- At 40 s the thread decides with what it has.
- At 75 s its model call is cut, and the decisions already made are kept.

**Model calls** (`runModelCall`, used by the plan, thread and reply calls):

- A call that fails or goes quiet for 20 s **before producing anything** is retried once.
- A call that breaks mid-answer is not retried; the decisions that arrived are kept.

**Whole-thread retry:** a thread that fails before deciding anything runs once more, if it's
under 40 s. Both tries show on the card (`a2-` step ids). The page gets one `thread_done`.

**Skipped pieces:**

- A piece with no decision line gets one repair round ("you wrote nothing for piece 2").
- Anything still undecided goes into `report.unfinished`. The reply then says "Didn't get to:
  … Send it again and I'll pick up there", and the planner history includes it, so "try again"
  routes back to the same project.

**Turn level** (`thread-chat.service.ts`):

- At most **5 threads** per message, projects with the most pieces first. The rest are named in
  the reply ("too many projects for one message; send those again").
- **Plan call:** retried once. If it still fails, the whole message goes to the one project it
  can only be about: the scoped project, or the only focus project.
- **Reply call:** retried once. If it still fails, the reply is each project's own report, word
  for word, with no model call. A "thanks!" with no threads still gets a normal reply.

**Already in place before this round:**

- One thread failing doesn't stop the others.
- Stop cancels every thread.
- Search has a 5 s timeout.
- Reads are size-capped, and duplicate reads are skipped.

**Checks:**

- 45 lab tests pass, 19 of them new (`thread-chat-budget.test.ts` plus the updated last-round
  tests in `thread-chat-carry.test.ts`).
- Type check and lint are clean for the lab files.
- The free replay was clicked through on local dev.

## Not done / next

- [ ] Live lab run (paid, about 1–2¢ on DeepSeek V4 Flash; ask DJ). Watch for budget extensions
      on a "draft a plan" message and the repair round.
- [ ] Commit by pathspec (with 151 and the provider list) and deploy web.
- [ ] Real saves with Undo. The commit pieces mostly exist in real chat: effect ledger,
      proposal cards, doc/table Undo (`TURN_ENGINE_2026-11-05.md` §2.4, §3).
- [ ] Move the thread engine into the worker. When threads run there, give each one its own
      `threadKey` in usage ids: today parallel calls in one worker turn would overwrite each
      other's usage and billing rows (`openrouter/usage.ts:86-110`). The lab isn't affected; its
      usage rows get database ids.
- [ ] Progressive reply: show each project as its thread finishes.

## Files

- `apps/web/src/lib/server/thread-chat/thread-chat-budget.ts` (new) + `thread-chat-budget.test.ts` (new)
- `thread-chat-thread.ts`: retry wrapper + attempt; the round loop now uses budget, watchdog,
  deadline and repair
- `thread-chat.service.ts`: turn pool, thread cap, plan and reply retry/fallbacks
- `thread-chat-core.ts`: `unfinished` in reports, history, reply prompt and direct reply; the
  thread prompt describes the budget
- `apps/web/src/routes/api/lab/thread-chat/+server.ts`: passes `unfinished` through history

## Adversarial review (2026-11-05) — fixes applied, UNCOMMITTED

A separate reviewing agent checked tasker 151, 152, the provider change and the turn-engine doc.
ZDR, RLS and production chat held up. Fixed:

1. **A 75 s timeout looked like success.** smart-llm's `streamText` returns quietly on abort, so
   `runModelCall` reported success. Now an abort that ends a stream always throws, and the
   thread reports "ran out of time". Test: a quiet-returning stream under a deadline.
2. **The watchdog couldn't end a stream that ignores abort.** Each `next()` now races the abort.
   Test: a generator stuck forever is cut and retried.
3. **A failed index load retried pointlessly** (same shared promise). It's now only retried when
   the project loaded. Test included.
4. **Spinners stayed on when a call failed.** The current "Thinking" step is now marked failed.
5. **Reading caps could be overshot by parallel reads.** Each read reserves its maximum size
   before starting and settles to the real size after; failed reads refund it. Test: a pool
   with room for one read lets one of three parallel reads run.
6. **The repair round could duplicate decisions and burn question numbers.** Lines for pieces
   already decided are now ignored during repair. An empty assistant turn is no longer sent, and
   a half-written line after a broken call is dropped instead of showing as a skipped line.
7. **Whole answers in each thread's history** grew prompts by up to 12k per turn; they're now
   clipped to 600 chars in `projectHistory`. The person still sees the full answer.
8. **Titles and headings sent back by the browser reached the prompt.** Carried items now take
   titles and headings from the index, and unknown section anchors are dropped.
9. **The search was skipped even when nothing carried loaded.** It's now skipped only after the
   carried text actually loaded.
10. **A plan call that broke partway dropped the rest of the message silently.** The reply now
    says the rest wasn't sorted.
11. **Web V4 Flash features had the new order but not the block list.** `openrouter-v2-service`
    now ignores SiliconFlow, Mancer, Wafer and DigitalOcean for V4 Flash. The "off" kill switch
    still drops it.
12. **The ZDR test couldn't fail.** It now passes `zdr:false, data_collection:'allow'` and
    asserts the builder wins.
13. Stale comments fixed (worker config, web test, service). The doc's access-check count was
    corrected from 32 to 20.
14. Read step ids include the round, in case a provider reuses tool-call ids, and replay `wait()`
    removes its abort listener.

**Not changed** (noted only):

- An extension is earned by any read that returns text (bounded by the ceilings: at most 2
  extensions).
- Cost from a failed call that had already produced output isn't counted.
- A forced "none" fallback round may land on Fireworks or Venice.
- Not-yet-created projects count toward the 5-thread cap.

**Checks:** 50 lab + 14 sort, 40 web routing, 22 worker config, 76 smart-llm tests. Lint and
type check clean. Replay clicked through with no console errors.

## Live complicated test (2026-11-05, DeepSeek V4 Flash, ~1.2¢)

The message had 8 pieces aimed at 3 projects: Wayne Strategies (Griffin in progress + Monday,
kill Fortress, an AI Founders Club brief question, a Cutlass reminder), 9takes (Wings done + draft
a plan for the next 3 posts) and BuildOS (Speed Insights done).

- **Totals:** 5 threads, 23 calls, **$0.012**, 28.7 s. The plan took 10.9 s; threads ran 16.7 s
  wall for 38.7 s of work. 100.9k prompt tokens, 61% of them cached.
- **Right:**
    - Griffin set to in_progress and moved to 2026-11-09.
    - Fortress archived (an explicit "kill it" counts as confirmed).
    - Wings guide and Speed Insights marked done.
    - 9takes **earned more reading** ("Found more; reading further") and read the next three
      posts in click order (Red Flags, Best Compliments, Instinctual Subtypes).
    - Radar honestly said it had nothing on the AI Founders Club.
- **Wrong:**
    1. **Duplicate decisions.** Wayne Strategies wrote Griffin and Fortress twice: once while
       still reading, again at the end. **Fixed:** a decision with the same piece, op and target
       replaces the earlier one (`changeKey`, `replaces` on `thread_change`, page and service
       upsert). The prompt also says to decide once, in the last round.
    2. **Misrouted pieces.** The AI Founders Club question went to Radar and the Cutlass reminder
       went to the Workspace; both belong to Wayne Strategies. The planner only sees project
       names. **Not fixed; needs DJ** (see below).
    3. **"Draft a plan" became an empty note.** **Fixed:** the prompt tells threads to answer a
       "work" piece with a doc whose `body` holds the draft.
    4. **The reply invented a question** about the 9takes plan; it's the 3rd invented question
       today. **Fixed:** when threads ran, the reply is composed from their own lines
       (`composeTurnReply`): answers labeled by project, one change line per project, and only
       the threads' numbered questions. No model call, about 1 s faster. The model still answers
       0-thread turns ("thanks").
    5. **The plan took 10.9 s** on a long message: the planner copies whole sentences into `q`.
       **Not fixed** (see below).
- 66 lab and sort tests pass (3 new); lint and type check are clean.

**Open for DJ:**

- **Re-routing.** A thread that finds nothing ("Radar doesn't have that") should hand the piece
  back. The orchestrator would then look it up across projects and run a second, small thread
  where it lives. That costs about 5–8 s more, but only on the misrouted pieces.
- **Plan speed.** Make `q` short (2–6 words, never the whole sentence), or drop it when a piece
  is the whole sentence. That should roughly halve plan time on long messages.

## Re-routing + timing breakdown (2026-11-05) — BUILT, UNCOMMITTED, not yet run live

- **Hand-back:** a thread whose piece names something its project doesn't have (a doc, person,
  company, client) writes `{"op":"elsewhere","look_for":"AI Founders Club brief",...}` instead of
  answering "not here". A new thing to do still gets created where it was sent. The piece isn't
  counted as skipped, and the card shows "Not in this project; handing it back".
- **Re-route (orchestrator):**
    - After the first threads, each handed-back piece is searched across the person's projects
      with the same `search_ontology` read tool chat uses, run as the person.
    - The top hit in another writable project wins. Pieces are grouped by project, and a second
      thread runs there: a "· handed over" card whose first step is "Handed over from X — found
      'Y'".
    - One hop only. Nothing found, or handed back again, means the reply names it and asks for
      the project.
    - New `rerouted` event; `totals.rerouted`.
- **Timing breakdown on the stats line** (server clock): `projects X s · first plan token Y s ·
plan done Z s`. That shows where the earlier 10.9 s went. The plan call itself was 1.9 s per
  `llm_usage_logs`, so the rest was before or around it, likely local load (swap was 61/62 GB).
- **Replay turn 4** demonstrates the hand-back: an Act II outline question goes to the channel,
  the channel hands it back, and Fading Crown answers.
- 69 lab and sort tests pass (3 new); lint and type check are clean. Replay clicked through all
  4 turns with no console errors.
- **Next:** re-run the complicated 8-piece message live (about 1–2¢, needs DJ's OK) to see the
  AI Founders Club and Cutlass pieces land in Wayne Strategies.

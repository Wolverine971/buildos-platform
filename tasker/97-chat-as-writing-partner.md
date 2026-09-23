<!-- tasker/97-chat-as-writing-partner.md -->

# Tasker 97 — Chat as a writing partner: returning to a project, and interviewing

**Status:** Built and replayed live 2026-09-23, uncommitted; `pnpm agentic:gate` pending DJ approval
(see "Results") · **Opened:** 2026-09-23 · **Source:** book dogfood loop (isolated QA DB,
project `445dd429-db93-4878-90a9-b3ab1627a9f2`; issues ledger `scripts/book-loop/ISSUES.md` #1 and #5).
**Related:** 96 (capture; its Finding 10 makes START HERE stale, which feeds problem A).

**Scope guard (DJ, 2026-09-23):** do not overengineer the harness for this one test case. Prefer
prompt, skill and context changes that help any user making something. Add no validators for document
formatting (for example chapter numbering) and no lexical rules; see AGENTS.md "Never classify
language with regex".

## A. Returning to a project gets logistics, not substance

**Repro:** in a fresh project chat, send "Okay, I want to keep going on my book project. Where are we at
with things? What do we have to do today?" Use `scripts/book-loop/turn.sh <name> "<msg>"`.
Evidence: `output/book-loop/t06-pick-back-up.json` (before tasker 95) and `t13-pick-back-up-v2.json`
(after).

**What happened (t13, 13s):**

- A task table (7 `todo`s), "no calendar events today", and the next step "draft a one-page
  overview".
- "Blueprint: not started", although a full first-pass outline was written into
  `Book Contract & Chapter Blueprint Template` the night before. The doc's update appears in the
  prompt's "Recent project changes".
- No mention of the thesis (social anti-fragility, "bridges not defenses"), the connector mechanism,
  the open reveal, or the outline's [GAP]s. All of these are in START HERE and the blueprint doc.

**What a good answer does:** for a creative or thinking project, a returning user first needs to know
_what they're making and where the thinking stands_, then what's next. For example: "Last session you
turned the thesis into a first-pass outline (4 parts, 12 cards). The biggest holes are the AI pillar
and 'what it means to be human'. Today: fill the AI pillar." Scheduling and task tables come after
that, and only if they matter.

**Likely levers (investigate; pick the smallest):**

- The prompt or skill guidance for "where are we / what's next" in project context currently steers
  to tasks and calendar. Give it a substance-first shape, with the user's words as the trigger (not a
  keyword rule).
- **Freshness:** when START HERE's `Current state` contradicts the recent project changes (a document
  updated after START HERE), the model should trust the newer record and say so. This could be a
  context-assembly change (show updated_at next to START HERE and the recent changes) rather than a
  new rule.
- Don't reach for the calendar on "what do we have to do today" in a project with no dated work. The
  empty calendar read cost a round in t06 and appeared in t13.

**Acceptance:** replaying t13 on the current QA clone produces an answer that (1) names the outline as
drafted, (2) states the thesis in a line, (3) names the top 1–2 gaps as the next move, and (4) keeps
any task/schedule detail short. Judge with an LLM rubric; do not assert on phrases. Get DJ's approval
before every paid run.

## B. Interviews ask too many questions

**Repro:** t08 ("Interview me: ask me questions that pull out the actual tactics…") → 11 questions in
4 tiers. t09 (DJ asked for follow-ups) → 10 questions. See `output/book-loop/t08-outline-interview.json`
and `t09-spine-answer.json`. Both were high quality and grounded, but each is a wall. Both ended with
"start with 1, 2 and 5", which admits the problem.

**Want:** when interviewing, ask the 2–3 highest-leverage questions, then wait. Keep the rest to
yourself or mention that more are coming. When the loaded context already implies an answer (spine B
followed from the thesis), propose it for confirmation instead of asking it open-ended.

**Likely lever:** the interview / question-asking guidance in the relevant skill or prompt section.
Find where "ask the user questions" behavior is shaped; the fiction skill has been deleted, so check
what now loads for writing and project turns.

**Acceptance:** replay t08 and t09 → each reply asks at most 3 questions, and t08 proposes spine (b)
for confirmation. The quality of the grounding stays at least as good as before, by LLM-judge
comparison against the saved replies.

## How to test

- **Setup:** `scripts/book-loop/restart.sh`, then `turn.sh`. Capture runs automatically, like prod.
  Use `BOOK_LOOP_NO_CAPTURE=1` to skip it.
- **Replay turns on a fresh session** rather than inside the original one. Before a replay you can
  reset with `restart.sh --reset`, but that re-copies the fiction-era production project and loses
  the outline. Prefer the current QA state.
- **Spend:** turns cost about 1–4¢ on DeepSeek V4.1 Flash. Still ask DJ before paid runs, as
  AGENTS.md requires.
- **Other agents:** tasker 96's capture e2e also writes to this project. Coordinate or clone a
  separate project.

## Results (2026-09-23)

**Root causes found**

- **A, shape.** No prompt text shaped a "pick it back up" answer. The Final Response Contract (the
  end of the prompt, where reply shape is decided) says reports go "in a compact list or table", so
  the model copied START HERE's `Current state` into a table.
- **A, freshness.** The START HERE header printed `updated_at` as a UTC instant (the next day), while
  Recent project changes printed local dates. At t13 the outline doc was saved at 22:31 local and
  START HERE at 22:11, but START HERE looked newer. The chat repeated "Blueprint: not started", and the
  idle capture then wrote that claim back into START HERE. That is tasker 96 Finding 10's loop,
  entered from the chat side.
- **B.** No prompt, skill or tool text said anything about interviewing, so the model fell back on
  exhaustive lists.

**Changes** (all in `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`; the
worker uses the same prompt artifact)

1. START HERE header: `last updated <local date time zone>`. When a loaded document was saved
   after START HERE, it adds `Changed after this START HERE: "<title>" (<local time>)… where they
differ, the newer document wins.` The comparison is done in code, on timestamps only.
2. Two Final Response Contract bullets, one on picking a project back up and one on interviewing
   (at most three questions, then wait; propose an answer when the context implies one). The first
   is scoped "without naming the facts they want", so requested status reports (gate case 14) keep
   the existing rules.
3. Tests: freshness-line unit test; contract bullet count 5 → 7; prompt budget re-baselined
   (system 11,020 → 11,439 chars; payload 76,588 of its 76,600 cap).

**Live replays** (deepseek-v4.1-flash, fresh sessions, capture off; $0.061 of model calls,
$0.088 by OpenRouter credit delta). Round 1 placed both lines in Identity and Mission. Round 2 is the
shipped placement.

| Turn                  | Original                                             | Round 1 (mission)                                                             | Round 2 (contract, shipped)                                                                                                                                                         |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t13 "where are we at" | Task table, "Blueprint: not started", no thesis; 13s | Same table, stale blueprint, thesis only at the end; 47s (24s provider stall) | Opens with the thesis; "first-pass chapter cards exist… several cards marked [GAP]"; next move = fill the gaps and settle the reveal; tasks cut to 2 lines; 28s (5s stall), 7 reads |
| t08 interview         | 11 questions in 4 tiers                              | 3 (sub-questions inside each), guesses offered                                | 3; Q3 proposes "be the human" for confirmation                                                                                                                                      |
| t09 follow-up         | 10 questions                                         | 5; proposes the reveal from START HERE                                        | 3, each with a proposed answer ("My read: (b) is the reveal… confirm or correct"); 0 reads, 13s                                                                                     |

Acceptance, judged by Claude against the rubric above (not phrase asserts):

- **A:** (1) outline named as drafted ✓, since the model now reads the outline doc and overrides
  START HERE; (2) thesis in a line ✓; (3) gaps as the next move are partly met: "fill the [GAP] cards
  and settle the reveal", but it did not name the AI pillar or the "what it means to be human" gap;
  (4) task/schedule detail short is partly met: tasks were cut to 2 lines, but a stale open-questions
  paragraph (Exclusions) remains.
- **B:** at most 3 questions ✓ on both turns. It proposes answers for confirmation ✓. The grounding
  is better than the saved replies: they cite real card numbers and gaps.

**Caveats**

- On the current QA clone, START HERE (00:40 local) is newer than the outline doc and still wrong,
  so the freshness line does not fire there. The model found the outline only because the new bullet
  sends it to "the documents holding the work". The real fix for `Current state` is tasker 96
  Finding 10.
- Re-entry now costs one more read round (13s → ~23s without the provider stall).
- Not yet run: `pnpm agentic:gate`, which is required because the Final Response Contract changed
  (case 14 risk). It is pending DJ approval, at about $0.29 on DeepSeek.

**Seen during the replays; not fixed here** (logged in `scripts/book-loop/ISSUES.md`)

- A lead-in line leaked into a worker final reply ("I'll check what's actually scheduled…", t13c).
- A Markdown link with a bare UUID as its URL (t08c).
- Redundant reads: the same doc was fetched whole, then by outline and section (t08b/t08c, 9 reads).
- Provider "insufficient progress" stalls cost 5–24s on 2 of 6 turns.
- The project's `next_step_short` ("Draft the one-page book overview") is stale, and chat still quotes
  it.

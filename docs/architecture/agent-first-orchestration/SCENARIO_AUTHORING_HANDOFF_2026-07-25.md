<!-- docs/architecture/agent-first-orchestration/SCENARIO_AUTHORING_HANDOFF_2026-07-25.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Handoff — Scenario & Brief Corpus Authoring

**Date:** 2026-07-25
**For:** a fresh agent in a new session
**Your job:** interview DJ, then turn his answers into **executable scenario files and a labeled
brief corpus**. Not a summary document. Files.
**Working directory:** `/Users/djwayne/buildos-platform`

---

## 1. Read this first (in order, and stop there)

1. [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md) — the spec you are populating.
   **This is the important one.**
2. `apps/web/src/lib/tests/agentic-e2e/README.md` — the Tier 1 instrument you will extend. Covers
   setup, cost, local-dev caveats, and auth. Read the "Local dev caveats" section carefully.
3. `apps/web/src/lib/tests/agentic-e2e/scenarios/task-create.scenario.ts` — the pattern to copy.

Do **not** read the `research/` folder (~55k words, 12 documents). Its conclusions are already
compressed into the methodology spec. Reading it will cost you a context window and change nothing
about your task.

---

## 2. Why this work exists

A nine-agent research dossier concluded (`research/SYNTHESIS.md` §8) that **zero published
comparisons exist in BuildOS's domain** — agent work over a user's own structured project data. All
external evidence is coding, math, multi-hop QA, or web research.

DJ's read, and the correct one: that is not a research gap you can close by reading more. **You close
it by writing scenarios and becoming the source.** That is this task.

The insight that shapes everything below: **"can the agent do the job" is two different measurement
problems**, and they need two different instruments.

|              | **Tier 1 — verifiable**                       | **Tier 2 — open brief**                       |
| ------------ | --------------------------------------------- | --------------------------------------------- |
| Example      | "This task is done." → find it, update it     | "Build me a marketing plan for this project." |
| Ground truth | Yes — a row changed or it didn't              | None. No answer key can exist                 |
| Instrument   | Already built; needs breadth                  | Being designed; needs DJ's taste              |
| Failure mode | Wrong write, missed write, **spurious write** | **Confident generic slop**                    |

---

## 3. State of the world — what not to break

- **Do not touch `packages/agent-orchestrator/src/testing/harness/`.** Another agent is actively
  working Tier 0 fixes there. Files were modified minutes before this handoff was written.
- **Do not modify `corpus/phase-a.json` or `corpus/phase-a-holdout.json`.** Both are frozen and
  SHA-256 pinned. The holdout is _held out_ — tuning anything against it destroys its only value.
- **Phase A is mid-flight and blocked.** It is a separate, older experiment (read-only, 8 scenarios).
  You are not working on it. Do not try to fix it.
- **Commit with explicit pathspecs.** The repo carries unrelated staged and unstaged work. Never
  `git add -A`, never `git commit` bare, never reset or restore broad paths.
- **Nothing here is authorized to spend money** without asking DJ first. The e2e harness makes real
  model calls on every turn.

---

## 4. What you are producing

**Tier 1 (do this first — DJ's explicit ordering):**

- New scenario files in `apps/web/src/lib/tests/agentic-e2e/scenarios/`, registered in `catalog.ts`.

**Tier 2 (after Tier 1, or in the same session if DJ has energy):**

- A brief corpus file: each brief with its text, target project snapshot, a **blocked vs.
  proceedable** label (see §7), and DJ's stated acceptance bar in his own words.

---

## 5. Tier 1 — the six gaps

The instrument exists and asserts against real database state: `task-create.scenario.ts:54` reads
`onto_tasks` back and verifies the row the agent claimed to write. Six scenarios ship today
(`scenarios/catalog.ts:12`; note `calendar-move` is a **disabled stub**).

Verified gaps, priority order:

1. **Cross-session entity resolution** — DJ's own example. New chat, no history, _"the beta email
   task is done."_ The agent must **search** the project for the referent. Today's closest scenario
   (`document-edit-context.scenario.ts:118`) resolves _"that section you just added"_ — but that
   referent sits in the threaded session, which is a fundamentally easier mechanism. **The cold case
   has zero coverage.** Highest value scenario in this list.
2. **Ambiguous referent** — three tasks partially match. Correct behavior is to disambiguate. Assert
   a question was asked **and zero mutations occurred**.
3. **The no-op case** — user mentions a task in passing, asks for nothing. Assert **zero writes**.
   Nothing in the suite currently catches a spurious mutation, which is the eager-agent failure mode.
4. **Reschedule by reference** — resolution plus a date mutation, verified against `due_at`.
5. **Multi-entity update in one turn** — "mark the first two done and push the third."
6. **Document from a vague description** — "we need to figure out research for a doc about X."
   Partially covered by `document-create`; the gap is non-imperative phrasing.

**Source them from real transcripts where possible.** The established practice in `phase-a.json` is
`source.kind: "production_chat_turn"` with a one-way `turn_ref_hash` and raw ids dropped. Invented
phrasing is a last resort — real users are terser and sloppier than anything you will write.

---

## 6. Tier 2 — what needs DJ's brain

For an open brief there is no answer key, so **DJ's taste is the ground truth**. The interview is not
a nicety here; it is the only way to obtain the rubric.

Two things the corpus must carry that only he can supply:

- **The briefs themselves**, in his words — things he would actually type, not plausible-sounding
  commissions you invented.
- **The acceptance bar** — what makes a plan worth executing vs. worth closing the tab on.

---

## 7. The interview guide

DJ's operating instructions (`~/.claude/CLAUDE.md`) apply and matter here:

- He is **vision-first**. Talk in product, UX, and outcome terms. Make the technical calls yourself.
- **Lead with an open-ended question**, then narrow only where his answer leaves a real fork.
- He will sometimes say _"I don't have a vision for that part — you decide."_ **Then decide.** Do not
  push the question back at him.
- Pitch lean and ambitious versions and let him pick; never silently default to lean.

Run the blocks in order. Blocks A and C are the highest value — if the session runs short, protect
those.

### Block A — real failure modes (Tier 1)

> **Open:** "Walk me through the last few times the agent did something wrong in chat. Not crashes —
> times it did the wrong thing _confidently_."

Then narrow:

- When you tell it a task is done in a fresh chat, **what do you actually type?** (Need his real
  terse phrasing. This becomes scenario #1 verbatim.)
- Has it ever written or changed something you didn't ask for? What was it?
- When you've referred to something vaguely, what did it do — guess, ask, or pick wrong?
- Any phrasing you've learned to avoid because it breaks things?

### Block B — the briefs (Tier 2)

> **Open:** "What would you actually type into BuildOS if you wanted it to go _do real work_ for you
> — not answer a question, go do something? As many as come to mind, in your words."

Then narrow:

- Which of those would you use **weekly** if it worked?
- Take the marketing plan one — **what would you do with the output?** (This reveals the real
  acceptance bar far better than asking about quality directly.)
- For each brief: could a smart contractor just make reasonable assumptions and start, or is there
  something only you know that they'd have to ask for first? → **this is the blocked vs. proceedable
  label**, and without it the clarification behavior in §6.1 of the spec cannot be scored at all.

### Block C — taste extraction (the crux)

This block produces the L3 rubric and the human anchor for the swap-test metric. Do not skip it.

- "Describe a marketing plan you'd throw away in ten seconds. What's in it?"
- "Two plans land. One is three bullets that are exactly right. One is three pages that are 70%
  right. Which do you want?"
- **"What would make you trust it actually read your project — versus pattern-matched the phrase
  'marketing plan'?"**
- **"What could a plan say that would make you go: oh, it genuinely gets this project?"**

The last two are the most important questions in the interview. They are the human definition of the
**grounding ratio** and the **swap test** — the metrics with no published equivalent. Capture his
answers close to verbatim; paraphrasing will sand off exactly the specificity you need.

### Block D — the swap-test pair

- "Which two of your real projects are the **most different** from each other?"
- "For which one would a generic plan be _obviously_ wrong at a glance?"

You need two genuinely different domains for the metric to have range. Candidates visible in the
workspace include a personal training program and SaaS/launch-shaped projects, but let him choose.

### Block E — scope

- "What's the smallest version of this that would make you go 'okay, that's real'?"
- "Is there a brief where you'd be genuinely surprised if it worked?"

---

## 8. Decisions already made — do not re-litigate

| Decision                                                                                                      | Made                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Finish Phase A first; open-brief evals are the follow-on                                                      | DJ, 2026-07-25                 |
| Tier 1 breadth before Tier 2                                                                                  | DJ, 2026-07-25                 |
| DJ has 2–3 hrs of blind labeling, one sitting                                                                 | DJ, 2026-07-25                 |
| **Clarification: run-and-surface by default, ask-first allowed when genuinely blocked. Not black and white.** | DJ, 2026-07-25 — see spec §6.1 |
| Silent guessing is the only hard violation; judgment quality is scored by DJ, not by code                     | derived from the above         |

---

## 9. Definition of done

1. Tier 1 scenarios written, registered in `catalog.ts`, and **passing or failing for a real reason**
   — a scenario that fails because the product is broken is a success for this task. Say so plainly
   rather than tuning it green.
2. A brief corpus with every brief carrying its text, target snapshot, blocked/proceedable label, and
   DJ's acceptance bar in his words.
3. `OPEN_BRIEF_EVAL_METHODOLOGY.md` §6.2 updated with the swap-test project pair.
4. A short report to DJ: what he said that changed the design, and what you decided on his behalf.

**The failure mode of this session is producing a nice summary document and zero scenario files.**
Capture his answers as corpus artifacts while he talks.

---

## 10. Related

- [`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md) — the spec
- [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) — §8 only, if you must
- [`README.md`](./README.md) — the agent-first architecture being measured
- `tasker/37-agent-first-orchestration-phase-a.md` — the Phase A kickoff brief (context, not your task)

<!-- docs/research/project-structure-search-eval-2026-09-29/README.md -->

<!-- doc-status: point-in-time -->

# Does folding or nesting projects help the agent find things?

Test plan and results, September 29, 2026. **Status: run complete.** DJ approved up to $0.50. It
cost $0.25 by OpenRouter balance change, or $0.45 by per-call receipts. Results are
[below](#results-2026-09-29), and the click-through page is
https://claude.ai/artifact/3EFYNSa1j7LDskb67VasUU (private to DJ).

This test comes out of the review of
[project-evolution-and-workspace-organization-2026-09-29.md](../project-evolution-and-workspace-organization-2026-09-29.md).
DJ likes the ambitious version (fold projects into projects, nest clients under a business, a
drag-and-drop Desk). He asked whether the agent would find things more easily in that structure,
before we build it.

## What we already know

The agent's cross-project search already works like a folder walk:

1. **Hop 1:** one card per project with the name, description, next step and record titles.
2. **Zoom:** pick up to 3 projects.
3. **Hop 2:** pick records inside them, then the sections of the best documents.

The 09-23 eval ([README](../jev-global-context-2026-09-23/README.md)) ran on DJ's real 46
projects:

- **The right project was reached about 95% of the time**, even with today's flat, messy list.
- **The right records were loaded in full only 39–72% of the time.**

So the open question is whether structure changes the second number, and whether it stops
stale twins from winning.

## The three workspace versions

Every version is built in memory from one read-only snapshot of DJ's account, taken 09-29.
Nothing in the account changes.

| Version             | What changes                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flat**            | Nothing. 46 projects as saved.                                                                                                                                                                                                                                                                                               |
| **Folded**          | Every record of DJ Wayne Studio and the three creator proposals (Julian Dorey, Hannibal Is Hungry, Nomtastic Kim) moves into Wayne Strategies. Their cards disappear, leaving 42. Folded START HERE docs become ordinary documents, and Wayne keeps its own. Record titles are unchanged; a folder would not show in search. |
| **Folded + nested** | Folded, plus labels: the Wayne card says it includes UXM Training Website, Beyond Exit Planning, Redline Training Company Website, The Cadre Content Operations and The Cadre- DJ Internal. Each of those cards says it is part of Wayne Strategies.                                                                         |

The specs are in `structures/`. Nesting is a label only. It grants no access, and zooming the
hub does not automatically pull in its clients. If business-level questions still miss the
clients, that pull-in is the next thing to test.

## The questions

There are 27 questions: 11 new Wayne questions and the 16 from 09-23. The answer keys are in
[`scenarios.json`](scenarios.json).

- **Must:** records the answer can't do without.
- **Outdated:** records that would mislead if loaded without the current ones.

### New Wayne questions

These were written from DJ's records, so they are not real messages. DJ should edit any that
don't sound like him.

| Key             | Question                                                                                                          | Where the answer lives (must)                                                                                                               | Outdated records                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| offer_now       | "what's my main offer right now for local businesses? like what do I actually lead with when I talk to an owner?" | Studio: Offer sheets (Diagnosis, Bid Desk, Quiet Quote Recovery). Wayne: Brand Direction & Rebrand History.                                 | Tacemus Positioning document, Tacemus Vision 2.0                      |
| samos_same      | "wait, is samos the same thing as wayne strategies? what happened to that name?"                                  | Studio: Samos — project context. Wayne: Brand Direction & Rebrand History.                                                                  | —                                                                     |
| cash_90         | "what's my plan to get to ten grand of new money in the next 90 days? who's closest to paying?"                   | Studio: Cash probe (33 actions). Studio task: propose the $2,500 automation to the financial analyst.                                       | —                                                                     |
| creator_desks   | "which maryland creators did I build those proposal desks for, and did any of the outreach actually go out?"      | The three "finalize and send outreach" tasks (Julian, Hannibal, Nomtastic) and the Julian proposal brief.                                   | —                                                                     |
| julian_pitch    | "what did I pitch julian dorey, and where did that end up?"                                                       | Julian project: Proposal Brief. Wayne: Julian Pitch.                                                                                        | —                                                                     |
| mca_status      | "what happened with the maryland content authority thing? am I still doing that?"                                 | Wayne: Wayne Strategies Context (holds the decision to drop it). Wayne: Tacemus — START HERE (holds the vision).                            | —                                                                     |
| brand           | "what's the brand direction for wayne strategies? the old money / legacy thing"                                   | Wayne: Brand Direction & Rebrand History.                                                                                                   | Tacemus Brand Imagery and Core Values, Tacemus Positioning document   |
| site_leads      | "when someone fills out the form on waynestrategies.com, where does it go? is that working yet?"                  | Wayne: Website inquiry and diagnosis pipeline. Wayne task: activate the intake pipeline.                                                    | —                                                                     |
| la_industrial   | "what do I still owe louis for the LA industrial shirts?"                                                         | Wayne: LA Industrial meeting notes. Wayne task: send apparel proofs.                                                                        | —                                                                     |
| rod_status      | "where am I with rod? did he ever pay, and what's next with him?"                                                 | Wayne task: payment collection for Rod. Beyond Exit: Rod Session 1 outcome. Beyond Exit task: arrange the next Rod conversation.            | Rod Chamberlin Project Recovery Plan, Rod website Unified Action Plan |
| clients_rundown | "give me a rundown of wayne strategies — the business itself and every client I'm working with right now"         | Tasks: send Logan the Redline offer, first Conversations with Rod batch, LA Industrial apparel proofs. UXM and Cadre are helpful, not must. | —                                                                     |

**What each group tests:**

- **Split between twins:** offer_now, samos_same, cash_90, julian_pitch, creator_desks. The
  answer is spread across Wayne, Studio or the proposal projects today. Folding should help
  here.
- **Wayne-only:** mca_status, brand, site_leads, la_industrial. The answer already lives in
  Wayne. Folding makes Wayne bigger, so these check whether that hurts.
- **Business and clients:** clients_rundown and rod_status. These test the nesting labels.

### Carried over from 09-23

These are 12 of DJ's real global-chat messages plus 4 synthetic ones. The labels are unchanged,
except that "Tacemus Website Design" is now "Wayne Strategies".

- **Wayne-related:** logan_offer, brain_dump_routing (Rod, Cody, Tacemus), phil_demo,
  samos_alias, ian_minor, naaccc_lunch.
- **Checks that folding doesn't hurt elsewhere:** theo_von (+ follow-up), ninetakes_status,
  air_days, todo_dump, portfolio, book_structure.
- **Controls:** calendar, thanks, quantum_negative. These should load nothing.

## Scores

- **Must project reached:** zoomed or pulsed (a pulse is a portfolio answer's START HERE
  summary).
- **Must records loaded in full / named** (named means shown in full or as a summary).
- **Outdated records named.** This is new; lower is better.
- **Scope right, controls clean, context size added.**

## How we read the results

- **Folding wins** the split questions (records loaded, outdated named) **without losing** on
  Wayne-only or elsewhere → build fold-into first.
- **Nesting labels add wins** on clients_rundown and rod_status → put `part_of` / `includes`
  on cards. It's a small change, already written for this test.
- **No version moves the numbers** → structure is a UI choice for DJ's eyes. Spend the effort
  on outside-agent search and record picking inside projects, and build the Desk only for
  navigation.
- **Folding hurts Wayne-only questions** → a folded project needs sub-scopes (folders the finder
  can rank), or clients should stay separate projects with labels.

## Free findings so far

### A folded Wayne is close to the in-project search ceiling

| Version | Wayne records | Wayne hop-2 request |
| ------- | ------------- | ------------------- |
| Flat    | 88            | 52 KB               |
| Folded  | 144           | 80 KB               |

The finder's request bound is 88 KB. Folding one more project into Wayne would push it over,
and the finder would start trimming what it can see. **Fold-into needs a size check**, or big
projects need folders the finder ranks first.

### Outside agents use plain text match

Codex and Claude use plain text matching, and roughly half of DJ's project changes come through
them. The table below is a simulation on the snapshot that mirrors `searchProjects` (the query
must appear inside the name plus description) and the record search (title, content and
description).

| Query an outside agent types          | Project search (name + description) | Record search: hits by project                                        |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Samos                                 | none                                | DJ Wayne Studio 7 (nothing in Wayne)                                  |
| Wayne Strategies                      | Wayne Strategies only               | Wayne 7 (the Studio offer, cash plan and 73 prospects stay invisible) |
| consulting business                   | none                                | none                                                                  |
| Rod Chamberlain (DJ's usual spelling) | none                                | Wayne 2 (Beyond Exit missed)                                          |
| Phil Valeyo (voice spelling)          | none                                | none                                                                  |
| proposal desk                         | none                                | none                                                                  |
| Diagnosis                             | DJ Wayne Studio                     | 9takes 14, Studio 11, Wayne 4 (+ others: another meaning of the word) |
| Julian Dorey                          | Julian proposal                     | Julian 5, Wayne 3                                                     |

Text match finds exact names. It misses misspellings and paraphrases, can't tell current from
stale, and can't tell two meanings of a word apart. This is independent of structure, and it's
probably the largest single search gap.

## Results (2026-09-29)

**What ran.** 125 of the planned 162 runs. Every question ran once in all three versions. The
second pass stopped at the per-version cap after 14–16 questions, and those were the older
questions, since they come first.

- **Spend:** receipts summed to $0.1381 (flat), $0.1595 (folded) and $0.1566 (folded + nested),
  for $0.454 total. The OpenRouter balance moved $0.249, the same roughly 2× gap between
  receipts and balance seen on 09-23. That balance is account-wide, so it's an upper bound for
  this run.
- **Cost per run:** about $0.0036 by receipts, double the dry-run estimate.

**Group averages.** Default policy, mean of each question's runs.

| Group (questions)       | Measure              | Flat | Folded | Folded + nested |
| ----------------------- | -------------------- | ---- | ------ | --------------- |
| Split between twins (6) | Projects reached     | 92%  | 100%   | 100%            |
|                         | Records named        | 92%  | 100%   | 100%            |
|                         | Loaded in full       | 75%  | 75%    | 79%             |
|                         | Outdated named (1 q) | 100% | 50%    | 50%             |
| Wayne-only (4)          | Projects reached     | 100% | 100%   | 100%            |
|                         | Records named        | 88%  | 100%   | 88%             |
|                         | Loaded in full       | 88%  | 75%    | 75%             |
| Business + clients (6)  | Projects reached     | 60%  | 64%    | **94%**         |
|                         | Records named        | 51%  | 64%    | **94%**         |
|                         | Loaded in full       | 47%  | 56%    | 69%             |
| Elsewhere (7)           | Projects reached     | 100% | 100%   | 100%            |
|                         | Loaded in full       | 83%  | 75%    | 62%             |
| Controls (4)            | Loaded nothing       | 88%  | 100%   | 75%             |

**What it says.**

1. **Nesting labels are the big win.** On business + client questions, projects reached went
   from 60% to 94%, and records named from 51% to 94%.
    - Client cards that say "part of Wayne Strategies" score higher. On the rundown question,
      Beyond Exit rose from 0.36 to 0.61 and UXM to 0.55.
    - "What's going on with Ian Minor?" went from 25% to 100%: the search opened UXM, Wayne and
      The Cadre- DJ Internal.
2. **Folding fixes the twin miss, but it isn't a big search win by itself.**
    - Flat, "is samos the same thing as wayne strategies?" scored DJ Wayne Studio 0.21 and never
      opened it. Folded, the Samos context loads.
    - On the other split questions, flat search already opened both twins (for example, Studio
      0.94 + Wayne 0.61 on the offer question).
    - Outdated Tacemus docs on the offer question dropped from 2 of 2 to 1 of 2.
3. **A bigger Wayne reads a little shallower.** Wayne-only records were still named, but fewer
   loaded in full (88% → 75%). That's within noise. Together with the 80 KB of 88 KB request
   size, it argues for folding true twins only, with a size check.
4. **Limits:**
    - The rundown of every client tops out at 67%. The search opens at most 3 projects and
      drops any under 60% of the top score, so UXM and Cadre at 0.55 miss the cut.
    - The labeled hub pulls a little harder. The quantum control loaded Wayne at 0.41, just
      over the 0.4 floor; flat loaded BuildOS at 0.41 once. The Phil demo, a calendar request,
      switched from "no saved work" to loading both Cadre projects.

**Noise.** "Loaded in full" follows the gate that decides whether to look inside a project.
"What is going on with 9takes" scores 0.46–0.53 on that gate and went 100% → 50% → 0% across
the versions, even though 9takes is identical in all three. Treat group differences under about
20 points on that measure as noise. "Projects reached" and "records named" are steadier. The
Wayne questions ran once each.

**Next.**

- **Ship the label:** the owner sets a parent. The card code is already written.
- **Fold only the true twins**, with a size check.
- **Test "the hub opens its labeled clients"** on business-wide questions. Replay can check the
  selection for free; loading the clients' records needs a small paid run.
- **Separately, smarter connector search.**

## The paid run

- **Model:** Jev only (`typesafe/jev-1.13`). No main chat model runs.
- **Scope:** 27 questions × 3 versions × 2 reps = 162 runs. Full cards only (`--no-lean`).
- **Estimate** from the dry pass (hop 1 exact, hop 2 approximate):
    - about $0.045 per pass flat, and $0.052 folded;
    - **≈ $0.30 total**.
    - The 09-23 run's actual cost per run was a little higher than its estimate, so we planned
      for $0.40.
- **Hard stop:** `--max-usd 0.16` per version, **$0.48 total**.
- **Two reps, not three.** Three would cost about $0.45 and could cross $0.50 if the estimate
  runs high.

```bash
cd apps/worker
# free: sizes, label check, cost estimate (already run for all three versions)
NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/jev-global-context-eval.ts \
  --dump <snapshot.json> --out <dir>/<version> \
  --scenarios ../../docs/research/project-structure-search-eval-2026-09-29/scenarios.json \
  --structure ../../docs/research/project-structure-search-eval-2026-09-29/structures/<version>.json --no-lean
# paid, after DJ's OK: add
JEV_GLOBAL_EVAL_LIVE=1 ... --live --reps 2 --max-usd 0.16
```

The snapshot comes from the projection in the harness header. It holds private project content,
so it stays in the session scratchpad and out of the repo. `summary.json` in each output
directory is used to compare the versions side by side, and `explainer.json` feeds a "see it"
page: pick a question, then compare what each version loads.

## Not tested here

- **The main chat model's answers.** This measures what gets loaded, not the reply.
- **Project chat's full prompt.** DJ's most-used surface is project chat: 30 turns in 14 days,
  vs 1 global turn. Project chat uses the same in-project finder as hop 2, so the Wayne-only
  rows approximate it. The START HERE and steward layers are not simulated.
- **Hub zoom pulling in its clients**, and **folders as sub-scopes** inside a big project.
- **Outside agents with smart search.** A follow-up could run the same questions through the
  connector with Jev behind it.

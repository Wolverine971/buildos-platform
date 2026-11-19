<!-- tasker/169-knowledge-what-matters.md -->

# 169 — Knowledge: only what matters to you (lean)

**Status:** BUILT, UNCOMMITTED · **Opened:** 2026-11-18 · **Parent:** 160, 164, 165
**DJ (2026-11-18):** "some of these entities don't have anything to do with me": San Francisco,
Yorba Linda, DoorDash ("unless I work at DoorDash or I'm trying to pitch DoorDash"). Picked the
lean version.

## What was wrong (DJ's real graph, 577 entries)

- 12 places, all made by research (a person's `located_in`), none linked to his work.
- DoorDash: 1 mention in his work-history doc + 10 in AI research briefs; the old circle question
  ("do you know them?") put it, Desk and GPU in his **inner circle**. /knowledge ignored circles.
- ~40 non-names (Desk, Email, GPU, Q3 renewal, "company 146668815"); duplicates (Anduril /
  Anduril Industries, LA Industrial ×3).
- Mention counts can't separate them: 332 entries have exactly one mention and nothing else
  (Arnette Welding next to CNN). Task-link quotes were just the bare name.

## Built

- Migration `20261118400000_knowledge_relevance.sql` (APPLIED 11-18, ledger repaired):
  `hidden_reason` gains `not_a_name`; `knowledge_list` gains `p_view` (all | world | reference |
  dropped; default all, so chat/other callers are unchanged) and `p_place`; rows carry `circle`,
  result carries `views` totals and `places`.
- `packages/shared-agent-ops/src/knowledge/circles.ts`: the model question is now "does this
  matter to the user's own work?" → inner (your world) / public (just mentioned) / not_a_name
  (hidden, reversible) / unknown, plus "same one as a similar entry?" → merge suggestion. The model
  sees where each mention came from ("Your task: … (project …)", "AI research brief: …") and
  `comes_up_in` counts; the user's own answers are passed as `examples`. Old model decisions
  (before `CIRCLE_QUESTION_SINCE`) and "just mentioned"/unsure entries linked to new work are
  asked again. `findEntriesToSort`, `sortKnowledgeEntries`, `loadCircleExamples`,
  `findSimilarEntries`.
- Worker `knowledgeSortSweep.ts`, hourly at :23: sorts a user once 25 entries wait or the oldest
  waited a day. **Off unless `KNOWLEDGE_SORT_USER_IDS` is set** (ids or `*`).
- Script `apps/worker/scripts/knowledge-sort.ts`: dry (free) / `--preview` / `--write` (paid,
  `KNOWLEDGE_SORT_LIVE=1`).
- /knowledge opens on **Your world**; tabs Just mentioned and (once any) Not names; "Place"
  filter; search still finds just-mentioned names (tagged). Card: "Just a mention" / "Part of my
  world" / "Show again" (the user's answer; never overridden).
- Tests: `circles.test.ts` (17, incl. DoorDash/Arnette/Desk/Anduril end to end on a fake db;
  mutation-checked), `knowledgeSortSweep.test.ts` (3). Shared knowledge 117 + worker knowledge 59 green;
  web check 0 errors; worker typecheck clean.
- DoorDash set to "just mentioned" as DJ's own answer (he said so) → first example.

## Review pass (2026-11-18 PM)

- **Batch size 20 → 12.** A worst-case 20-entry call measured 96,009 bytes, over the decision
  client's 96 KB limit: that batch would have failed every hour. New test pins worst case < 70%
  of the limit (fails at 20, mutation-checked).
- The user's own answers are no longer restamped when they pass through a batch.
- Entries signals left "unknown" (nothing linked yet) are rechecked once work links to them.
- No merge suggestion into an entry being hidden as not a name.
- Card buttons only for the viewer's own entries (`circle` is only sent for own rows; a shared
  private entry belongs to someone else).
- Place filter renamed "Place" (tasker 168's "Where" pills sit on the same page).
- Verified: task reader and doc reader skip hidden names, so a not-a-name entry isn't recreated;
  research briefs are the only AI-generated doc type linked to DJ's entries; decision-model
  latency p90 368 ms, max 1.2 s (8 s timeout), 0 failures in 14 days; old circle call cost
  $0.000314 at 7.5k prompt tokens.
- Peer session staged these files together with tasker 168's; both features coexist on the page
  (picking a view or place leaves the project lens).

## Next

1. Paid preview on DJ's graph (514 waiting, 43 calls of 12, ≈ $0.02): needs OK.
2. `--write`, then deploy web + worker; set `KNOWLEDGE_SORT_USER_IDS` on the general worker.
3. Ambitious version (not built): "why it's here" line per card, weekly keep/drop tray, readers
   stop creating dropped names at the source.

# Book loop — open issues ledger

Everything the book dogfood loop has found, and where each item lives. Keep it short: one line per
issue, with its owner. Fix what serves real writers; skip test-case polish.

| # | Issue | Where | Status |
|---|---|---|---|
| 1 | Returning to a project ("where are we at?") gets logistics, not substance; the chat trusts stale START HERE over recent activity | tasker 97 | **built 09-23**, uncommitted; t13c passes 2 of 4 criteria fully, 2 partly; gate pending |
| 2 | Local stack lacked the prod capture sweep | `scripts/book-loop/checkpoint.sh`, called from `turn.sh` | **fixed 09-23** |
| 3 | Capture pile-up, candidate→decision promotion, log noise, deleted-doc refs, `Current state` echoing chat claims | tasker 96 | **mostly fixed 09-23**, uncommitted: Current state needs cited evidence (status reads 11/11), restates/kind verified; open = request-as-result 1/3, stale untouched lines, Finding 8 |
| 4 | Capture e2e (`capture-eval/e2e-qa.mts`) runs on the book-loop project clone | tasker 96 owner | open (now restores instead of deleting); QA tree's 2 dead Thinking-log nodes pruned 09-23 |
| 5 | Interviews ask 10–11 questions per turn | tasker 97 | **built 09-23**, uncommitted; t08c/t09c: 3 questions each, answers proposed; gate pending |
| 6 | Outline turn slow (110s, 15 reads incl. reads of deleted docs) | watch; retest after 96 | watch |
| 7 | CI red: `apps/worker/tests/contextFinderPilot.live.test.ts` `plan` possibly null | context-finder owner | open |
| 8 | A lead-in line leaks into a worker final reply ("I'll check what's actually scheduled…", t13c) | worker final-text | watch |
| 9 | Markdown link with a bare UUID as its URL (t08c) | prompt/record_references | watch |
| 10 | Redundant reads: a doc fetched whole, then again by outline and sections (t08b/c, 9 reads) | tool descriptions | watch |
| 11 | Provider "insufficient progress" stalls cost 5–24s on 2 of 6 turns (Together, CoreWeave) | provider routing | watch |
| 12 | `next_step_short` ("Draft the one-page book overview") is stale, and chat quotes it | capture / project digest | open |
| — | Outline chapters not numbered past Part II; stale "Phase 2" placeholder above the outline | model judgment on one doc | **won't fix in harness**; ask BuildOS in-book if it matters |
| — | Leading blank lines in one reply | cosmetic | watch |

## Fixed earlier (committed)
Slow-stream watchdog vs hidden reasoning · empty-reply repair with reasoning off · acting cap 4K→12K ·
commission rule ("describing never stages") · false "could not finish" summary · fiction mode
(system deleted) · connector frozen project list (tasker 94) · hybrid capture (tasker 95) · mission line:
thinking is auto-captured.

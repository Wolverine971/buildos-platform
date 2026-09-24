<!-- scripts/book-loop/ISSUES.md -->

# Book loop — open issues ledger

**As of 2026-09-23 the loop runs on DJ's REAL project in prod** (`BOOK_LOOP_TARGET=prod scripts/book-loop/turn.sh …`); the QA clone is retired. Fixes reach the loop only after deploy.

Everything the book dogfood loop has found, and where each item lives. Keep it short: one line per
issue, with its owner. Fix what serves real writers; skip test-case polish.

| # | Issue | Owner | Status |
| --- | --- | --- | --- |
| 1 | Returning to a project gets logistics, not substance; stale START HERE trusted over recent changes | tasker 97 | committed at HEAD (192eb2d12); verify in prod after deploy |
| 2 | Interviews ask 10–11 questions per turn | tasker 97 | committed at HEAD; verify in prod |
| 3 | Capture: pile-up, candidate→decision promotion, log noise, deleted-doc refs, `Current state` echoing chat claims | tasker 96 | mostly fixed, **uncommitted** (staged); open: Finding 8, request-as-result, stale untouched lines |
| 4 | Decisions recorded in START HERE never reach the source docs they change ("Exclusions dropped" vs contract) | tasker 96 (Finding 11) | open; not listed in 96's status; confirm it's tracked |
| 5 | General-context chats never captured into a project | tasker 96 (`globalAttribution.ts`, staged) | in progress |
| 6 | Wrong link domain `buildos.com` in replies | tasker 100 | open |
| 7 | "Let me check…" narration + leading blank lines saved into replies | tasker 100 | open |
| 8 | BuildOS-written docs say "the user" about their owner; replies echo it | tasker 100 | open |
| 9 | Invented facts in status answers ("Day 1 of the project") | tasker 100 | open |
| 10 | Stale `next_step_short` quoted as current | tasker 100 | open |
| 11 | Markdown link with a bare UUID as its URL | tasker 100 | open |
| 12 | Generic "internal check… retry" after an exhausted review | tasker 100 (confirm vs 99) | open |
| 13 | CI red: `contextFinderPilot.live.test.ts` `plan` possibly null | tasker 100 (quick) | open |
| 14 | Redundant reads (doc fetched whole, then by outline and sections) | — | watch |
| 15 | Provider "insufficient progress" stalls 5–24s on some turns | — | watch |
| 16 | Multi-edit outline update used 2 review rounds (p07) vs 1 (p06) | — | watch |
| — | Chapters not numbered past Part II; stale "Phase 2" placeholder | — | won't fix in harness; ask BuildOS in-book |
| — | Capture e2e runs on the QA clone | — | moot: the loop moved to prod |

## Verified fixed in prod (09-23)
Surgical document edits (tasker 99): Exclusions removal (p04: 69s, 1¢, 1 review) · 4-card outline edit (p06: 10 one-line edits, 1 review, 1.3¢) · 3-spot content fill (p07: 2.2¢).

## Fixed earlier (committed)

Slow-stream watchdog vs hidden reasoning · empty-reply repair with reasoning off · acting cap 4K→12K ·
commission rule ("describing never stages") · false "could not finish" summary · fiction mode
(system deleted) · connector frozen project list (tasker 94) · hybrid capture (tasker 95) · mission line:
thinking is auto-captured.

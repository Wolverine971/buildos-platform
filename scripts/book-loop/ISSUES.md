<!-- scripts/book-loop/ISSUES.md -->

# Book loop — open issues ledger

**As of 2026-09-23 the loop runs on DJ's REAL project in prod** (`BOOK_LOOP_TARGET=prod scripts/book-loop/turn.sh …`); the QA clone is retired. Fixes reach the loop only after deploy.

Everything the book dogfood loop has found, and where each item lives. Keep it short: one line per
issue, with its owner. Fix what serves real writers; skip test-case polish.

| #   | Issue                                                                                                              | Owner                                      | Status                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Returning to a project gets logistics, not substance; stale START HERE trusted over recent changes                 | tasker 97                                  | committed at HEAD (192eb2d12); verify in prod after deploy                                                                                                    |
| 2   | Interviews ask 10–11 questions per turn                                                                            | tasker 97                                  | committed at HEAD; verify in prod                                                                                                                             |
| 3   | Capture: pile-up, candidate→decision promotion, log noise, deleted-doc refs, `Current state` echoing chat claims   | tasker 96                                  | mostly fixed, **uncommitted** (staged); open: Finding 8, request-as-result, stale untouched lines                                                             |
| 4   | Decisions recorded in START HERE never reach the source docs they change ("Exclusions dropped" vs contract)        | tasker 96 (Finding 11) + tasker 106        | tasker 106 radar now DETECTS it (decisions as news + section dig → Fix in chat); built, uncommitted; auto-propagation still open in 96                        |
| 5   | General-context chats never captured into a project                                                                | tasker 96 (`globalAttribution.ts`, staged) | in progress                                                                                                                                                   |
| 6   | Wrong link domain `buildos.com` in replies                                                                         | tasker 100                                 | fixed, uncommitted: prompt says exact relative `/projects/` url; chat renderer + history rewrite any-host record links to relative (`assistant-app-links.ts`) |
| 7   | "Let me check…" narration + leading blank lines saved into replies                                                 | tasker 100                                 | fixed, uncommitted: only a pass that ends without tool calls speaks; opening blank lines trimmed (`turn-provider.ts`, `turn-state.ts`)                        |
| 8   | BuildOS-written docs say "the user" about their owner; replies echo it                                             | tasker 100                                 | fixed, uncommitted: owner-voice line in chat Safety rules + START HERE capture prompt; existing outline lines need an in-book cleanup turn (DJ OK)            |
| 9   | Invented facts in status answers ("Day 1 of the project")                                                          | tasker 100                                 | fixed, uncommitted: no day count without a recorded start; source = stale "100-day clock started (2025-04-14)" stamp in START HERE                            |
| 10  | Stale `next_step_short` quoted as current                                                                          | tasker 100                                 | fixed, uncommitted: prompt labels it "Saved next step (may predate recent work)"; generator now reads START HERE and treats the old step as possibly stale    |
| 11  | Markdown link with a bare UUID as its URL                                                                          | tasker 100                                 | fixed with 6 (bare-id link renders as text)                                                                                                                   |
| 12  | Generic "internal check… retry" after an exhausted review                                                          | tasker 100 (confirm vs 99)                 | fixed: tasker 99 removed the copy (after p02 ran); revision-cap path now names the held change (uncommitted)                                                  |
| 13  | CI red: `contextFinderPilot.live.test.ts` `plan` possibly null                                                     | tasker 100 (quick)                         | fixed on HEAD; CI red again from 4 web test-type errors in other sessions' files                                                                              |
| 14  | Redundant reads (doc fetched whole, then by outline and sections)                                                  | —                                          | watch                                                                                                                                                         |
| 15  | Provider "insufficient progress" stalls 5–24s on some turns                                                        | tasker 101                                 | 9 watchdog kills in the 09-24 gate (3 right after pre-tool narration); fix candidates in tasker 101                                                           |
| 16  | Multi-edit outline update used 2 review rounds (p07) vs 1 (p06)                                                    | —                                          | watch                                                                                                                                                         |
| 17  | Freshness radar: scans independent, repeat flags never accumulate or close, AI Pillar doc + blueprint task dropped | tasker 106                                 | built + replay-accepted 09-25 ($0.0025): both roll up, surface once, close on fix; UNCOMMITTED; prod migration + deploy need DJ                               |
| —   | Chapters not numbered past Part II; stale "Phase 2" placeholder                                                    | —                                          | won't fix in harness; ask BuildOS in-book                                                                                                                     |
| —   | Capture e2e runs on the QA clone                                                                                   | —                                          | moot: the loop moved to prod                                                                                                                                  |

## Verified fixed in prod (09-23)

Surgical document edits (tasker 99): Exclusions removal (p04: 69s, 1¢, 1 review) · 4-card outline edit (p06: 10 one-line edits, 1 review, 1.3¢) · 3-spot content fill (p07: 2.2¢).

## Fixed earlier (committed)

Slow-stream watchdog vs hidden reasoning · empty-reply repair with reasoning off · acting cap 4K→12K ·
commission rule ("describing never stages") · false "could not finish" summary · fiction mode
(system deleted) · connector frozen project list (tasker 94) · hybrid capture (tasker 95) · mission line:
thinking is auto-captured.

<!-- docs/product/activation-start-here-phase0-findings-2026-07-11.md -->

# Phase 0 Findings — Start Here Quality Sampling (Ticket 1)

Date: 2026-07-11
Parent plan: `activation-start-here-daily-brief-plan-2026-07-10.md`
Method: read-only production Supabase sampling (all `document.context.project` docs, all
`Update project START HERE` agent runs), plus code-path verification against
`packages/shared-agent-ops/src/ontology/start-here.ts` and
`apps/worker/src/workers/chat/startHereCaptureProcessor.ts`.
Activation false-positive baseline (41.4% zero-project completions) was already recorded in
tasker/26; not re-measured here.

## Population (prod, 2026-07-11)

| Measure                                                         | Value                                    |
| --------------------------------------------------------------- | ---------------------------------------- |
| Live `document.context.project` docs                            | 100 (90 projects, 31 owners; DJ owns 42) |
| True Start Here docs (managed status/map regions present)       | 65                                       |
| — of those, status region still `State: Unknown` + empty map    | **54 (83%)**                             |
| — ever refreshed by a snapshot (`_Last refreshed_` footer)      | 10                                       |
| Docs created by the 2026-06-24 backfill                         | 56                                       |
| Docs with old-template plain-text scaffolding in authored zones | 54                                       |
| Ordinary chat/instantiation context docs sharing the type_key   | 35 (no managed regions)                  |
| Projects with >1 `document.context.project` doc                 | 5                                        |
| Capture runs, all time (label `Update project START HERE`)      | 11 — all DJ's projects                   |
| — status breakdown                                              | 4 completed, 6 partial, 1 proposal_ready |

## Finding 1 — Backfilled Start Here docs are stale husks (blocks Phase 2 prominence)

The forced context snapshot only fires on new project instantiation. The 6/24 backfill created
template docs but never queued snapshots, so **83% of real Start Here docs still read
`State: Unknown / No project snapshot has been rendered yet`** with an empty knowledge map.
If Phase 2 surfaces Start Here prominently today, most existing users see a memory card that
says their project's memory is empty.

**Action:** one-time snapshot backfill — enqueue `build_project_context_snapshot` for the ~54
stale projects (script drafted, dry-run default: `apps/web/scripts/backfill-snapshot-refresh.mjs`).
The Phase 2 card must also render a graceful "memory not refreshed yet" state rather than
parroting `State: Unknown`.

## Finding 2 — Old-template scaffolding pollutes prompts as fake content

54 backfill docs use an older template variant: a `> _authored - capture target_` marker line
followed by **plain-text** instructional lines ("- Things we are deliberately not doing, with the
reason in brief.", "2-4 sentences: what just happened…"). `stripPromptNoiseLines` only strips
italic-blockquote lines and the refresh footer, so these instructional lines flow into chat
prompts, brief context, and any display excerpt **as if they were authored project content**.

**Action:** extend the noise-stripper (or a one-time content migration) to drop the known
old-template instructional lines. Cheap, high hygiene value for every prompt consumer.

## Finding 3 — Capture proposal content is good; the accept path is broken

Where session-end capture fires, the proposed content is genuinely durable and specific
(decisions with dates, constraints, diagnosis — see Spooky Good, Operation Second Round, BuildOS
runs). **Prompt tuning is not the bottleneck.** The plan's question "is prompt tuning needed?" —
answer: no, not yet.

The bottleneck is mechanical: **6 of 11 runs (55%) ended `partial` with the identical error**
"Staged document change is stale: current data no longer matches the reviewed before snapshot."
The snapshot worker (or any doc touch) rewrites the doc between staging and human accept, so the
before-snapshot comparison fails and the proposal becomes permanently unappliable. The capture
processor already strips managed regions from the staged `after` precisely because they are
snapshot-owned; the stale check must apply the same logic — compare with managed regions (and
volatile footer) stripped from both sides for this op.

## Finding 4 — Wrong-document targeting via type_key overload

35 of 100 docs sharing `document.context.project` are ordinary context/architecture docs.
`pickProjectStartHereDocument`'s fallback (any candidate when no explicit doc exists) caused 3
capture runs on 9takes to stage full-document updates against **"Instagram Saves Engine —
Architecture (Slim)"** — a 14.5k-char architecture doc that is not a Start Here doc. Repeat
sessions also re-proposed near-identical content (no dedup against pending proposals for the same
doc).

**Action:** capture flow should only target _explicit_ Start Here docs (template origin or START
HERE title); when none exists, create one via `ensureProjectStartHereDocument` instead of
adopting an arbitrary context doc. Dedup/supersede pending proposals for the same document.

## Finding 5 — Two template dialects; managed status region is the only reliable machine surface

New chat-created projects get a "<Name> Context Document" (Vision & Summary / Initial Goals /
Initial Tasks variant); `ensureProjectStartHereDocument` paths get the six-section START HERE
template. Zero live docs contain the current `> _Capture target:` placeholder dialect. The one
structure shared by every maintained doc is the **managed `status` region** (State / Now / Next
step) merged by the snapshot worker, plus `onto_projects.next_step_short`.

**Implication for Phase 2:** the snapshot card should parse the managed status region and
`next_step_short`, never assume the six-section layout, and fall back to the doc's first
authored paragraph for "What this is".

## Five orientation questions — current answers

| Question                       | New (instantiated) project                       | Backfilled project    |
| ------------------------------ | ------------------------------------------------ | --------------------- |
| What is this project?          | ✅ seeded Vision/description                     | ✅ seeded description |
| Current state?                 | ✅ managed status after snapshot                 | ❌ `State: Unknown`   |
| Next move?                     | ✅ `next_step_short` + status                    | ❌ `Not captured yet` |
| What was decided?              | ⚠️ only if a capture run was accepted (55% fail) | ❌ scaffolding only   |
| What changed since last visit? | ➖ deliberately `/today`'s job                   | ➖ same               |

## Phase 0 exit assessment

- Start Here quality: **known** — creation-time content is good, maintenance loop is broken in
  three specific, fixable places (snapshot coverage, stale-accept, doc targeting).
- Activation false positives: **quantified** (41.4%, tasker/26; gate now shipped).
- New data model needed: **no** — every finding is a surfacing/plumbing fix on existing tables.
- Remaining Phase 0 item: the three-intent live walkthroughs (`organize`/`plan`/`unstuck`) —
  one de-facto walkthrough exists (tasker/26 Balcony Herb Garden). DJ-driven; not blocking
  Phase 2 build.

## Recommended fix order (feeding Phase 2)

1. Stale-accept fix in change-set commit comparison (unblocks the existing review loop).
2. Snapshot backfill for the 54 stale docs (dry-run script ready; DJ triggers real run).
3. Scaffolding noise-strip extension for old-template lines. **BUILT 2026-07-11** (see below).
4. Capture targeting: explicit-doc-only + ensure-on-missing + pending-proposal dedup.
5. Phase 2 snapshot card designed against Finding 5 (managed status + next_step_short, graceful
   unrefreshed state). **BUILT 2026-07-11** (see below).

## BUILD STATUS — 2026-07-11 (uncommitted; typecheck + tests + lint green, live-verified)

Phase 2 Tickets 5 + 6 plus fix #3 shipped in the same slice:

- **Parsers** — `packages/shared-agent-ops/src/ontology/start-here.ts`:
  `parseStartHereStatusRegion` (inverse of `renderStartHereStatusContent`; flags never-rendered
  template as `rendered: false`) and `extractStartHereOrientation` (handles the `What this is`
  and instantiation `Vision & Summary` dialects + first-paragraph fallback). New
  `start-here.test.ts` (8 tests). Dist rebuilt.
- **Fix #3** — `stripPromptNoiseLines` now drops the five 6/24 legacy plain-text scaffold lines,
  so every prompt/brief/display consumer stops seeing fake authored content.
- **Memory card** — `apps/web/src/lib/components/project/ProjectMemoryCard.svelte`, rendered on
  the v2 project page between PulseStrip and search. Shows freshness (authored-over-refresh
  heuristic), Now, Next step (falls back to `onto_projects.next_step_short`), 2-line
  orientation; actions `Update project` (opens project-context AgentChatModal) and
  `Open Start Here` (existing DocumentModal deep link). Graceful "Not refreshed yet" state.
- **Content-staleness fix** — `hasContextDocumentContent` on the project page now only accepts
  the `content` column: `props.body_markdown` is a legacy copy without managed regions (verified
  in prod — Spooky Good's props copy lacks both regions), and treating it as loaded left the
  card (and the edit modal) on a stale body.
- **Ticket 6 telemetry** — `loop-telemetry.ts` gains surface `'project'` + events
  `project_opened`, `memory_snapshot_shown`, `start_here_opened`, `memory_update_started`; all
  added to client `FUNNEL_EVENTS` (plus the missing `first_capture_skipped`). First-open vs
  reopen is derived in PostHog from per-user event ordinality — no new tables.
- **Live verify** — Spooky Good project on a fresh dev server: card rendered real state
  (`Now: 6 open tasks · 0 overdue`, next step, orientation, "Memory updated 1 hour ago"), both
  actions opened the right modals, health logs fired at load and on click.

Still open from this slice: run `apps/web/scripts/backfill-snapshot-refresh.mjs --apply`
(DJ decision — queues 52 prod snapshot jobs), fix #1 stale-accept, fix #4 capture targeting,
Phase 3A/B. Note: a long-running dev server needs a restart after the shared-agent-ops dist
rebuild (stale SSR module cache 500s the project page).

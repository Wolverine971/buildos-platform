<!-- tasker/26-phase1-onboarding-activation-slice.md -->

# 26 - Phase 1: Onboarding Activation Slice

**Created 2026-07-10.** Owner: next product/engineering agent.
**Type:** scoped build handoff. This is Phase 1 of the thinking-loop plan-of-attack, scoped with
the activation research in hand (tasker/22 + tasker/23 outputs now exist in `docs/product/`).

## Why this build, in one paragraph

The activation assessment's verdict: BuildOS is _adjacent to_ activation, not at it. The two-part
definition it landed on — **first structured win** (a real brain dump becomes a recognized
structured project, opened in-session) as precondition, **the remembered return** (user returns
24h+ later and acts on surfaced memory without re-creating context) as North Star. The funnel's
biggest hole is that onboarding does not force the first structured win: `ProjectsCaptureStep` is
tutorial-style, Continue/Skip always advances, and `complete_v3` accepts `projectsCreated: 0` for
every intent. This slice builds the forcing function.

## Read first

- `docs/product/activation-as-strategy-assessment-2026-07-07.md` — blockers B1–B6, funnel map,
  instrumentation diff, 7/30/90 plan. This tasker is its 30-day core.
- `docs/product/thinking-loop-plan-of-attack-2026-07-07.md` §Phase 1 — the four work items this
  scoping refines.
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md` — the UX spec
  (composer left / transformation panel right, continue rules, success state). Still the design
  source of truth; written pre-/today, so reuse the newer contracts below.
- `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md` — P1/P2 items this overlaps
  (transformation reveal, sample project).
- `docs/product/day-30-moat-context-compounding-2026-07-07.md` — the day-1 rung of the ladder
  this slice must prove ("messy input becomes a recognizable project").

## Decisions DJ must make BEFORE building (from the assessment §8)

**DECIDED 2026-07-10 (DJ):**

1. **Default landing flip** — ✅ **Flip both now.** `/` → `/today` and `ReadyStep` → `/today`
   (`apps/web/src/routes/+page.server.ts`, `apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte`).
2. **Zero-project gate** — ✅ **Yes, gate both** UI and `complete_v3`, with the explicit +
   analytics-tagged `explore` escape hatch.
3. **Direct create vs review proposal** — ✅ **Direct create** via the parse-and-apply pipeline
   (rebuild spec assumption). Receipt shows what was created with edit affordances after the
   fact; "accepted structure" signal = user continues past the receipt.
4. **Creator intent + sample project** — ✅ **Deferred out of this slice.** Keep pain-based
   intents; creator intent becomes its own follow-up once the gate proves itself.

## Work packages

### WP-1: Inline first brain dump in onboarding

Replace the tutorial-style `ProjectsCaptureStep.svelte` (chat-modal overlay) with inline capture
per the rebuild spec §6–7. Reusable contracts from /today quick capture
(`apps/web/src/routes/today/+page.svelte` `submitCapture()`):

- `contextType: 'general'` — skips the chat context selector, normalizes to workspace scope
  (`normalizeAgenticChatContextType`).
- `autoSendInitialDraft` prop on `AgentChatModal` — fires the send once when the draft lands in a
  ready composer. Do NOT remove its hold-while-selector-up guard.
- `TextareaWithVoice` for the composer (voice parity with /today).

Route through the project-creation pipeline, NOT raw `onto_braindumps` title/topic processing.
Show progress while structure generates. Whether the chat modal is the processing vehicle or a
headless run is an implementation call — the spec's inline experience is the bar.

### WP-2: Transformation receipt

After processing: "I found this project, these tasks, this current state, this next move" —
created/updated entities with edit/accept before continuing (shape depends on DJ decision 3).
Then land the user in the project (or /today per decision 1) with the new memory visible.

### WP-3: Gate non-explore zero-project completion

- UI: Continue stays disabled (or routes back to capture) for non-explore intents at 0 projects.
- Server: `complete_v3` in `apps/web/src/routes/api/onboarding/+server.ts` rejects non-explore
  zero-project completion (the funnel's false-positive source: `onboarding_completed` currently
  fires at `projects_created: 0`).
- Keep an explicit explore/empty-workspace branch — chosen, not defaulted into — and tag it in
  analytics.

### WP-4: Activation funnel instrumentation

- Extend `apps/web/src/lib/services/loop-telemetry.ts` (`LoopSurface` union gets `'onboarding'`)
  — shipped 2026-07-10 with /today; envelope = IDs/counts only, no content.
- Events (plan-of-attack Phase 1 list): `first_capture_started`, `first_capture_submitted`,
  `first_structure_generated`, `first_project_created`, `first_project_reviewed`,
  `first_project_opened`.
- Add `intent_selected` and a first-vs-Nth flag on the existing `project_created` capture at its
  chokepoint (`packages/shared-agent-ops/src/ontology/instantiation.service.ts:1077`).
- If any new event should get `[posthog-health]` logging, add it to `FUNNEL_EVENTS` in
  `apps/web/src/lib/services/posthog.ts`.

### WP-5: Baseline before/after

One-time funnel snapshot (SQL + PostHog once events land): signup → onboarding_completed →
completed-with-≥1-project → project reopened within 7d. The assessment needs the false-positive
rate (completions at 0 projects) as a known number to prove this slice moved anything.

**BASELINE RECORDED 2026-07-11T03:09Z (pre-gate, prod Supabase, read-only):**

| Cohort            | Signups | Completed  | ≥1 project | 0 projects (false-positive) | Reopen-7d proxy |
| ----------------- | ------- | ---------- | ---------- | --------------------------- | --------------- |
| All-time          | 108     | 29 (26.9%) | 17 (58.6%) | **12 (41.4%)**              | 0 (0.0%)        |
| Last 90d (signup) | 13      | 2 (15.4%)  | 1 (50.0%)  | **1 (50.0%)**               | 0               |
| Last 30d (signup) | 7       | 2 (28.6%)  | 1 (50.0%)  | **1 (50.0%)**               | 0               |

By intent (all-time completions / at 0 projects): `(null)` 25/11 (44%), `organize` 3/1 (33%),
`plan` 1/0. The 25 null-intent completions predate v3 intent capture.

Method notes: "has project" = user's actor (`onto_actors.user_id`) created ≥1 `onto_projects`
row (`created_by` is an ACTOR id, not a user id — any future SQL must join through
`onto_actors`). Reopen proxy = any `onto_project_logs` row by the user on their own project
between +24h and +7d after their FIRST project's creation; `onto_project_logs` only exists
since the activity-log migration, so pre-migration reopens are invisible — treat the 0% as
"no instrumented reopens," not "no reopens." Script:
`apps/web/scripts/activation-funnel-snapshot.mjs` (rerun post-ship for the after-snapshot).

## Landmines

- `onboarding_completed` currently fires for every completion including 0-project ones — WP-3
  changes semantics; keep the event but make cohorts distinguishable (`projects_created` property
  already exists; don't silently redefine the event).
- Welcome sequence fires on BOTH signup paths (queue-backed, hourly cron) — don't double-trigger
  it from a rebuilt step.
- `apps/web/src/lib/config/onboarding.config.ts` has 14 PLACEHOLDER assets (12 screenshots +
  2 videos); the rebuilt step should not add more screenshot dependencies.
- Dev server: `pnpm dev --filter=@buildos/web`. Parallel sessions are normal in this repo — scope
  test blame accordingly (see tasker/25 landmines).
- The trial-reminder email step is a `console.log` placeholder and `canGenerateBriefs: false`
  silences briefs for read-only users — adjacent conversion repairs (assessment plan item 7),
  deliberately OUT of this slice.

## Definition of done

- A new non-explore user cannot complete onboarding without one real structured project, and saw
  a transformation receipt on the way.
- The explore branch is explicit and measurable.
- The six first-run events + `intent_selected` + first-vs-Nth `project_created` fire end-to-end
  (verify with `PUBLIC_POSTHOG_CAPTURE_DEV=true`).
- Baseline snapshot recorded before the gate ships (WP-5).
- DJ decisions 1–3 recorded here (edit this file) with whatever he chose.

---

## BUILD STATUS — 2026-07-10/11 (uncommitted, tests + typecheck green)

**All five WPs + landing flip BUILT.** Live-verified on the dev server (port 5174) with DJ's
account: intent select → inline composer → auto-sent project-create chat → "Balcony Herb
Garden" created → transformation receipt rendered (understood / created / Start Here excerpt /
next move / calendar follow-up / Continue setup). Test artifacts cleaned up afterwards
(project soft-deleted, DJ's onboarding fields restored to pre-test values).

What shipped where:

- **Landing flip** — `hooks.server.ts` + `+page.server.ts`: logged-in `/` → `/today`
  (live-verified); `ReadyStep` → `/today`, CTA copy "Start your day".
- **WP-1/2 (rebuilt step)** — `onboarding-v2/ProjectsCaptureStep.svelte` fully rewritten:
  inline `TextareaWithVoice` composer (intent-aware copy, prompt chips, Enter-to-send),
  submit → `AgentChatModal` `contextType="project_create"` + `autoSendInitialDraft` (the
  processing vehicle), close-with-changes → receipt phase. Step substate (phase/projectIds/
  draft) persists in sessionStorage across the calendar OAuth redirect. Calendar block moved
  below the receipt per the spec. Draft is preserved when the chat closes without changes.
- **WP-2 packet endpoint** — NEW `GET /api/onto/projects/[id]/activation-packet`: project
  name/description/`next_step_short`, Start Here excerpt via `pickProjectStartHereDocument` +
  `buildStartHerePromptExcerpt` (1200 chars, managed-region comment markers stripped for
  display), counts (tasks/goals/documents/plans/milestones), ≤3-per-kind sample entities.
  Receipt actions: Open my project (new tab), Adjust in chat (project-context modal),
  Continue setup. Packet counts feed `onProjectsCreated` → ReadyStep stats.
- **WP-3 gate** — UI: non-explore zero-project users have NO continue affordance (composer is
  the only path); explore gets an explicit "Skip for now — start with an empty workspace"
  link (fires `first_capture_skipped`); users with existing workspace projects keep Continue.
  Server: `complete_v3` resolves the actor and head-counts `onto_project_members`
  (`removed_at IS NULL`) — non-explore with 0 workspace projects → 400. The DB count is the
  gate, NOT the client-claimed `projectsCreated` (tested). `onboarding_completed` gains
  `projects_in_workspace` + `explore_empty_workspace` properties; event name unchanged.
- **WP-4 instrumentation** — `loop-telemetry.ts`: surface `'onboarding'` + 7 first-run event
  names; all fire through the IDs/counts-only envelope. `intent_selected` fires in
  IntentStakesStep on tap. `is_first_project` added to the server `project_created` capture
  at the instantiation chokepoint (actor project head-count; count runs in the existing
  parallel batch). All new events added to `FUNNEL_EVENTS` → `[posthog-health]` logging
  (confirmed firing in dev console at each funnel stage during the live run).
- **WP-5** — baseline recorded above; snapshot script persisted to
  `apps/web/scripts/activation-funnel-snapshot.mjs` (rerun post-ship for the after).
- **Tests** — `api/onboarding/server.test.ts` (7: gate accept/reject/explore/existing-project
  cases), NEW `activation-packet/server.test.ts` (3), `page.server.test.ts` updated for
  `/today`. ReadyStep now surfaces the server's gate message instead of `error?.[0]`
  first-char garbage.

Open / follow-ups:

1. **Zero-project live smoke** — DJ's account has projects, so the live run exercised the
   existing-projects branch of the gate UI. The fresh-account branches (no continue for
   non-explore, explore skip link) are code-reviewed + unit-tested but not walked in a
   browser with a zero-project user.
2. **Observation during live test**: `onboarding_completed_at` was re-set at
   2026-07-11T03:29:32Z while this session was mid-flow and had NOT called complete — code
   search shows the only writers are ReadyStep→`complete_v3` and the legacy `complete`
   action. Most likely a parallel session testing onboarding against the same dev DB.
   If it recurs when no other session is active, hunt for the caller.
3. `first_project_opened` fires from the receipt's "Open my project"; consider also firing on
   first project-page visit (Phase 2 return-routing work).
4. Real-key PostHog verification (`PUBLIC_POSTHOG_CAPTURE_DEV=true`) — health logs confirmed
   the wiring; actual PostHog ingestion not yet observed in the dashboard.
5. Creator intent + sample project deliberately deferred (DJ decision 4).

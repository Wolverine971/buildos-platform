<!-- tasker/27-today-migration-ia-consolidation.md -->

# 27 - Finish the /today Migration & Information-Architecture Consolidation

**Created 2026-07-11.** Owner: next product/engineering agent.
**Type:** scoped build handoff, derived from the full-platform audit
(`docs/technical/reviews/BUILDOS_FULL_PLATFORM_AUDIT_2026-07-11.md`).
**Prereqs / relations:** continues [25](25-today-view-dashboard-v2-handoff.md) and
[26](26-phase1-onboarding-activation-slice.md); the daily-brief items overlap the 7/06 daily-brief
cleanup plan; the chat-security item is tracked separately in [20](20-agentic-chat-wave3-security-brief.md).

## Why this build, in one paragraph

The platform is caught **mid-migration to `/today`**, and the half-finished state is actively
harmful: two entry points were flipped to `/today` (bare domain `/` and onboarding `ReadyStep`),
but every login/OAuth/post-onboarding funnel still hardcodes `/dashboard`. So a returning user who
logs in lands on the **old dashboard** and never sees `/today`'s "What changed" receipt feed — the
exact remembered-return flow `/today` (and its strong loop telemetry) was built to prove. The
North-Star metric and the routing are working against each other. This tasker finishes the flip,
promotes the one capability trapped under `/dashboard` (the calendar), retires the redundant
overview surface, resolves the orphaned `/briefs` route, and does the paired reliability + scale
fixes so consolidating onto RPC-backed feeds is safe.

## Read first

- `docs/technical/reviews/BUILDOS_FULL_PLATFORM_AUDIT_2026-07-11.md` — the source audit; §"The two
  things to fix this week", §Surfaces, and the §"Recommended sequence" are this tasker's spec.
- `apps/web/docs/technical/audits/DASHBOARD_RESPONSIVENESS_FIX_PLAN_2026-07-07.md` — what the
  dashboard already is; don't re-polish what's headed for deletion.
- `tasker/26-phase1-onboarding-activation-slice.md` §Decisions — decision 1 scoped the flip to
  exactly `/` and `ReadyStep`; this tasker extends it to the auth funnel (a deliberate follow-on,
  not a bug in 26).

## Decisions DJ must make BEFORE building

1. **`/today` vs `/dashboard` end state** — Is `/today` the single authenticated home (dashboard
   retired), or do they coexist as "quick agenda" vs "full overview"? The audit recommends the
   former. **This one answer unblocks WP-1, WP-4, WP-5.** If coexist, WP-4/WP-5 are cut and WP-1
   only removes the ambiguity (logo + one canonical default), not the Dashboard tab.
2. **`/briefs` end state** — fold brief-reading into `/today` and retire the standalone route, OR
   make `/briefs` canonical and link it from nav. (WP-6.)
3. **Daily-brief default** — opt-out (default-on for users who created a project) vs opt-in with a
   guaranteed first brief pre-generated at onboarding completion. (WP-3; also a retention decision
   carried from the activation audit.)
4. **`/today` first-run model (NEW, 2026-07-12 — gates WP-0 and reorders the sequence). ✅ DECIDED
   2026-07-12 (DJ):** DJ raised that new/sparse users shouldn't be dropped onto an empty `/today`.
    - **✅ Make `/today` adaptive to readiness** — NOT route sparse users away (routing-away
      re-fragments the exact IA we're consolidating). `/today` renders a first-run state when sparse
      and fills in as work accrues. **WP-0 lands BEFORE the WP-1 redirect flip.**
    - **✅ Zero-project state = brain-dump-first-project composer** (reuse the onboarding capture
      contract + relief copy). Sample project is NOT in this slice (stays deferred, activation P2 #7).
    - **✅ Empty-agenda state = surface undated `Next:` steps / `todo` tasks ("what's waiting")**, not a
      bare "Clear day ahead" (DJ endorsed this via the selected preview).

## Work packages

### WP-0: Make `/today` readiness-aware so it is never badly-empty (M — DO FIRST; precondition for WP-1)

Today the `/today` empty state is a single bare "Clear day ahead" card (`today/+page.svelte:238,871-891`)
shown whenever the agenda has no all-day/scheduled/anytime items — identical for a brand-new
zero-project user and an established user with a genuinely clear day. Worse, the agenda only pulls
tasks that are **due today, starting today, or `in_progress`** (`today-feed.service.ts:110-132`), so
a new user with a real project full of undated `todo` tasks sees an empty Today even though they
have work. This is why "Today doesn't fill up" for new users — it isn't just calendar-sparse, it's
that undated tasks are invisible here. **This is the reason not to flip auth to `/today` yet; fix it
first.**

The server load already has the signal: `feed.projectNames` is the map of non-paused projects, so
`Object.keys(feed.projectNames).length` distinguishes zero-project users at zero query cost. Render
three states:

- **Zero projects (onboarded explore/skip, or deleted-all):** a first-run _hero_ — the relief promise
  ("Get it out of your head") + a prominent inline first-project brain-dump composer (reuse the
  onboarding `ProjectsCaptureStep` capture contract, not the generic "What changed?" placeholder),
  and per DJ decision 4(b) optionally a one-click sample project. NOT "Clear day ahead".
- **Has projects but empty agenda:** per DJ decision 4(a), either surface each project's `Next:` step
  / undated `todo` tasks as a "pull into today" list so there's always something actionable, or keep
  a minimal "Clear day ahead — here's what's waiting" with links into projects. Fold `overdueCount`
  into the copy (the current headline ignores it).
- **Has agenda:** unchanged.

Also vary the always-present quick-capture placeholder for zero-project users (the current
"What changed? … messy is fine" assumes prior state).

Acceptance: a fresh explore/zero-project account landing on `/today` sees a getting-started state
with a first-project action, never a bare "Clear day ahead"; an established user with a real clear
day still sees the calm empty state; a user with undated tasks is not shown an empty day.

### WP-1: Finish the redirect flip (S — AFTER WP-0 + WP-2)

Repoint the auth-funnel **defaults** to `/today`, preserving existing `redirect`/`pendingRedirect`/
invite targets — only change the fallback:

- `apps/web/src/routes/auth/login/+page.server.ts:9` (already-signed-in guard)
- `apps/web/src/routes/auth/register/+page.server.ts:9` (already-signed-in guard)
- `apps/web/src/routes/onboarding/+page.server.ts:54` (post-onboarding redirect)
- `apps/web/src/routes/auth/login/+page.svelte:207` (client `destination ?? '/dashboard'`)
- `apps/web/src/routes/auth/login/+server.ts:173` (login success `/dashboard?auth_success=true`)
- `apps/web/src/routes/auth/google/login-callback/+page.server.ts:47` (`successPath`)
- `apps/web/src/routes/auth/google/register-callback/+page.server.ts:47` (`successPath`)
- `apps/web/src/routes/auth/google/gmail-callback/+page.server.ts:16,249` (default)
- `apps/web/src/lib/components/layout/Navigation.svelte:787` (authenticated logo href)

Acceptance: fresh password login, Google login, and Google register all land on `/today`; an
`invite`/`redirect` param still wins over the default.

### WP-2: Guard the landing so `/today` can't be an onboarding bypass (S)

The `/`→`/today` flip has no onboarding-completion check, and `/today` has no onboarding gate, so a
mid-onboarding user hitting the bare domain or logo is dropped onto an empty `/today` — bypassing
the tasker/26 forcing function.

- Add an `onboarding_completed_at` check to the `/`→`/today` flip (`hooks.server.ts:509-515`)
  and/or `routes/today/+page.server.ts`: incomplete non-explore users → `/onboarding` (or
  `/dashboard?onboarding=true` if the modal host stays there short-term). Use the **same gate** as
  `complete_v3` so they can't disagree.
- Add `/today` and `/` to `shouldLoadOnboardingProgress` in `routes/+layout.server.ts:146-150` so
  the nav onboarding indicator is correct on the landing page (fixes the false-"urgent" state).
- Remove the dead `isDashboard` coupling in the `?onboarding=true` consumer
  (`routes/+layout.svelte:269-295`) so the nudge can render wherever an un-onboarded user lands.

Acceptance: a user with `onboarding_completed_at=null` + zero projects who visits `/` or clicks the
logo is routed into onboarding, not an empty `/today`.

### WP-3: Fix the daily-brief opt-in path + default (S–M)

The onboarding brief opt-in silently fails and falsely reports success; the brief defaults off. See
audit §"The two things #2".

- Make `PUT /api/notification-preferences` (or the brief-channel path it calls) **idempotently
  upsert** `user_brief_preferences (is_active=true)` in the same request instead of preconditioning
  on a pre-existing row (`notification-preferences/+server.ts:132-151`).
- In `NotificationsStepV3.svelte`, only set `emailEnabled`/call `onEmailEnabled` **after a 2xx**
  (currently fires regardless at :77; swallows the 400 at :40-48).
- Per DJ decision 3: default the email brief on for project-creators (opt-out) **or** pre-generate
  the user's first brief at onboarding completion so they experience it once.
- Add a test that opts a brand-new user (no `user_brief_preferences` row) into the email brief
  end-to-end.

Acceptance: a fresh account that checks "Email Daily Brief" in onboarding has
`should_email_daily_brief=true` **and** an active `user_brief_preferences` row afterward; the
ReadyStep "check your brief tomorrow" copy is now truthful.

### WP-4: Promote the calendar to a top-level `/calendar` route (M — the phase-out blocker)

The full calendar (day/week/month, layer filters, edit modals, prefs) lives only at
`/dashboard/calendar` (1,167 lines) and is absent from the nav. It is the **one capability with no
home on `/today`** — the real blocker to retiring `/dashboard`. **Scope this first among the
phase-out work; it must land before WP-5.**

- Move `routes/dashboard/calendar/` → `routes/calendar/` (or extract its `CalendarView` +
  loaders into a shared module mounted at `/calendar`).
- Add "Calendar" to the nav (`Navigation.svelte` navItems + mobile drawer).
- Fix while moving: remove debug `console.log` in click handlers
  (`calendar/+page.svelte:457-462,495-504`); replace `window.open(_blank)` project/task links with
  in-app `goto()` (`:646-664`).

Acceptance: `/calendar` is a first-class nav route; the old `/dashboard/calendar` redirects to it.

### WP-5: Retire `/dashboard` as a first-class surface (S then M — AFTER WP-1 + WP-4)

- Remove "Dashboard" from `Navigation.svelte` navItems (:215-221) and the mobile drawer; keep
  `/dashboard` reachable by **redirect** initially (not hard-deleted).
- Confirm the homes for every dashboard widget: invites→`/invites` (banner already links there),
  chats→`/history`, activity→`/today` What-Changed (or drop), brief→WP-6 outcome, calendar→WP-4.
- Then delete: `AnalyticsDashboard.svelte` (~1,584 lines), `dashboard.css` (202 lines),
  `DashboardBriefWidget`, and the `user-dashboard-analytics.service.ts` ~340-line legacy fallback
  (:575-804) once the RPC is trusted.
- Reconcile the daily-brief app-open trigger: `ensure-today` is wired only into
  `DashboardBriefWidget` — move the call to the `/today` load (or a small widget there) so the
  morning brief still auto-generates on the surface users now land on.

Acceptance: nav shows no Dashboard tab; no auth path lands on `/dashboard`; `ensure-today` fires on
`/today`; dead dashboard code deleted or scheduled with a date.

### WP-6: Resolve the `/briefs` orphan (S–M)

`/briefs` is a full route nothing links to; `BriefStatusIndicator` routes to `/projects?tab=briefs`
instead (`BriefStatusIndicator.svelte:81-83`). Per DJ decision 2: fold brief-reading into `/today`
and retire the route, OR make `/briefs` canonical and add it to nav. Either way, point
`BriefStatusIndicator` at the single canonical brief surface. Pair with pointing the brief email's
primary CTA at `/today` rather than `/projects` (daily-brief follow-up).

### WP-7: `/history` fail-loud (S — reliability, do alongside WP-1)

`loadHistoryData` catches RPC/migration failure and returns an empty result that **resolves
successfully**, so the error UI never fires and a broken RPC looks like an empty archive
(`history/+page.server.ts:249-266`). Make it rethrow (or return a discriminated `{error}` shape) so
the existing `historyError` UI fires. Important because consolidating onto RPC-backed feeds raises
the blast radius of invisible migration lag — and there is a known unapplied prod migration
outstanding. (Also fix the dashboard→history dead-link gate mismatch if `/dashboard` survives:
align `message_count >= 1` with the RPC's `>= 3-or-summary` gate.)

### WP-8: `/projects` scale + declutter (M — parallelizable)

- **Scale (DJ hits this at 84 projects):** pass `p_limit` for the default view
  (`+page.server.ts:64` → `fetchProjectSummaries(supabase, actorId, { limit })`) and add
  load-more/pagination or a virtualized list. RPC + service already accept `p_limit`.
- Extract the admin-only ontology graph (~200 lines) out of `projects/+page.svelte` to an
  `/admin`-gated route.
- Delete the `/projects/create` wrapper route (fold its two callers onto the inline modal or
  `/projects`); fix the context-unaware "Head to Projects" toast.
- Remove the live `/projects/[id]/old/` route (2,309 + ~1,734 lines of old-only components) — park
  outside `src/routes` if a rollback net is wanted, don't leave it routable. Set a sunset date for
  the "Classic view" toggle.
- Lazy-import `ProjectAuditTracker` behind the `PROJECT_LOOPS_ENABLED` gate
  (`projects/[id]/+page.svelte:44`) so 1,221 lines of dead-in-prod loops UI stop shipping on the
  hot path.

## Out of scope (tracked elsewhere)

- Chat Wave 3 security (S1 write-policy unification, S2 image exfiltration, S14, agent-run stalled
  sweeper) → [20](20-agentic-chat-wave3-security-brief.md) + audit §Systems.
- ~~Apply prod migration `20260706020000` (anon-readable engagement metrics)~~ ✅ DONE 2026-07-12 (DJ). Left: drop temp `as any` casts after `pnpm gen:all`.
- Brief content split (WP-7/11 of the 7/06 plan), reachability gate, generation-health admin card →
  daily-brief cleanup follow-ups.
- Unify the three project-creation flows into one braindump→project pipeline → strategic, its own
  handoff.

## Sequencing & user-facing risk

**Revised 2026-07-12 (DJ concern about empty Today):** the redirect flip is no longer step one.
Do **WP-0 (readiness-aware `/today`) → WP-2 (landing guard) FIRST**, so `/today` is never
badly-empty and incomplete users can't be dumped there. **Only then WP-1 (redirect flip).** Fix the
destination before you send everyone to it. Then WP-3 → WP-7 (all S, low risk). Then **WP-4
(calendar) BEFORE WP-5 (dashboard retire)** — reversing them orphans calendar for power users. WP-6
and WP-8 are parallelizable. Keep `/dashboard` and `/projects/[id]/old` as **redirect-only, not
hard-deleted**, until `/today` and v2 are trusted in prod.

## Done / Left

| WP                            | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Left                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-0 Readiness-aware `/today` | **BUILT + SELF-REVIEWED 2026-07-12 (uncommitted, typecheck green ×2).** `TodayProject` added to feed (no new query); `/today` renders 3 states: zero-project first-run hero (brain-dump→`submitFirstProject`), empty-agenda "what's waiting" next-steps list, normal agenda. Readiness tagged on `loop_surface_shown` (`readiness_state`/`project_count`). **Bug caught & fixed in review:** "what's waiting" filter used a hardcoded/un-normalized terminal-state set (invented `done`/`archived`); now uses canonical `isActiveFacing()` from `$lib/config/project-states`.                                       | Live-verify with a zero-project account + a has-projects/empty-agenda account. Edge (noted): feed excludes `paused` projects, so a paused-only user sees the first-run hero (acceptable). Optional: surface undated `todo` tasks (not just project `next_step`) in "what's waiting".                                                                                                         |
| WP-1 Redirect flip            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started. 9 files listed above. **AFTER WP-0 + WP-2.**                                                                                                                                                                                                                                                                                                                                    |
| WP-2 Landing guard            | **BUILT + VERIFIED 2026-07-12 (uncommitted, typecheck green, 10 route tests green).** Un-onboarded users are redirected into `/onboarding` from `/` (`hooks.server.ts` + `routes/+page.server.ts` defense-in-depth) and `/today` (`today/+page.server.ts`); completed/explore users (onboarding_completed_at set) fall through to `/today`. Added `/` + `/today` to `shouldLoadOnboardingProgress`. Verified no redirect loops (onboarding bounces completed→dashboard; incomplete renders the flow). Caught & fixed a **pre-existing stale test** (`authenticated-pages.test.ts` still asserted `/`→`/dashboard`). | **Deviation (intentional):** did NOT remove the `isDashboard` coupling on the `?onboarding=true` nudge — routing incomplete users to the full `/onboarding` flow makes the nudge-on-`/today` scenario impossible, and removing the coupling would risk rendering the nudge on top of the flow. Live-verify the loop-free redirects with a fresh un-onboarded account and an explore account. |
| WP-3 Brief opt-in fix         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started. Depends on DJ decision 3.                                                                                                                                                                                                                                                                                                                                                       |
| WP-4 `/calendar` promote      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started. Precondition for WP-5.                                                                                                                                                                                                                                                                                                                                                          |
| WP-5 Dashboard retire         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started. Depends on WP-1 + WP-4.                                                                                                                                                                                                                                                                                                                                                         |
| WP-6 `/briefs` orphan         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started. Depends on DJ decision 2.                                                                                                                                                                                                                                                                                                                                                       |
| WP-7 History fail-loud        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started.                                                                                                                                                                                                                                                                                                                                                                                 |
| WP-8 Projects scale/declutter | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not started.                                                                                                                                                                                                                                                                                                                                                                                 |

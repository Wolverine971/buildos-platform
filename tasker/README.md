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

## Built 2026-10-04 — uncommitted, ships on the next push

All of these pass their focused tests. The worker and runtime typecheck is clean, the web check has
no errors in these files, the route-export guard passes, and lint is clean.

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

1. **P0 — Account deletion fails in prod** ([103](103-privacy-audit-trustworthy-data-handling.md)).
   An agent is on it; the fix (`20261004213000`) is not applied yet.
2. **Commit and deploy the work above.** Use explicit pathspecs: other sessions have uncommitted
   tables and consolidation work in the same tree.
3. **P1 — The ~30-minute live-click checklist** in [38](38-live-verification-debt.md). It covers
   116, 115, 114, 96, and calendar. Run it after the deploy.
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

## Active trackers

| Tracker                                                                                        | Status         | Pri | What's left                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [103 — Privacy audit](103-privacy-audit-trustworthy-data-handling.md)                          | ACTIVE         | P0  | Fix account deletion and prove it end to end; owner env/key items; ZDR check (paid); DATA_INVENTORY items 13–18.                                                                                |
| [20 — Agentic Chat security](20-agentic-chat-wave3-security-brief.md)                          | ACTIVE         | P1  | S1 rebuilt 10-04, uncommitted. Left: deploy, the calendar-counts-as-external veto, second-order gaps, a paid seeded-email case.                                                                 |
| [116 — BuildOS plugin reconnect loop](116-buildos-plugin-reconnect-loop.md)                    | VERIFY LIVE    | P1  | App path recovered; refresh works on its own. Direct `.mcp.json` removed (uncommitted). Left: commit, restart Codex, one cloud-thread `search`.                                                       |
| [109 — Chat spend and speed](109-agentic-chat-session-spend.md)                                | VERIFY LIVE    | P1  | Project Setup repair fix and cron guard built 10-04. Left: deploy, paid Project Setup check (~$0.07), streaming answers, calendar-write check, key split, local queue guard (absorbed 65, 108). |
| [38 — Live verification debt](38-live-verification-debt.md)                                    | VERIFY LIVE    | P1  | Live-click checklist ready; welcome-email cron fix built. Left: PostHog 2-min check, chat-worker PostHog key, Google signup event, fresh-account walk after 103 (absorbed 74, 78).              |
| [115 — Skills: Jev playbooks + connector pack](115-skills-jev-playbooks-and-connector-pack.md) | ACTIVE         | P1  | Lean pass live. Supabase redirect allow-list, post-deploy smoke, then Phase 1 tests (P2).                                                                                                       |
| [76 — Production database security](76-production-database-security-containment.md)            | ACTIVE         | P2  | 104's 5 guard fixes, leaked-password protection, OTP expiry, Postgres patch, Supabase's 2026-10-30 default-exposure change (absorbed 104).                                                      |
| [88 — Freshness radar](88-chat-workflow-ordinary-chat.md)                                      | VERIFY LIVE    | P2  | Live for DJ only. auto_apply decision (~20 clean scans), backtest, widen beyond DJ.                                                                                                             |
| [96 — Capture follow-ups](96-capture-followups-from-book-loop.md)                              | VERIFY LIVE    | P2  | Click the receipt chip + Undo once; delete the dead `reconcileStartHereAuthoredSections`.                                                                                                       |
| [114 — Large write batches](114-large-batch-cleanup-budget-and-review-deadlock.md)             | VERIFY LIVE    | P2  | Reconcile effect `094a68ea`; first live click on the cleanup card (absorbed 112); then one approved batch turn (~$0.06–0.10).                                                                   |
| [110 — Project steward beta](110-project-steward-beta.md)                                      | WAITING ON DJ  | P2  | Behind the `project_steward` flag (DJ only). Charter edits; 9takes scorecard; second project?                                                                                                   |
| [29 — Deep Research](29-deep-research-production-track.md)                                     | PARKED + GATED | P2  | Kill switch built 10-04 (`PRIVATE_DEEP_RESEARCH_ENABLED`, off). Quotas and an eval only if it is ever turned back on (absorbed 32).                                                             |

## Parked

| Tracker                                                                                         | Wake condition                                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [73 — Libri post-migration safety audit](73-libri-post-migration-safety-audit.md)               | Libri's live backend cuts over from Convex.                               |
| [77 — Billing commercial contract](77-billing-commercial-contract-reconciliation.md)            | The owner decides to charge (Stripe flag is off).                         |
| [111 — Loop unit economics](111-loop-unit-economics.md)                                         | Building the digest pass (= the Project Pulse reconciler) (absorbed 107). |
| [46 — Legacy project-generation retirement](46-legacy-project-generation-retirement.md)         | Someone needs the legacy tables gone.                                     |
| [48 — `DocumentModal` decomposition](48-document-modal-decomposition.md)                        | Before the next document feature (now 5,193 lines and growing).           |
| [62 — Agent Chat modal decomposition](62-agent-chat-modal-state-orchestration-decomposition.md) | A chat-modal feature that the 3,365-line component blocks.                |

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

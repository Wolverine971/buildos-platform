<!-- tasker/README.md -->

# Tasker — Open Work

**Re-audited 2026-11-15** for trackers 125–159 against git and production. Everything through
`1118ea9d0` is committed and pushed, so "UNCOMMITTED" notes inside older trackers are stale.
Trackers 125–139, 144, 150–153 and 155 were closed today (finished or superseded); their few
residuals moved into 157 or the "Needs DJ" list below, and the files remain in git history.
Trackers numbered 124 and below were last audited on 2026-10-04 and are carried over unchanged.

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

## Running now (2026-11-15)

| Tracker                                                           | Owner            | What users get                                                                                                                                                                               |
| ----------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [158 — Privacy and security: fix first](158-privacy-fix-first.md) | agent DJ assigns | The 8 Nov 5 security migrations applied (they were never applied; editors can still change owner/agent columns), collaborator emails sealed at the database, Writing off on DJ's public page |
| [159 — Workspace search](159-workspace-search.md)                 | Claude agent     | Always-visible search pane on /projects over Workspace + every project, then ⌘K anywhere                                                                                                     |
| [147 — Builder profiles](147-builder-profiles.md)                 | Claude agent     | Finished /@handle pages: Writing opt-in per doc, share image, polish, approved draft check                                                                                                   |

## Open (recent work, 140–157)

| Tracker                                                                           | What's left                                                                                                                                   |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [157 — Chat audit: honest record](157-chat-audit-honest-record.md)                | Case 7 rerun (receipt names homes), full prod battery (absorbed from 138/150/152), save-threshold readings, "Continue in X" first turn unfelt |
| [156 — AI Inbox: see under the hood](156-ai-inbox-see-under-the-hood.md)          | Paid review pass + email quote dry run; DJ decision on storing email body words (claim G11)                                                   |
| [154 — Project calendars two-way + Gmail cards](154-project-calendars-two-way.md) | DJ moves an event in Google → check Done for you; Gmail cards paid dry run before going live; member fan-out deferred                         |
| [145 — People layer launch](145-people-layer-launch.md)                           | The 7-step two-account live run (also closes 140, 141, 143, and checks the brief's "While you were away" lines for another person); review the 7 pre-10-23 editors whose agents are on Write                    |
| [140 — Agent access wall](140-agent-access-wall.md)                               | Two-account run (in 145); the editor `external_agent_access` gap is fixed by 158's migration 120200                                           |
| [141 — One home for sharing](141-one-home-for-sharing-settings.md)                | Two-account run (in 145); email leak moves to 158                                                                                             |
| [143 — Four ways in, unified](143-four-ways-in-unified.md)                        | Two-account run (in 145)                                                                                                                      |
| [146 — Workspace chat](146-workspace-chat.md)                                     | Paid rerun of Workspace battery cases 1, 2, 5; search moved to 159; project chat can't edit Workspace items                                   |
| [148 — Mobile app](148-mobile-app.md)                                             | Blocked on DJ: Apple Developer + Expo accounts, a real-iPhone run. Then web parity (new Today, inbox, chat record)                            |

## Needs DJ

- **Apple Developer account** (individual, or company with a D-U-N-S number) and an **Expo account** (148).
- **A second test account + your phone** for the people-layer live run (145).
- **Railway cleanup:** remove `AGENTIC_CHAT_CONTEXT_FINDER_CHAT` and `AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL`
  from agentic-chat-worker. Nothing reads them (checked 2026-11-15); removing them redeploys the service.
- **Builder page:** review your draft, Publish, set the 9takes/BuildOS links (147).
- **Inbox:** decide whether highlighting the email-body words a card came from is worth storing them (156).
- **Move one event on a project calendar in Google**, then open AI Inbox → Done for you (154).

## Older open trackers (audited 2026-10-04, not re-audited)

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

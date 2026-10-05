<!-- tasker/README.md -->

# Tasker — Open Work

**Audited 2026-10-04.** All 69 trackers were checked against git history, the code, and deploy status.
Each tracker now carries a dated `> **Audit 2026-10-04 — …**` block under its title. All code on
`main` is pushed and deployed: `df81f97dc` has Vercel and all three Railway workers green. Notes
inside older trackers that say "uncommitted" or "not deployed" are stale. The QA branch and
`pnpm agentic:gate` were retired on 09-24, so steps that wait on "the gate" are obsolete; live checks
now use `pnpm agentic:prod-battery`.

**Result:** 12 active, 6 parked, 2 to move to `docs/marketing/`, and **49 ready to delete**. Deletion
waits for the owner's OK; move each tracker's residual first, as listed in the deletion section below.

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

## Do next (ranked)

1. **P0 — Account deletion fails in prod** ([103](103-privacy-audit-trustworthy-data-handling.md)).
   `finalize_account_deletion_database` sets `user_id` to NULL on human actors, which violates
   `chk_actor_identity`, so the whole delete rolls back. The user is locked out at request time, yet
   `/privacy` promises deletion. There have been 0 requests so far.
2. **P1 — No structural review of writes after email or web content is read**
   ([20](20-agentic-chat-wave3-security-brief.md)). The S1 rule died with the legacy engine
   (`35bbbd3c5`). Only prompt framing remains, plus egress taint, which still blocks exfiltration.
   Then run [35](35-agentic-chat-gmail-tools.md)'s seeded malicious-email test.
3. **P1 — A local worker runs production crons.** `apps/worker` `bootstrap.ts` starts the scheduler
   with no guard, and `apps/worker/.env` points at the prod DB, so any local `pnpm dev` can
   double-send briefs and loops. Owned by [109](109-agentic-chat-session-spend.md) (from 108's
   "scheduler guard").
4. **P1 — CI is red on `main`.** `20260930220000_project_fold_foundation.sql` was edited in place,
   and the migration ledger check fails every push since `97a8d5004`. Restore the file and put the
   change in a new migration.
5. **P1 — Activation gauges are unverified** ([38](38-live-verification-debt.md) §4). PostHog prod
   ingestion was never confirmed, the fresh-account onboarding walk was never done, and the funnel
   snapshot dates from July.
6. **P1 — One free live-click session (~30 min)** clears these:
    - [116](116-buildos-plugin-reconnect-loop.md): reconnect, then `search`/`fetch`.
    - [115](115-skills-jev-playbooks-and-connector-pack.md): the Supabase `/auth/confirm` allow-list and a Try signup.
    - [114](114-large-batch-cleanup-budget-and-review-deadlock.md): reconcile effect `094a68ea`, then the first click on the cleanup card.
    - [96](96-capture-followups-from-book-loop.md): the receipt chip and Undo.
    - [38](38-live-verification-debt.md): the calendar pass.
7. **P1 — New users' first chat turns took 78–102 s** ([109](109-agentic-chat-session-spend.md)),
   unmeasured since 09-25. Also there: a ~$0.01 calendar-write check on the fallback path most users hit.
8. **Owner decisions:**
    - Pick one home: password sign-in lands on `/today`, while Google sign-in and the logo land on
      `/projects`. Only `/projects` triggers `ensure-today`.
    - Hide or keep Deep Research ([29](29-deep-research-production-track.md)). It is live via
      `delegate_task`, has no quota, and failed its quality gate.
    - Switch off and delete the specialist/workflow pilot code. It is still live for DJ, specialists
      went 0/4 in the 09-23 blind read, and stewards replaced the direction.

## Active trackers

| Tracker                                                                                        | Status        | Pri | What's left                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [103 — Privacy audit](103-privacy-audit-trustworthy-data-handling.md)                          | ACTIVE        | P0  | Fix account deletion and prove it end to end; owner env/key items; ZDR check (paid); DATA_INVENTORY items 13–18.                                                                |
| [20 — Agentic Chat security](20-agentic-chat-wave3-security-brief.md)                          | ACTIVE        | P1  | Worker-side "review writes after external content" rule; seeded malicious-email test (absorbs 35).                                                                              |
| [116 — BuildOS plugin reconnect loop](116-buildos-plugin-reconnect-loop.md)                    | VERIFY LIVE   | P1  | SQL repair and web error handling are live. One deliberate reconnect plus `search`/`fetch`, then expiry/refresh.                                                                |
| [109 — Chat spend and speed](109-agentic-chat-session-spend.md)                                | VERIFY LIVE   | P1  | New-user first-turn latency; calendar-write check (~$0.01); context-finder measurement; scheduler guard, key split, brief tasks > 0, reviewer replay (~$0.03), from 108 and 65. |
| [38 — Live verification debt](38-live-verification-debt.md)                                    | VERIFY LIVE   | P1  | PostHog ingestion, fresh-account walk, funnel rerun; 74's calendar pass; 78's signup → capture → return → delete smoke.                                                         |
| [115 — Skills: Jev playbooks + connector pack](115-skills-jev-playbooks-and-connector-pack.md) | ACTIVE        | P1  | Lean pass live. Supabase redirect allow-list, post-deploy smoke, then Phase 1 tests before any ambitious build (P2).                                                            |
| [76 — Production database security](76-production-database-security-containment.md)            | ACTIVE        | P2  | Core exposure contained by 104. Left: 104's 5 guard fixes, leaked-password protection, OTP expiry, Postgres patch, Supabase's 2026-10-30 default-exposure change.               |
| [88 — Freshness radar](88-chat-workflow-ordinary-chat.md)                                      | VERIFY LIVE   | P2  | Live for DJ only. auto_apply decision (~20 clean scans), backtest, widen beyond DJ.                                                                                             |
| [96 — Capture follow-ups](96-capture-followups-from-book-loop.md)                              | VERIFY LIVE   | P2  | Click the receipt chip + Undo once; delete the dead `reconcileStartHereAuthoredSections`.                                                                                       |
| [114 — Large write batches](114-large-batch-cleanup-budget-and-review-deadlock.md)             | VERIFY LIVE   | P2  | Reconcile effect `094a68ea`; first live click on 112's cleanup card; then one approved batch turn (~$0.06–0.10).                                                                |
| [110 — Project steward beta](110-project-steward-beta.md)                                      | WAITING ON DJ | P2  | Behind the `project_steward` flag (DJ only). Approve or reject pending charter edits; 9takes scorecard; second project?                                                         |
| [29 — Deep Research](29-deep-research-production-track.md)                                     | WAITING ON DJ | P2  | Hide or keep `deep_research`; quotas and an eval only if it stays (absorbs 32).                                                                                                 |

## Parked

| Tracker                                                                                         | Wake condition                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [73 — Libri post-migration safety audit](73-libri-post-migration-safety-audit.md)               | Libri's live backend cuts over from Convex.                     |
| [77 — Billing commercial contract](77-billing-commercial-contract-reconciliation.md)            | The owner decides to charge (Stripe flag is off).               |
| [111 — Loop unit economics](111-loop-unit-economics.md)                                         | Building the digest pass (= the Project Pulse reconciler).      |
| [46 — Legacy project-generation retirement](46-legacy-project-generation-retirement.md)         | Someone needs the legacy tables gone.                           |
| [48 — `DocumentModal` decomposition](48-document-modal-decomposition.md)                        | Before the next document feature (now 5,193 lines and growing). |
| [62 — Agent Chat modal decomposition](62-agent-chat-modal-state-orchestration-decomposition.md) | A chat-modal feature that the 3,365-line component blocks.      |

**Move to `docs/marketing/`** (not engineering work):
[10 — Creator outreach](10-creator-outreach-swyx-riley.md) (the Simon email is drafted; re-run the
MCP security self-audit before sending) and
[12 — Personal-brand throughline](12-personal-brand-throughline.md) (an idea note).

## Ready to delete (49) — owner OK pending

Move the residual first where an arrow shows one.

- **Chat workflow pilot.** Shipped; its exit gates needed the retired QA gate: 81, 82, 84, 85, 86,
  87, 89, 91, 92.
- **Gate latency and stall chain.** Done in prod: 99, 100, 101, 102, 105.
- **Specialist readiness.** Superseded by stewards: 98.
- **Capture, loops, and review roll-up.** Done or absorbed: 93, 94, 97, 106, 107 → 111 (audit
  timeout check), 112 → 114 (card click-through).
- **Older Agentic Chat lanes:** 50, 67, 70, 75, 80, 60, 61 (premature scale work); 65 → 109;
  35 → 20.
- **Platform:** 63 (replaced by `pnpm db:rehearse`); 104 → 76 (5 guard fixes); 74 → 38;
  108 → 109.
- **Product and IA.** Overtaken by the 10-01 Projects fold, stewards, and the cleanup card: 27, 34,
  40, 52, 53. Never realistic at current user volume: 41, 43, 44. Expired: 36.
- **Paid-launch program:** 78 → 38 (fresh-account smoke), 79.
- **Research:** 32 → 29.
- **Marketing and skills.** Superseded or never started: 17, 18, 24.

## Unowned residue

No tracker owns these. Pick them up or drop them knowingly.

- **Migration rehearsal skips the lock-first rule.** `project_write_lock_first.check.sql` is not in
  `DEFAULT_CHECKS` in `scripts/migration-rehearsal/rehearse.py`, so the organize, fold and
  attach/detach migrations were never checked against it. Free to add (from 105).
- **`/history` fails soft.** A broken RPC shows users an empty archive instead of an error (from 27).
- **Duplicate creates.** Only byte-identical re-proposals are blocked (from 82/92).
- **Calendar buffer (Case 10) never re-verified.** The prod-battery harness account has no calendar,
  so the battery can't cover it.
- **Saving a static key in Agent keys rotates its secret.** This breaks the keychain stdio bridge
  (from 94).
- **P3 hardening from 102.** The prompt-snapshot RPC holds the turn row `FOR UPDATE`, and finalize
  never retries a transient DB code.
- **Dormant code to delete.** The specialist/workflow pilot (v4 admission/prep/execution, Workflow
  Lab, the comparison lab); Gmail Phase A routes and their hourly retention cron (36); the
  caller-less `/api/search` (46).
- **Public-content hygiene (from 79).** Blog TODO comment blocks and "Start your free trial" CTAs
  in 4 posts; some prototype routes are still public.
- **Stale acceptance doc.** `docs/testing/chat-workflow-pilot-acceptance.md` still reads
  "implementation in progress"; mark it point-in-time when 89 is deleted.

Marketing content cadence itself belongs in `docs/marketing/ops/queue.json`, not in Tasker.

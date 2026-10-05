<!-- tasker/38-live-verification-debt.md -->

# 38 — Live verification debt (one place for "built, never exercised live")

> **Audit 2026-10-04 — SHIPPED, VERIFY LIVE.** Two items are moot: the §2 primary-calendar hardcode was fixed in 833f4b21a (now `providerCalendarId`), and the §5 rotation was replaced by 112 lineages (fbc7b79fa). The §1 R1–R8 were written for the v2 web chat route, which was deleted in 35bbbd3c5 (09-04); re-base them on the worker runtime or fold them into `pnpm agentic:prod-battery`.
> **Left:** §4 onboarding fresh-account branches + PostHog prod ingestion + funnel snapshot rerun (highest value); Agent Run calendar port; Complete Project Audit e2e; agent-run notification; second-user read-only guard; legacy-chat caller smokes.
> **Priority:** P1 for §4 (the activation gauges), plus the absorbed items: 74's signed-in calendar
> pass and 78's fresh-account smoke (signup → capture → return → delete). The rest is P2.
> **Recommend:** keep as the single live-verification list (prune §2b/§5, re-scope §1).

**Created 2026-07-24** by consolidating the verification residuals out of taskers 06, 08, 13, 14,
26, and 28 (all now deleted — their build state is recorded in git history and in the feature docs
cited below).

**Type:** QA / live smoke. Every item here is code that is **written, tested, and deployed** but
whose real-world path has never been walked. None of it is a build task.

**Why one file:** each of these was a 30–60 minute chore sitting alone in its own tracker, which is
why none of them got done. They share a shape — get a real account, click the path, record the
result — so they should be batched into one session.

---

## 1. Agentic-chat manual pentest R1–R8 (was 06) — highest value

Spec: `apps/web/docs/features/agentic-chat/pentesting/REGRESSION_TESTS_2026-06-23.md`
(+ `TEST_PROJECT_SPEC.md`, `TEST_MATRIX.md`).

Eight manual tests — stale-context write reversal, false-done correction, cross-project write
protection, refusal-no-loop, etc. No run log has ever existed. The A–D empty-synthesis fixes and
the D6 ok-aware finalization guard they were written to validate are all deployed.

- [ ] Run R1–R8 against throwaway test projects, record results vs `TEST_MATRIX.md`, delete the
      test projects after.

**Resolved, do not re-open:** the "over-eager document-claim corrector" from 06 is fixed.
`collectUnsupportedDocumentClaims` now constrains link/placement claims at clause level and has
regression coverage in `repair-instructions.test.ts` (`does not correct task-to-goal link claims
when a document is mentioned in a separate clause`, `allows document placement claims when a tree
move succeeded`).

**Relation to [20](20-agentic-chat-wave3-security-brief.md):** R1–R8 covers write-integrity, not
prompt injection. Run it before Wave 3 to get a clean pre-change baseline, and again after.

## 2. Calendar in Agent Runs (was 08)

- [ ] With a Google-connected account, run create → read → delete through the Agent Run
      `CalendarPort`; confirm a `review:true` run exposes calendar **reads only**.
- [ ] Replace the hardcoded primary calendar:
      `apps/web/src/lib/services/calendar-analysis.service.ts:1456`
      (`calendar_id: 'primary', // TODO: Get actual calendar ID`). Verified 2026-07-24 that this is
      now the **only** remaining hardcode — the second one at `:292` is gone. Breaks for any user
      whose target calendar isn't primary.

## 3. Complete Project Audit end-to-end (was 14)

The whole feature is built (schema, trigger/queue path, worker generation with LLM synthesis +
deterministic fallback, recurrence memory, tracker UI, detail modal, metrics, 7/05 lifecycle
hardening). Migrations applied. `PROJECT_LOOPS_ENABLED = true` as of 2026-07-24, so the path is
reachable in prod.

- [ ] Manual trigger → worker completion → tracker → detail modal → parent inbox follow-up,
      against the migrated database.
- [ ] Confirm no orphaned `queued` run/audit rows after a **duplicate** manual trigger.
- [ ] Confirm pending child follow-ups are not left visible when the parent audit is forced to
      fail after child insert.

Optional, not blocking: audit appetite/notification preference config, fuller audit history UI.
Spec: `apps/web/docs/technical/architecture/agent-work/COMPLETE_PROJECT_AUDIT_TRACKER_SPEC_2026-07-01.md`.

## 4. Onboarding activation slice — fresh-account branches (was 26)

Shipped and committed in `3ab66905`; live-verified only on DJ's account, which **has** projects, so
only the existing-projects branch of the gate was exercised.

- [ ] Walk the **zero-project non-explore** branch with a fresh account (expect: no continue
      affordance, composer is the only path).
- [ ] Walk the **explore** branch (expect: "Skip for now" link firing `first_capture_skipped`).
- [ ] Verify real PostHog **ingestion** in the dashboard — the health logs confirmed wiring only.
      Set `PUBLIC_POSTHOG_CAPTURE_DEV=true`.
- [ ] Rerun `apps/web/scripts/activation-funnel-snapshot.mjs` for the post-ship "after" number.
      Baseline false-positive rate recorded pre-gate was **41.4%**.

Not a bug unless it recurs with no parallel session running: `onboarding_completed_at` was re-set
mid-flow during the 7/11 live test by what was almost certainly a sibling session on the same dev DB.

## 5. Project Review rotation / attention budget (was 28 Phase 1)

Phase 1 shipped in `292b61d8`, migration `20260718010000` applied to prod, cleanup executed live
(50 pending → 25 pending + 23 deferred, every project ≤ 3). Calendar event-window expiry is now
committed too (`CALENDAR_EVENT_WINDOW_GRACE_MS` in `packages/shared-agent-ops/src/inbox-index.ts`).

- [ ] **Overdue check-back** (was due 2026-07-19): confirm rotation actually fires on a post-deploy
      nightly via `reconfirmed_count` / `rotated_out_count` on the `project_suggestion_generated`
      PostHog event (or `queue_jobs` logs), and that pending stays ≤ 3/project with no manual
      cleanup.
- [ ] Manual review pass on a previously flooded project → verify rotation supersedes, budget
      defers to 3, badge drops.

Forward work from 28 that is **not** verification lives in
[34](34-project-review-holistic-synthesis.md) (cross-family synthesis) and remains open there;
the global cross-project top-3 broker is still unbuilt and unowned.

## 6. Relocated residuals from the AI Inbox close-out (was 13)

- [ ] Agent-run **live notification** smoke (the bridge-plan path).
- [ ] Read-only guard check — needs a **second** user account.

---

## 7. Legacy agent-chat caller-cutover path smoke (was 45)

The database retirement, archives, current-model caller conversion, generated contracts, and search
gate are complete. The caller-cutover commit is an ancestor of later recorded production web
deployments, so deployment itself is no longer a separate build task. Retain only the real-world
path checks here:

- [ ] Trigger the affected email-generation path and confirm current `chat_sessions` /
      `chat_messages` attribution succeeds without a retired-table error.
- [ ] Exercise the retargeting analytics path and the admin dashboard/user-activity endpoints; prove
      their current-model counts render and no retired relation is queried.
- [ ] Re-run the legacy relation search gate after the smokes and record the deployment/date used.

Any failure becomes a narrow repair tracker. A green result deletes this section; Tasker 45 remains
deleted because its migration and caller-cutover build are complete.

---

## Done when

Every box above is checked and its result recorded here (green/red + date). Anything that comes
back red becomes its own tracker; anything green gets deleted with the section.

## Absorbed from 74 — 74 — Reconcile legacy calendar surfaces with the ontology calendar model (2026-10-04)

74 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — SHIPPED, VERIFY LIVE.** Both defects are fixed, pushed, and deployed. W1: `/time-blocks` and `GET /api/calendar` now share `hasUsableGoogleCalendarConnection` (fed8fd476, 09-01). W2: `20260830163828_fix_task_series_enable_schema_drift` (aa4b5c609) is recorded in the prod ledger. No live check is recorded.
**Left:** W3 only: one signed-in pass where `/time-blocks` shows connected, a task recurrence is added, changed, and removed, and the test data is cleaned up. **Priority:** P2. **Recommend:** merge into 38.

## Absorbed from 78 — 78 — Product promise production-proof program (2026-10-04)

78 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — STALE — RETIRE.** The paid-launch go/no-go frame is premature: billing is off, 77 is parked, and blocker 76 is contained (fe3a44c12). The WP-2 fresh-account run is still the check that matters for activation. A signup blocker went unnoticed from 09-09 to 09-24 (0 of 2 signups completed), and account deletion fails in prod on `chk_actor_identity` (see 103).
**Left:** a repeatable fresh-account smoke: signup → onboarding → capture → return → delete account. **Priority:** none for this tracker; the salvaged smoke is P1. **Recommend:** merge into 38.

## Live-click checklist — prepared 2026-10-04 (~30 min, signed in at build-os.com)

Prepared from read-only prod checks. Calendar: both Google connections are active (last verified
10-02). Steps 1–6 are read-only; steps 7–12 change data.

**Read-only**

1. Open https://build-os.com/time-blocks. **Pass:** the calendar and "Create Block" show, with no
   "Connect Google Calendar" overlay. Then open https://build-os.com/api/calendar. **Pass:**
   `"connected":true`.
2. Open https://build-os.com/history?id=bd9426ed-4cfe-4fd6-818b-23b51017b6e1&itemType=chat_session.
   **Pass:** a chip reads "Saved to START HERE · thinking log · 2 changes to review · Undo", and its
   links open the docs. Don't click Undo yet (tracker 96).
3. Go to https://build-os.com/projects and click the AI Inbox icon. **Pass:** the Wayne "Project
   cleanup" card shows its counts and lists. Repeat at phone width (tracker 114).
4. In ChatGPT, open a new chat with BuildOS on and ask "search BuildOS for Wayne Strategies", then
   fetch one result. Repeat in your original chat. **Pass:** results come back with no reconnect
   prompt (tracker 116).
5. Do the same in Codex. See 116: Codex's direct connection is still calling with no auth header.
6. Open the calendar skill article
   (https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create),
   /skills and /skills/people at phone width. **Pass:** no sideways scroll, and Try is visible. Then
   resubmit the sitemap in Search Console (tracker 115).

**These change data**

7. In an incognito window, open
   https://build-os.com/skills/try/google-calendar-for-ai-agents-search-before-you-create and sign
   up with a `+try` alias, then click the emailed link. **Pass:** you land signed in on /today with
   the chat open and the prompt drafted, and no bounce to /onboarding or `email_link_failed`. Don't
   send the prompt; that's a paid turn. Don't delete this account until tracker 103 is fixed.
8. Optionally repeat step 7 with a second Google account.
9. Back on the step 2 chip, click **Undo**. **Pass:** "Capture undone" (tracker 96).
10. On the Wayne cleanup card, tick only "Archive empty blog placeholder 'Political Analysis'" and
    click **Apply 1 selected**. **Pass:** the item leaves the card and the ready count drops by one.
    Don't apply "Book Research"; it's 114's replay target.
11. Click **Not needed** on one duplicate. **Pass:** it disappears and records a reason.
12. Create a task called "zz recurrence test", due tomorrow. Click Repeat → Weekly → Make Recurring,
    move one instance's due date, then Delete Series → Delete Upcoming. **Pass:** no errors, and any
    Google events disappear (from 74).

## Progress 2026-10-04 — activation gauges (read-only)

Full write-up: `docs/research/activation-funnel-2026-10-04.md`, with the funnel, first-run path map,
and a 10-minute walk in §4.

**PostHog:** prod ingestion is unknown but probably working. The key is set in Vercel and built into
the site, and no server capture failure has ever been logged. The events can't be read without the
key stored in Vercel; §1.4 has DJ's 2-minute check. Even if ingestion works, the dashboard can't
show the real funnel:

- `project_created` never fires for chat-created projects, because the chat worker has no PostHog key.
- `brain_dump_created` has been dead since May.
- `onboarding_completed` is rare.
- `signup` misses brand-new Google accounts created from the login page.
- Browser events only cover visitors who opted in on the privacy banner.

**Funnel (database, last 12 weeks):** 14 real signups → 7 made a project → 8 sent a first message →
0 active on a later day → 0 active in week 2. There have been no signups since 09-24.

**Biggest leak, verified:** the day 1/3/6/9 welcome emails have never been sent. Vercel's Root
Directory is `apps/web`, so the crons in the root `vercel.json` never run: welcome-sequence,
reactivation-sequence, trial-reminders, dunning, and billing-ops-monitoring. `cron_logs` only has the
`apps/web/vercel.json` jobs. A fix with a backlog guard is in progress (welcome only; the rest are DJ
decisions).

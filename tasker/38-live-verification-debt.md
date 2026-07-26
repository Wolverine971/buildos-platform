<!-- tasker/38-live-verification-debt.md -->

# 38 — Live verification debt (one place for "built, never exercised live")

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

## Done when

Every box above is checked and its result recorded here (green/red + date). Anything that comes
back red becomes its own tracker; anything green gets deleted with the section.

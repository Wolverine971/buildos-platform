<!-- tasker/88-chat-workflow-ordinary-chat.md -->

# 88 — Jev freshness radar: after a brain dump, catch what went stale

**Created:** 2026-09-12. **Reshaped by DJ:** 2026-09-18.
**Follow-up (2026-09-19, ~21:10 UTC):** two real live scans completed successfully for DJ Wayne
Studio, with no card-worthy result. A repeated-message cursor defect was reproduced on real local
PostgreSQL and fixed locally; focused tests pass 28/28, full gate and deployment remain pending.
The first-scan exclusion policy also filtered all recently imported entities. See the
[live check and next actions](../docs/technical/reviews/AGENTIC_CHAT_RADAR_LIVE_CHECK_2026-09-19.md).

**UI follow-up (2026-09-19, local):** implemented **Review project** in the composer, durable
workflow stages/findings/recovery in ordinary chat, and **Review deeper** on matching-project
freshness cards. Review deeper preserves the existing draft and waits for Send. Review access
remains gated by the server switch/cohort; unavailable explicit reviews cannot become ordinary
mutating turns. Research, full QA gate, and activation are deferred by DJ. Details:
[implementation record](../docs/technical/reviews/AGENTIC_CHAT_REVIEW_UI_2026-09-19.md).

**Status (2026-09-19 01:30 UTC): LIVE for DJ only.**

- Deployed at `262e86bfc`.
- Production migrations `20260918200000`–`200300` are applied and recorded in the ledger.
- `FRESHNESS_RADAR_MODE=live` is set on `daily-brief-worker`.
- DJ's flags `freshness_radar`, `.surfaces` and `.inbox_cleanup` are ON; `.auto_apply` is OFF,
  gated on the ledger.
- The first real scans still need watching. See the
  [handoff](../docs/technical/reviews/AGENTIC_CHAT_HANDOFF_2026-09-19.md).

**Build status (2026-09-18):** built on `main`.

- Plan and interfaces are frozen in
  [`docs/architecture/jev-freshness-radar-v1-plan.md`](../docs/architecture/jev-freshness-radar-v1-plan.md),
  with lane amendments appended.
- **Lane A** (`fc8c1edcc`…`3b5ed1955`): 4 migrations, shared types, `JevClient` (live Score/Noul/Choice
  shapes confirmed), scalar and goal/milestone drafts in `verify-operations`, inbox freshness helpers.
- **Lane B** (`b6d1642f8`…`1e12e8de2`): the worker scanner, the ledger, auto-apply, inbox cleanup, the
  bundle, the card, and the read-only backtest.
- **Lane C** (`1e1a19f26`…`359f152ab`): the chat card, badges and gauges, inbox labels, and the
  undo, flag and decide routes.
- **Integration fix** (`fd8b76f4d`): milestone date drafts now keep the user's calendar day.
- **Verified on merged `main`:**
    - worker typecheck is clean;
    - radar and inbox worker suites pass 126/126, including a real disposable-Postgres end-to-end scan;
    - web freshness, chat session and decide suites pass 116/116;
    - SQL contracts pass 52/52.
- **Remaining:**
    - observe the first live scans;
    - enable `freshness_radar.auto_apply` after about 20 clean scans, with DJ's OK;
    - run the backtest only with DJ's new OK (he declined it on 09-18).
      **Depends on:** nothing blocking. It reuses the Project Review suggestion, approval and inbox machinery.
      The 86/87 workflow is not used for drafting. It is read-only and text-only by contract, and about
      500× the cost per scan.

## Outcome

After DJ brain dumps about a project in chat, BuildOS notices which tasks, documents, goals and
milestones the new information probably made stale.

1. It scores each one with the Jev decision model (`typesafe/jev-1.13`, about $0.0005 per scan).
2. Very-confident, low-risk updates are applied automatically, with undo.
3. The rest are drafted for one-tap approval.
4. The same pass retires AI Inbox items the new information made obsolete, again with undo.
5. It also gauges whether each goal and milestone is on track.

Every judgment is written to a calibration ledger, so the percentages can be tuned from real outcomes.

## DJ's decisions (2026-09-18)

- **Scope: ambitious.** Staleness scores, the flags card, "Update these", the on-track gauge and
  inbox cleanup all ship in the first version. The cohort is DJ first.
- **Surfaces: all three.**
    - A card in the chat right after the dump.
    - One AI Inbox item per project, within the 3-per-project attention budget.
    - A "may be out of date" badge on each flagged entity.
- **Updates: auto-apply when very confident.** Everything else is drafted for approval.
- **Inbox cleanup: auto-retire with undo.** Borderline items are marked "possibly stale".

## Coordinator defaults (DJ may veto; from plan section 10)

1. **Auto-apply scope.** Tasks only: status to in progress, blocked or done, and absolute due dates
   the user literally stated. Goals, milestones and documents are always drafted.
2. **Auto-apply starts gated.** Drafts, the card and badges go live first. Auto-apply switches on
   after DJ's first ~20 live scans show zero grounding violations in the ledger.
3. **No generative rewriting by the radar.** For text and document changes, "Draft in chat"
   pre-fills a normal chat message.
4. **Badge visibility.** Badges are visible only to the person whose brain dump produced them,
   because the evidence quotes private chat.
5. **Percentages.** Raw percentages are shown with a "model estimate" hint. They are uncalibrated
   until about 50 labelled outcomes exist.
6. **Retire scope.** Only individual Project Review suggestions auto-retire. Briefs, audits, agent
   proposals and calendar items are only marked "possibly stale".
7. **Timing.** The card appears about 60–90 seconds after the last message, so a multi-message
   dump becomes one scan. Undo and the bundle both last 72 hours.

## Displaced original scope

The original 88 was an explicit **Review project** entry in the ordinary chat composer, using the
86/87 workflow. It is displaced, not cancelled. A "Review deeper" action on the radar card needs
that entry. The UI note from 87 still applies: after a finish from a visible prefix, the editor step
reads `claimed`, so render from the terminal outcome.

## Lanes (disjoint files; see plan section 8)

- **A — schema, contracts, shared core:**
    - four new migrations;
    - `freshness-radar.types.ts` and the additive type edits;
    - the generic `JevClient` in `packages/smart-llm`;
    - scalar/goal/milestone support in `verify-operations`;
    - freshness helpers in `inbox-index`.
- **B — worker scanner:** `apps/worker/src/workers/freshness-radar/**`, the queue registration,
  and the read-only backtest script.
- **C — web:**
    - the badge, undo and flag routes;
    - the null-`run_id` approval path;
    - `FreshnessRadarCard` in chat, badges and the gauge in the project UI, and inbox labels.

## Acceptance

- Focused lane tests, plus SQL/RLS on a local disposable Postgres. No hosted database.
- Migrations are applied to QA and then production only with DJ's explicit OK.
- Rollout order:
    1. Cohort flag on for DJ in `shadow` mode.
    2. Then `live` without auto-apply.
    3. Then auto-apply once the ledger gate above passes.
- **Backtest:** replay DJ's recent chat sessions read-only through the scanner and report precision
  and calibration. This runs on production data only with DJ's explicit OK.
- The live browser journey (dump → card → Update these → Undo → badge → inbox) is recorded in 89.

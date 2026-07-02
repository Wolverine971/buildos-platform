<!-- tasker/README.md -->

# Tasker — Open Loose Ends

Generated 2026-06-24, **refreshed 2026-07-01** against git history through `eb84a8ff`, the staged worktree, the AI Inbox / loops docs, live-site checks, and the engagement logs. Each file is one loose end: what's done, what's not, and the concrete next action.

## ✅ Closed / corrected since last pass

| #                                   | Item                      | Resolution                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01](01-haro-pam-baker-response.md) | HARO / Pam Baker response | **Sent** (unchanged).                                                                                                                                                                                                                                 |
| [03](03-anti-feed-t35-publish.md)   | T35 blog publish          | **CORRECTED: the blog is live** (200 at `/blogs/philosophy/you-stopped-choosing-what-you-think-about`, `published: true` since ~May). Remaining = flip WS09 dashboard, post social lanes, recordings. Tracker was out of sync with prod.              |
| [07](07-mcp-hardening.md)           | MCP hardening             | **MOSTLY DONE — file was stale.** CORS/GET/protocol checks, Phase 0 tests, stdio bridge, and the `mcp:repro` script all shipped. Remaining = commit the untracked lethal-trifecta self-audit doc, then **Simon outreach is unblocked**.               |
| [02](02-instagram-reply-queue.md)   | Instagram reply queue     | **ROLLED UP 2026-07-01** into `docs/marketing/social-media/daily-engagement/INSTAGRAM_REPLY_ROLLUP_2026-07-01.md` — one doc with the re-login blocker, the 7-item live queue, Lea's DM debt, and process fixes. Task closed; execute from the rollup. |

## The standing theme, updated

Last pass: "execution, not ideas, is the constraint." Still true, plus a second one: **verification and shipping discipline** — the AI Inbox + loops flow is code-complete through Phase 5 + burst hardening + run→chat bridge, but three manual smoke checklists are unrun, prod migration state is unverified, and ~4 finished bundles sit uncommitted in the worktree.

## Do first (cheap or perishable)

| #                                 | Item                                   | Why now                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [15](15-commit-staged-work.md)    | **Commit the standing worktree** (new) | 4 finished bundles (skill ontology refactor 35/35 green, burst hardening 6/6 green, ideate/moodboard, docs/specs) + untracked strays. ~30 min, removes risk.                            |
| [09](09-linkedin-ship-list.md)    | LinkedIn ship list                     | Board untouched since **06-18** — the Tier A queue is dead. Don't post the stale list; run a fresh scan and post same-day. Troy/Manuel relationship touches may still be worth it late. |
| [03](03-anti-feed-t35-publish.md) | T35 social lanes + dashboard flip      | Blog already live; kit drafted; just post. Unblocks WS10 T48 psychologically too.                                                                                                       |

## Engineering — verify what's built

| #                                         | Item                                | State (2026-07-01)                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [13](13-ai-inbox-verify-and-cleanup.md)   | **AI Inbox + loops verification**   | Code-complete through Phase 5 + run→chat bridge + in-chat resolution + burst score gate. **Smoke debt now spans 3 checklists**; type regen ✅; prod migrations unverified → gates `PROJECT_LOOPS_ENABLED`.                      |
| [05](05-start-here-deploy-and-monitor.md) | Project START HERE doc              | **No movement.** Migration committed 6/23, deploy unconfirmed; backfill (`pnpm backfill:start-here`, note corrected script name) never run; no capture monitoring.                                                              |
| [06](06-empty-synthesis-verify.md)        | Agentic-chat empty-synthesis repair | **Partial movement**: finalization-guard hardened + tested 6/28. Still open: over-eager doc corrector (`collectUnsupportedDocumentClaims`, `repair-instructions.ts:613`) unguarded; pentest R1–R8 unrun (only template exists). |
| [08](08-calendar-live-smoke.md)           | Calendar in Agent Runs              | **No movement** on the loose ends. Hardcoded `calendar_id: 'primary'` now at `calendar-analysis.service.ts:1456`; no Google-connected live smoke. (Adjacent calendar-suggestion FK/status work did land 6/28.)                  |
| [14](14-complete-project-audit-build.md)  | **Complete Project Audit** (new)    | Spec'd 2026-07-01 (`project_audits` + 4-gate trigger evaluator + worker generator + tracker UI). **Zero implementation.** Sequence after 13 is green.                                                                           |

## Marketing / distribution — execution

| #                                       | Item                                      | State                                                                                                                                 |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [10](10-creator-outreach-swyx-riley.md) | Creator outreach: Swyx + Riley + pipeline | Unchanged: Riley verification-gated, Swyx artifact unbuilt, pipeline unverified. **Note: MCP no longer blocks Simon** ([07] cleared). |
| [11](11-tiktok-ws10-setup.md)           | TikTok / WS10 short-form video            | Unchanged: T46 account setup (DJ phone) + T50 rubric still the gate. T48 scripts now have a live blog to point at ([03]).             |
| [12](12-personal-brand-throughline.md)  | DJ personal-brand throughline decision    | Unchanged: the one-sentence test is still unanswered; blocks personal-brand calendar.                                                 |

## Housekeeping

- Root `test.md` (single HTML comment) — delete (folded into [15]).
- 4 pre-existing unrelated web test failures pollute full-suite runs (dashboard page expectations, next-step fallback model, tool-surface size budget ×2) — fix or quarantine before using "full suite green" as a gate.
- `tasker/` itself is untracked — commit it with [15] so this artifact survives.

## Notes

- This is a manually-refreshed artifact. Re-run the reassessment (or `/loop 30 …`) to refresh.
- Recommended sequence this week: **15 (commit) → 13 (smoke + prod migrations) → 07 remainder (self-audit commit → Simon outreach) → marketing ships (IG rollup/09/03) → 14 (new build)**.

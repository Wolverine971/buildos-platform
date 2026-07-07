<!-- tasker/06-empty-synthesis-verify.md -->

# 06 — Agentic-chat empty-synthesis repair: verify & harden

**Priority:** P1 — code shipped locally, verification incomplete
**Type:** Engineering (QA + small fix)
**Source:** `apps/web/docs/technical/audits/AGENTIC_CHAT_EMPTY_SYNTHESIS_REPAIR_PLAN_2026-06-23.md`

## State

Fixes A–D are **implemented and locally verified** with regression coverage (`empty-synthesis-retry.regression.test.ts`, 3 cases, no skips):

- **A** typed search-result materialization (`tool-payload-compaction.ts`)
- **B** wrong-entity-kind repair (`entity-kind-repair.ts`)
- **C** empty no-tool synthesis retry (one retry)
- **D** evidence-aware finalization-guard fallback (`finalization-guard.ts:137-181`)

## Refresh 2026-07-02 — adjacent hardening landed; core loose ends unchanged

Commit `734b291a` (7/01) shipped DEEP-audit fix **D6**: `finalization-guard.ts` + `round-analysis.ts` are now ok-aware (`didGatewayExecSucceed` treats only explicit `ok:false` gateway envelopes as failure — no more false "I completed the change" on failed writes), with new tests. The A–D fixes are also now deployed (pushed to main), so loose end 3's "no live deploy" is stale — but nothing has been _verified_ live.

Still open, unchanged: pentest R1–R8 (no run log exists) and the over-eager corrector (`repair-instructions.ts` untouched since 6/25).

## Loose ends

1. **Manual pentest R1–R8 not run** — `apps/web/docs/features/agentic-chat/pentesting/REGRESSION_TESTS_2026-06-23.md` defines 8 manual tests (stale-context write reversal, false-done correction, cross-project write protection, refusal-no-loop, etc.). No run-log exists. These should be run _after_ the A–D changes.
2. **Over-eager document-claim corrector flagged, not fixed** — `collectUnsupportedDocumentClaims()` in `repair-instructions.ts` (~L210/613-631) can strip legitimate read-synthesis sentences (it removed a correct "the parent task … is still todo" during test dev). Plan calls this out as a follow-up.
3. ~~No live/staging deploy verification~~ — code is deployed (main = origin/main); live _verification_ is what R1–R8 provides.

## Next action

1. Run R1–R8 manually against throwaway test projects (spec in pentesting `TEST_PROJECT_SPEC.md`), record results vs `TEST_MATRIX.md`, delete the test projects after.
2. Review `collectUnsupportedDocumentClaims`: add a guard so it doesn't rewrite task-state claims, or split document-link vs document-placement logic; add a unit test for the task-state preservation case.
3. Deploy to staging, re-run R1–R8 against live endpoints, then promote.

## Done when

R1–R8 logged green post-deploy and the corrector fix has a regression test.

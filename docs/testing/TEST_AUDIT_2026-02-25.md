<!-- docs/testing/TEST_AUDIT_2026-02-25.md -->

# Test Health and Coverage Audit (2026-02-25)

## Scope

This audit covered all monorepo Vitest suites I could run locally in this environment:

- `@buildos/shared-utils`
- `@buildos/smart-llm`
- `@buildos/twilio-service`
- `@buildos/worker` (unit/default suite and integration script)
- `@buildos/web` (default suite behavior + deterministic per-file audit for non-LLM tests)

Raw per-file web results are saved at:

- `docs/testing/artifacts/test-audit-2026-02-25/web-results.tsv`
- `docs/testing/artifacts/test-audit-2026-02-25/web-test-counts.tsv`
- `docs/testing/artifacts/test-audit-2026-02-25/web-pass-files.txt`
- `docs/testing/artifacts/test-audit-2026-02-25/web-fail-files.txt`
- `docs/testing/artifacts/test-audit-2026-02-25/web-timeout-files.txt`

## Executive Summary

- Total test files discovered in repo: **140**
- Web LLM files intentionally excluded by default config: **5**
- Test files executed in this audit (non-LLM): **130**
- Passing test files: **106**
- Failing test files: **23**
- Timeout/hanging test files: **1**

Test-case totals from executed suites:

- Passed tests: **1070**
- Failed tests: **89**
- Skipped tests: **3**

High-level outcome:

- `shared-utils`, `smart-llm`, `twilio-service`, and worker default suites are healthy.
- Most breakage is concentrated in `apps/web`.
- One web test file hangs (`TaskBraindumpSection.test.ts`).
- Worker integration script is misconfigured (it filters integration tests but config excludes them).

## What Is Working

### Stable suites (all green)

- `@buildos/shared-utils`: 1 file, 1 test passed.
- `@buildos/smart-llm`: 4 files, 12 tests passed.
- `@buildos/twilio-service`: 2 files, 6 tests passed.
- `@buildos/worker` default suite: 10 files, 151 tests passed.

### Web suite (non-LLM, per-file audited)

- **89/113 files passing**
- **900 tests passed**, **3 skipped** across passing files
- Strong pass coverage in:
    - `src/routes/api/agent/stream/**`
    - most `src/routes/api/onto/**`
    - many `src/lib/services/ontology/**`
    - `agentic-chat-v2` service tests

## What Is Broken

### 1) Web failing/hanging files (24 total)

#### Timeout / hang

- `src/lib/components/project/TaskBraindumpSection.test.ts` (hangs; no completion within timeout window)

#### Missing modules / files

- `tests/integration/synthesis-flow.test.ts`
    - Cannot find module: `$lib/services/synthesis/task-synthesis-helpers`
- `src/lib/stores/project.store.test.ts`
    - Cannot find module: `./project.store`
- `src/lib/tests/chat/token-usage.test.ts`
    - Cannot find module: `../mocks/supabase-mock`
- `src/lib/components/ui/codemirror/sticky-scroll.test.ts`
    - Missing fixture file: `docs/specs/sticky-scroll/test.md`

#### Environment mismatch

- `src/lib/services/__tests__/time-block-notification.bridge.test.ts`
    - `window is not defined` (node env vs browser assumptions)

#### "No tests" condition

- `src/lib/components/agent/PlanVisualization.test.ts`
    - "No test suite found in file"

#### Supabase mock/API drift (`this.supabase.rpc is not a function`)

- `src/lib/services/time-block.service.test.ts`
- `src/lib/utils/__tests__/braindump-ui-validation.test.ts`
- `src/lib/utils/__tests__/project-ref-resolution.test.ts`
- `src/lib/utils/__tests__/reference-resolution.test.ts`
- `src/lib/utils/operations/operations-executor.test.ts`
- plus related failures under `src/routes/__tests__/authenticated-pages.test.ts`

#### Assertion drift / behavior changes

- `src/lib/stores/__tests__/notificationPreferences.test.ts`
- `src/lib/tests/chat/progressive-flow.test.ts`
- `src/lib/services/ontology/project-graph-builder.test.ts`
- `src/routes/__tests__/authenticated-pages.test.ts`
- `src/lib/services/agentic-chat/persistence/agent-persistence-service.test.ts`
- `src/lib/services/agentic-chat/planning/plan-orchestrator.test.ts`
- `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.test.ts`
- `src/lib/services/agentic-chat/synthesis/response-synthesizer.test.ts`
- `src/lib/services/agentic-chat/analysis/strategy-analyzer.test.ts`
- `src/lib/services/agentic-chat/tools/core/tool-executor.test.ts`
- `src/lib/utils/__tests__/prompt-audit.test.ts`
- `src/lib/utils/__tests__/brain-dump-integration-simple.test.ts`

### 2) Worker integration script is broken by config

- Script: `apps/worker package.json` -> `test:integration = vitest run tests/integration`
- Config: `apps/worker/vitest.config.ts` excludes `**/tests/integration/**`
- Result: `No test files found, exiting with code 1`

This is currently a configuration contradiction.

## Coverage Assessment

### Line/branch/function coverage where measurable

| Workspace                 | Command                 |  Stmts | Branch |  Funcs |  Lines |
| ------------------------- | ----------------------- | -----: | -----: | -----: | -----: |
| `@buildos/shared-utils`   | `vitest run --coverage` |     0% |   100% |   100% |     0% |
| `@buildos/smart-llm`      | `vitest run --coverage` | 35.00% | 43.79% | 40.77% | 35.00% |
| `@buildos/twilio-service` | `vitest run --coverage` | 37.53% | 71.42% | 66.66% | 37.53% |
| `@buildos/worker`         | `vitest run --coverage` | 10.04% | 71.13% | 17.18% | 10.04% |

Notes:

- Worker coverage is low despite many passing tests, indicating tests are concentrated in selected flows while much runtime code remains unexecuted.
- Shared-utils coverage reports 0%; current test likely validates exports/types without executing instrumented implementation paths.

## Test-surface ratio (test files vs source files)

| Workspace                 | Test files | Source files | Ratio |
| ------------------------- | ---------: | -----------: | ----: |
| `apps/web`                |        118 |         1221 |  9.7% |
| `apps/worker`             |         15 |           60 | 25.0% |
| `packages/shared-utils`   |          1 |            9 | 11.1% |
| `packages/smart-llm`      |          4 |           12 | 33.3% |
| `packages/twilio-service` |          2 |            3 | 66.7% |

## Why Web Coverage Is Not Reliable Yet

- Full web suite run (`vitest run`) repeatedly hangs.
- A single-file timeout strategy identified one hanging file and 23 failing files.
- Attempting one-shot coverage against only passing web files produced an invalid run (`No test files found`) and a meaningless 0% report.

Conclusion: web line coverage should be re-measured only after fixing the failing/hanging files and running a clean full suite.

## Priority Fix Plan (Recommended)

1. Fix broken imports/fixtures first (quick wins, unblock multiple files).
2. Fix worker integration config conflict (`exclude` override or separate config).
3. Standardize supabase mocks (`rpc` support) for tests expecting RPC-backed flows.
4. Resolve assertion drift in agentic-chat and store tests (align with current behavior or restore intended contracts).
5. Quarantine or fix hanging `TaskBraindumpSection.test.ts` (likely async teardown/open-handle issue).
6. Re-run full web suite and then run web coverage cleanly.

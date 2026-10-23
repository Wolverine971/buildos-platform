<!-- docs/technical/reviews/REPO_HEALTH_REVIEW_2026-09-28.md -->
<!-- doc-status: point-in-time -->

# Repository health review — 2026-09-28

**Status:** Local fixes verified; dependency vulnerability scan awaiting permission.
**Reviewed checkout:** `main`, starting at `bd45c65b8`.
**Scope:** Configured workspace type checks, web/worker test type checks, existing lint and
guardrails, recent steward and project-loop code, and repository documentation/migration checks.

The application and package type checks passed at the start. The separate web test type check
found 17 errors, and lint found stale generated CSS. Code review and regression tests also
confirmed two runtime bugs. These issues are fixed in the working tree. Existing documentation
and Tasker changes present before this review were preserved.

## Fixed findings

### 1. Steward controls could lose their state during project changes

In `apps/web/src/lib/components/agent/StewardChip.svelte`, switching projects while a toggle was
pending left `busy` set for the previous project. The new project's GET response was discarded,
leaving its control hidden. Returning to the original project also allowed an older POST to
overwrite its current status; an old request's cleanup could clear a newer request's busy state.

Project changes now invalidate earlier requests and reset the control. Responses and cleanup
apply only to the current request, and aborted status reads are ignored. The conflict-refresh
path also checks that it still belongs to the current request sequence.

Three component regression tests reproduced the failure before the fix and pass afterward.
They cover switching projects during a POST, returning to the original project, and overlapping
requests belonging to different projects.

### 2. Reclaiming a stuck review blocked its own replacement

In `apps/worker/src/workers/project-loop/enqueue.ts`, reclaiming a stale run set its `finished_at`
to the current time. The next query then treated that failed orphan as a recent run and refused
the automatic replacement with `cooldown_active`.

The cooldown query now excludes the run reclaimed during this enqueue attempt. Other recent
runs still impose the existing cooldown. Regression coverage checks both replacement and
preservation of that cooldown. The replacement test failed before the fix and passes afterward.

### 3. Seventeen web test type errors blocked validation

| File                                                               | Original errors | Fix                                                                                             |
| ------------------------------------------------------------------ | --------------: | ----------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/services/openrouter-v2-service.test.ts`          |              14 | Name the operation explicitly on mocked JSON/text requests, as required by the current API.     |
| `apps/web/src/lib/server/project-steward.service.test.ts`          |               2 | Assert that exactly one write exists before accessing it.                                       |
| `apps/web/src/lib/components/layout/brain-bolt-hevc-alpha.test.ts` |               1 | Read the alpha metadata byte with `Buffer.readUInt8`, which also rejects an out-of-bounds read. |

The final web and worker test type checks both report zero errors. Compiler settings,
exclusions, and the zero-error baseline remain intact.

### 4. Generated Inkprint CSS was stale

The style guardrail failed for `color-system.css`, `textures-core.css`, and `utilities.css` in
`apps/web/static/design-library/inkprint-textures`. Running the existing `styles:sync` generator
updated these three files from the canonical stylesheet. The style ownership, typography, and
generated-file checks now pass.

## Verification

Heavy checks ran sequentially through `test-gate`, with its worker caps. All executed checks
were free and local; provider requests in the OpenRouter tests were mocked.

| Check                                                                       | Result                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Web `check` after the component fix                                         | 0 errors, 0 warnings                                                    |
| Other 10 workspace `typecheck` scripts, run with concurrency 1              | Passed                                                                  |
| Worker `typecheck` after the enqueue fix                                    | Passed                                                                  |
| Web and worker `typecheck:tests` after fixture fixes                        | 0 errors each                                                           |
| Existing lint scripts: web, worker, smart-llm                               | Passed; web rerun after CSS/fixture fixes                               |
| Web route, query-column, select, icon, style, and skill guardrails          | Passed                                                                  |
| Worker HTTP module guardrail                                                | Passed                                                                  |
| Final web regressions: steward component/service, OpenRouter, HEVC metadata | 48 passed                                                               |
| Final worker regressions: enqueue gates and active-run audit gate           | 13 passed                                                               |
| Steward prompt tests                                                        | 13 passed                                                               |
| RPC-parser and migration/cleanup tooling tests                              | 39 passed                                                               |
| Documentation health, strict                                                | 1,763 tracked documents checked; 0 dead-schema and 0 dead-path findings |
| Migration ledger                                                            | 487 files valid against the existing historical exceptions              |
| Libri migration scope                                                       | 32 migrations valid                                                     |
| SQL contract inventory                                                      | 162 files classified                                                    |
| Changed source/test formatting and `git diff --check`                       | Passed                                                                  |

The Svelte analyzer reported no blocking issues. Its suggestions about effect assignments were
reviewed: these assignments reset UI state when the project changes and synchronize asynchronous
API responses. The analyzer's existing snippet suggestion was outside this fix's scope.

## Remaining items

1. **Dependency vulnerability scan requires permission.** Automatic approval review rejected
   `pnpm audit --prod --audit-level high --json` because it would send dependency names and
   versions to npm. No dependency vulnerability result was obtained.
2. **Vite configuration compatibility warnings.** The current web test run warns that a native
   configuration loader does not support extensionless imports of `vitest.workers` and
   `vitest.coverage`, or their ESM syntax under the root CommonJS package boundary. Current
   tests pass; address the configuration/module boundaries before adopting that loader.
3. **Seven nonblocking documentation status warnings.** The following historical documents need
   a status/last-updated header:
    - `docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md`
    - `docs/architecture/JEV_EMAIL_SCAN_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_FITNESS_AUDIT_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_FITNESS_DECISION_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md`
    - `docs/technical/reviews/SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md`

## Limits

This was a local diagnostic review with focused regression suites, not an exhaustive code or
security audit. The full production build, entire test suite, live model/API validation, and
hosted database checks were not run. SQL inventory/ledger checks do not prove that production
has applied the migrations; the migration immutability comparison was skipped because
`MIGRATION_BASE_REF` was unset. No migrations were added or applied. The fixes are uncommitted
and have not been deployed.

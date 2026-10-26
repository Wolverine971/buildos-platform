<!-- docs/testing/TEST_AUDIT_2026-10-26.md -->

# BuildOS testing audit

- **Date:** 2026-10-26
- **Status:** Audit complete; first three implementation priorities addressed (see remediation below)
- **Scope:** Test selection, assertion quality, CI wiring, recent changes, and critical missing coverage
- **Code reviewed:** Working tree during the audit, ending at `2605098ce`; the email campaign migration was still untracked. Existing code and tests were left unchanged.

BuildOS has substantial, useful testing. The main problems are gaps between tests that exist and tests CI executes, several assertions that freeze implementation details, and missing behavioral coverage at money, messaging, and browser boundaries. A focused concurrency probe reproduced a campaign daily-cap overrun while the existing cap test passed.

The answer to “am I testing the wrong things?” is **sometimes, in specific suites**. Rewrite those assertions selectively. The answer to “are there glaring gaps?” is **yes**, especially the recent SQL checks omitted from CI and concurrent campaign sending. A broad push for more test files or a global coverage percentage would miss the highest-value work.

## Current infrastructure

| Area            | Test or spec files on disk | Interpretation                                                               |
| --------------- | -------------------------: | ---------------------------------------------------------------------------- |
| Web             |                        898 | Includes separate paid and browser suites                                    |
| Worker          |                        332 | Includes four separately configured integration files and opt-in live suites |
| Shared packages |                        204 | Includes runtime, shared operations, LLM, and client contracts               |
| Total           |                      1,434 | File inventory, not executed-test count or coverage                          |

The SQL inventory reports 167 `.test.sql` files: 76 self-contained disposable contracts, 57 classified as Vitest-backed, and 34 legacy schema-dependent contracts. Separately, 45 `.check.sql` files are classified as support fixtures. Classification alone does not establish execution.

CI already runs static checks, application and test typechecks, lint, builds, Vitest, coverage reporting, four Agent Run database integration suites, and self-contained SQL contracts. It also repeats the SQL gate against PostgreSQL 15. The older testing README does not describe this setup accurately.

## Priority findings

### 1 P1 Recent database assertions are omitted from CI

**Evidence:** [SQL classification](/Users/djwayne/buildos-platform/scripts/database/sql-contracts.mjs:23) treats every SQL file that does not end in `.test.sql` as a support fixture, after two special cases. The [SQL runner](/Users/djwayne/buildos-platform/scripts/database/run-sql-contracts.mjs:37) selects only self-contained disposable contracts. Neither CI nor the Vitest wrappers invokes the 45 `.check.sql` files.

These are executable assertions, including Workspace isolation, project invite links, agent access walls, guest calendar projection, chat restoration, atomic finalization, and shutdown requeueing. For example, [Workspace assertions](/Users/djwayne/buildos-platform/supabase/tests/20261023230000_workspace_foundation.check.sql:1) test authenticated grants and separation between two users. They are not merely fixture data.

Migration rehearsal can run them manually with `--check`. Four standing checks are included in [rehearsal defaults](/Users/djwayne/buildos-platform/scripts/migration-rehearsal/rehearse.py:56), but rehearsal is not a CI step. The inventory check currently passes while these assertions remain outside CI.

**Consequence:** New access-control or lifecycle behavior can regress without failing the automated database gate. Existing historical tests do not close this gap: the [workflow end-to-end database helper](/Users/djwayne/buildos-platform/apps/worker/tests/helpers/workflowPostgres.ts:15) applies a selected migration chain ending September 24, rather than October's current lifecycle definitions.

**Action:** Give rehearsal assertions an explicit inventory category and an execution owner. Add a disposable current-schema contract lane, using a reviewed schema fixture or sanitized schema snapshot with synthetic data. Run the important assertions after composing current migrations. Start with Workspace/access walls, sharing/restoration/finalization, and guest calendar permissions. Keep historical migration tests where they still prove upgrade behavior; do not mistake them for current-schema integration coverage. Renaming files alone will not supply their database prerequisites.

### 2 P1 Campaign cap tests miss a reproduced concurrency defect

**Evidence:** [Sender tests](/Users/djwayne/buildos-platform/apps/web/src/lib/server/email-campaigns/sender.test.ts:292) check the daily cap in one invocation. The [sender](/Users/djwayne/buildos-platform/apps/web/src/lib/server/email-campaigns/sender.ts:149) reads the number already sent and calculates its allowance before claiming recipients. The [claim RPC](/Users/djwayne/buildos-platform/supabase/migrations/20261025200000_add_email_campaigns.sql:181) locks recipient rows, but does not reserve a shared daily allowance.

**Reproduced locally:** With two due recipients, zero prior sends, `dailyCap: 1`, and two simultaneous `processDueCampaignSends` calls, both calls returned `sent: 1`; the mocked transport was called twice and both recipients became sent. All 18 existing sender tests passed in the same run. The probe used the real sender with the existing in-memory database helper and an injected mock transport; it did not contact a database or send email. This demonstrates the application-level allowance race, not the correctness of PostgreSQL locking.

The [fake claim implementation](/Users/djwayne/buildos-platform/apps/web/src/lib/server/email-campaigns/fake-db.test-helper.ts:216) explicitly reproduces the SQL “minus locking.” It is useful for sender orchestration, but cannot establish that simultaneous cron processes avoid duplicate claims. The new migration has no dedicated executable database contract in the current suite.

**Action:** Add a failing regression asserting that concurrent runs share one allowance, then enforce that allowance atomically. Add a two-connection disposable PostgreSQL test for exclusive claims and lease handling. Add route tests proving ordinary users cannot queue campaigns and invalid cron credentials cannot invoke the sender. Preserve the existing suppression, deletion-status, uncertain-send, and save-before-queue tests; those protect real user outcomes.

### 3 P1 Billing coverage is too narrow for its responsibilities

**Evidence:** The [Stripe service suite](/Users/djwayne/buildos-platform/apps/web/src/lib/services/stripe-service.test.ts:85) contains two tests: a failed subscription write and recovery of a paid invoice. Both are valuable. Repository searches found no tests invoking the Stripe webhook route, signature verification, checkout creation, portal creation, subscription deletion, or failed-payment webhook handling. The service implements all of these.

The [server-hook tests](/Users/djwayne/buildos-platform/apps/web/src/hooks.server.test.ts:29) disable and mock the consumption-billing guard. The guard and automatic tier-upgrade features default off in source, so their missing coverage is particularly a prerequisite for enabling them, not evidence that they are currently active in production. Worker usage accounting, billing cache, activation-page, and dunning tests exist; this is a boundary gap, not an absence of all billing tests.

**Action:** Use mocked Stripe SDK calls and database failures to cover signature rejection, successful processing, duplicate delivery, retry after partial failure, failed-to-paid recovery, cancellation, and protection against stale event state. Test checkout/portal user ownership. Exercise frozen-account behavior through the actual hook with the feature enabled, including allowed recovery routes and denied writes. Require an explicit test for automatic tier upgrades before rollout. None of these tests needs paid API calls.

### 4 P1 CI does not verify a complete browser journey

**Evidence:** There is one [Playwright spec](/Users/djwayne/buildos-platform/apps/web/src/lib/tests/agentic-e2e/browser/agent-chat-modal.spec.ts:1), focused on Agent Chat. It is [excluded from Vitest](/Users/djwayne/buildos-platform/apps/web/vitest.config.ts:149), and [CI](/Users/djwayne/buildos-platform/.github/workflows/ci.yml:56) has no browser step. Even the wiring cases use a helper that requires harness credentials and provisions users and rows in Supabase.

Component tests are extensive and useful, but they cannot prove the built app hydrates, navigates, preserves authentication, and connects UI actions to the correct route together. The recent project desktop, Workspace, sharing, and invite changes particularly need this layer.

**Action:** Add a small, free browser suite using the built app, isolated auth/database fixtures, and scripted model responses. Begin with login-to-workspace, project/task editing and reload persistence, chat send/stop/reopen, and invite acceptance. Include one mobile viewport for the core path. Keep live-model validation separately approved. Do not simply enable the current production-dependent harness on every pull request.

### 5 P2 Some tests enforce source spelling instead of the intended behavior

These are the clearest candidates for reducing development friction:

| Existing test                                                                                                                     | What it currently freezes                                                                         | Better contract                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Chat craft](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-modal-craft.test.ts:37)                 | Exact numbers of class strings and exact animation declarations                                   | Every visible mobile action has an adequate target; incoming content preserves reader position; explicit jump-to-latest works |
| [Entity details drawer](/Users/djwayne/buildos-platform/apps/web/src/lib/components/ontology/EntityModalDetailsDrawer.test.ts:23) | Variable name, class ordering, breakpoint construction, and exact height expression               | Starts closed, opens/closes accessibly, resets on reopen, and remains usable at desktop/mobile sizes                          |
| [Entity header](/Users/djwayne/buildos-platform/apps/web/src/lib/components/ontology/EntityModalHeader.test.ts:17)                | Source fragments and broad forbidden-word matches over source                                     | Correct accessible title/actions and the intended visible fields                                                              |
| [Chat lifecycle](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-modal-lifecycle.test.ts:164)        | Extracts source between comments, transpiles callbacks, replaces `$effect` with a stub            | Mount/unmount and session-change behavior using real Svelte effects, or an extracted production controller tested directly    |
| [Catalog baseline](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts:88)  | Entire serialized tool catalog, descriptions, lengths, order, and hashes in a “pre-move” snapshot | Unique names, valid parameter schemas, permission/dispatch compatibility, required capabilities, and meaningful size budgets  |

A harmless class reorder can fail a source assertion while leaving the rendered UI identical. Conversely, disconnected lifecycle wiring can pass an extracted-callback test because the callback is invoked by the test rather than by Svelte. The lifecycle scenarios themselves are valuable; preserve them while changing the test seam.

The catalog snapshot is 1,431 lines and 163,233 bytes, and changed in 10 commits during October through the reviewed HEAD. A prose-only tool-description change changes the serialized hashes. That documents maintenance churn, not proof that every snapshot update was unnecessary. Keep the other structural fitness assertions; shrink or retire the whole-catalog migration snapshot unless exact compatibility is still an explicit requirement.

All selected UI source-contract tests passed. This audit did not establish that they currently force obsolete business behavior. It did establish that they restrict implementation choices more than their stated user requirements need.

### 6 P2 The production battery policy tests are not in the regular gate

**Evidence:** [Root scripts](/Users/djwayne/buildos-platform/package.json:48) define `test:agentic:gate`, but `verify:static`, `verify`, and CI do not call it. These root-level Node tests are outside the workspace Vitest discovery roots. The six files protect scorecard completeness, timing rules, deployment provenance, harness-account restrictions, and the acting-model allowlist. All 25 tests passed when run directly.

**Action:** Add this free script to the regular gate. Keep it distinct from the paid production battery. Inventory other standalone Node/Python test entrypoints too, especially the migration-rehearsal harness that has become important to the newer SQL checks. Web harness unit tests are already in CI; this finding concerns the separate root scripts.

## Smaller infrastructure issues

- **The generic worker integration command is stale.** [The script](/Users/djwayne/buildos-platform/apps/worker/package.json:27) selects `tests/integration` through a [config that excludes it](/Users/djwayne/buildos-platform/apps/worker/vitest.config.ts:163). Discovery returned no files; the dedicated integration config listed all four. Alias the generic command to that config. CI already uses the correct dedicated command.
- **CI repeats the main Vitest suites.** `pnpm verify` runs `test:run`, then the next step runs `test:coverage`. Use one coverage-enabled CI run after static/build checks, retaining separate database/version contracts. This is an execution duplication finding; no wall-clock savings were measured.
- **A scheduler DST test overclaims.** [The named DST case](/Users/djwayne/buildos-platform/apps/worker/tests/scheduler.comprehensive.test.ts:95) only checks non-null and `Date` type. Assert the exact instant, and define spring-gap/fall-overlap behavior. Other timezone and civil-date tests already provide useful coverage.
- **Testing documentation is materially stale.** [The README](/Users/djwayne/buildos-platform/docs/testing/README.md:11) says 378 test files and says CI lacks build, coverage, and integration checks. The coverage matrix still lists retired code and recommends adding infrastructure that exists. Replace these with generated runner inventories and a short behavior-based risk matrix.
- **Coverage reports need interpretation.** Coverage is centralized and includes unloaded source files, but has no thresholds. Existing local reports predate the audit and are not a current baseline. Prefer branch coverage or mutation checks on a few critical modules after adding the missing contracts; do not start by enforcing an arbitrary repository-wide percentage.

## Tests worth keeping

Preserve authentication tests that reject forged session identities; cross-user and capability-boundary tests; SQL claim fencing, cost reservation, replay/idempotency, and recovery contracts; deletion/retention checks; and failure-path tests that prevent reporting a write as successful after persistence fails.

The recent [CampaignPage tests](/Users/djwayne/buildos-platform/apps/web/src/lib/components/email-campaigns/CampaignPage.test.ts:193) are a good model: edits must save before queuing, and a failed save must prevent queuing. The [workflow end-to-end test](/Users/djwayne/buildos-platform/apps/worker/tests/agenticChatWorkflowEndToEnd.postgres.test.ts:121) also exercises a valuable lost-terminal-response replay scenario. Bring its database fixture forward for current-schema claims rather than deleting the scenario.

Static source checks can be appropriate for dependency boundaries, prohibited secret logging, and retired engine imports. Do not delete them wholesale merely because they read files. The problem is using source spelling as a substitute for behavior that can be tested directly.

## Recommended sequence

1. Add the campaign concurrency regression and fix shared allowance reservation; add claim/role database tests before relying on concurrent sends.
2. Make current SQL assertions visible in the inventory and executable in CI, beginning with access control and chat lifecycle.
3. Wire the free root policy tests and repair the misleading integration command.
4. Add billing boundary tests and a small isolated browser smoke suite.
5. Replace the most brittle UI source assertions and shrink the catalog snapshot as those areas are next edited.
6. Remove duplicate CI execution and refresh testing documentation.

Do not broadly weaken assertions or bless snapshot changes just to make a refactor pass. For each failing test, identify the user-visible invariant or security guarantee first; preserve that guarantee in the replacement.

## Validation performed

| Validation                                                                   | Result                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Root agentic policy tests, six files                                         | 25 passed                                                            |
| Seven selected web files: UI contracts, lifecycle, billing, campaign page    | 46 passed                                                            |
| Four selected worker files: batching, scheduling, ownership, mutation review | 94 passed                                                            |
| Existing campaign sender suite                                               | 18 passed                                                            |
| Separate temporary concurrent-sender probe                                   | Reproduced two mock sends with a cap of one; probe removed afterward |
| SQL inventory check                                                          | Passed; exposed the `.check.sql` classification gap                  |
| Worker integration discovery                                                 | Default config: zero files; dedicated config: four files             |

In total, 183 existing tests passed. Vitest used one worker through `test-gate`. The temporary reproduction asserted the observed defect, so its passing status is not evidence that the cap is correct. No full-suite, fresh coverage, browser, live-model, or database contract run was performed for this audit. No production data was changed, and no paid test was run. Findings about missing execution come from runner/configuration inspection, not from an assumption that every unrun test fails.

## Remediation implemented — 2026-10-26

The first three implementation priorities were SQL execution, the campaign cap race,
and free-test wiring. The original findings above describe the pre-change audit.

- **SQL execution:** `pnpm test:sql-current` discovers all 46 current `.check.sql`
  files (45 existing plus the new campaign contract). CI runs them against PostgreSQL
  15 with pgvector, using a reviewed schema-only fixture plus subsequent migrations.
  Each assertion gets a fresh database. The existing main CI job explicitly requires
  this lane to succeed. No hosted credentials or production rows are needed.
- **Stale assertions repaired:** six existing files initially failed. Organize and
  permission-request checks now seed their rollout singletons. Invitation checks
  exercise atomic acceptance, owner-reviewed rejoining, the current RPC signature,
  connection-aware request merging, and complete approval payloads. Their access and
  rollback protections remain asserted.
- **Campaign cap:** the claim RPC atomically reserves a shared rolling allowance.
  Reservations survive uncertain failures and manual retries; confirmed sends count
  from completion. Pre-send release and suppression skips return their allowance.
  Deleting a recipient removes its reference without resetting recent send accounting.
  Two real database connections prove contention and exclusive claims. Sender and
  route tests cover concurrent invocations, unauthorized cron/admin requests, invalid
  waves, and the development send guard.
- **Free-test wiring:** `verify:static` now runs the 25 root agentic policy tests and
  the database tooling/rehearsal tests. Worker `test:integration` now selects the
  dedicated integration configuration instead of returning no files.

Validation after implementation:

| Check                                                        | Result                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Complete current-schema lane, local PostgreSQL 16            | 46 SQL files passed; both concurrency scenarios passed                                                                     |
| Campaign sender and route tests                              | 29 passed                                                                                                                  |
| Generic worker integration command                           | Four files, 23 passed                                                                                                      |
| Root agentic policy tests                                    | 25 passed                                                                                                                  |
| Database tooling and rehearsal unit/integration tests        | 32 passed                                                                                                                  |
| Shared-types build, focused web TypeScript check, and ESLint | Passed                                                                                                                     |
| New migration rehearsal against cached production schema     | Passed, including four standing checks and the campaign check; zero security/API/data findings; no new role-probe failures |

The rehearsal used the production schema snapshot captured 2026-10-25. Its existing
anonymous-role probe failure was unchanged. No paid test, email send, or hosted
mutation was performed. GitHub CI/PostgreSQL 15 has not been run from this local
session; the local full-suite result above is PostgreSQL 16.

**Deployment order:** apply
`supabase/migrations/20261026171609_email_campaign_atomic_daily_cap.sql` after the
base email-campaign migration, then deploy the updated sender. This work does not
apply either migration to production. Older callers remain compatible with the
new claim signature's default daily cap; the updated sender needs the new allowance
RPC. The conservative allowance includes uncertain send attempts for 24 hours.

Runner and baseline maintenance instructions:
[Current-schema contract baseline](../../supabase/tests/fixtures/current-schema/README.md).

## Remaining remediation — 2026-10-26

Implemented the non-browser follow-up work:

- **Billing boundaries:** added real-SDK webhook-signature verification tests, enabled/disabled
  billing guard tests, checkout/portal ownership and return-path checks, and stateful service
  tests for duplicate delivery, retries, persistence failures and delayed events. Fixed the
  exposed failure paths: failed receipt/account writes are retryable, delayed webhook payloads
  reconcile current Stripe state, successful payments resolve dunning, newer subscriptions
  survive cancellation of older ones, and retrying a provider-completed tier upgrade does not
  request a second proration. Customer and upgrade requests use stable idempotency keys.
  These are mocked provider/database tests, not a concurrent exactly-once or live billing proof.
- **UI contracts:** replaced source-string assertions for entity headers/drawers and chat
  craft/lifecycle with rendered interactions, direct production lifecycle functions, and a
  real Svelte effect harness for receipt subscription/cleanup. Stale responses, busy states,
  authoritative receipt merging and reader-position behavior remain asserted. Browser layout
  and mobile action-target geometry remain unverified.
- **Tool catalog:** removed the 163 KB whole-catalog migration snapshot. Kept vocabulary,
  schema and permission invariants; added recursive required-property and registry/schema
  alignment checks. Existing capability and payload-budget tests remain in place.
- **Scheduling:** replaced the non-null DST assertion with exact instants through spring gaps
  and fall overlaps. The regression exposed two past-instant cases during the repeated hour.
  Daily/weekly scheduling now uses the existing shared cycle scheduler, which advances gaps,
  chooses the earlier overlap occurrence, and moves a passed occurrence to the next day/week.
- **CI and documentation:** `verify:ci` performs static/build checks and one coverage-enabled
  test run, removing the prior regular-test/coverage duplication. Added `test:inventory` and
  replaced obsolete module/percentage lists with runner ownership and a behavior risk matrix.

Browser work was **paused at the user's request** because builds and Playwright slowed the
laptop. The selected-route build and login-to-Today path worked locally, but the task-edit
journey is still failing and project/chat/invite/mobile coverage is incomplete. The unfinished
browser job was removed from CI and its required dependencies. Its source is preserved with
[resume notes](../../apps/web/tests/browser/README.md); no further browser runs or builds were
started after the pause.

Validation before the pause:

| Check                                                                      | Result / limit                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Stripe service, webhook signatures, catalog invariants and payload budgets | 44 passed: 24 service, 8 webhook and 12 catalog/budget tests                                                         |
| Billing checkout/portal routes and authentication/billing hooks            | 12 route and 20 hook tests passed                                                                                    |
| Rendered entity header/drawer tests                                        | 7 passed                                                                                                             |
| Chat craft and lifecycle                                                   | 3 craft tests and the final 16 lifecycle tests passed                                                                |
| Related chat message-list, markdown and shell-router suites                | 41 passed                                                                                                            |
| Worker scheduler suites                                                    | 49 passed, including the two previously failing fall-overlap regressions                                             |
| Svelte component autofixer                                                 | No issues in changed components/helpers                                                                              |
| Full web check                                                             | Completed with one optional-invoice-ID type error; explicit ID validation added afterward. Not rerun after the pause |
| Latest billing read-failure hardening                                      | Four additional regression cases and the invoice-ID guard have not been rerun after the pause                        |
| Browser suite / CI                                                         | Incomplete and excluded from CI; no passing suite claim                                                              |

No paid API/model tests, live billing operations, production mutation or deployment were
performed. The earlier campaign migration deployment prerequisite still applies. The pending
focused billing rerun and web typecheck should be completed when machine resources permit;
browser implementation/execution remains paused until the user resumes it.

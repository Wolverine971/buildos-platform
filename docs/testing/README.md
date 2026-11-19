<!-- docs/testing/README.md -->

# BuildOS testing

- **Last updated:** 2026-11-17
- **Status:** Active
- **Scope:** Free local/CI gates, separately approved live validation, and test selection

Start with the behavior that could fail, then choose the narrowest runner that exercises it.
Use [the behavior risk matrix](./COVERAGE_MATRIX.md) and
[the October audit](./TEST_AUDIT_2026-10-26.md) to choose missing contracts.
Do not infer coverage from a count of test files or from a mock returning the expected value.
For concrete keep/remove/rewrite decisions, see
[the November test value audit](./TEST_VALUE_AUDIT_2026-11-17.md). The
[chat failure scenario index](./AGENTIC_CHAT_FAILURE_SCENARIOS.md) maps failure cases to their
owning tests without treating test names as executable coverage.

## Runner inventory

Run `pnpm test:inventory` for current workspace test scripts and file counts. It reads the
working tree instead of maintaining a dated count here. Counts include separately configured
suites and do **not** mean every file runs in the default gate. Vitest configs own exclusions;
[CI](../../.github/workflows/ci.yml) owns automated execution.

| Command                                          | What it proves                                                                                            | Execution owner                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm verify:static`                             | Documentation/migration/SQL inventory, standalone tooling/policy tests, application/test typechecks, lint | Local and CI                                      |
| `pnpm verify`                                    | Static gate, builds, one regular workspace test run                                                       | Local pre-push                                    |
| `pnpm verify:ci`                                 | Static gate, builds, one coverage-enabled workspace test run                                              | Main CI job                                       |
| `pnpm test:sql-current`                          | Every `.check.sql` against a fresh current schema; two-connection campaign cap/claim races                | PostgreSQL 15 + pgvector CI lane                  |
| `pnpm test:sql-contracts`                        | Classified self-contained SQL contracts                                                                   | Main CI and separate PostgreSQL 15 safety gate    |
| `pnpm --filter @buildos/worker test:integration` | Four Agent Run database integration suites through their dedicated config                                 | Main CI (also named `test:agent-run:integration`) |
| `pnpm test:browser:smoke`                        | Experimental isolated built-app harness; journeys are incomplete                                          | Paused; manual only, excluded from CI             |
| `pnpm test:agentic:gate`                         | Production battery provenance, scoring, account/model restrictions; no model calls                        | Included in `verify:static`                       |
| `pnpm test:database-tools`                       | Current-schema runner and migration-rehearsal tooling                                                     | Included in `verify:static`                       |

The main CI job requires current-schema contracts to pass. Its
workspace suites run once, with coverage enabled; database integration and version-specific
contracts remain separate. Coverage includes unloaded source through
[`vitest.coverage.ts`](../../vitest.coverage.ts). There is no arbitrary repository-wide
percentage gate. Read branch reports for critical modules alongside their failure-path tests.

## Local validation

On the shared development laptop, run heavy commands through `test-gate`, with one Vitest
worker for agent work. If the gate refuses or times out, wait at least 60 seconds and retry
once; then report the limitation. Do not bypass worker caps or run broad suites in parallel.

```bash
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/web exec vitest run src/lib/services/stripe-service.test.ts
test-gate run env VITEST_MAX_WORKERS=1 pnpm --filter @buildos/worker exec vitest run tests/scheduler.comprehensive.test.ts
```

See [`AGENTS.md`](../../AGENTS.md) for the machine limits and paid-test rules. New migrations
must also pass the [schema rehearsal](../../scripts/migration-rehearsal/README.md).
A skipped PostgreSQL suite is not a passing database contract; install the local tools or use
its documented disposable database connection. Current-schema fixtures contain schema and
synthetic data, never a copy of production rows.

## Browser smoke — paused

Browser development and execution were paused at the user's request on 2026-10-26 because
the builds and Playwright runs slowed the development laptop. The experimental harness is
preserved under `apps/web/tests/browser`, but is **not a completed or required CI gate**.
Do not run it as routine validation. See [its status and remaining work](../../apps/web/tests/browser/README.md).

The runner copies application source into a temporary workspace, supplies synthetic environment
values, and builds a selected subset of application routes. Its configuration defines one
Chromium worker at desktop and mobile sizes. Deployment packaging, unrelated routes and
marketing-page prerendering are omitted. Application hooks and included routes are real;
Auth/PostgREST are local transport fixtures. These fixtures cannot establish RLS or model
quality; those require separate evidence. Unknown fixture database operations fail visibly.

Node connections and browser requests to external hosts are blocked, and production credentials
are not inherited. The command never reuses a running app server. Failure traces/screenshots go
to `apps/web/test-results/smoke`. Login reached Today in local testing; the task-edit journey
still fails, and the project/chat/invite/mobile journeys remain unfinished. Keep future smoke
coverage small and deterministic before considering CI wiring.

## Live validation costs money

Default Vitest and browser runners exclude paid model suites. Every live run and rerun requires
explicit approval for that scope, acting model and estimated cost (or an explicit unknown cost).
Implementation approval does not authorize paid testing. Prefer mocks and offline replays.
Follow [the production battery guide](./agentic-chat-gate.md); report unapproved live validation
as **not run**, never passing.

## Verification workflow

The useful lessons from [the Claude Code verification article](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/)
are to exercise real flows, express invariants, compare independent implementations during
refactors, and check whether verification catches known defects. For BuildOS, choose the
smallest boundary that can expose the particular failure. Browser checks remain paused;
mocked RPC assertions do not establish database atomicity or model quality.

Before changing a test, write three short statements in the work notes or PR: **failure**,
**trigger**, and **expected result**. Then choose evidence from the changed behavior:

| Changed behavior                                           | Plausible failure                                                              | Targeted evidence                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat events, snapshots, or attempt generations             | Duplicated text, gaps, or an old attempt replacing the current answer          | Compose the real inbox and UI adapter; vary delivery order, duplicates, and takeover timing; check text after every transition and eventual convergence      |
| Effect/RPC ownership, retries, or external writes          | A stale worker writes, or a lost response causes a second non-idempotent write | Exact outgoing ownership fields, denied receipts, and failures before dispatch versus after possible commit; use current-schema SQL for database enforcement |
| Persisted formats or shared implementations being replaced | Old records stop loading, or a rewrite silently changes output                 | Representative old-format fixtures and an independent reference/old implementation; explicitly list intended differences                                     |
| Scheduling, quotas, claims, or authorization               | Duplicate delivery, exceeding a limit, or crossing a user's access boundary    | Exact boundary values, failure recovery, and real two-connection tests when the guarantee depends on a database race                                         |
| Navigation, hydration, layout, or reload persistence       | Isolated logic passes but the visible feature fails                            | A short rendered interaction or built-app journey with the failed step and trace; report the paused browser gap instead of claiming unit tests prove it      |

Use the [risk matrix](./COVERAGE_MATRIX.md) for existing owners and remaining limits. These
are human-readable selection rules, not source-count tests or a mandate to run every suite.

For example, the [chat inbox suite](../../packages/agentic-chat-client/src/worker-realtime-inbox.test.ts)
now composes the real inbox and UI adapter against a small durable text log. Two bounded
permutation checks explore registration/reconciliation timing and generation takeover.
They assert ordered text after each delivery, no repeated live-event identity, and convergence
after an authoritative snapshot. Assertion messages include the full delivery order and the
failing step. This exercises the contract between modules without a browser, network, model,
random seed, or new test dependency. It does not cover DOM rendering, polling cadence, or RLS.

## Keep the expected result independent

- Use literal outcomes, protocol contracts, or a simpler independent model. Comparing two
  wrappers around the same function is not differential evidence. A round trip alone can
  hide matching encoder/decoder mistakes; retain fixed vectors or cross-boundary checks.
- State an invariant's domain. A sequence cursor is monotone **within an attempt**, but may
  reset when a newer generation takes ownership. Do not impose idempotency on arbitrary
  escaped-input normalization without first establishing that it is the intended contract.
- Prefer bounded exhaustive combinations when the state space is small. For broader generated
  inputs, use a fixed seed, retain the failing input, and minimize it into a named regression.
  Do not build a custom fuzzing framework or generate thousands of indistinguishable examples.
- During a semantics-preserving rewrite, run old and new code on synthetic or sanitized
  fixtures. Normalize only irrelevant differences such as test timestamps, never ownership,
  order, amounts, or persisted content. An intentional correction needs a contract assertion;
  the old implementation may contain the bug.
- For critical replacement checks, try one plausible fault in an isolated copy or temporary
  transform: omit the processing token, reuse another batch's ownership, replay snapshot text,
  or accept an outdated attempt. The test must fail at the relevant assertion. Confirm the
  normal code passes afterward. A surviving fault is a weakness in the check, not a passing
  verification result. Full mutation testing is not required for routine edits.
- Keep expected fixtures independent of mutable values passed to production code or returned
  by mocks. Faults must not be able to rewrite both the result and its expectation.

## Keep verification trustworthy

Run cheap, focused checks first under the machine and cost rules above. Fix the cause of a
failure instead of adding sleeps, weakening an assertion, or rerunning unchanged until green.
If progress stalls, report the smallest reproducer and the unmet contract. An unresolved flaky
test is missing reliable evidence; replacing/removing it requires an explicit coverage decision.

For a review or validation report, identify the revision, selected commands, results, and what
they do not prove. With concurrent local edits, retain a scoped file fingerprint or snapshot
and recheck changed inputs before claiming the earlier result still applies. A green run is
evidence about those bytes, not all later edits in the workspace.

When changing a verifier, compare its old rule with the replacement and demonstrate a known
failure still gets caught. Review policy changes separately from the behavior they judge;
derive protected CI/review rules from the base revision if introducing such a gate. A new
blocking rule should first be evaluated without blocking work, against known failures **and**
clean changes. This guidance adds no commit hook, automatic approval requirement, or new gate.

## Keep or remove a test

- Name the plausible regression before adding a test. Keep a separate case for a distinct
  failure branch, boundary, or timing; do not target a number of tests.
- Assert persisted user outcomes, ownership, role fences, retries and failure recovery.
- Test shared behavior in its owning package. Adapter tests should exercise what the host
  adds: environment selection, authorization, translation, and actual wiring.
- Before removing a duplicate, compare the production path, injected fault, and observable
  outcome. Calling the same function or sharing a filename is not enough.
- Use rendered components and accessibility roles for UI behavior. Use a browser for layout,
  hydration, navigation and reload persistence.
- Keep source checks for actual dependency/security boundaries; avoid exact CSS ordering,
  private variable names, transpiled callback extraction and whole-catalog prose snapshots.
- Keep tool schema/dispatch/capability invariants and reviewed payload budgets. A harmless
  description edit should not require approving a new full-catalog hash.
- Treat fake database concurrency as orchestration evidence; use two real connections for locks.

## More test docs

- [daily-brief-notification-refactor-tests.md](./daily-brief-notification-refactor-tests.md) — what tests must cover in the daily brief notification pipeline

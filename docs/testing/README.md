<!-- docs/testing/README.md -->

# BuildOS testing

- **Last updated:** 2026-10-26
- **Status:** Active
- **Scope:** Free local/CI gates, separately approved live validation, and test selection

Start with the behavior that could fail, then choose the narrowest runner that exercises it.
Use [the behavior risk matrix](./COVERAGE_MATRIX.md) and
[the October audit](./TEST_AUDIT_2026-10-26.md) to choose missing contracts.
Do not infer coverage from a count of test files or from a mock returning the expected value.

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

## Test design

- Assert persisted user outcomes, ownership, role fences, retries and failure recovery.
- Use rendered components and accessibility roles for UI behavior. Use a browser for layout,
  hydration, navigation and reload persistence.
- Keep source checks for actual dependency/security boundaries; avoid exact CSS ordering,
  private variable names, transpiled callback extraction and whole-catalog prose snapshots.
- Keep tool schema/dispatch/capability invariants and reviewed payload budgets. A harmless
  description edit should not require approving a new full-catalog hash.
- Treat fake database concurrency as orchestration evidence; use two real connections for locks.

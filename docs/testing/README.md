<!-- docs/testing/README.md -->

# BuildOS Testing Infrastructure

- **Last updated**: 2026-07-06
- **Status**: Active
- **Scope**: Vitest-first test infrastructure across the BuildOS monorepo

## Audit Summary

BuildOS uses **Vitest** as the primary test runner for web, worker, and package tests. The current infrastructure is much broader than earlier testing docs described: this repo now has **378 Vitest-discoverable test/spec files** by filesystem inventory.

| Area          | Test/spec files | Runner                  | Notes                                                                                                        |
| ------------- | --------------: | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web`    |             320 | Vitest + SvelteKit      | Default Node environment, per-file `jsdom` for component/page tests, LLM tests split into a separate config. |
| `apps/worker` |              42 | Vitest                  | Node environment, setup file, integration tests excluded from default runs.                                  |
| `packages`    |              16 | Vitest where configured | Package-owned tests now exist for every package with a package manifest.                                     |
| **Total**     |         **378** |                         | Counted from runnable `*.test.{js,ts}`, `*.spec.{js,ts}`, and `.svelte.test.{js,ts}` style files.            |

This is a test-file inventory, not a line or branch coverage measurement. Coverage is not consistently configured across the monorepo yet, so do not treat old percentage claims in archived testing docs as current truth.

## Current Infrastructure

### Root orchestration

Root scripts in [`package.json`](../../package.json):

```bash
pnpm test       # turbo test
pnpm test:run   # turbo test:run
pnpm typecheck  # turbo typecheck
pnpm lint       # turbo lint
pnpm build      # turbo build
pnpm pre-push   # turbo typecheck test:run lint build
```

Turborepo configuration in [`turbo.json`](../../turbo.json):

- `test` depends on upstream workspace builds and is explicitly uncached.
- `test:run` depends on upstream workspace builds and uses Turbo's default cache behavior.
- `typecheck` depends on upstream workspace builds.
- Environment-sensitive tasks include the env keys listed in `globalEnv`.

### CI

GitHub Actions is configured in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). On pushes to `main` and on pull requests it:

1. Installs dependencies with `pnpm install --frozen-lockfile`.
2. Copies example env files to `.env`, `apps/web/.env`, and `apps/worker/.env`.
3. Runs `pnpm turbo typecheck`.
4. Runs `pnpm turbo lint`.
5. Runs `pnpm turbo test:run`.

CI does **not** currently run `pnpm pre-push`, `pnpm turbo build`, coverage, web LLM tests, or worker integration tests.

## Running Tests

### Monorepo

```bash
pnpm test
pnpm test:run
pnpm pre-push
```

Use `pnpm test:run` for the same test task CI runs. Use `pnpm pre-push` when you want the local typecheck, test, lint, and build sequence.

### Web app

```bash
pnpm --filter @buildos/web test:run
pnpm --filter @buildos/web test:watch
pnpm --filter @buildos/web test:ui
pnpm --filter @buildos/web test:llm
```

Web test config:

- Standard config: [`apps/web/vitest.config.ts`](../../apps/web/vitest.config.ts)
- LLM config: [`apps/web/vitest.config.llm.ts`](../../apps/web/vitest.config.llm.ts)
- Setup file: [`apps/web/vitest.setup.ts`](../../apps/web/vitest.setup.ts)

Standard web tests include `**/*.{test,spec}.{js,ts}` and exclude `apps/web/src/lib/tests/llm/**` plus `llm-simple/**` to prevent accidental paid API calls. Component and page tests that need a DOM should use a file-level directive:

```ts
// @vitest-environment jsdom
```

### Worker

```bash
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker test:watch
pnpm --filter @buildos/worker test:scheduler
pnpm --filter @buildos/worker test:coverage
pnpm --filter @buildos/worker test:integration
```

Worker test config:

- Config: [`apps/worker/vitest.config.ts`](../../apps/worker/vitest.config.ts)
- Setup file: `apps/worker/tests/setup.ts`

Default worker tests exclude `apps/worker/tests/integration/**`. Use `test:integration` only when database credentials and any required external services are available.

### Packages

Configured package test scripts:

```bash
pnpm --filter @buildos/smart-llm test:run
pnpm --filter @buildos/shared-agent-ops test:run
pnpm --filter @buildos/shared-types test:run
pnpm --filter @buildos/shared-utils test:run
pnpm --filter @buildos/supabase-client test:run
pnpm --filter @buildos/twilio-service test:run
pnpm --filter @buildos/mcp-server test:run
```

All packages under `packages/` now have `test` and `test:run` scripts. The `shared-agent-ops`, `shared-types`, and `supabase-client` suites are seed suites; expand them as shared contracts change.

## What Is Working Well

- CI now runs typecheck, lint, and `test:run` for pull requests.
- Web has broad server, route, agentic-chat, admin analytics, utility, and component test coverage by file count.
- Web LLM tests are isolated behind an explicit `test:llm` command.
- Worker has dedicated scheduler, brief, queue contract, project loop, HTTP utility, and integration test areas.
- Package tests cover the shared LLM package, shared agent ops utilities, shared type validation, Supabase client factories, Twilio service, shared utilities, and MCP client/config behavior.
- Web setup centralizes `$env/dynamic/public`, `matchMedia`, and console-noise handling.
- The old webhook `server.ts.spec` implementation sketch has been moved out of the route tree to documentation so it is no longer mistaken for a runnable test.

## Infrastructure Gaps

### P0: Coverage is not standardized

Only the worker has a `test:coverage` script, and only `twilio-service` has coverage configured in package Vitest config. The web app has no coverage script or thresholds. There is no monorepo coverage aggregation or CI coverage gate.

Recommended next steps:

- Add `test:coverage` to `apps/web`.
- Add coverage provider/reporters to shared package Vitest configs.
- Define realistic initial thresholds for critical paths instead of broad percentage targets.
- Publish CI coverage artifacts before enforcing thresholds.

### P1: No browser E2E, visual regression, or accessibility runner

There is no Playwright/Cypress dependency or CI job in the current package manifests. Existing UI tests are unit/component style and rely on `jsdom` where needed.

Recommended next steps:

- Add Playwright for a short list of critical flows: auth, project page load, agent stream, invite flow, and billing/admin smoke paths.
- Add axe checks for high-traffic pages once Playwright is in place.
- Keep E2E separate from default unit tests until the suite is stable and low-noise.

### P1: CI excludes expensive and environment-dependent suites

The default CI path intentionally excludes:

- Web LLM tests.
- Worker integration tests.
- Coverage.
- Production build.

Recommended next steps:

- Add scheduled or manually dispatched workflows for LLM and integration suites.
- Run build in CI or align the CI job with `pnpm pre-push`.
- Document required secrets for each non-default suite.

### P2: Package test ownership is still shallow

Every package now has a package-owned test entrypoint, but several are still seed suites. Shared code used by both runtime surfaces should keep moving from app-only indirect coverage into package-level tests.

Recommended next steps:

- Treat shared package tests as the default home for framework-agnostic logic.
- Keep app tests focused on SvelteKit, route, service composition, and integration behavior.
- Expand `shared-agent-ops`, `shared-types`, and `supabase-client` beyond seed suites.
- Add a short "where should this test live?" section to contributor docs if confusion persists.

## Test Placement Guidelines

- Put web route tests next to the route module, for example `server.test.ts` beside `server.ts`.
- Put web service and utility tests next to the source module under `apps/web/src/lib/**`.
- Put Svelte component tests next to the component and use `// @vitest-environment jsdom` when rendering DOM.
- Put worker unit tests under `apps/worker/tests/**` unless there is already a local pattern beside the source.
- Put database or external-service integration tests under `apps/worker/tests/integration/**` or another clearly excluded path.
- Put framework-agnostic behavior in package-level tests when the source lives in `packages/**`.

## Documentation Links

- [Web app coverage notes](./WEB_APP_COVERAGE.md)
- [Coverage matrix](./COVERAGE_MATRIX.md)
- [Agentic chat prompt test plan](./AGENTIC_CHAT_PROMPT_TEST_PLAN.md)
- [Agentic chat hybrid tool surface prompt tests](./AGENTIC_CHAT_HYBRID_TOOL_SURFACE_PROMPT_TESTS_2026-04-10.md)
- [Agentic chat project creation manual flow](./AGENTIC_CHAT_PROJECT_CREATION_MANUAL_FLOW.md)
- [Manual agent work smoke tests](./MANUAL_AGENT_WORK_SMOKE_TESTS_2026-06-20.md)
- [Manual AI inbox smoke tests](./MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md)
- [Daily brief email webhook implementation sketch](./daily-brief-email-webhook-implementation-sketch.md)
- [Web testing checklist](../../apps/web/docs/technical/testing/TESTING_CHECKLIST.md)

Keep durable audit summaries in this folder. Do not keep one-off raw run artifacts under `docs/testing/artifacts/`; regenerate them locally when needed.

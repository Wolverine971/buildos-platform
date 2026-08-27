<!-- docs/technical/reviews/REPOSITORY_CLEANUP_AUDIT_2026-08-26.md -->

# Repository cleanup audit and roadmap

**Status:** Current — P0, P1.1, and P1.2 implemented and verified 2026-08-26
**Scope:** Web application, worker processes, shared packages, Supabase, repository tooling, CI, documentation, and agent ergonomics  
**Audit date:** 2026-08-26

## Executive assessment

BuildOS does not need a rewrite. The repository has strong foundations: strict TypeScript, extensive tests, useful route and worker guardrails, durable queue semantics, careful Agentic Chat cutover work, and unusually detailed architecture records.

The highest-leverage problems are drift between the architecture and the repository's operating contract:

1. CI no longer proves everything contributors assume it proves.
2. Legacy and canonical names obscure the actual owner of some live behavior.
3. A few compatibility and UI composition files concentrate too much lifecycle context.
4. Generated evidence, media, documentation, and package configuration make navigation noisier than necessary.

The work should therefore begin by restoring trust in the verification and migration contracts. Structural refactors become safer after that foundation is green and reproducible.

## Audit snapshot

- `apps/web/src` contains roughly 2,400 TypeScript/Svelte/JavaScript files and 650 route files, including about 404 API endpoints.
- `apps/worker/src` contains roughly 200 TypeScript files. The general process currently owns HTTP, the general queue consumer, and the scheduler.
- Shared code spans nine packages. `@buildos/shared-types`, `@buildos/agentic-chat-runtime`, and `@buildos/shared-agent-ops` are the most widely connected.
- Supabase contains hundreds of migrations and dozens of SQL contract files.
- Git history is approximately 697 MB and includes large videos, ZIP archives, screenshots, and generated evidence.
- The current working tree is intentionally active and contains many user-owned changes. Findings from validation runs must therefore be described as current-worktree evidence, not automatically attributed to clean `main`.

### Initial validation observed during the audit

- Typecheck passed, including `svelte-check` with zero diagnostics.
- Lint passed with 210 web warnings and 177 worker warnings.
- The full test command completed with 3,840 passing, 14 failing, and 51 skipped tests in the web workspace.
- Another 27 PostgreSQL suites failed because the audit sandbox could not bind localhost. Those are environment failures and are separate from the 14 functional failures.
- A live `pnpm audit --prod` found 6 high and 9 moderate advisories.
- Documentation health scanned 1,483 tracked Markdown documents and found two documents with dead repository paths plus 12 unstamped point-in-time documents.

### P0 completion evidence

- `pnpm verify:static` passed all 24 Turbo tasks plus strict documentation, migration-ledger, SQL-inventory, and generated-schema checks.
- `pnpm test:run` passed all 19 Turbo tasks. The web workspace passed all 621 test files and all 3,942 tests with the disposable PostgreSQL suites enabled.
- `pnpm build` passed all 11 workspace build tasks, including the production SvelteKit/Vercel build. The adapter still emits informational cross-platform Sharp optional-binary warnings; the build exits successfully.
- `pnpm test:sql-contracts` passed all eight self-contained disposable SQL contracts.
- `pnpm audit --prod` reports no known vulnerabilities.
- Strict documentation health now reports zero dead schema references, zero dead repository paths, and zero unstamped point-in-time documents across 1,485 Markdown files.
- The migration gate recognizes 376 migration files, freezes 29 historical filename exceptions and nine historical duplicate-version groups, and checks branch-relative immutability in CI.
- Test-only typechecking now ratchets existing debt: 818 diagnostics in web tests and 625 in worker tests may not increase. Application typechecking remains clean, including zero Svelte diagnostics.
- The authoritative verification command runs tests before production builds. This prevents Vitest collection from racing the SvelteKit build over the shared `.svelte-kit` directory.
- Lint remains green with 210 web warnings and 176 worker warnings. Warning reduction remains P2 work rather than being hidden inside P0.

## P0 — restore repository trust

### P0.1 — One authoritative verification contract

**Problem:** CI, local `pre-push`, workspace scripts, and package coverage do not execute the same contract.

Current gaps include:

- CI runs `turbo test:coverage` rather than the normal `test:run` contract.
- `@buildos/agentic-chat-runtime` has `test:run` but no `test:coverage`, so its unit suite is omitted from the coverage graph.
- CI does not build the production applications.
- Strict documentation health is local-only.
- Web TypeScript excludes test files; worker TypeScript includes only `src`.
- Lint currently runs only in web, worker, and `smart-llm`.

**Target:** Add one root `verify` command and use it in CI and `pre-push`. It should cover repository guardrails, typechecking, normal tests, production builds, schema tooling, migration validation, and strict documentation health. Coverage remains a separate reporting/gating lane so it does not replace normal tests.

**P0 implementation checklist:**

- [x] Add a root `verify` command.
- [x] Use the same contract in CI and `pre-push`.
- [x] Add `test:coverage` to `@buildos/agentic-chat-runtime`.
- [x] Add test-focused TypeScript checks without making application compilation depend on test-only globals.
- [x] Fix the current non-environment test failures.
- [x] Build production applications in CI.
- [x] Run strict documentation health in CI.

### P0.2 — Patch production dependency advisories

**Problem:** Several security overrides are now pinned below the newest patched releases. At audit time the affected graph included PostCSS, SvelteKit, `sanitize-html`, Undici, `fast-uri`, DOMPurify, NanoID, and `tar`.

**Target:** Patch the current advisories as a focused security update, preserve a frozen lockfile, and automate future detection through Dependabot/Renovate plus a scheduled production audit. Major runtime upgrades are separate projects.

**P0 implementation checklist:**

- [x] Update vulnerable direct dependencies and override floors.
- [x] Refresh the lockfile and re-run `pnpm audit --prod`.
- [x] Add automated dependency update configuration.
- [x] Add a scheduled production dependency audit.

### P0.3 — Enforce the Supabase migration ledger and SQL contracts

**Problem:** Four migration version prefixes are duplicated, 29 older migrations use noncanonical prefixes, and the `supabase/tests` SQL corpus does not have a complete, obvious repository-level gate. Historical files cannot be renamed safely without reconciling the deployed migration ledger.

**Target:** Introduce a mechanical ledger check that prevents new ambiguity while explicitly grandfathering reconciled history. Run disposable-database SQL contracts in CI. Do not run destructive or PSQL-only tests against a linked production database.

**P0 implementation checklist:**

- [x] Add a migration-ledger manifest for reconciled historical exceptions.
- [x] Reject new duplicate or malformed migration versions.
- [x] Verify migration immutability against the pull-request/base-branch ledger.
- [x] Classify SQL files into automated disposable tests, production verification, and preflight/manual checks.
- [x] Add a disposable PostgreSQL/Supabase CI lane for automated SQL contracts.
- [x] Document the repair procedure for remote/local ledger disagreement.

## P1 — make ownership obvious

### P1.1 — Remove the `projects-old` ownership inversion — completed

The live loader, route-generated types, focused document/task routes, and their tests now belong to `/projects`. `/projects-old/[id]` and `/projects/[id]/old` are query-preserving compatibility redirects. The retired route pages and their confirmed orphan components were removed, and the live `ProjectWorkspacePrototype` name was promoted to `ProjectWorkspace`.

The transferred task focus route now matches the document route's login, authorization, and cross-project ownership behavior. The generated web project-context inventory was refreshed after the move.

Coordinate this with `tasker/46-legacy-project-generation-retirement.md`. The route ownership cleanup does not itself authorize dropping legacy database records.

### P1.2 — Finish quarantining the legacy Agentic Chat compatibility host — completed

The dedicated Agentic Chat worker cutover is complete and should not be redesigned. Gmail, Calendar, OAuth handoff, and worker-disabled image execution intentionally remain parity-gated.

The public web stream endpoint is now a thin HTTP adapter over an explicit `legacy-execution/http-stream` boundary. The existing 45-scenario route suite continues to characterize authentication, authorization, request normalization, SSE delivery, cancellation, provider failures, tool execution, persistence, and supervisor checkpoints. A structural guard prevents execution dependencies from returning to the route, and the route no longer needs an oversized-route exception.

The compatibility handler remains intentionally large but is now physically and conceptually quarantined. Gmail, Calendar, OAuth handoff, and worker-disabled image execution remain parity-gated. Future extraction should proceed one lifecycle seam at a time inside the legacy boundary; capability retirement still requires worker parity or an explicit product decision.

### P1.3 — Execute the `DocumentModal` decomposition

`DocumentModal.svelte` is about 4,500 lines and owns document lifecycle, autosave, conflicts, publishing, tree navigation, assets, versions, nested modals, and presentation. Activate `tasker/48-document-modal-decomposition.md` nearly as written: characterize races first, establish typed clients, extract document/public-page controllers, then split stable UI seams.

The existing `{@html}` path is intentionally sanitized through `renderMarkdown`; preserve that contract and keep the sanitizer dependency patched.

`AgentChatModal.svelte` should follow the same ownership principle: separate session lifecycle, transport/prewarm, composer state, timeline navigation, and presentation rather than creating a generic mega-store.

### P1.4 — Decompose the general worker process without splitting deployment

Extract `app.ts`, route modules, `bootstrap.ts`, and scheduler-domain modules while retaining one Railway service. Migrate the eight `createLegacyJob` processor adapters to the native `ProcessingJob` contract one domain at a time. Split deployed services only when operational evidence requires it.

### P1.5 — Standardize package development and test resolution

Replace the duplicated source-alias matrices in the web and worker Vitest configurations with consistent development export conditions or one shared alias generator. Forbid imports directly into `packages/*/src`, add shared TypeScript presets per runtime, and give every package a deliberate lint/test/coverage policy.

### P1.6 — Clean repository artifacts and worktree discipline

- Keep required runtime assets in Git.
- Move large source media and generated evidence to object storage, release artifacts, or Git LFS.
- Use one ignored artifact convention for temporary analysis output.
- Detect nested repositories, oversized new blobs, extensionless screenshots, and accidental duplicated paths in CI.
- Remove known accidental files such as `apps/web/--full-page` and `apps/web/apps/web/scratch-q2.mjs` after confirming they have no consumer.

## P2 — ratchet quality and speed

### P2.1 — Burn down warnings and size allowlists

Do not turn every lint rule on at once. Prevent warning growth, prevent new oversized routes, remove stale allowlist entries automatically, and enable stricter rules first in newly extracted modules. Add promise-handling rules to server, queue, and scheduler code.

### P2.2 — Improve the inner development loop

Add a changed-package verification command, quiet test output by default, remove duplicate dependency builds from the web's Turbo build path, narrow build outputs per package type, and reduce global environment inputs that invalidate unrelated Turbo tasks.

### P2.3 — Make documentation and codebase inventories trustworthy

Run strict doc health in CI, maintain a concise canonical ownership map, distinguish reference/plan/evidence/archive documents, and publish the existing codebase inventory as a generated CI artifact. Consolidate repeated boundary primitives such as `isRecord`, environment parsing, and response decoding when semantics truly match.

### P2.4 — Upgrade major dependencies in cohorts

Do not combine Express 5, Zod 4, Vitest 4, OpenAI 7, Stripe 22, Tailwind 4, and other major migrations. Upgrade security patches first, tooling second, and runtime SDK cohorts behind their own contract tests.

## Explicit non-goals

- Do not replace the Supabase queue system; its atomic claims, fencing, and durable admission are strong foundations.
- Do not merge Agentic Chat directories based only on similar names; they now have different runtime and compatibility responsibilities.
- Do not delete external-account/image legacy execution before capability parity or an explicit product retirement decision.
- Do not split the general worker into more deployed services without an operational need.
- Do not refactor generated database types.
- Do not chase one global coverage percentage. Ratchet stable, high-risk contracts instead.
- Do not eliminate the documented TypeScript compiler generations merely to make versions uniform.
- Do not generalize domain code solely because an inventory reports textual similarity.

## Recommended sequence

1. Make `verify` authoritative and green.
2. Patch the production dependency graph.
3. Enforce the migration ledger and disposable SQL tests.
4. ✅ Canonicalize project-route ownership.
5. ✅ Quarantine the legacy Agentic Chat HTTP/SSE host; execute the `DocumentModal` decomposition.
6. Decompose worker bootstrap/scheduler ownership.
7. Standardize package resolution, then ratchet warnings and workflow speed.

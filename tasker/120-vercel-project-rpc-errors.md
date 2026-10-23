<!-- tasker/120-vercel-project-rpc-errors.md -->

# 120 — Project RPC errors: authenticate before loading and identify the originating request

**Status:** LOCAL VERIFIED — not deployed; deployment and live correlation pending  
**Priority:** P2 · **Opened:** 2026-10-08 · **Owner:** DJ / delegated BuildOS remediation

## Scope and related work

Owns the BuildOS runtime findings from the October 7–8 Vercel audit. This is separate from
[119](119-project-pages-overfetch-audit.md)'s payload/performance work and preserves
[76](76-production-database-security-containment.md)'s RPC permission containment. The recovered
OAuth flow in [116](116-buildos-plugin-reconnect-loop.md) is not implicated by these logs.

Local source changes and free tests are authorized. Commits, pushes, deployments, database writes,
credential/access changes and production configuration changes are not authorized by this handoff.
No Taskman-specific workflow or tool was found in repository guidance or the available tools.

## Audit evidence

Read-only Chrome audit supplied by task `01a119b6-4006-730d-ba03-3f490e21d0fa` and parent
`01a11888-f925-74d0-8bb4-dbddffb260df`. Window: rolling October 7–8, about 04:24 UTC; minute
precision, not a second-exact frozen range. BuildOS had **8 error-bearing requests and 45
warning-bearing requests**, all production, with no HTTP 5xx in the selected rows. Counts are
requests, not individual console messages. Evidence links depend on Vercel retention.

### A. Project RPC permission errors (2 requests)

Deployment `dpl_H27ZkhJqTG3SBTcHGyaDaFwNbU85`, branch `main`:

| UTC timestamp           | Message                                                                     | Attached Vercel request                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 13:04:26.718 | `42501: permission denied for function get_project_skeleton_with_access_v2` | `GET /`, 304; [request ddkw9-1791378266615-f3c2d8aa405d](https://vercel.com/djwayne35gmailcoms-projects/build-os/logs?timeline=pastDay&search=level%3Aerror%2Cwarn&selectedLogId=ddkw9-1791378266615-f3c2d8aa405d&panelState=opened)                                    |
| 2026-10-07 13:04:42.237 | `42501: permission denied for function get_project_full`                    | `GET /sitemap-public-pages.xml`, 200, AhrefsBot; [request 6nnjm-1791378282084-6538a1bfdafb](https://vercel.com/djwayne35gmailcoms-projects/build-os/logs?timeline=pastDay&search=level%3Aerror%2Cwarn&selectedLogId=6nnjm-1791378282084-6538a1bfdafb&panelState=opened) |

**Confirmed source defect:** `routes/projects/[id]/+page.server.ts` started the skeleton and family
RPCs without authenticating. Its layout checks authentication, but SvelteKit runs page and layout
loads concurrently and can skip a layout during data navigation. When the skeleton RPC failed,
the page queried the session but still called `get_project_full` with a null actor for an anonymous
visitor. Both functions intentionally deny `anon` execution (migration
`20260925013000_contain_client_callable_definer_rpcs.sql`, lines 124–133).

**Attribution limit:** this defect reproduces the denied-call sequence locally, but the two historical
rows are attached to public routes and contain no originating project request ID or auth state.
It is a plausible explanation, not proof those exact requests were anonymous or that signed-in
users experienced an outage. Production grants were not independently queried in this remediation.

**Local change:** validate the cached session before any project RPC, redirect logged-out requests
with their destination intact, and reuse that session for fallback. Preserve the user-context
Supabase client, database membership checks, and all grants. Add per-request route ID, project ID
and request ID to skeleton/fallback errors and the context-document warning. Use the existing
log sanitizer for error payloads; omit URL query strings and cookies.

### B. Transport failures and missing request correlation (2 requests)

Two `/privacy` rows, both HTTP 200: request starts at `2026-10-07 13:02:56.069Z` (skeleton
`UND_ERR_SOCKET`) and `13:04:26.153Z` (full fallback `ETIMEDOUT`). These are transport failures,
not permission denials. The public-route attachment has the same attribution limitation as A.

The loader already makes one full-data fallback after a failed skeleton result and returns a 500
if that fallback fails; deferred full-data failures become a recoverable page result. Regression
tests cover these finite call counts. No retry loop, timeout change or global transport change was
added without evidence about the origin or duration. This does **not** prove a wall-clock timeout
bound or production recovery. Added request context supports a subsequent read-only correlation.

### C. No demonstrated current regression (49 requests)

- **45 MCP warnings:** known SDK 2.0.0 JSON response-mode warning, all HTTP 200; latest
  `2026-10-07 23:45:47.249Z`. No new notification-loss evidence. Leave the existing MCP and OAuth
  behavior intact; do not widen permissions or undo the SQL repair.
- **One portrait 404:** `/images/skill-people/april-dunford.jpg` at `2026-10-07 07:36:42.185Z`;
  [evidence](https://vercel.com/djwayne35gmailcoms-projects/build-os/logs?timeline=pastDay&search=level%3Aerror%2Cwarn&selectedLogId=fxcg6-1791358602185-d7d79a345184&panelState=opened).
  Repository search found no current reference to that URL or the `skill-people` image directory.
  The profile and expert cards use `SkillExpertMonogram`, and social metadata uses the shared
  default image. No replacement portrait or blanket 404 redirect is justified by this evidence.
- **Three icon-path 404s:** the audit supplied no exact paths or demonstrated current caller.
  No code change; obtain the exact requested paths and referrers only if these recur.

## Validation

- **PASS:** `test-gate run "pnpm --filter @buildos/web exec vitest run 'src/routes/projects/[id]/page.server.test.ts'"`
  — 1 file, 16 tests. Covers owner/editor/viewer permissions, nonmember denial, logged-out redirect
  before all RPCs, waiting for session validation, transport fallback success/failure, request
  correlation, redaction, deferred failure, and existing redirects.
- **PASS:** targeted ESLint for `+page.server.ts` and `page.server.test.ts`, through `test-gate`.
- **PASS:** `test-gate run 'pnpm --filter @buildos/web check'` — 0 errors, 0 warnings.
- **PASS:** targeted Prettier check and `git diff --check`.
- **PASS (follow-up):** `test-gate run 'pnpm --filter @buildos/web build'` — client/server bundles
  and Vercel adapter packaging completed, exit 0. Log: `/tmp/buildos-120-web-build.log`.
- **PASS (follow-up):** `test-gate run 'pnpm --filter @buildos/web lint'` — full ESLint and all eight
  guardrail stages, including 611 route exports. Log: `/tmp/buildos-120-web-lint.log`.
- **PASS (follow-up):** `test-gate run 'pnpm --filter @buildos/web typecheck:tests'` — 0/0 test type
  errors. Log: `/tmp/buildos-120-test-types.log`.
- **PASS (follow-up):** repository static prerequisites from `verify:static`: doc-health strict
  (0 dead schema/path errors, 8 nonblocking existing unstamped-doc advisories), migration ledger
  (538 files), Libri migration scope (52 migrations and 38 tests), SQL contract inventory (200
  files), and schema-tool tests (5 tests). No migration base ref was provided, so the ledger's
  historical immutability comparison was skipped; this change edits no migrations.
- Build advisories: chunks over 1000 kB; dependency tracing could not resolve Sharp targets for
  other platforms and optional `ws` dependencies; plugin timing notices. Build still completed.
  Vitest also emitted the Vite native-config compatibility advisory. No dependency/config edits.
- Build generators changed only `apps/web/src/content/blogs/blog-context.json`; restored its exact
  pre-build bytes from a scoped backup. Unrelated `TaskEntityPopover.svelte` work appeared in the
  shared tree during the follow-up and was left untouched.
- **Not run:** root `pnpm verify`, `pnpm test:run`, `pnpm pre-push`, full monorepo coverage/build/
  typecheck fan-out, and PostgreSQL integration suites. `AGENTS.md` explicitly says “Do not run
  root `pnpm test:run`, `pnpm verify`, or `pnpm pre-push` from a subagent” and requires the narrowest
  useful tests on this laptop. The web aggregates and lightweight repository prerequisites above
  cover this loader-only patch; full CI remains a publication gate, not a claimed local pass.
- No paid model/API tests, production reproduction, migration, deployment or browser interaction
  by this remediation task. Existing unrelated working-tree changes are preserved.

## Exit / awaiting authorized follow-through

1. Local regression tests and relevant static validation are complete (above).
2. With separate authorization, commit and deploy the two loader files through the normal web
   deployment path. No migration, permission grant or production setting change is proposed.
3. Perform free, read-only acceptance after deployment: logged-out project navigation and
   `__data.json` redirect to login without project RPCs; signed-in owner/viewer loads still succeed;
   a signed-in nonmember remains denied. Confirm no new errors from this path for normal traffic.
4. If transport errors recur, correlate the emitted route/project/request ID with the originating
   request and Supabase logs before choosing a transport fix. Historical attribution and timeout
   causality remain open; do not claim the production cluster resolved from unit tests alone.
5. Move final evidence into durable operations documentation and remove this tracker and README
   row once deployment and live acceptance pass, moving any genuine residual to an open tracker.

References: [SvelteKit load concurrency](https://svelte.dev/docs/kit/load#Parallel-loading) and
[Supabase API grants](https://supabase.com/docs/guides/api/securing-your-api).

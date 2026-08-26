<!-- docs/plans/ONTOLOGY_API_ACCESS_HELPER_RESEARCH_AND_PLAN_2026-08-25.md -->

# Ontology API Access Helper Research and Plan

**Date:** 2026-08-25  
**Status:** Approved pilot implemented and verified locally  
**Implementation status:** Phases 0A, 1, and 2 are implemented in the worktree. The migration has not been applied to the linked database.

## Implementation result

The approved database hardening, shared primitives, and document-only pilot are complete locally.

- Added a targeted migration for `ensure_actor_for_user`, `actor_has_project_member_access`, and `current_actor_has_project_member_access`. It enforces authenticated self-resolution, preserves trusted service-role/internal callers, makes first-use actor creation conflict-safe, pins empty search paths, and grants each role explicitly.
- Added a disposable PostgreSQL contract covering function ownership/security configuration, the complete execute-privilege matrix, authenticated/service identity behavior, fallback names, missing users, owner access, repeat calls, and 12 concurrent first-use calls returning one canonical actor.
- Extracted server-only actor/access/error-logging primitives and left the former route logging module as a compatibility re-export.
- Migrated the approved document create, detail, full, versions, version detail, and restore handlers. The `/full` actor/RLS race is removed while the primary document wrapper retains its existing parallel access/project fetch.
- Replaced the versions endpoint's arbitrary-user actor provisioning with a read-only RLS-scoped actor lookup. Invalid or invisible filters remain restrictive and return no matching versions rather than silently removing the filter.
- Kept public-page access on its specialized local helper, as planned; its existing regression tests remain green.

Verification completed on 2026-08-25:

- `11` focused test files, `37` tests passed.
- `pnpm --filter @buildos/web check` passed with `0` errors and `0` warnings.
- The linked database linter reported existing unrelated function findings and none for the three target RPCs. Because the migration is still local, the disposable PostgreSQL contract is the proof for the new definitions.

The remaining Phase 0A rollout gate is intentionally operational: apply the migration to a non-production environment, re-query the deployed function owner/configuration/ACLs, and run authenticated invite, admin, and worker smoke paths before production deployment. Phase 3 remains unimplemented pending review of this pilot evidence.

## Executive decision

The access pattern should be extracted, but it should not be replaced with one broad, table-name-driven helper or migrated in one pass.

The recommended shape is a small set of server-only primitives that encode the security-sensitive ordering and error logging once:

1. Resolve the authenticated user's ontology actor.
2. Read the requested entity only after the actor exists, because ontology RLS derives access from the current actor.
3. Check the required project member access explicitly.
4. Log infrastructure failures with consistent ontology API context.
5. Return the route's existing `Response` contract without logging normal 403/404 outcomes.

The first implementation slice covers the document API. The structurally similar task/goal/plan/milestone/risk/requirement families remain a later phase. Comments, edges, public routes, projectless events, admin routes, and service-role workers need separate review because they do not share one authorization model.

A database hardening change is included ahead of the route cleanup. The deployed RPC grants do not match the repository's intended grants, and the former `ensure_actor_for_user` definition is not concurrency-safe. These are confirmed production-state findings, not assumptions based only on migrations.

## Scope

This research covers:

- `ensure_actor_for_user` usage in the web application, with a detailed inventory of `/api/onto` route handlers.
- The `ensureDocumentAccess()` pattern in `apps/web/src/routes/api/onto/documents/[id]/+server.ts`.
- Existing overlapping access helpers.
- RLS ordering, RPC definitions and grants, service-role callers, logging behavior, status-code behavior, concurrency, and current tests.
- A phased plan with explicit approval and rollback gates.

The completed approval covers the local implementation of Phases 0A, 1, and 2. It does not authorize deployment or a broad rewrite of actor resolution outside the document pilot.

## Verified inventory

The inventory was re-run on 2026-08-25 with test/spec files excluded.

- The web source tree contains **81** non-test TypeScript occurrences of `ensure_actor_for_user` across **59** files.
- API route handlers contain **54** occurrences across **36** `+server.ts` files.
- `/api/onto` route handlers account for **51** occurrences across **33** `+server.ts` files.
- The conventional document/task/goal/plan/milestone/risk/requirement families account for **34** occurrences across **20** of those files. This is the strongest shared-helper migration set.
- **27** of the 33 ontology route files already use `logOntologyApiError`; the six exceptions are listed below.

### `/api/onto` distribution

| Route family                    |  Files | `ensure_actor_for_user` occurrences | Initial treatment                                   |
| ------------------------------- | -----: | ----------------------------------: | --------------------------------------------------- |
| documents                       |      6 |                                   8 | Pilot, then migrate family                          |
| tasks                           |      3 |                                   5 | Migrate after document pilot                        |
| goals                           |      3 |                                   5 | Migrate after document pilot                        |
| plans                           |      3 |                                   5 | Migrate after document pilot                        |
| milestones                      |      2 |                                   4 | Migrate after document pilot                        |
| risks                           |      2 |                                   4 | Migrate after document pilot                        |
| requirements                    |      1 |                                   3 | Migrate after document pilot                        |
| comments                        |      3 |                                   5 | Specialized review                                  |
| edges                           |      4 |                                   5 | Specialized review                                  |
| projects and project operations |      4 |                                   5 | Prefer project-specific helper; review individually |
| events                          |      1 |                                   1 | Specialized review; project can be absent           |
| graph                           |      1 |                                   1 | Specialized graph/public-access review              |
| **Total**                       | **33** |                              **51** |                                                     |

The six inventoried ontology route files with actor resolution but no `logOntologyApiError` import are:

- `apps/web/src/routes/api/onto/edges/[id]/+server.ts`
- `apps/web/src/routes/api/onto/edges/available/+server.ts`
- `apps/web/src/routes/api/onto/edges/linked/+server.ts`
- `apps/web/src/routes/api/onto/graph/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts`
- `apps/web/src/routes/api/onto/requirements/[id]/+server.ts`

## Current design and duplication

`ensureDocumentAccess()` currently combines four responsibilities:

- Actor resolution through `ensure_actor_for_user`.
- Entity loading through the authenticated Supabase client.
- Explicit project-member authorization through `current_actor_has_project_member_access`.
- Error-to-response mapping and structured error logging.

It is used by PATCH and DELETE in the document route. GET has a different read path through the agentic-chat runtime and repeats actor resolution separately, so the local function is already not a universal document-access abstraction.

There are several overlapping helpers with different contracts:

| Helper                                       | Location                                                              | Important difference                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ensureActorId`                              | `packages/shared-agent-ops/src/ontology/ontology-projects.service.ts` | Low-level, client-agnostic, throws; no route response or logging context                                        |
| `requireProjectMemberAccess`                 | `apps/web/src/lib/server/ontology-project-access.ts`                  | Widely used project-level helper; validates UUID/session/project, but does not log through ontology API logging |
| `verifyProjectAccess` / `verifyEntityAccess` | `apps/web/src/lib/utils/api-helpers.ts`                               | Older result shape; fixed read access; dynamic table string and weaker typing                                   |
| asset access helpers                         | `apps/web/src/routes/api/onto/assets/shared.ts`                       | Route-family-specific actor/project/entity implementation                                                       |
| local document/task/event helpers            | Individual route files                                                | Preserve local messages and result shapes but repeat the same RPC/error plumbing                                |

This supports extraction, but it also argues against adding another monolithic helper. The new layer should be small enough that these existing helpers can compose it or be retired incrementally.

## Confirmed security and correctness findings

### 1. Actor resolution must precede RLS-protected reads

This is confirmed by repository RLS migrations. Select policies for documents, tasks, goals, plans, milestones, and risks call current-actor project access functions. The May 2026 tightening migration replaced public-read policies with `current_actor_has_project_member_access` for internal ontology entities.

For a first-use user with no `onto_actors` row, an entity query can be hidden by RLS until `ensure_actor_for_user` completes. Therefore actor creation and the first protected entity read are not independent operations.

Four `/full` routes currently run them in the same `Promise.all`:

- `apps/web/src/routes/api/onto/documents/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/plans/[id]/full/+server.ts`

On an existing actor this usually works. On a user's first ontology request it can intermittently return a database/not-found response even though actor creation succeeds. The shared helper must prevent this race.

### 2. Existing 404/403 behavior depends on the same ordering

The current entity-first flow has a useful anti-enumeration property:

- A non-member may have the entity hidden by RLS and receive 404.
- A read-only member can load an entity but fail a required write/admin check and receive 403.

Changing the flow to run the SECURITY DEFINER access RPC before the entity read could turn some existing 404s into 403s and reveal that an entity/project exists. The first refactor must preserve `actor -> entity read -> required-access check` for entity-by-ID routes.

Create and project-ID routes are different: when the project ID is already supplied and no entity must be discovered, the project-level helper can check project existence/access directly.

### 3. Deployed function grants are broader than repository intent

Read-only catalog queries were run against the linked Supabase project on 2026-08-25.

| Function                                             | Repository intent                                                                  | Confirmed deployed executors                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ensure_actor_for_user(uuid)`                        | Migration grants `authenticated`; service-role use also exists in application code | `PUBLIC`, `anon`, `authenticated`, `service_role` |
| `current_actor_has_project_member_access(uuid,text)` | `authenticated`, `service_role`; PUBLIC revoked                                    | `anon`, `authenticated`, `service_role`           |
| `actor_has_project_member_access(uuid,uuid,text)`    | `service_role` only; PUBLIC revoked                                                | `anon`, `authenticated`, `service_role`           |

The deployed definitions are `SECURITY DEFINER` with a pinned `public` search path. The actor-explicit access helper therefore acts as a membership oracle for arbitrary actor/project IDs when called by roles that were not intended to execute it. `ensure_actor_for_user` accepts an arbitrary user UUID, does not compare it with `auth.uid()`, and can create an actor as its owner.

The project's confirmed default function ACL grants execution to `anon`, `authenticated`, and `service_role`. Revoking only `PUBLIC` does not remove those explicit role grants. Any hardening migration must revoke from each unintended role explicitly and verify the deployed catalog afterward.

This is not evidence that every caller is exploitable without knowing IDs, but it is a confirmed authorization-boundary exposure and should be fixed before expanding reliance on the RPCs.

### 4. `ensure_actor_for_user` has a first-call concurrency race

The deployed function performs `SELECT`, then `INSERT`. The deployed schema has both a non-unique partial index and a unique partial index on non-null `onto_actors.user_id`.

Two simultaneous first calls can both observe no actor; one insert succeeds and the other can fail on the unique index. Multiple browser requests, background jobs, or worker calls for the same first-use user can trigger this independently of the `/full` read-ordering issue.

The function should use conflict-safe creation and then return the canonical row. The implementation should avoid a no-op update solely to obtain `RETURNING`, because that can trigger unnecessary update side effects. A safe pattern is insert-on-conflict-do-nothing followed by a select of the canonical actor in the same function.

### 5. Service-role and current-user paths cannot be collapsed blindly

Authenticated web routes resolve the current session user. Admin and worker code intentionally resolves arbitrary users using service-role clients. Confirmed examples include admin user activity, agent run dispatch, agent operatives, daily briefs, and agentic-chat worker capture.

Similarly:

- Web/session code should use `current_actor_has_project_member_access`, which derives identity from the JWT.
- Service-role worker code uses `actor_has_project_member_access(p_actor_id, ...)`, because a service client does not carry the end user's `auth.uid()`.

The route helper must therefore be session-bound and server-only. The existing lower-level `ensureActorId(client, userId)` remains appropriate for trusted service-role code; it should not be exposed as the web authorization abstraction.

### 6. Error logging is fail-open and should remain so

`logOntologyApiError` catches its own logging failures. Today an error-log outage does not replace the route's original response. The shared helper must preserve that property.

Expected authorization outcomes (missing entity, denied access) should not be logged as infrastructure failures. RPC and database failures should be logged with endpoint, method, user, project, entity, operation, and table context when known.

## Assumptions and their verification status

| Assumption                                                    | Status                       | Evidence / consequence                                                                                                              |
| ------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Most ontology CRUD routes repeat the same pattern             | Confirmed                    | 34 occurrences in 20 conventional entity-family route files                                                                         |
| One helper can safely cover every call site                   | Rejected                     | Public, comments, edges, projectless events, admin, and workers have different identity/access rules                                |
| Actor creation and entity reads can be parallelized           | Rejected                     | RLS policies depend on current actor; four `/full` routes contain a first-use race                                                  |
| Repository grants describe deployed grants                    | Rejected                     | Linked database ACLs are broader than the migrations intend                                                                         |
| `REVOKE ... FROM PUBLIC` is sufficient                        | Rejected                     | Default ACLs explicitly grant `anon` and `authenticated`                                                                            |
| Actor creation is already idempotent under concurrency        | Rejected                     | Check-then-insert plus unique `user_id` index can raise a conflict                                                                  |
| The refactor can standardize all status codes/messages safely | Rejected for initial rollout | RLS ordering, anti-enumeration, and route-specific messages make this a behavior change                                             |
| Existing tests fully cover access failures                    | Rejected                     | Targeted tests cover document mutations/concurrency and one collaborator path, but not the shared failure matrix or database grants |
| A route-only helper can replace trusted service utilities     | Rejected                     | Service-role code intentionally resolves actors for arbitrary users                                                                 |

## Implemented abstraction

### Location and boundary

Add a server-only access module under `$lib/server`, tentatively:

- `apps/web/src/lib/server/ontology-api-access.ts`
- `apps/web/src/lib/server/ontology-api-error-logging.ts`

Move the logging implementation to the server module and leave `apps/web/src/routes/api/onto/shared/error-logging.ts` as a temporary re-export. That avoids a server library depending on a route directory and avoids a big-bang import rewrite.

The access module should expose three narrow primitives rather than a dynamic table abstraction:

```ts
requireOntologyActor(...)
requireCurrentActorProjectAccess(...)
requireProjectEntityAccess<T>(...)
```

The exact names may change during implementation, but their responsibilities should not.

### Contract

Use one explicit discriminated result shape:

```ts
type AccessResult<T> = { ok: true; actorId: string; value: T } | { ok: false; response: Response };
```

Key design constraints:

- The helper receives the authenticated session user, not a user ID parsed from request input.
- `requiredAccess` is mandatory for entity access; no implicit read default in the generic composer.
- The entity is loaded through a typed callback supplied by the route. Do not accept an arbitrary table-name string or cast every query to `any`.
- The callback preserves each route's selected columns, soft-delete conditions, and `maybeSingle`/`single` semantics.
- The composer derives `project_id` from the loaded entity and performs the member-access RPC only afterward.
- Audit context is explicit and includes route-specific operation prefixes/messages.
- Expected 403/404 responses are configurable so the first migration preserves the exact public contract.
- Domain-specific follow-up loading remains in a thin local wrapper. For example, `ensureDocumentAccess` can retain the project-record load while delegating actor/entity/access/error plumbing.

### Error/response compatibility contract

| Condition                           | Initial migration behavior                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Missing session                     | Preserve route's existing 401 message; normally handled before helper call                      |
| Missing/invalid route ID            | Preserve each route's existing 400/404 behavior; do not introduce global UUID normalization yet |
| Actor RPC error or empty result     | 500; structured error log; preserve route-facing message                                        |
| Entity query error                  | Existing database-error response; structured error log                                          |
| Entity hidden/missing/deleted       | 404; no error log                                                                               |
| Access RPC error                    | 500; structured error log                                                                       |
| Insufficient required access        | 403 with existing route message; no error log                                                   |
| Related project query error/missing | Preserve existing 500/404 behavior in domain wrapper                                            |
| Logging failure                     | Swallowed; never changes the response                                                           |

## Implementation plan

Each phase has a stop/review gate. There should be no big-bang migration.

### Phase 0A: targeted database hardening

Create a migration and SQL tests for the three target RPCs.

1. Make `ensure_actor_for_user` conflict-safe and guaranteed to return the canonical actor under concurrent first calls.
2. Enforce caller identity:
    - authenticated callers may resolve only `auth.uid()`;
    - trusted service-role callers may resolve an explicit user ID;
    - verify internal SQL callers before finalizing the guard so invite/context functions are not broken.
3. Explicitly revoke `PUBLIC` and `anon` from `ensure_actor_for_user`; explicitly grant `authenticated` and `service_role` because both caller classes are present.
4. Explicitly revoke `PUBLIC`, `anon`, and `authenticated` from `actor_has_project_member_access`; grant only `service_role`.
5. Explicitly revoke `PUBLIC` and `anon` from `current_actor_has_project_member_access`; preserve `authenticated` and, initially, `service_role` to match repository intent.
6. Add SQL assertions for function owner/security/search path, each role's execute privilege, authenticated self-only behavior, service-role behavior, missing users, repeated calls, and canonical actor return.
7. Exercise concurrent first-use with two database/client sessions. If the existing SQL harness cannot coordinate sessions, record a separate integration reproduction rather than treating sequential idempotence as proof.
8. Apply to a non-production environment and query `pg_proc`/ACLs again. Do not infer success from migration text.

**Gate 0A:** Database tests pass; deployed ACLs match the matrix; authenticated web, invite, admin, and worker smoke paths pass.

### Phase 0B: default-function-privilege decision

The default ACL is a systemic source of future exposure, but changing it can affect unrelated functions and deployment workflows. Handle it as a separately approved audit/migration:

1. Inventory all functions that intentionally require `anon` or `authenticated` execution.
2. Decide the project's secure default for future functions.
3. Change default privileges only with generated before/after ACL evidence and targeted API smoke tests.

**Recommendation:** Do not bundle the global default-privilege change into the access-helper PR. Harden the three target functions explicitly now and open a separate security task for defaults.

### Phase 1: add primitives and contract tests, without route migration

1. Add the server-only logging and access modules.
2. Leave the existing route logging path as a re-export.
3. Add unit tests for every row in the compatibility table, including logger failure.
4. Add a test proving the entity loader is not invoked until actor resolution has completed.
5. Add a test proving the access RPC is not called when the entity is missing/hidden.
6. Add a test proving `requiredAccess` is passed exactly and is not silently defaulted.

**Gate 1:** New helpers are independently tested; no route behavior has changed.

### Phase 2: document pilot

1. Refactor the PATCH/DELETE `ensureDocumentAccess` wrapper to compose the shared helper while preserving its return type and project fetch.
2. Refactor `/api/onto/documents/[id]/full` so actor resolution completes before its protected document query.
3. Migrate document create/version/restore routes only after the primary route tests pass.
4. Preserve exact status codes, public messages, operation names, soft-delete filters, selected columns, and optimistic-concurrency behavior.
5. Do not combine this pilot with query-count optimization. Once parity is proven, a separate measured change can consider folding the project fetch into a typed relation select.

**Gate 2:** Document targeted tests, new access tests, `pnpm --filter @buildos/web check`, and manual first-actor/read-only-member/non-member smoke cases pass.

### Phase 3: conventional entity families

Migrate in small family slices:

1. tasks, including `task-document-helpers.ts` and `/full` ordering;
2. goals and plans, including `/full` ordering;
3. milestones, risks, and requirements;
4. create routes using the project-level primitive where no entity exists yet.

Run the family-specific tests and the web check at every slice. Do not mix families in a single unreviewable diff.

**Gate 3:** Each family demonstrates response/logging parity before proceeding to the next.

### Phase 4: consolidate existing web helpers

After the route primitive is stable:

1. Refactor `requireProjectMemberAccess` to compose the same actor and project-access primitives without changing its public result contract.
2. Migrate or retire `verifyProjectAccess` and `verifyEntityAccess` after enumerating their consumers.
3. Migrate asset access helpers where their status and logging contracts match.
4. Keep `ensureActorId` as the low-level cross-runtime/service helper; avoid SvelteKit `Response` dependencies in shared-agent packages.

**Gate 4:** Existing inbox/project API tests that mock `requireProjectMemberAccess` continue to pass without caller rewrites unless explicitly approved.

### Phase 5: specialized-route review

Review rather than automatically migrate:

- comments, because target visibility and comment ownership add rules;
- edges and graph routes, because linked entities and public graph behavior matter;
- events, because `project_id` may be null;
- public pages, because deliberate public visibility is not collaborator access;
- project operation routes, where `requireProjectMemberAccess` may already be the better abstraction;
- admin and service-role/worker paths, which must keep explicit actor semantics.

Each route should either use a proven primitive or retain a local helper with a short comment explaining the special rule.

## Verification plan

### Existing baseline

The following targeted baseline passed before implementation planning:

- `apps/web/src/routes/api/onto/documents/[id]/server.test.ts`
- `apps/web/src/routes/api/onto/documents/[id]/document-patch-concurrency.test.ts`
- `apps/web/src/routes/api/onto/tasks/task-document-helpers.project-access.test.ts`

Result: **3 test files, 10 tests passed**.

These tests protect document mutation behavior, optimistic concurrency, and one collaborator-access path. They do not cover actor/access failure mapping or database RPC privileges.

A broader existing test run observed unrelated failures in the dirty worktree/environment (including sandbox permission errors, a missing legacy route, and agentic golden-output drift). Those failures should not be silently attributed to this work. The approval implementation should use targeted gates plus `pnpm --filter @buildos/web check`, and record any pre-existing full-suite failures separately.

### Required new route tests

- Actor RPC error and empty actor.
- Entity query error.
- Entity missing/RLS-hidden.
- Read member requesting write access.
- Write/admin success.
- Access RPC error.
- Logger failure does not alter response.
- Actor completion before entity loader begins.
- No access RPC after missing entity.
- Existing route-specific messages and operation metadata.
- First-use `/full` request no longer races.

### Required database tests/evidence

- ACL matrix for `PUBLIC`, `anon`, `authenticated`, and `service_role`.
- Authenticated self resolution succeeds; another user's ID is rejected.
- Service role can resolve an explicit user where required.
- Missing user fails without creating an actor.
- Existing actor returns unchanged.
- Blank/null name fallback remains correct.
- Concurrent first calls return the same actor without unique violations.
- Deployed `prosecdef`, `proconfig`, definition, owner, and ACLs match expectations.

## Rollout and rollback

- Keep database hardening and route refactoring in separate commits or PRs so each can be reverted independently.
- Apply database changes to a non-production environment first and capture the post-migration catalog query.
- Migrate one route family at a time; avoid mechanical repository-wide replacement.
- Preserve the local document wrapper during the pilot, making rollback a small import/call-site change.
- Do not remove old helpers until all known consumers are migrated and tests are green.
- If a route changes its 404/403 behavior, stop the rollout and treat it as a product/security decision rather than normalizing it opportunistically.

## Approval decisions

The recommended approvals are:

1. **Approve Phase 0A** as a preceding targeted security/correctness change.
2. **Approve Phases 1-2** as the first implementation PR: shared primitives plus a document-only pilot.
3. **Approve Phase 3** only after reviewing pilot evidence.
4. **Keep Phase 0B separate**: audit global default function privileges in a dedicated security task.
5. **Preserve current status codes and messages** during migration; consider standardization later.
6. **Do not optimize query counts in the pilot**; measure and optimize after behavior parity.
7. **Do not automatically migrate specialized/public/admin/worker routes.**

## Evidence and references

### Repository evidence

- `apps/web/src/routes/api/onto/documents/[id]/+server.ts`
- `apps/web/src/routes/api/onto/documents/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/plans/[id]/full/+server.ts`
- `apps/web/src/lib/server/ontology-project-access.ts`
- `apps/web/src/lib/utils/api-helpers.ts`
- `apps/web/src/routes/api/onto/assets/shared.ts`
- `apps/web/src/routes/api/onto/shared/error-logging.ts`
- `packages/shared-agent-ops/src/ontology/ontology-projects.service.ts`
- `apps/worker/src/workers/agentic-chat/workerAccessAdapter.ts`
- `supabase/migrations/20260428000019_fix_ensure_actor_for_user_nullable_name.sql`
- `supabase/migrations/20260514000500_add_project_member_access_helper.sql`
- `supabase/migrations/20260514001000_tighten_public_project_internal_access.sql`

### Authoritative external references

- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database linter: authenticated SECURITY DEFINER executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html)
- [PostgreSQL `CREATE FUNCTION`](https://www.postgresql.org/docs/current/sql-createfunction.html)

Supabase's current documentation confirms that database functions are executable broadly by default unless privileges are revoked, and that exposed `SECURITY DEFINER` functions require careful grant control. PostgreSQL's documentation likewise recommends revoking broad function execution and granting selectively in the same transaction.

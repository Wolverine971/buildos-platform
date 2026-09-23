<!-- tasker/94-connector-scope-frozen-project-list.md -->

# 94 — Connected agents cannot see projects created after the connection

**Created:** 2026-09-22. **Owner:** next implementation agent; DJ approves any scope widening.
**Status:** BUILT 2026-09-22 (DJ chose "ambitious: one-click grant" + "flip all 9 frozen keys").
Code UNCOMMITTED and undeployed; free local tests + svelte-check pass. Prod data fix APPLIED.
See "Implementation" at the end.

## Symptom

The user-scope `buildos` MCP server (launcher
`packages/buildos-mcp-server/bin/buildos-mcp-bridge.sh`, which sends a static `boca_…` key to
`/mcp/buildos`) returns `{"code":"FORBIDDEN","message":"Project is outside the allowed call scope"}`
from `get_onto_project_details`, `get_document_tree`, and `list_onto_tasks` for project
`445dd429-db93-4878-90a9-b3ab1627a9f2`. That project was created 2026-08-20; it is
`external_agent_access = 'standard'` and not shared. Older projects work.

## What the code already supports

The "all projects, including future ones" mode **already exists**. It is
`project_scope_mode = 'all_unrestricted'`, added by
`supabase/migrations/20260728010000_external_agent_project_access.sql`.

- **Scope is computed per request, not frozen at dial.** For static keys,
  `authenticateBuildosMcpRequest` (`apps/web/src/lib/server/agent-call/mcp-connector.service.ts:370-434`)
  calls `resolveEffectiveAgentProjectScope`
  (`apps/web/src/lib/server/agent-call/project-access.service.ts:80`).
- **In `all_unrestricted` mode, new projects are included automatically.**
  `computeEffectiveAgentProjectScope` (`project-access.service.ts:37-77`) adds every owned,
  unshared, `standard` project, plus explicit grants from `external_agent_project_permissions`.
- **In `selected` mode, only rows in that permissions table count.** Enforcement is
  `buildAllowedProjectSet` / `assertAccessibleProject`
  (`packages/shared-agent-ops/src/gateway/op-execution-gateway.access.ts:19-45`), and it throws the
  exact error seen.
- The settings UI already offers both modes (`AgentKeysTab.svelte:2050-2080`: "All standard
  projects — Includes owned standard projects you create later"). Changing mode in place (no key
  rotation) is supported by `updatePermissionsForUser`
  (`caller-provisioning.service.ts:1079-1180`).

## Root cause

Read-only production query, 2026-09-22. The key the bridge uses is caller
`7d2fba91-db2c-4d2d-bd92-406eb4033b94`: `codex-cli:local:codex-all-projects`, `read_write`, last
used 2026-09-22 16:55 UTC. Its state is `project_scope_mode = 'selected'`, with 41 explicit
`allowed_project_ids` and 41 active permission rows, **none** for `445dd429…`.

1. **A legacy key was migrated as a fixed list.** The key was provisioned on 2026-07-16, before
   project scope modes existed. At that time "all projects" could only be expressed as an explicit
   array of every visible project (Select All). The 07-28 migration (`:34-36` and `:163-172`)
   treated _any_ array as `selected` and turned it into permission rows. A key whose name says
   "all projects" became a list frozen at 41 projects.
2. **The migration choice was correct for security, but the user was never told.** Widening a
   read_write key to future projects without consent would be wrong. But nothing flagged keys whose
   selected list equaled "every project I had at the time", so DJ was not asked.
3. **"Select All" still produces a frozen list today.** In `selected` mode, the UI's
   `toggleAllProjects` (`AgentKeysTab.svelte:~494-500`) saves every current id. The
   provisioning default (`caller-provisioning.service.ts:158-162`, `:835-838`) then stores
   `selected`. The trap still catches new keys.
4. **The error is a dead end for the agent.** The FORBIDDEN message does not say that the project
   exists but was not shared with this connector, or where to fix it. `list_onto_projects` hides
   the project entirely, so the agent cannot help either.

Confidence: **high** for 1 and 3 (code plus production row); **medium** that DJ intended future
projects (the caller name suggests it; confirm with DJ). The note in memory about "30 project_ids in
call.dial" matches the older `agent-call-service.ts:217-337` dial path. That path intersects
requested ids with the caller policy, so it would also exclude new projects under `selected`.

## Fix direction

1. **Immediate (DJ, no code):** Profile → Agent keys → `codex-all-projects` → switch to _All standard
   projects_. Keep read_write if intended. Do not script this change on production without DJ's
   approval; it is a scope widening.
2. **One-time "you may have meant All" prompt, not a silent migration.** For `selected` callers
   whose permission set is a superset of the owned standard projects at migration time
   (source `migration`), show a banner on the agent keys page: "This key was set to your N projects
   on <date>. New projects since then are not visible. Switch to All standard projects?" This
   needs one explicit click per key. For read_write keys, add a second line naming the write
   operations.
3. **Fix the Select All trap.** In `selected` mode, when the selection equals every choice, show
   an inline suggestion to switch to _All standard projects_. Apply the same change to the OAuth
   consent page (`apps/web/src/routes/oauth/authorize/+page.svelte:215-250`).
4. **Ask on project creation.** For each active `selected` caller that has been used in the last
   30 days, show a non-blocking chip on the new project: "Share with Codex CLI?". It creates an
   `external_agent_project_permissions` row with `source = 'selected'`. Lean alternative: no chip,
   only the better error in step 5.
5. **Make the error actionable.** In `assertAccessibleProject`, when the project exists and is
   visible to the user but is out of the connector's scope, return FORBIDDEN with
   `details: { reason: 'project_not_granted_to_connector', manage_url: '/profile/agent-keys/<callerId>' }`
   and text telling the agent to ask the user to grant access. Do not reveal names of projects
   the user cannot see.

**Security considerations**

- Widening scope only ever happens after an explicit user click.
- `all_unrestricted` already excludes shared and `restricted` projects. Keep that.
- Future-project **write** access stays a separate, explicit opt-in: the read_write radio stays
  distinct from the project mode.
- OAuth grants can only be narrowed in place (`caller-provisioning.service.ts:1136-1143`). Keep
  "reconnect to widen" for OAuth.
- Log every mode change as a security event.

## Acceptance criteria

- After switching the caller to `all_unrestricted`, the three tools succeed for `445dd429…`, and for
  a project created after the switch, with no key rotation or reconnect.
- A `selected` caller still gets FORBIDDEN for a new project. The error carries
  `reason: 'project_not_granted_to_connector'` and a manage link. A project the user cannot see
  still returns the same message as today, with no leak.
- In `selected` mode, choosing Select All shows the switch suggestion. Saving without accepting
  keeps `selected`.
- Shared or `restricted` projects never enter scope unless explicitly granted, in either mode.
- The migration banner appears only for callers matching the superset rule and disappears once the
  user decides either way.

## Tests (free, local)

- **`project-access.service.test.ts`:**
    - `all_unrestricted` includes a project newer than every permission row.
    - `selected` excludes it.
    - `restricted` and shared projects are excluded under `all_unrestricted`.
    - read_write plus a membership without write access produces no `write_project_ids` entry.
- **`mcp-connector.service.test.ts`:** a static key in `selected` mode calling
  `get_onto_project_details` on a visible but ungranted project returns the new reason code.
  After an in-place mode update, the same call succeeds.
- **`caller-provisioning.service.test.ts`:** `updatePermissionsForUser` switching
  `selected → all_unrestricted` revokes or keeps explicit rows correctly and records a security
  event. OAuth widening is still refused.
- **Component test for `AgentKeysTab`:** in `selected` mode, Select All over every choice renders
  the switch suggestion.

## Implementation (2026-09-22)

**Production data (applied, DJ-approved in chat).** DJ's 9 trusted `selected` callers were switched to
`all_unrestricted` in one transaction: `external_agent_callers.project_scope_mode` + `policy`
(`project_scope_mode`, `allowed_project_ids: []`), the one active OAuth grant for `7f926510…`, and
158 redundant permission rows revoked (`revoked_at` set, rows kept). Nine
`agent.caller.permissions_updated` security events carry
`metadata.source = 'tasker94_owner_approved_prod_flip'`. Verified live: `get_onto_project_details`
on `445dd429…` via the stdio bridge now succeeds with no key rotation. Rollback: un-revoke the rows
revoked at that timestamp and set the mode back to `selected`. Only one `selected` caller remains
in prod (another user's, never used), so the migration banner (fix step 2) was **not built**.

**Code (uncommitted):**

- `shared-agent-ops/.../op-execution-gateway.access.ts`: `buildAllowedProjectSet` returns a
  `ScopedProjectMap` that also knows which user-visible projects are ungranted.
  `assertAccessibleProject` / `assertVisibleEntityProject` throw FORBIDDEN with
  `details.reason = 'project_not_granted_to_connector'` + `project_id` for those (never the name);
  invisible projects keep the old message. `loadVisibleProjects` exposes `ungrantedProjectCount`.
- `...projects.ts`: `list_onto_projects` / `search_onto_projects` add a count-only
  `connector_scope` note when projects are hidden from the connector.
- `external-tool-gateway.ts`: `attachConnectorGrantLinks` adds `grant_url`
  (`/profile/agent-keys/<callerId>/grant[?project=<id>]`) using the new `connectorOrigin` param;
  MCP connector (tools/call, search, fetch) and the dial path pass their origin.
- `agent-call-service.ts` `resolveCurrentSessionScope`: dial sessions no longer freeze the project
  list at dial time; the fence applies only when the agent requested specific `project_ids`.
- `caller-provisioning.service.ts`: `getProjectGrantContextForUser`, `grantProjectsForUser`
  (adds rows in place, keeps mode, access level follows the key/OAuth grant, syncs legacy policy
  arrays), `switchToAllProjectsForUser` (never widens read→write or allowed_ops).
  `updatePermissionsForUser` now drops redundant explicit grants in all mode and logs
  `agent.caller.permissions_updated`; grants log `agent.caller.project_access_granted`.
- New route `/profile/agent-keys/[callerId]/grant`: "Let <agent> work on <project>?" with
  [Share just this project] / [Share all my projects]; list mode without `?project=`.
- `AgentKeysTab.svelte`: Select All in selected mode shows "This freezes today's list" +
  [Use All standard projects]; switching to All prunes redundant picks. OAuth consent copy warns
  that later projects aren't included in selected mode.

**Tests (free, local):** `op-execution-gateway.access.test.ts` (7),
`caller-provisioning.project-grants.test.ts` (10), 3 new in `external-tool-gateway.test.ts`,
2 new in `agent-call-service.test.ts`, `AgentKeysTab.test.ts` (2), MCP origin assertion. All
`src/lib/server/agent-call/` suites pass (165+). `pnpm --filter @buildos/web check`: 0 errors.

**Not verified:** the primary "Let X work on Y?" card in a browser (no `selected` key left to
render it against; covered by service tests). The already-granted, all-visible, and bad-link
states were checked on the local dev server against prod data. Not deployed.

**Correction to "What the code already supports":** in-place mode changes exist (`PATCH
/api/agent-call/callers` → `updatePermissionsForUser`), but the Agent keys editor uses PATCH only
for OAuth connectors. Saving a **static** key there re-provisions it (`POST`) and issues a new
secret, which breaks clients such as the keychain-based stdio bridge until their config is
updated. The grant page never rotates. Possible follow-up: link each static key card to its
grant page, or route static edits through PATCH.

**Docs updated 2026-09-22:** `docs/architecture/EXTERNAL_AGENT_PROJECT_ACCESS.md` (canonical:
session fence, pruning, denials and grants, migration consequence),
`docs/technical/project-access-and-agent-auth-model.md`, `apps/web/src/content/docs/connect-agents.md`
(public: scope options, "When an agent can't see a project", rotation note),
`docs/integrations/openclaw/{README,setup}.md`, `plugins/buildos/skills/buildos-context/SKILL.md`
(agent guidance), `docs/specs/buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md` (§4c, T8),
`docs/specs/buildos-mcp-audit-fixes-2026-06-28.md` (oracle note). The Agent keys connection prompt
(`projectScopeDescription`) now reflects scope mode and tells agents to relay `grant_url`.

**Landmine:** running `pnpm --filter @buildos/web check` while `vite dev` is running deletes the
dev-only `.svelte-kit/types/**/proxy+*.ts` files, and every page 500s with ENOENT. Touching
`apps/web/vite.config.ts` makes Vite restart in place and fixes it.

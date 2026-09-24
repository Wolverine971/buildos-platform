<!-- docs/architecture/EXTERNAL_AGENT_PROJECT_ACCESS.md -->

# External agent project access

BuildOS connector authorization is deny-by-default at the project boundary and
uses two independent controls.

## Connector project policy

- `all_unrestricted` includes every current and future **owned** project whose
  `external_agent_access` is `standard`.
- `selected` includes only projects with an explicit connector permission.
- Shared projects never inherit connector access. They require an explicit
  permission even when the connector uses `all_unrestricted`.
- The legacy `allowed_project_ids` values remain as a write-through compatibility
  mirror. They are not an authorization fallback; `project_scope_mode` and active
  explicit permission rows are authoritative. The call-gateway dial path still
  negotiates `selected` scope from the mirror, so every writer keeps it in sync.
- Under `all_unrestricted`, explicit rows exist only for shared or restricted
  exceptions. Saving a connector in that mode drops explicit rows for owned
  standard projects, so marking a project `restricted` later cuts access off.
- `all_unrestricted` is the default for new keys and OAuth consent. In `selected`
  mode, choosing every project freezes today's list; the Agent keys editor warns
  about this and offers to switch.

## Project policy

- `standard` allows eligible `all_unrestricted` connectors to inherit access.
- `restricted` requires an explicit connector permission.
- Public visibility is not authorization. Only projects visible through the
  user's membership are candidates for connector access.

Explicit permissions are stored in `external_agent_project_permissions`. OAuth
permissions bind to an individual `agent_oauth_grant_id`; static-key permissions
bind to the caller with a null OAuth grant. Each permission has its own
`read_only` or `read_write` ceiling.

## Runtime enforcement

Every MCP request resolves the connector policy, live project membership, the
project lock, and explicit permissions into concrete `project_ids` and
`write_project_ids`. The operation gateway uses those arrays as its read and
write fences. MCP resources use the same resolved scope.

Legacy call sessions re-resolve scope before listing or executing tools, so
project restrictions and membership revocations take effect without waiting for
a new session. A session is fenced to its dial-time project list only when the
agent asked for specific `project_ids` in `call.dial`; otherwise projects created
or granted mid-session are visible on the next call.

When a selected connector creates a project, BuildOS immediately adds the new
project to its in-memory scope, explicit permission rows, and the compatibility
allowlist. OAuth creation updates the OAuth grant itself, not only the shared
caller row.

An existing OAuth token may be narrowed from the connector settings. Increasing
its operation scope from read-only to read/write requires OAuth re-consent so an
old token can never silently acquire a broader capability. Project scope (mode
and explicit projects) may be widened in place by the signed-in owner; the
grant's read/write level is never changed by a project grant.

## Denials and one-click grants

A connector that is denied a project the user can see gets an actionable
denial instead of a dead end:

- `assertAccessibleProject` / `assertVisibleEntityProject` return `FORBIDDEN`
  with `details.reason = 'project_not_granted_to_connector'` and `project_id`.
  The project name is never included. A project the user cannot see still
  returns the old `Project is outside the allowed call scope` message.
- `list_onto_projects` and `search_onto_projects` add a count-only
  `connector_scope` note when user-visible projects are hidden from the
  connector.
- The web gateway adds `grant_url` to both, built from the request origin and
  caller id: `/profile/agent-keys/<callerId>/grant[?project=<projectId>]`.

The grant page is owner-only (session plus `external_agent_callers.user_id`),
refuses revoked connectors, and offers two actions:

- **Share just this project** adds explicit permission rows in place. The access
  level follows the key, or each active OAuth grant, and the mode is unchanged.
- **Share all my projects** switches the connector to `all_unrestricted` in
  place. It keeps the read/write level and allowed ops, and keeps only shared or
  restricted exceptions.

Both actions, and every Agent keys edit, write security events
(`agent.caller.project_access_granted`, `agent.caller.permissions_updated`).
Implementation: `caller-provisioning.service.ts` (`getProjectGrantContextForUser`,
`grantProjectsForUser`, `switchToAllProjectsForUser`) and
`apps/web/src/routes/profile/agent-keys/[callerId]/grant/`.

## Migration behavior

Existing connectors retain their previous meaning:

- null or missing legacy allowlist becomes `all_unrestricted`;
- an existing legacy array becomes `selected` and is backfilled into explicit
  permission rows;
- existing projects start as `standard` until an admin marks them restricted.

Existing selected connectors are never silently widened by the migration.

Known consequence (tasker 94, 2026-09-22): keys created before scope modes
existed could express "all projects" only as a full array, so the migration
froze them as `selected`, and projects created later were invisible to them.
The owner's 9 affected keys were switched to `all_unrestricted` with explicit
approval. The now-redundant permission rows were revoked (kept, with
`revoked_at` set), and the switch was logged as
`agent.caller.permissions_updated` with
`metadata.source = 'tasker94_owner_approved_prod_flip'`.

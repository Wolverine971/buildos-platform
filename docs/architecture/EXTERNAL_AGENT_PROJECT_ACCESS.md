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
  mirror during rollout. They are not an authorization fallback;
  `project_scope_mode` and active explicit permission rows are authoritative.

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

Legacy call sessions re-resolve and narrow their stored project fence before
listing or executing tools, so project restrictions and membership revocations
take effect without waiting for a new session.

When a selected connector creates a project, BuildOS immediately adds the new
project to its in-memory scope, explicit permission rows, and the compatibility
allowlist. OAuth creation updates the OAuth grant itself, not only the shared
caller row.

An existing OAuth token may be narrowed from the connector settings. Increasing
its operation scope from read-only to read/write requires OAuth re-consent so an
old token can never silently acquire a broader capability.

## Migration behavior

Existing connectors retain their previous meaning:

- null or missing legacy allowlist becomes `all_unrestricted`;
- an existing legacy array becomes `selected` and is backfilled into explicit
  permission rows;
- existing projects start as `standard` until an admin marks them restricted.

Existing selected connectors are never silently widened by the migration.

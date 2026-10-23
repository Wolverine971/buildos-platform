<!-- docs/specs/buildos-mcp-permission-requests-plan-2026-09-30.md -->

# BuildOS MCP permission requests implementation plan

Date: September 30, 2026. Revision: 2. Status: ready to begin implementation after independent adversarial review and second-pass approval. This document plans implementation; it does not authorize a production deployment or paid validation.

## Outcome and scope

A connected agent that can read a BuildOS record can submit a specific proposed edit for the user to review. BuildOS shows a durable notification and review page. The user can apply that change once, apply it and allow similar edits in that project going forward, or deny it. The agent can retrieve a durable execution receipt. Ongoing permissions are visible and revocable in connector settings.

The first release covers existing document and task edits through the general remote MCP integration and agent-key bridge. Implement documents first as the vertical slice, then tasks before completing the release. The search/fetch data profile stays read-only and directs users to the action-capable connection through setup guidance. This is an explicit surface limitation, not a permission error that approval can fix.

This plan supersedes open choices in the [research note](/Users/djwayne/buildos-platform/docs/research/buildos-mcp-permission-requests-2026-09-30.md). Scope is deliberately bounded so approval previews and execution can agree exactly.

| Capability      | Allowed fields and behavior                                                                                                                    | Excluded                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.edit` | Title, description, body; deterministic replace, append, exact-text edits, and section edits; existing content limits and deletion protections | State/type changes, archive/delete, props supplied by callers, moves/edges, publishing, `merge_llm`, overriding large-deletion protection, machine-managed Start Here documents |
| `task.edit`     | Title, description, workflow state, priority; server-generated completion timestamp follows state changes                                      | Archive/delete, schedule/calendar, assignment, relationships, moves, type changes, arbitrary props                                                                              |

These capabilities are versioned server-owned definitions, not free-text classifications or just aliases for an unrestricted update tool. Unknown fields fail validation. Later additions to the existing tool schemas do not automatically expand these grants. A request covers one entity and exactly one capability. “Always allow” authorizes that capability in that exact project, including future eligible entities in the project. The review explicitly lists its fields and exclusions.

Both owner-approved proposals and ordinary writes authorized by a new scoped grant use a bounded executor. They do not publish, send messages, notify mentions, call models, or modify external calendars. This includes title/completion edits of tasks already linked to calendars. Suppression is an executor effect policy, not merely omission of `calendar_sync`: the current gateway may implicitly sync those edits. Existing internal activity logging and derived indexes are preserved through idempotent post-commit work. Legacy tools retain their existing behavior only when their existing broad authorization independently permits the complete operation.

## User experience and identity

New MCP tools:

- `get_buildos_permissions`: effective access and supported request capabilities, optionally for a project. Returns structured denials without revealing inaccessible project details.
- `request_buildos_permission`: a discriminated document/task edit proposal, an optional agent-provided reason, and a required idempotency key. Connection identity and owner are derived from credentials. The server derives the requested capability and project from the target and validated fields.
- `get_buildos_permission_request`: status and a minimal receipt for a request belonging to this authenticated connection.

The request tool is listed before write access is granted. It creates approval state and is annotated `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: false`. Requesting approval is a documented control capability of a trusted connection; it does not confer data-write permission. Invalid/revoked/blocked credentials cannot request access. Users can disable requests for a connection.

Notifications say “Your [connection label] connection requests an edit” and link to `/profile/agent-keys/[callerId]/requests/[requestId]`. The page shows verified connection identity, project, exact before/after diff, requested ongoing capability, expiry, and agent-provided reason. Connection display names are registration metadata, not attestation of a particular model or chat. Explain that chats sharing the same credential share ongoing access.

Decisions are **Apply once**, **Apply and always allow [capability] in [project]**, and **Deny**. The second choice applies the displayed change and saves the ongoing grant in the same database transaction. For read-only OAuth credentials, its success page says the change was applied but future direct writes require reconnecting. Do not call ongoing access usable before that step completes.

A request list under the connector remains available if a notification delivery fails. Reading or dismissing a notification does not decide a request. In v1, use the existing notification bell/activity timeline plus this request list; do not add permission approvals to generic AI Inbox approve buttons. That avoids routing a sensitive decision through generic fallback status handlers.

Review links are ordinary owner-authenticated links, never bearer approval URLs. No GET action grants access. Approval accepts only request ID, reviewed digest, and decision; it never accepts replacement mutation arguments. Use the authenticated web session, CSRF/origin protections, and explicit owner checks. There is no agent-facing approval tool.

This guarantees that MCP credentials cannot approve themselves. It does not attest that a human physically clicked: an agent separately controlling an authenticated owner browser has that session's authority. The plugin must prohibit self-approval and browser workarounds. Human-presence verification such as WebAuthn would be a separate product feature, not an implicit guarantee of this release.

## Authorization model

Use a common server-side evaluator for all external-agent entrypoints. Preserve two separate concepts: the credential's immutable OAuth scope ceiling and the user's live BuildOS permission policy.

For an ordinary direct write, all of the following must hold:

1. The account and connection are active; the account is not being deleted; the resource audience and credential binding match.
2. An OAuth token includes `buildos.write`, or the caller is a valid agent-key principal whose live policy authorizes this write.
3. The connection has current read access to the target project, and the owner currently has write/admin membership. Public visibility does not count.
4. Either the existing legacy permission path allows the operation, or an active scoped grant matches this connection, project, versioned capability, and every supplied field.
5. The current record is eligible, unarchived, and still belongs to the authorized project.

Model scoped grants as tuples. Do not flatten them into the Cartesian product of global operations and project IDs. Authorization must check actual arguments and target project even if tool discovery exposes an operation because it is allowed somewhere.

Add a typed external authorization context alongside existing `AgentCallScope`, with credential ceiling, legacy base policy, scoped grants, principal boundary, and policy revision. `scope.mode`/`allowed_ops` alone cannot represent this feature. Old callers without this context retain legacy behavior; no new scoped grant can reach a legacy-only execution path that drops its restrictions. Canonical op normalization happens before checking a capability; aliases and `tools/call` versus gateway dispatch must agree. The evaluator returns a server-only execution disposition: independently authorized legacy operation, bounded scoped operation, or denial. A tool argument cannot select this disposition.

Bounded direct operations use the same strict normalization and transactional persistence/effect contract as approved proposals. A service-only `apply_scoped_edit` RPC receives the validated credential reference and normalized mutation, revalidates its live principal/capability at the write boundary, checks the expected project/head, and records a stable execution receipt. It never falls back to the unrestricted handler. Thread the existing execution idempotency key through this path; clients must provide a stable key for newly scoped mutation calls, including the bridge. Advertise that requirement in the exposed schema and reject missing keys on this new path. Replay checks occur before recomputing state-dependent edits. Broader legacy handlers need no blanket transactional rewrite.

The one-time owner decision is a separate authorization event. It may authorize the exact stored proposal even when the connector lacks write scope, but it must recheck owner membership, connector read access, connection status, target eligibility, and request expiry. It never fabricates a broad `read_write` context and sends it through arbitrary tools.

Granting access, making a connector read-only, revoking a project, revoking a connection, and disabling requests have the precise effects in the control table below. A narrowed or revoked grant cannot silently revive on a later reconnect. Check policy live on calls; cached discovery is never authorization. Grants are intentionally connection-wide: a newly owner-approved tuple can be used by existing write-capable credentials for that exact boundary. Existing read-only credentials never acquire `buildos.write` from that event. A new OAuth client/grant boundary receives no transfer based on matching labels; it requires its own approval.

## Proposal and execution contract

Create a shared pure proposal builder by extracting the supported normalization and deterministic document editing logic from the gateway. Load records under connector read access; do not weaken the existing `previewDocumentUpdate` write check globally just to create a proposal. It currently requires write access and needs a separate, explicitly read-authorized wrapper around shared pure computation.

Normalize aliases before rejecting unsupported fields. Store both normalized input and the final concrete mutation, including the exact resulting document body. Approval never reruns a model, reapplies an append against a newer head, or reanchors edits after the user reviewed them. Exclude `merge_llm` and managed Start Here documents for this release. Preserve content/body mirrors, document history, task completion semantics, and existing size/deletion guards.

The server computes a reviewed SHA-256 digest over a versioned canonical representation of principal boundary, project, target, capability, base version, and concrete mutation. The UI submits that stored digest when approving. Reject an empty/no-effect new proposal, but return an existing request on an exact retry even if its mutation is now a no-op. Display text comes from stored verified records; user/model prose is data and cannot modify scope. This reviewed digest is distinct from the stable submission fingerprint described below.

Use a new transactional database operation for owner decisions, with the lock order specified below. It rechecks all invariants; compares the reviewed head; writes the exact mutation and required document checkpoint; inserts the execution receipt/audit; optionally inserts the standing grant; and queues idempotent derived work. All authoritative changes commit together. If stale or unauthorized, neither mutation nor standing grant is created. Task completion time is an explicitly displayed server-derived field, evaluated from the transaction timestamp when entering done; reopening clears it. The reviewed mutation encodes that rule, never an agent-chosen execution timestamp.

The existing gateway is not an atomic approval primitive: document saves, versioning warnings, tree metadata, mentions, and activity calls span multiple writes, and append/edit retries may rebase. Reuse its pure normalization and extract the smallest shared persistence contract needed; do not call `commitChangeSet` unchanged or pretend its separate request receipt is transactional. Preserve the existing document write contract and represent mandatory versus deferred effects explicitly.

For stale detection, store and compare the exact source `updated_at` plus a canonical snapshot hash that includes source project, relevant fields, eligibility flags, and document body/props mirror. Recheck eligibility separately even if a field does not bump the timestamp. Do not use mutable document history numbers as the head version. A changed head requires a new review; never automatically rebase an approved append or text edit.

Every bounded document write creates a sealed checkpoint with execution/request ID, snapshot hash, and existing version metadata. Add an explicit checkpoint marker to the version contract. Shared versioning must skip sealed checkpoints when coalescing, and a database guard must reject snapshot rewrites of sealed rows; adapt the legacy versioner's race fallback to create a new version if a stale merge candidate became sealed. Merely passing `forceCreateVersion` once is insufficient. The receipt records checkpoint ID and hash. Checkpoint/head/receipt failure rolls back together. Normal project history follows its existing retention/deletion policy; the request-payload purge does not delete it.

Expose the decision RPC only to authenticated users, with an explicit `auth.uid()` owner check; external MCP bearer tokens are not Supabase user JWTs. Revoke public/anon execution and direct DML to authority tables. Any necessary `SECURITY DEFINER` helper uses a fixed search path and narrow explicit checks; service-only internal functions are not browser-accessible. The browser cannot submit arbitrary entity patches to the decision RPC.

Single-use means one committed mutation plus receipt. Concurrent approvals serialize. Repeating the same decision returns its receipt; a contradictory decision after finalization returns conflict. A network timeout has an unknown result: read request status and retry the same decision only as an idempotent operation. Never use a timeout as permission to run the original direct write.

### Locking and revocation ordering

Reuse `onto_lock_project_for_write` and `onto_lock_projects_for_write` from the existing project lock-first migrations. New bounded writes must acquire project locks before entity/context writes. The detailed order is: feature-control row in share mode, account row in share mode, affected projects in ascending ID order, principal/grant policy guard, membership/explicit-read-permission rows, request or execution row, then target and version rows. Reload/check the immutable identity fields after locks; never authorize from an unlocked preflight result alone.

Decision, bounded direct-write, project-access change, and project-scoped revoke paths use this order. Whole-connection revocation/epoch changes may lock account/principal without projects only if they never acquire project/entity locks afterward. Token exchange locks account/principal and credential-family/code rows, with no project writes. A feature kill-switch transaction only updates its control row/epoch; cleanup runs separately. Locks protecting live authorization are held through mutation commit, so a revoke that commits first blocks the write; a write that acquired and retained valid authority first may finish before revocation completes. This is the promised linearization boundary, not cancellation of an already committed edit.

Lock every existing membership/read-grant row on which authorization positively depends. No matching row means deny; do not authorize through the absence of a row. Owner access is anchored in the locked account/project ownership records, and inherited all-unrestricted policy is anchored in locked principal/project flags. Scoped capabilities do not inherit into child projects. Audit member removal/downgrade/leave and project external-access mutation routes during P2; bring authority-changing writers into the project-first ordering where needed, including their account-deletion interactions. Existing project moves must take both project locks before the target lock. Concurrency probes with those actual writers, not just two approval RPCs, are P2 exit criteria. This is a targeted authorization/locking integration, not a rewrite of unrelated membership features.

## Persistence and state

Add `external_agent_permission_requests` with:

- Owner user ID; external caller ID; auth kind; exact OAuth grant/client/resource identity where relevant; policy revision at creation.
- Project ID, entity kind/ID, capability key/version, normalized input, concrete mutation, before snapshot/base version, reviewed digest, agent reason.
- Request status, expiry, immutable decision actor/time/mode, receipt fields, idempotency key, stable submission fingerprint, base-bound proposal fingerprint, feature epoch, and notification linkage.

Add `external_agent_capability_grants` keyed by owner + principal boundary + project + capability version. Store active/revoked state, source request, approver/time, policy revision, and feature epoch. Do not apply an OAuth grant to every grant sharing the same caller row. Agent keys are scoped to their caller identity. Foreign keys/constraints enforce tenant and principal consistency, not merely individually valid UUIDs. Add a persisted feature-control row with enabled flag and monotonically increasing epoch; bind all new requests/grants to its current epoch.

Requests expire after 24 hours. Grants remain until revoked; they are not “forever” promises. Payloads and before snapshots are retained for 30 days after terminal state, then removed; retain minimal decisions and receipts without document contents for audit. Account deletion must remove these rows through the existing deletion lifecycle. Dates are policy defaults, not protocol requirements.

| Request state | Permitted transition or meaning                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `pending`     | Owner decides, expiry elapses, eligibility is revoked, or target becomes stale at decision time |
| `applied`     | Mutation and receipt committed; includes decision mode and optional standing grant ID           |
| `denied`      | Explicit rejection; terminal                                                                    |
| `expired`     | Deadline passed; terminal                                                                       |
| `stale`       | Reviewed base no longer matches; terminal; user reviews a new proposal                          |
| `canceled`    | Connection/project/request capability revoked; terminal                                         |

Transient database failures leave the request pending and report retryable failure, unless the commit outcome is unknown; then status is authoritative. No long-lived `executing` state or mutation worker is needed for these bounded internal transactions. Standing-grant usability is a separate derived state: active and usable, active but credential upgrade required, or revoked. This prevents conflating “the one-time edit succeeded” with “the client has a new token.”

Enforce uniqueness for principal boundary + idempotency key. After authenticating and canonicalizing the submitted schema, look up that key before loading/rebuilding a proposal. The stable submission fingerprint hashes the principal boundary and normalized submitted mutation/capability version, independent of current entity state. Exclude optional reason text from equality; an exact retry retains the original reason. Same key/same submission returns the original request/status/receipt subject to current redaction; same key/different submission returns conflict. Keep this minimal fingerprint after payload purge. No-op validation occurs only for genuinely new submissions.

Separately, compute a base-bound proposal fingerprint to collapse identical pending proposals across new keys. Denied or revoked proposal fingerprints have a 24-hour re-request cooldown; owner UI can explicitly restart. Initial defaults: 10 pending per connection, 30 requests/hour per connection, 100/hour per owner, maximum request envelope 256 KiB and existing per-field limits. Enforce centrally and atomically, not in an instance-local map. Exact retries and status reads do not create new notifications or consume creation quotas. Apply the same stable-input-versus-reviewed-state distinction to bounded direct-write execution keys.

Requests/status responses do not disclose stored before/after content to a connection after it loses target read access. Return a minimal unavailable/canceled state when safe; invalid credentials receive the ordinary auth error. Owner review also requires current membership to view content.

## OAuth upgrade and transport behavior

First reproduce the refresh-scope issue from the research note with a mocked test. Refresh issuance must use the presented refresh credential's original scopes intersected with live authorization, and honor a requested narrower scope. A rotated token retains or narrows that ceiling. Authorization-code exchange must likewise honor the code's consent snapshot rather than whatever a shared grant later became. Expanding access creates credentials through a new authorization-code flow; refresh is not step-up. The snapshot records the credential scopes and reviewed retained/additional policy, not a promise of isolated per-token project permissions.

Replace separate consume/insert steps with one service-only consume-and-issue transaction for each credential flow. Generate secrets in trusted server memory, validate client/resource/PKCE, and pass hashes to the transaction. Under the principal/family/code locks, recheck expiry, unused status, account/connection status, consent revision, resource, and allowed scope ceiling; consume the presented credential and insert access/refresh records atomically. Return secrets only after confirmed commit. A rollback leaves no partial token pair. If commit succeeded but the response was lost, do not reconstruct tokens from hashes or expand retry permissions: require fresh authorization; refresh-token reuse retains the existing fail-closed reuse response. Test that token insert failure cannot burn a code/refresh token while leaving a partial access token.

Separate live base policy from OAuth credential authorization. A new `buildos.write` token may authorize use of a narrow scoped grant without making the legacy base policy `read_write`. Central evaluation intersects the credential with the union of explicit base grants and scoped grants. Update authentication, discovery, caller settings, project grants, gateway execution, refresh issuance, revocation, and agent-call negotiation together so old scalar scope helpers cannot broaden or suppress this policy accidentally.

Choose connection-wide retained-access semantics. Reauthorization for an approved request adds only the displayed capability tuples and never widens the legacy base policy through `allowedOpsForScopes` or all-project defaults. Consent shows two complete sections: **Access this connection retains** and **Additional access you approved**. Do not describe the resulting token/connection as restricted solely to the new tuple when broader legacy access remains. Narrowing existing broad access requires the explicit settings action first; a new per-token policy dialect is out of scope.

Load approved standing grants matching signed-in owner, OAuth client, resource, and exact connection boundary. Bind the displayed policy snapshot and credential scopes to the authorization code; a stale code cannot approve a later broader base policy or mint broader scopes. Live, separately user-approved tuples may still become usable by existing write tokens for the same boundary, by design. Multiple additions are displayed explicitly; no implicit selection by an agent-provided name or URL. A normal broad reconnect is a separate explicit consent choice. If a client re-registers with a new client/grant identity, it must obtain approval for that new connection instead of inheriting old grants.

If current effective access already authorizes the entire submitted operation, return `already_allowed` with no request or notification; let the agent use the normal write path. If it is authorized by an existing scoped grant, the bounded executor still applies. Retries with an existing request key always return the original request first, even after access was later broadened.

An owner approval records standing permission; only the MCP client's normal OAuth flow supplies PKCE/state and receives credentials. Do not ask an LLM to mint state or return tokens through tools. The status response can say `reauthorization_required` and identify `buildos.write`; it does not claim the client has reconnected.

Add a stable `authorize_buildos_writes` control tool, callable/listed on the general profile before mutation access. It performs no project mutation. If this authenticated principal has an approved active scoped grant but its OAuth credential lacks write scope, return the standard challenge. If no approved grant exists, return a structured request-required result. Agent-key callers receive effective status without an OAuth challenge. This avoids depending on an unavailable write tool to trigger step-up. The tool is not an approval endpoint.

Generic HTTP clients receive operation-specific HTTP 403 `insufficient_scope`; OpenAI receives the documented auth metadata and tool error adapter. Challenge only recoverable missing credential scope. Blocked/revoked connections, missing membership, unsupported profiles, and absent BuildOS grants do not trigger upgrade loops. Support both the legacy handler and MCP 2026-07-28 SDK path with transport-level tests.

Use explicit `tools/list` refresh after credential replacement, preserving existing profile boundaries. Do not advertise `listChanged: true` until an actual compatible delivery path exists. Keep request/status/authorization tools stable to survive stale discovery caches. For clients that cannot refresh mid-chat, return actionable reconnect/restart instructions. The stdio bridge forwards structured status; agent-key grants take effect server-side. Manually supplied OAuth tokens in the bridge require user-managed replacement; do not add secret handling to the agent's tool inputs.

No automatic chat wakeup is promised. While active, the agent can check status with bounded backoff; after a turn ends, the user may need to continue the chat. The BuildOS notification and approval do not override client-side tool confirmation or workspace policy.

## Notification and settings integration

Create request plus in-app notification event/delivery/user-notification rows atomically, with uniqueness by request/event/channel. Reuse the existing payload contract, but do not call the current multi-insert helper and assume transactional success. If delivery is moved to an outbox, request+outbox insertion is atomic and the retry consumer must be deduplicated; pick one implementation per release. Default for v1 is the atomic in-app insert, with no push/email/SMS fan-out.

Add the permission event types to both TypeScript and all effective database check constraints. Activity entries deep-link to the review page and show pending/decided state from the request. Use the generic notification component until a specialized layout earns its complexity. Request lists use keyset pagination and indexed owner/principal/status queries.

Settings show separate legacy permissions and new scoped grants, with a precise read-only action that revokes both. Existing broad access is not silently narrowed or expanded by this feature. If broad access already subsumes the proposed standing grant, show it and avoid claiming that removing a redundant narrow grant would remove all access. Audit decisions, direct writes using scoped grants, reauthorization, and revocation with request/grant IDs; never log document payloads or raw credentials.

| Control                              | New requests                            | Pending requests                 | Standing and legacy access                                                      |
| ------------------------------------ | --------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| Disable requests for this connection | Rejected until re-enabled               | Canceled                         | Existing standing and legacy permissions remain; the label says this explicitly |
| Make connection read-only            | Allowed only if requests remain enabled | Canceled                         | Revoke all standing write grants and narrow legacy writes; read access retained |
| Remove one scoped grant              | Requests allowed subject to cooldown    | Cancel matching proposals        | Revoke that tuple; clearly disclose any independent legacy authorization        |
| Remove project access                | Rejected for that project               | Cancel that project's requests   | Revoke its tuples and read/write access through the unified project policy      |
| Disconnect or block connection       | Rejected                                | Canceled                         | Revoke credentials/standing authority; no automatic restoration on reconnect    |
| Disable feature globally             | Rejected                                | Effectively canceled immediately | New scoped grants immediately invalid; legacy access unchanged                  |

Global disablement atomically sets enabled=false and increments the persisted feature epoch. All evaluators, decision/creation RPCs, and bounded-write RPCs check it. Old-epoch requests/rules remain permanently invalid on re-enable; new consent is required. UI/status derives effective canceled/revoked state from epoch immediately, while an idempotent cleanup materializes row states later. No mass cleanup must finish for the kill switch to work. Re-enabling request submission alone also does not reopen canceled requests.

## Work packages and dependencies

| Package                             | Concrete work                                                                                                                                                                                                         | Exit condition                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 contracts and UI prototype       | Shared strict schemas/capability registry; notification, diff review, pending/applied/denied/stale/reconnect states behind a disabled flag                                                                            | Inspectable UI fixture covers all decisions and clearly shows connection/project/fields; no real grants                                        |
| P1 credential boundaries            | Regression tests and fixes for access/refresh/code scope ceilings and atomic consume-and-issue; new typed effective authorization evaluator and policy revision contract                                              | Old credentials cannot gain scope; partial issuance rolls back; legacy permission behavior unchanged; scoped grants remain project/field-bound |
| P2 persistence and transactions     | New request/grant schema, RLS/grants/indexes/epoch, atomic creation/decision/revoke and bounded-direct primitives, retention/deletion wiring, sealed document checkpoints, targeted membership/lock-order integration | Database probes prove isolation, ordering with actual move/member/revoke writers, rollback, and durable receipts; migrations rehearse cleanly  |
| P3 request tools and once flow      | Read-authorized proposal builder, general-profile control tools, request/status service, owner route, atomic in-app notification, request list                                                                        | Read-only connector proposes a document then a task edit; user applies once; repeat calls return receipt                                       |
| P4 standing grants and OAuth        | Settings/effect table, retained-access re-consent/code snapshot, authorization control tool, live project/operation/field evaluation and bounded dispatch at every external write entrypoint                          | Always-allow applies once; future scoped writes preserve effect restrictions; revocation ordering and honest retained-access UI are proven     |
| P5 client compatibility and rollout | Legacy/modern transport adapters, bridge tests, refreshed plugin skill/setup docs, manual client matrix, feature flag and rollback checks                                                                             | Supported-client behavior documented from evidence; all required offline and rehearsal checks pass                                             |

P0 can begin before database work. P1 and the policy design precede any real permission mutations. P2 precedes P3. P3 and P4 must both pass before external rollout; P5 closes the release. Keep implementation PRs small enough to review, with separate credential-hardening and feature migrations. Do not deploy a half-wired settings revocation path.

Expected edit locations:

- New contracts in `packages/shared-types/src/agent-permission.types.ts`; new capability policy/proposal modules in `packages/shared-agent-ops/src/permissions/`.
- Existing shared gateway core/tasks/policy/types, document write/versioning helpers, and external-agent dispatcher; scope refactors limited to external authorization.
- Targeted authority-change routes for project member downgrade/remove/leave and project external-access settings, plus account-deletion integration, where required by the lock-order proof.
- New permission service under `apps/web/src/lib/server/agent-call/`; existing OAuth, caller provisioning, project access, MCP connector, and agent-call service.
- New request list/review routes below `apps/web/src/routes/profile/agent-keys/[callerId]/`; existing connector settings and OAuth consent UI; shared notification event types and activity adapters.
- New migration(s) via `supabase migration new`; corresponding SQL checks and updated generated/shared database types.
- `packages/buildos-mcp-server/src/client.ts` as needed for structured fallback; `plugins/buildos/skills/buildos-context/SKILL.md` and plugin/setup docs.

Repository paths in this section describe planned edits, including files that do not exist yet. Reuse actual component conventions when implementing. Load Svelte skills before editing Svelte and follow the web AGENTS requirement to run the web check afterward.

## Acceptance tests and release gates

Use free mocks and local database/rehearsal fixtures. Each row is a behavior to prove, not a claim that tests have run.

| Area                  | Required cases                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principal isolation   | Cross-owner request ID; wrong OAuth grant sharing a caller; wrong audience; forged identity arguments; blocked caller; deleted account; read-only project member                                                                                                                                                                 |
| Proposal admission    | Unreadable target; unsupported field; aliases; oversized envelope; no-op; model merge; archive/publish/props escalation; managed document; archived record                                                                                                                                                                       |
| Review integrity      | Tampered digest; injected replacement patch; changed document/task; entity moved projects; membership/read grant revoked after preview; GET and forged-origin decision attempts                                                                                                                                                  |
| Atomic once behavior  | Double-click, parallel approvals, conflicting decisions, timeout after commit, crash before commit, version write failure, replayed append, unique receipt and notification; same-key retry after target changes/no-op/payload purge                                                                                             |
| Ongoing policy        | Document grant A does not permit task edits A or document edits B; title grant cannot archive; future schema fields rejected; inherited child projects excluded; scheduled-task title/completion edits do not sync calendars; document/task mentions send nothing; correct bounded-handler selection                             |
| Credential boundaries | Old read access token and refresh family after later re-consent; stale auth code after broader consent; narrower refresh; wrong client/resource; revocation during exchange; atomic token-pair insertion failure; OAuth scope alone without scoped policy; retained broad-access consent; no transfer across new client identity |
| Revocation            | Every control-table row; concurrent project move/member downgrade/leave and direct scoped write; no stale-cache authorization; global disable/re-enable while cleanup is incomplete; no canceled request revival                                                                                                                 |
| Versioning            | Same-actor edit immediately after approval preserves sealed checkpoint; stale coalescing candidate retries as new version; checkpoint hash matches receipt; request purge leaves normal project history intact                                                                                                                   |
| Delivery and data     | Notification receipt consistency; read state independent of decision; request list survives rendering failure; payload retention; account deletion; status redaction after losing access                                                                                                                                         |
| Transport and clients | Both MCP protocol handlers; generic HTTP and OpenAI challenges; data profile read-only; request tool always discoverable on eligible general profile; bridge forwarding; bounded retry and manual continuation                                                                                                                   |

Run focused suites sequentially using `pnpm --filter <pkg> exec vitest run <specific files>` through the repository's test gate and worker limits. Do not run broad suites merely because this spans packages. After Svelte changes, run `pnpm --filter @buildos/web check`. Rehearse each migration against production's schema with `pnpm db:rehearse <file>`, include role probes, and resolve SECURITY and standing-check findings. Production application is a separate authorized release step, one migration at a time with history repair as required by AGENTS.

Manual compatibility targets: Codex remote OAuth, ChatGPT/OpenAI action-capable integration, and stdio agent-key bridge. Use a test account and sacrificial project; distinguish protocol-only tests from a paid model-driven conversation. Any paid test needs explicit approval for that run, its acting model, and a model-specific estimate when available. Until approved/run, mark that evidence pending. Automatic continuation is optional; the supported fallback must work.

Feature flags default off. The persisted kill switch and epoch behave as specified above; status/settings remain available for review and revocation. Rollback is additive: keep tables and receipts, disable the feature, do not remove the credential-hardening fix. Check schema dependencies before rolling code back. A deployment flag alone must not bypass the persisted epoch invalidation on a production rollback.

The plan is ready for implementation when the adversarial review has no unresolved blocking design findings. The feature is ready to release only after these acceptance gates pass. Plan approval is not evidence of implementation correctness or production readiness.

## Adversarial review record

Independent review: [adversarial review and evidence](/Users/djwayne/buildos-platform/docs/technical/reviews/BUILDOS_MCP_PERMISSION_PLAN_REVIEW_2026-09-30.md). First pass found no P0, three P1 gaps, and three P2 clarifications. Revision 2 addresses all six. The independent reviewer reread the revised contracts and returned **ready to begin implementation**, with no unresolved blocking design findings.

| Finding                                  | Revision 2 resolution                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 scoped direct-write effects and races | Bounded executor and transactional policy/target checks now cover ongoing writes as well as owner approvals; explicit suppression of calendar/mentions/model/publishing; race tests |
| R2 OAuth retained-access ambiguity       | Connection-wide permissions, explicit retained/additional access UI, no broadening of base policy, intentional same-boundary tuple use, no cross-boundary transfer                  |
| R3 mutable-state idempotency             | Stable submission fingerprint and key lookup before proposal computation; separate reviewed/base fingerprints; replay and purge tests                                               |
| R4 mutable version receipt               | Sealed checkpoints with database protection and coalescing fallback; exact head/hash checks; ordinary history retention preserved                                                   |
| R5 lock order and revocation             | Existing project-first helpers, concrete relative order, shared authority-change integration, defined commit ordering, real concurrency probes                                      |
| R6 disablement and token issuance        | Control effect table, persisted non-resurrecting epoch, transactional consume-and-issue and explicit lost-response behavior                                                         |

Additional precision: MCP approval isolation does not claim human attestation for a separately controlled owner browser; completion timestamps are declared server-derived fields; scoped direct writes require stable execution keys.

Readiness evidence is document/code inspection and two independent review passes. No feature implementation, tests, migration rehearsals, paid client conversations, or production changes were performed in this planning task. The next work package is P0, followed by P1 before any real permission mutations. Remaining implementation watchpoints are lock-order integration with actual authority-changing writers, correct bounded-versus-legacy dispatch, and sealed-version compatibility; they are captured in the required tests and package exit criteria.

## Implementation follow-through

Implementation and final adversarial findings are recorded in [the implementation record](/Users/djwayne/buildos-platform/docs/technical/reviews/BUILDOS_MCP_PERMISSION_IMPLEMENTATION_2026-09-30.md). The feature is implemented and disabled; actual task-mover compatibility and live client acceptance remain release gates. No production change or paid test was made.

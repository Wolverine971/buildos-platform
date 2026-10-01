<!-- docs/technical/reviews/BUILDOS_MCP_PERMISSION_IMPLEMENTATION_2026-09-30.md -->

# BuildOS MCP permission requests — implementation record

**Schema applied and code deployed; feature disabled.** No paid test ran. The remaining release gates are actual task-mover compatibility and live client acceptance.

> **Rollout status (2026-10-01 03:40Z).** Web/worker code shipped in `39886266d` (deployed 2026-09-30 20:56Z) before its schema, which broke OAuth code/refresh exchange (`exchange_agent_oauth_credential` missing), guarded member role/removal, the activity timeline's request rows and the worker's permission retention step. Both migrations were then rehearsed against production (passed; the 3 SECURITY findings are the intended `auth.uid()`-checked definers) and applied one at a time, recorded as `20260930185120` and `20260930185213`. Verified: `agent_permission_feature.enabled = false`; exchange fails closed on an unknown credential; the 9 unused refresh tokens issued before the gap are still live, so connections resume without reconnecting. Steps 1–2 below are done. `20260930170110` (the Organize mover) is now applied too, so the task-mover gate in step 3 should be rerun against it.

## Delivered behavior

A read-authorized agent submits an exact document or task edit with `request_buildos_permission`. BuildOS atomically records the proposal and an in-app notification. The owner reviews the stored diff and chooses:

- **Allow once:** apply this edit once and return a durable receipt; token permissions remain unchanged.
- **Always allow:** apply the edit and grant this connection the stated capability in this exact project, including future eligible records.
- **Deny:** preserve the target and put matching proposals in cooldown.

Owners can disable requests, remove a scoped grant, or make the connection read-only. Notification read state is independent of the decision; the activity timeline links to current request status. Review, request history/settings and retained-access OAuth consent pages are implemented.

Documents support title, description and deterministic body edits. Tasks support title, description, state and priority. Bounded handlers exclude archive/delete, moves, publishing, calendar synchronization, mentions/messages, model calls and arbitrary properties. Completion time is server-derived and disclosed in review.

The [offline interactive preview](../../specs/fixtures/buildos-permissions-preview.html) uses sample data. Once, always and deny controls were exercised in the browser. This demonstrates the review contract, not a live authenticated BuildOS session.

## Integrity and authorization

Rules bind caller + OAuth grant when applicable + project + capability + epoch. Independently granted legacy access retains its existing handler and broader schema. Scoped retries resolve before target recomputation, even after payload purge. Owner decisions compare the reviewed digest and full target snapshot. A changed or moved target requires another review.

The database rechecks live account, connection, project, membership, explicit project access and credential authority under locks. Mutation, sealed document version, receipt, optional grant, internal activity and maintenance work commit together. Concurrent approvals produce one write/checkpoint. Sealed checkpoints cannot be rewritten by the ordinary version coalescer.

OAuth scopes are immutable credential ceilings. Reconnection preserves and displays base permissions plus separately approved tuples. Authorization codes bind the base-policy snapshot, and scoped consent also binds the epoch. Code consumption, refresh rotation and token-pair issuance are atomic. Reused refresh credentials revoke the family/grant/caller inside that transaction; the audit runs after a committed reuse result. Ordinary expiration does not revoke a family.

Recognized revoked OAuth credentials return `401 invalid_token`, cannot fall back to a static key and cannot prompt for a write upgrade. Approved scoped writes lacking a write token receive HTTP `403 insufficient_scope`; `?auth_errors=tool` enables the OpenAI tool-result metadata adapter. Both MCP protocol handlers are covered. `chatgpt_data_app` remains search/fetch only.

Host-side approvals, cached tool lists, installed app action capabilities and continuation after reconnect remain client responsibilities. BuildOS cannot expand those permissions. Plugin guidance prohibits self-approval through an owner browser and supports manual continuation.

## Validation

These are focused final results across several runs, not a whole-repository suite. Heavy final commands ran through the test gate.

| Check                                                                         | Evidence                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared proposal and document version suites                                   | 25 passed                                                                                                                                                                                                                                                                          |
| Web permission/session/gateway/MCP/OAuth/refresh/activity/member-route suites | 178 passed across focused runs                                                                                                                                                                                                                                                     |
| Worker retention suite                                                        | 11 passed                                                                                                                                                                                                                                                                          |
| Shared types and shared agent operations builds                               | Passed                                                                                                                                                                                                                                                                             |
| Web Svelte check after final web changes                                      | 0 errors, 0 warnings                                                                                                                                                                                                                                                               |
| Svelte autofixer, four changed components                                     | No issues/suggestions                                                                                                                                                                                                                                                              |
| Both migrations, cached production schema and role probe                      | Passed                                                                                                                                                                                                                                                                             |
| Permission SQL assertions                                                     | Owner isolation, flag off, atomic notification, dedupe/alias conflict, null/tampered digest, rollback on checkpoint failure, repeated/conflicting decisions, sealed history, task completion, project/capability limits, staleness, retries after purge, controls and epoch passed |
| OAuth SQL assertions                                                          | Pair rollback, PKCE/null rejection, scope ceiling, narrowing, ordinary expiry, stale consent, killed epoch and expired-token reuse revocation passed                                                                                                                               |
| Standing archived-scope SQL checks                                            | Passed                                                                                                                                                                                                                                                                             |
| Concurrent proposals and decisions                                            | Three requests dedupe; two approvals create one checkpoint                                                                                                                                                                                                                         |
| Actual member remove/downgrade/self-leave and caller revoke races             | Scoped writes denied without deadlock; RLS hides revoked-project proposal payloads                                                                                                                                                                                                 |
| Equivalent project-first row-move race                                        | Approval becomes stale without editing the moved target                                                                                                                                                                                                                            |
| Actual deployed task-mover race                                               | **Blocked**, below                                                                                                                                                                                                                                                                 |
| Live Codex OAuth, action-capable ChatGPT and stdio acceptance                 | **Not run**; protocol/service tests are not substitutes                                                                                                                                                                                                                            |

The production schema cache was captured at `2026-09-30T17:24:19Z`. Rehearsal wrote only to disposable local PostgreSQL. Role probes showed one pre-existing anonymous read failure before and after, and zero authenticated failures.

Three printed SECURITY findings were reviewed and resolved by design: the deliberately authenticated `SECURITY DEFINER` RPCs are `decide_agent_permission_request` (checks owner and immutable digest/decision), `control_agent_permissions` (checks connection owner; never adds a capability), and `update_project_membership_guarded` (project admin or self-leave, owner protected, project-first locks). Each uses an empty fixed search path, qualified objects and revoked anonymous execution. Cross-owner/anonymous behavior and guarded member routes are tested. Token minting and bounded writes remain service-only. Authenticated feature-status reads expose only enabled/epoch.

## Adversarial review

The independent reviewer made no implementation edits and ran no tests. Iterative findings drove fixes for lock inversion, project-read RLS, retry redaction/epoch state, quotas, owned-project semantics, alias keys, null approval arguments, existing-session policy clamping, consent snapshots, read-only controls, legacy dispatch, terminal revoked-token responses, null PKCE and atomic refresh reuse.

Final static verdict: **no unresolved implementation blocker found**. The reviewer explicitly kept actual task-mover compatibility as a release gate; this is not a production-readiness claim.

## Release gate: existing task mover

Cached production `onto_task_move_atomic` references removed `onto_tasks.plan_id` and errors with `42703` before completing a move. The probe reports BLOCKED, then checks an equivalent project-first row move. That fallback proves stale-snapshot protection only.

The separately pending `20260930170110_organize_atomic_moves_and_journal.sql` replaces the old mover. It belongs to another change in this checkout and was not modified or applied here. Before enabling permission requests, deploy a reviewed repair and rerun the actual writer probe without its BLOCKED message.

## Rollout and rollback

1. Review/land the change. Rehearse against the then-current schema; apply `20260930185120_agent_oauth_atomic_scope_ceiling.sql`, then `20260930185213_agent_permission_requests.sql`, one file at a time, recording each applied version under the repository migration procedure. Never replay unrelated pending migrations or use `db push --include-all`.
2. Deploy compatible web/worker code after the schema. Keep the feature disabled. Publish the updated plugin guidance through its normal release process. Existing credentials stay bounded; consent that changed while a code was outstanding must be retried.
3. Repair the actual task mover and rerun `scripts/migration-rehearsal/agent-permission-concurrency-probe.mjs` against a fresh disposable rehearsal. The command accepts local cluster paths only, never a database URL.
4. In the approved acceptance environment, use a sacrificial project to verify Codex OAuth, an action-capable OpenAI integration and stdio: discovery, proposal, notification, once/always/deny, reconnect, manual resume, replay and revoke. A data-only app cannot become action-capable through BuildOS consent alone. Paid model runs require separate per-run approval.
5. Following release approval, enable through service-only `set_agent_permission_feature(true)`. Monitor request decisions, OAuth errors, failed writes and maintenance lag without logging proposal bodies.

Rollback through `set_agent_permission_feature(false)`: it increments the epoch and immediately invalidates feature authority. Old requests/rules never revive on re-enable. Preserve tables, receipts and credential hardening. Do not update the enabled boolean directly or confuse global disablement with the separate request-submission control, which preserves existing grants.

Proposal payloads expire 30 days after terminal status; durable minimal receipts/hashes remain with the connection. Account deletion cascades to the new stores, and deletion-requested accounts fail authentication/approval immediately. See [DATA_INVENTORY](../../privacy/DATA_INVENTORY.md) and [CLAIMS](../../privacy/CLAIMS.md).

No deployment, feature enablement, plugin publication, live browser consent or paid test was performed in this implementation task.

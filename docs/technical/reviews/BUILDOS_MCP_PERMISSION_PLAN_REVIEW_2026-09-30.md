<!-- docs/technical/reviews/BUILDOS_MCP_PERMISSION_PLAN_REVIEW_2026-09-30.md -->

# BuildOS MCP permission plan — independent adversarial review

Reviewed: September 30, 2026. **Final verdict after revision 2: ready to begin implementation.** No unresolved P0/P1 findings or blocking design ambiguities remain. The first pass found three P1 design gaps and three P2 clarifications; all six are resolved in the revised plan. This is a plan review, not an implementation or production security certification. No tests, live mutations, or paid calls were run.

Reviewed the implementation plan, its research note, OAuth issuance/authentication and provisioning, project scope resolution, document/task gateway writes, document versioning, notification persistence, and applicable schema/lock-order migrations. Line references below describe the code present at review time; other sessions have unrelated changes in this checkout.

The draft correctly rejects broad temporary write access, binds approval to concrete stored mutations, separates OAuth scope from live policy, preserves the search/fetch profile, identifies client continuation limitations, and requires transactional receipts. Those decisions should remain.

## First-pass findings (resolved in revision 2)

### R1 — P1: scoped direct writes need their own bounded execution contract

The plan gives the owner decision an atomic executor, but describes ongoing writes primarily as a new authorization evaluator around existing entrypoints. It only promises suppressed external effects for the **proposal path**. That leaves a grant for `task.edit` capable of reaching code whose allowed title/state edits sync calendar events, despite the capability excluding calendar behavior. The current task normalizer defaults missing `calendar_sync` to `auto`; `syncUpdatedTaskSideEffects` syncs on title edits or completion and then emits mentions. Document edits also emit mentions. Rejecting unsupported input fields cannot prevent these implicit effects.

There is a second authorization race in the same route: the ordinary scalar task save updates by task ID only, after project/read/write checks occurred in separate reads. A task moved to another project or revoked while that request is running can still be mutated. The new proposal executor handles such races, but the proposed ongoing path is not explicitly required to use it or an equivalent guard.

Evidence:

- [Task write by ID followed by side effects](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.ts:769).
- [Title/completion calendar synchronization and mention processing](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/gateway/op-execution-gateway.activity.ts:174).
- [Missing calendar option defaults to auto](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/gateway/op-execution-gateway.normalization.ts:321).
- [Document mention notifications](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts:1212).

**Required plan amendment:** Route every write authorized solely by a new scoped grant through the same strict capability normalization and bounded persistence/effect policy as an approved proposal. Explicitly suppress calendar/mention/model/publishing effects for both paths. Preserve broad legacy behavior only when the legacy path independently authorizes the operation. State the mutation/revocation linearization point and require target-project, archive/deletion, membership, and current-policy checks at that write boundary. A scoped operation must never fall back to an unrestricted handler merely because its tool name is allowed. Add focused future tests for scheduled-task title/completion changes, mentions, a task moved between check and write, and revocation racing a scoped write.

### R2 — P1: scoped OAuth re-consent promises conflict with retained broad legacy access

The draft offers a scoped authorization choice that preserves the exact policy, retains existing broad legacy grants, and evaluates a write token against the union of legacy and new scoped grants. Consider a boundary that already has broad legacy access: a newly minted token advertised as scoped to document edits in project A still passes the legacy branch for every existing broad permission. A scope-string-only token ceiling does not distinguish the two choices. Binding a policy snapshot to the authorization code alone also does not establish how that choice survives issuance and refresh.

Evidence: [OAuth re-consent updates the existing active grant](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:788); [access authentication currently has only an immutable scope string plus live grant policy](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:1411); [token tables contain scope but no authorization-policy discriminator](/Users/djwayne/buildos-platform/supabase/migrations/20260513000001_agent_oauth_remote_mcp.sql:66).

**Required plan amendment:** Choose one explicit product/security rule. The smaller solution is connection-wide permissions: scoped re-consent does not narrow existing access, the consent page displays **all retained effective access**, and it must not promise a token is limited to the selected new tuple. Its code snapshot records that reviewed policy and cannot expand legacy policy during issuance. A newly approved tuple may intentionally benefit existing write-capable credentials in the exact same boundary. If truly narrow token families are desired instead, specify an immutable authorization-policy ceiling/discriminator on code, access token, and refresh family and intersect it in every evaluator. Either choice must say that a new client/grant boundary never inherits old scoped grants automatically. Add a broad-existing-boundary consent test and a stale-code/concurrent-consent test for the chosen semantics.

### R3 — P1: request idempotency currently depends on mutable target state

The reviewed digest contains the base version and computed mutation, while the request deduplication rule says same key/same digest returns the existing request. An exact retry of `append "X"` after owner approval recomputes against the now-updated document and produces a different digest; a retried replace may instead fail the no-op check. Both defeat the promised recovery behavior if the original creation response was lost. The draft does not specify lookup-before-recompute or a stable input fingerprint.

**Required plan amendment:** Define a canonical submission fingerprint independent of current entity state, derived from authenticated principal boundary plus normalized submitted input (with a clear rule for optional reason text). After authentication, look up `(principal boundary, idempotency key)` before loading/rebuilding a new proposal. An exact retry returns the original request/status/receipt subject to current read-redaction rules; conflicting input returns conflict. Use a separate reviewed digest for the UI and a separate base-bound proposal fingerprint for cross-key pending dedupe. Preserve the minimal submission fingerprint through payload retention. Add future tests for response loss, exact retry after approval, changed target before retry, no-op retry, and retry after payload purge.

## Actionable P2 design clarifications

### R4 — P2: seal approval versions; forcing creation once is insufficient

The plan requires a document version and durable receipt but does not define whether that version can subsequently absorb another edit. Current versioning merges the newest same-actor version for 60 minutes unless it is a restore checkpoint. `forceCreateVersion` only changes the current call; later ordinary edits can overwrite the new version's snapshot. After the request payload expires, a receipt pointing to that mutable version would not prove what was approved.

Evidence: [version merge condition and snapshot replacement](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/ontology/versioning.service.ts:235); [head/version writes are currently non-atomic](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/ontology/document-write.service.ts:43).

**Amendment:** Define an approval checkpoint marker (or equivalent immutable receipt snapshot contract), update shared version coalescing so later writes cannot merge into it, and include request/receipt ID plus resulting snapshot hash. The new transactional write must roll back if mandatory history persistence fails. Name the timestamp/hash or revision used for stale detection; document history's mutable version number alone is insufficient. Clarify that request-content retention does not delete normal project document history. Future tests must edit as the same actor immediately after approval and verify the checkpoint remains unchanged.

### R5 — P2: use the established project lock order and specify what is actually serialized

“Locks request, authorization boundary, relevant project/membership, and entity in a consistent documented order” is not yet the actual repository order. The repo recently fixed reproducible deadlocks caused by writing entity/context rows before acquiring the project lock. New request/revoke/membership transactions must participate in a compatible order; locking an authorization row only helps if revocation also locks that row. Existing gateway calls and membership writers are not automatically serialized by a new approval RPC.

Evidence: [project lock-first migration and rationale](/Users/djwayne/buildos-platform/supabase/migrations/20260925020000_project_write_lock_first.sql:1); [multi-project lock helper](/Users/djwayne/buildos-platform/supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql:132).

**Amendment:** Name the existing project-lock helper(s), require project-before-entity/context writes, document relative request/principal/membership ordering shared by decision and revoke paths, and define checks for membership deletion, inherited project policies, or missing permission rows where a row lock alone cannot protect absence. Make the concurrency proof a package P2 exit criterion, not a reason to block planning until tests are written.

### R6 — P2: clarify disablement and OAuth issuance atomicity

“Disable requests” has no chosen effect on already-pending requests or existing standing grants, and feature-flag disablement promises mass cancellation/deactivation without stating whether this is persisted or simply an evaluator check. Re-enable must not revive authority while asynchronous cleanup is incomplete. Separately, token/code consumption and token issuance currently use multiple writes. The plan names scope snapshots and revocation-during-exchange tests but leaves the chosen issuance boundary unspecified.

Evidence: [code consumption precedes issuance](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:1104); [refresh consumption precedes issuance](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:1220); [access then refresh inserts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:994).

**Amendment:** Add a compact effect table for disable requests, make read-only, remove project access, disconnect, and global feature disablement. Choose a non-resurrecting persisted generation/revocation boundary for the kill switch. Define transactional code/refresh consume-and-issue or an equally precise failure contract and a live-boundary check that prevents issuance under revoked consent. These decisions can reuse existing principal-policy revision machinery; they do not require an unrelated OAuth rewrite.

## Scope and sequencing assessment

The user request supports this feature scope. Documents first, tasks next, then complete standing grants before rollout is sensible. Credential hardening can ship independently. The plan should explicitly keep new scoped write execution bounded rather than refactoring every legacy gateway mutation, and should not turn per-token policy isolation into additional scope unless the product chooses it in R2.

The draft's no-promise stance on automatic client wakeup, stable request/status tools, independent notification read state, read-only search/fetch profile, and offline-first validation are appropriate. Current client behavior remains a release gate, not a blocker to plan readiness. No live client or paid model run is needed to resolve these plan findings.

## Second-pass review

Reviewed the complete revision 2 contracts, including the authorization rules, concrete execution path, persisted state, lock order, OAuth behavior, control effect table, and acceptance gates. The verdict is based on those contracts rather than the plan's disposition table.

| Finding | Second-pass disposition                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | **Resolved.** Both approved proposals and standing-grant writes use the bounded executor. The evaluator selects the execution disposition server-side; scoped writes cannot fall back to the legacy handler. The direct RPC rechecks current principal/capability, expected project/head, and effect restrictions at the mutation boundary. Calendar/mention suppression covers title and completion edits explicitly.           |
| R2      | **Resolved.** The plan selects connection-wide retained-access semantics and displays retained plus added access. It no longer promises a narrowly isolated token where broad grants remain. Scope/code snapshots prevent credential expansion through refresh or stale code, while separately approved live tuples can intentionally benefit existing write tokens in the same boundary. New boundaries require fresh approval. |
| R3      | **Resolved.** Stable submission equality is independent of current entity state; existing keys are resolved before proposal recomputation/no-op detection. Reviewed digests and cross-key proposal fingerprints have distinct roles. Minimal fingerprints survive payload purge, and exact retries preserve the original reason and avoid creation quotas. The same rule is applied to direct scoped execution keys.             |
| R4      | **Resolved.** Bounded document writes create sealed checkpoints, with database protection against rewriting and shared-versioner fallback. Receipts bind checkpoint ID and snapshot hash, and transactional failure rolls back the mutation. Staleness uses the head timestamp plus canonical snapshot hash; ordinary document history has separate retention.                                                                   |
| R5      | **Resolved.** Project-before-entity ordering is tied to existing helpers. The plan states the full ordering, explains the whole-connection/token/feature-control exceptions, locks positive authorization dependencies, and defines commit-order revocation semantics. Actual member/move/revoke writers must participate, with concurrency probes as implementation exit criteria.                                              |
| R6      | **Resolved.** The effect table distinguishes disabling requests from revoking access. A persisted increasing epoch invalidates old authority immediately and prevents resurrection while cleanup lags. Code/refresh consumption and token-pair issuance share a transaction, with live principal checks and explicit fail-closed lost-response behavior.                                                                         |

The additional owner-browser explanation correctly limits the guarantee to MCP credential authority and avoids claiming human-presence attestation. Server-derived completion timestamps are disclosed, and new scoped direct writes require stable execution keys. These are appropriate clarifications without adding unrelated product scope.

**Ready to implement, not ready to release.** No further product decision or live/paid experiment is needed to start the planned work packages. The largest implementation risks remain the targeted authority-writer locking integration, preserving legacy behavior while dispatching new scoped writes, and sealed-version compatibility; the plan now assigns those risks concrete contracts and required evidence. Their tests, migration rehearsals, manual client compatibility checks, and any separately authorized production release remain pending. A passed plan review must not be reported as proof of those outcomes.

## Implementation follow-through

Implementation and final adversarial findings are recorded in [the implementation record](/Users/djwayne/buildos-platform/docs/technical/reviews/BUILDOS_MCP_PERMISSION_IMPLEMENTATION_2026-09-30.md). The feature is implemented and disabled; actual task-mover compatibility and live client acceptance remain release gates. No production change or paid test was made.

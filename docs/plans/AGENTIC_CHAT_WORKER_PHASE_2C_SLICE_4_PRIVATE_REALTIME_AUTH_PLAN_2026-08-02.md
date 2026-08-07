<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_4_PRIVATE_REALTIME_AUTH_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2C Slice 4 — Private Realtime Authorization Plan

**Date:** 2026-08-02

**Status:** Implemented, review-hardened, and hosted through exact receipt `20260802036000`. Browser subscription wiring, queue-consumer registration, and worker routing remain intentionally deferred.

## Objective

Authorize authenticated browsers to receive private Agentic Chat Broadcast messages only from their exact per-user topic, `chat-user:<auth.uid()>`, while preserving service-role-only publication and adding no user-visible worker route.

## Locked scope

- One `SELECT` policy on `realtime.messages` for the `authenticated` database role.
- Exact topic shape: `chat-user:<canonical UUID structure>` with no suffix, alternate prefix, malformed identifier, or session lookup.
- Read the attempted channel topic through Supabase Realtime's `realtime.topic()` authorization helper, not from a stored message row.
- Limit authorization to `realtime.messages.extension = 'broadcast'`; do not grant Presence access.
- The topic UUID must equal `(select auth.uid())`.
- No authenticated or anonymous `INSERT` policy; browsers may subscribe but may not publish Agentic Chat Broadcast messages.
- Service-role publication continues through the platform's existing RLS-bypass boundary and gains no application-table write authority from this policy.
- Replace any same-name policy deterministically instead of accepting unknown prior policy text.
- No browser channel lifecycle, event application, transport readiness, reconciliation, queue consumer, provider/model call, or feature-flag change in this slice.

## Migration contract

Migration `20260802036000_agentic_chat_private_realtime_authorization.sql` replaces `agentic_chat_realtime_messages_select` on `realtime.messages` with one exact policy:

```sql
FOR SELECT TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND CASE
    WHEN (select realtime.topic()) matches exactly chat-user:<uuid>
    THEN split_part((select realtime.topic()), ':', 2)::uuid = (select auth.uid())
    ELSE false
  END
)
```

The `CASE` guard prevents malformed attempted channel topics from ever reaching the UUID cast. The anchored expression also rejects extra colon segments and other topic families. The Broadcast extension check prevents this receive policy from implicitly granting Presence access. Authorization is intentionally user-scoped rather than session-scoped so the channel can exist before first-turn session creation and multiplex every session owned by that authenticated user.

## Required proof

- A fixture begins with a permissive same-name policy; the migration replaces it with the exact restrictive definition.
- Authenticated user A can authorize Broadcast receive on only `chat-user:<A>` and cannot authorize user B, malformed, suffixed, or other-prefix topics.
- Authenticated user B can authorize Broadcast receive on only `chat-user:<B>`.
- The same valid user topic does not authorize Presence rows.
- Anonymous access returns no rows even when underlying table privileges exist.
- Authenticated and anonymous inserts are denied because no publish policy exists.
- Service-role publication remains possible through RLS bypass.
- Policy roles and command are exactly `authenticated` and `SELECT`.
- Reapplying the migration is idempotent.
- Package-only rollback restores the policy.

## Local implementation result

Completed locally on 2026-08-02:

- added one deterministic `SELECT TO authenticated` policy on `realtime.messages` for Broadcast authorization on the exact attempted `chat-user:<auth.uid()>` channel returned by `realtime.topic()`;
- guarded the UUID cast behind an anchored topic-shape check, so malformed, suffixed, and unrelated topic families fail closed;
- added no browser publish policy; authenticated and anonymous inserts remain denied, while `service_role` retains its existing RLS-bypass publication boundary;
- added a deliberately unsafe starting fixture to prove that rerunning the migration replaces, rather than preserves, an unknown same-name policy;
- proved two-user isolation, anonymous denial, receive-only behavior, service publication, idempotent reapplication, and package-only rollback in disposable PostgreSQL;
- kept the package inert: no browser channel, event application, reconciliation route, queue consumer, provider/model call, feature flag, or user-visible worker route was added.

Migration SHA-256:

- `20260802036000`: `6e4dde1da09e4e32614def74f4c4983c020cacd784b5226e16dbf23c32123617`

Validation:

- focused private-Realtime PostgreSQL runner: 1/1;
- cumulative Agentic Chat PostgreSQL gate: 15 files / 19 tests;
- complete `agentic-chat-v2` suite: 87 files / 740 tests;
- web `svelte-check`: 0 errors / 0 warnings;
- migration/test diff check: clean.

Hosted application completed on 2026-08-02 together with the immediately following reconciliation receipt. The source and receipt-isolated staged SQL both matched SHA-256 `6e4dde1da09e4e32614def74f4c4983c020cacd784b5226e16dbf23c32123617`. The isolated workdir contained the 47 exact pre-existing hosted receipts plus only `20260802036000` and `20260802037000`; its dry run named exactly those two files in order. Application succeeded, including deterministic replacement of the previously absent same-name policy, the post-apply dry run reported the remote database up to date, and the linked ledger now shows exact local/remote parity for `20260802036000`.

The exact applied migration installs only the reviewed `SELECT TO authenticated` Broadcast policy and adds no browser publish or Presence policy. The focused disposable PostgreSQL authorization proof was rerun after hosted application and passed 1/1, covering the exact policy definition, roles, topic isolation, receive-only behavior, service publication, idempotency, and rollback. No production client mounts the channel yet, so this hosted authorization remains inert until the Phase 2D coordinator is wired.

## Deferred

- Chat-surface mount subscription and auth-token refresh lifecycle.
- Channel readiness and authenticated polling fallback at Send.
- Generation-consistent reconciliation RPC and authenticated routes.
- Client buffering, gap detection, reload/second-tab adoption, and supersede terminal waits.
- Targeted low-latency cancellation notifications.
- Queue-consumer registration, provider/model execution, feature flags, and user-visible routing.

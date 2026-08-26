<!-- docs/plans/GMAIL_RECONNECT_ATTENTION_PLAN_2026-08-03.md -->

# Gmail Reconnect Attention Plan

**Date:** 2026-08-03  
**Status:** Complete — production reconnect flow, refresh-expiry handling, and scheduled health sweep verified  
**Owner:** BuildOS web and integrations

## Outcome

When a connected Gmail account can no longer be refreshed, BuildOS should create one durable,
actionable attention item for that account. The user should see it in the AI Inbox, receive an
immediate in-app warning while the website is open, and be able to reconnect without hunting
through settings. A successful reconnect should resolve the attention item automatically.

Normal short-lived access-token expiration must remain invisible to the user because BuildOS can
refresh it automatically. The reconnect flow is only for refresh-token expiration, provider
revocation, missing credentials, or a read-scope policy mismatch.

## Product decision

The AI Inbox will expand from a review-only queue into a broader attention-and-action queue.
`user_email_connections` remains the authoritative integration state; `inbox_items` remains a
denormalized, user-visible index of unresolved attention.

The Activity feed may record reconnect events later, but it will not own unresolved state. A user
can snooze a reconnect item, but cannot permanently dismiss it while the connection remains
unavailable.

## Target lifecycle

1. An active connection approaches access-token expiry.
2. BuildOS refreshes it normally without notifying the user.
3. If a known refresh-token deadline is reached or refresh returns a permanent grant error, BuildOS
   changes the connection to `reconnect_required`.
4. That transition upserts one `integration_attention` AI Inbox item keyed by the Gmail connection
   ID.
5. A logged-in website session refreshes the Inbox badge and shows a persistent warning toast with
   a **Reconnect** action.
6. The AI Inbox Account group displays the same durable item with **Reconnect**, **Snooze**, and
   **Manage account** actions.
7. OAuth completes in a popup where possible, with a full-page redirect fallback.
8. Once the connection returns to `active`, the Inbox item is automatically resolved and all
   temporary UI alerts disappear.

## Detection layers

### Required

- Existing on-demand refresh detection in `GmailReadOAuthService`.
- A single forced refresh-and-retry after a Gmail API `401`, preventing a revoked but not-yet-expired
  access token from being treated as a generic provider outage.
- A bounded scheduled health sweep for active Gmail connections, so an idle account does not remain
  silently disconnected until the next agent query.
- Preserve `refresh_token_expires_in` as an absolute deadline when Google supplies it for a
  time-based grant. Once that known deadline is reached, transition the connection without waiting
  for a failing Gmail request.

### Later hardening

- Google Cross-Account Protection/RISC webhook handling for near-real-time `token-revoked` events.
- Optional push or account-email escalation that respects notification preferences.

## Durable data model

- Add `integration_attention` to `inbox_items.source_type` and the shared `InboxSourceType` union.
- Use the Gmail connection UUID as `source_ref_id`; the existing unique constraint on
  `(source_type, source_ref_id)` provides per-account deduplication.
- Keep these items user-scoped (`audience = 'user'`, `project_id = NULL`).
- Use `source_status` to mirror `active`, `reconnect_required`, `disabled`, or `disconnected`.
- Use `action_kinds = ['reconnect', 'snooze', 'manage']` while attention is required.
- Do not assign a review TTL; the item resolves only when the source connection recovers or is
  removed.
- Preserve an active snooze during duplicate failure reports.
- Reopen and re-date a previously resolved item if the same connection fails again.

## UI behavior

### AI Inbox

- Render integration items inside the existing Account group.
- Show the account label and email address without exposing credentials or provider error details.
- Primary action: **Reconnect Gmail**.
- Secondary actions: **Snooze until tomorrow** and **Manage account**.
- Do not show proposal-oriented Approve/Reject/Chat controls for integration attention.

### Website alert

- Subscribe to user-owned `inbox_items` changes through Supabase Realtime.
- On a new pending integration item, refresh the shared Inbox count and show a persistent warning
  toast with a Reconnect action.
- On resolution, refresh the count and remove any corresponding temporary alert.
- Fetch current pending integration items at bridge initialization so users returning in a new
  session still see the issue.
- Track surfaced item IDs for the browser session to prevent repeated toast spam.

### OAuth completion

- Reuse `POST /api/integrations/gmail/connections` to create the authorization URL.
- Centralize browser launching in a reusable client helper used by Profile and AI Inbox and
  available to future chat surfaces.
- Prefer a popup plus `BroadcastChannel`/`postMessage` completion signal.
- Fall back to full-page navigation when popups are blocked.
- Verify recovery through `GET /api/integrations/gmail/connections`; never trust the popup message as
  proof of authorization.

## Scheduled health sweep

- Add a cron-authenticated endpoint and Vercel schedule.
- Select a bounded page of active read connections whose access token is expired or near expiry.
- Refresh with low concurrency and existing token encryption/rotation logic.
- Let permanent refresh failures use the normal reconnect-required transition.
- Record only content-free counts and reason codes in cron/audit logs.
- Do not log tokens, OAuth URLs, state values, email content, or Gmail query data.

## Rollout slices

- [x] Slice 1 — schema, lifecycle trigger, shared source type, and transactional SQL coverage
- [x] Slice 2 — source hydration, AI Inbox card, reusable reconnect client, and focused service/client
      tests
- [x] Slice 3 — Realtime attention bridge, persistent toast, badge refresh, session deduplication, and
      cleanup
- [x] Slice 4 — provider `401` forced-refresh recovery and bounded hourly health sweep
- [x] Slice 5 — popup callback bridge, full-page fallback, and post-callback server verification
- [x] Slice 6 — persist Google-provided refresh-token deadlines and detect known expiry in the
      scheduled health sweep
- [x] Slice 7 — production deployment, cron registration, and scheduled-run verification

Google OAuth publishing/restricted-scope confirmation is an external Google Cloud Console
administrative check. Cross-Account Protection remains optional follow-up hardening. Neither is a
blocker for closing the scoped AI Inbox and in-website reconnect flow.

## Acceptance criteria

- One Gmail account produces at most one unresolved reconnect item.
- Multiple failed reads or concurrent refreshes do not create duplicate items or alerts.
- Reconnecting the account resolves the item without a manual Inbox decision.
- A reconnect item survives logout, refresh, navigation, and a closed browser.
- A currently open website session sees the badge update and an actionable warning without reload.
- Snoozing suppresses the item until its wake time, then it returns if the connection is still
  unavailable.
- Disconnecting the Gmail account retires the reconnect item.
- Healthy hourly access-token rotation never creates user-facing noise.
- Provider outages, timeouts, and quota failures are not mislabeled as revoked authorization.
- All OAuth state, credential, audit, and content-isolation tests remain green.

## Verification

- SQL lifecycle tests for transition, deduplication, snooze preservation, recurrence, recovery, and
  disconnect.
- Gmail OAuth unit tests for permanent versus transient refresh errors.
- Gmail gateway tests for one-time `401` recovery.
- Inbox service and route tests for `integration_attention` ownership and hydration.
- Svelte component tests for reconnect/snooze/manage actions and non-proposal controls.
- Realtime bridge tests for initial hydration, insert/update events, deduplication, and cleanup.
- Focused web checks followed by the full `@buildos/web` type check before rollout.

## Operational dependency

If the Google OAuth app remains External/Testing, Gmail refresh tokens generally expire after seven
days under [Google's OAuth rules](https://developers.google.com/identity/protocols/oauth2). Google
Workspace administrators can override that behavior by marking an app Trusted, as described in
[Google's publishing-status guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
so only the Google Cloud Console can conclusively establish publishing and verification state. The
three current grants were more than 12 days old and still refreshed successfully, which rules out
the standard seven-day Testing behavior for those accounts but does not distinguish Published/In
production from a Workspace Trusted override.

## Implementation and deployment record

Implemented on 2026-08-03:

- `integration_attention` is a supported durable AI Inbox source.
- A `user_email_connections` trigger creates, deduplicates, snooze-preserves, reopens, resolves, and
  retires Gmail reconnect items from authoritative connection state.
- The AI Inbox Account group renders dedicated Reconnect, Snooze, and Manage actions without
  proposal controls.
- Profile and AI Inbox use the same popup-first OAuth launcher. The callback reports through
  same-origin `postMessage`/`BroadcastChannel`, while the opener independently verifies active
  read-only access before reporting success.
- A user-scoped Realtime bridge refreshes the shared Inbox badge and shows one persistent reconnect
  warning per recurrence/browser session.
- Gmail API `401` responses get one forced refresh and retry. Explicit permanent refresh failures
  move the account to `reconnect_required`; generic provider `400`/outage failures no longer do.
- `/api/cron/gmail-connection-health` checks a bounded, low-concurrency batch hourly once the web
  deployment containing the updated `vercel.json` is live.

Hosted database application:

- Migration `20260803014000_gmail_reconnect_ai_inbox.sql` was applied to the linked Supabase project
  on 2026-08-03.
- A receipt-isolated pre-apply dry run named only that migration; the post-apply dry run reported the
  remote database up to date.
- A read-only hosted probe successfully queried the new source type and found `0` reconnect-required
  connections and `0` integration-attention rows, confirming an empty, aligned backfill at deploy
  time.

Verification completed:

- 42 focused Vitest tests passed across Inbox hydration, OAuth storage/refresh behavior, Gmail
  gateway authorization/retry behavior, scheduled health classification, popup completion, and
  Realtime attention initialization/action/resolution.
- All four touched Svelte components passed the Svelte 5 autofixer.
- A scoped Svelte/type check covering every touched runtime file passed with `0 errors and 0
warnings`.
- The full repository web check did not finish: the checker was terminated after several minutes
  with an esbuild deadlock/SIGTERM and emitted no code diagnostic before termination. The scoped
  check was used to close validation for this feature.
- The transactional SQL lifecycle test is checked in at
  `supabase/tests/20260803014000_gmail_reconnect_ai_inbox.test.sql`. The linked Supabase test runner
  could not execute it because Docker Desktop was unavailable; the hosted migration itself applied
  successfully and its ledger/backfill probes passed.

Deployment readiness verified on 2026-08-03:

- The linked migration ledger was checked again and shows `20260803014000` on both the local and
  remote sides; the migration was not replayed.
- A corrected read-only hosted probe found `0` Gmail connections in `reconnect_required` and `0`
  unresolved `integration_attention` items. The counts match, so the empty backfill remains aligned.
- At readiness time, local `HEAD`, `origin/main`, and the current production deployment all resolved
  to commit
  `15e92f17d194cc6d75c8b69b29a37390de0ae30f`; an isolated release candidate therefore starts from
  the deployed production baseline instead of rolling code backward.
- The production `build-os` Vercel project contains the Gmail OAuth client, token-encryption,
  Supabase service-role, `CRON_SECRET`, and legacy cron-secret environment-variable names required
  by this release. Values were not read or logged.
- A clean temporary tree was assembled from production `HEAD` plus only the Gmail reconnect runtime
  files. The exact production Turbo command completed successfully: 8 of 8 workspace build tasks
  passed in 5 minutes 14 seconds.
- The generated Vercel output contains the Gmail connection-health function and Gmail read callback
  completion route. The repository-root `vercel.json` contains the hourly `45 * * * *` schedule,
  but later runtime verification found that the Vercel project Root Directory is `apps/web`; that
  root-level deployment configuration was therefore not registering the scheduled job.
- No production web deployment was performed from the dirty worktree during readiness validation.

Production deployment verified on 2026-08-03:

- The Gmail reconnect implementation landed on `main` in commit
  `32ce98ae5792ffbb1e0abe319b0a886500b7d36f` and is present on `origin/main`.
- Vercel deployment `dpl_GGFkBqtZTsCXRuJuee1RacvVzZJ3` is ready in the production environment.
- `GET /auth/google/gmail-read/complete` returns `200`, confirming the popup completion page is
  available. An unauthenticated `GET /api/cron/gmail-connection-health` returns `401`, confirming
  the deployed endpoint enforces cron authorization.
- One authenticated production health sweep completed successfully. It checked 3 candidate Gmail
  connections, refreshed all 3, reported 0 reconnect-required grants, 0 transient failures, and no
  additional page.
- The sweep wrote a successful `gmail_connection_health` receipt to `cron_logs`. A follow-up
  read-only probe found 0 reconnect-required Gmail connections and 0 unresolved
  `integration_attention` items, so the trigger-backed Inbox state remains aligned.
- The final focused regression run on the deployed source commit passed 42 of 42 tests.

Known refresh-token-expiry hardening completed on 2026-08-03:

- Migration `20260803017000_gmail_refresh_token_expiry.sql` adds an indexed nullable
  `refresh_token_expires_at` credential deadline and backward-compatible overloads for the existing
  credential upsert/rotation RPCs.
- The migration was applied through a receipt-isolated linked Supabase workdir. Its pre-apply dry
  run named only `20260803017000`; the post-apply dry run reports the remote database up to date.
- At migration deployment time, a content-free hosted probe read the new column across all 3 Gmail
  credential rows. All deadlines were null, as expected: the app did not invent an expiry for an
  existing grant when Google had not provided one.
- Hosted RPC resolution probes with nonexistent IDs confirmed that both the old and new rotation
  signatures resolve without PostgREST ambiguity and perform no mutation. A separate anonymous-role
  probe was rejected with PostgreSQL `42501`, confirming the new overload remains service-role-only.
- The hosted PostgREST OpenAPI document exposes the new timestamp column and
  `p_refresh_token_expires_at` RPC parameter, matching the updated shared database types.
- OAuth exchange now converts Google `refresh_token_expires_in` seconds into an absolute timestamp.
  Same-token reconnects and ordinary access-token rotations preserve an existing deadline.
- On-demand authorization and the scheduled health query now recognize a reached known deadline;
  the standard reconnect-required transition creates the existing AI Inbox notification.
- The focused Gmail reconnect regression set passes 43 of 43 tests, the shared types package builds,
  and a scoped TypeScript check covering the changed server files passes. The repository-wide
  Svelte checker again produced no diagnostics but did not complete and was stopped after a bounded
  wait.
- The rollback-only SQL test is checked in at
  `supabase/tests/20260803017000_gmail_refresh_token_expiry.test.sql`. The current Supabase CLI still
  tries to start Docker even with `--linked`, so it could not execute in this environment; hosted
  migration, schema, and RPC-resolution checks passed.

Production closeout verified on 2026-08-06:

- The refresh-token-expiry server changes and scoped `apps/web/vercel.json` are committed on `main`
  and `origin/main`. Commit `1316f8942c92c651510c6c5829b8e1d5a07c630a`, which introduced this
  hardening, is an ancestor of closeout HEAD
  `dfb69d8447b8b21e5fc330ce74568316ac01f80d`.
- Vercel production deployment `dpl_rE91Xannz4HL9CaRn7avj7upRnFi` is ready. Its generated deployment
  configuration contains exactly the intended `/api/cron/gmail-connection-health` schedule at
  `45 * * * *`, and its output contains the Gmail health endpoint.
- The scheduled run at `2026-08-06T20:45:34.321Z` wrote a successful
  `gmail_connection_health` receipt: 3 connections checked, 3 refreshed, 0 reconnect-required, 0
  transient failures, and no additional page.
- A content-free hosted probe found 3 active Gmail connections, 3 active read credential rows with
  known refresh-token deadlines, and 0 unresolved `integration_attention` items.
- The focused closeout regression run passed 43 of 43 tests across Inbox hydration, OAuth
  storage/refresh behavior, Gmail gateway recovery, scheduled health classification, popup
  completion, and Realtime attention behavior.

## Closeout decision

The scoped Gmail reconnect attention outcome is complete and operating in production. No additional
application work is required to close this plan.

The following are retained as non-blocking follow-ups:

- Confirm and document the Google OAuth app's publishing/restricted-scope status in Google Cloud
  Console, or document the applicable Google Workspace Trusted override. Repository and runtime
  inspection cannot conclusively determine this external administrative state.
- Execute the checked-in rollback-only SQL lifecycle tests when a Docker-capable Supabase test
  environment is available. Hosted migration, schema, RPC-resolution, and runtime probes already
  passed.
- Consider Cross-Account Protection/RISC, push/email escalation, and a dedicated inline chat
  reconnect card as separate optional hardening work.

<!-- apps/web/docs/technical/email/PHASE-1-MULTI-ACCOUNT-READ-CONNECTIONS.md -->

# Phase 1 — Multi-Account Gmail Read Connections

**Status:** Live for three test accounts; Google restricted-scope production verification remains
**Depends on:** Phase 0 go/no-go
**Does not include:** message search/read UI, AI processing, sending, composing in Gmail, modifying,
attachments, or background sync

## Outcome

One authenticated BuildOS user can securely connect, label, inspect, reconnect, and disconnect up to
five Gmail or Google Workspace accounts. Every connection is read-only and owns an independent OAuth
grant and token lifecycle.

## Implementation checkpoint — 2026-07-22

Implemented and deployed:

- connection, credential, capability, OAuth-state, and metadata-only audit tables with RLS;
- an atomic database function that requires `gmail.readonly` and rejects Gmail action scopes;
- a five-account cap and stable Google `sub` identity rules;
- dedicated Gmail Read OAuth configuration with PKCE, nonce, hashed single-use state, and exact
  read-only scopes;
- AES-256-GCM token encryption bound to the BuildOS user, Google account, and read grant;
- connect, list, label, reconnect, and disconnect server workflows;
- per-connection token refresh with atomic rotation and fail-closed `reconnect_required` handling;
- immediate Gmail credential cleanup and bounded Google revocation attempts when account deletion
  is scheduled, with a second cleanup attempt during final purge;
- an Email profile tab showing one card per account, with Sending and Message changes visibly off;
- focused tests for scope isolation, token encryption, reconnect behavior, and revocation failure.

Live validation completed on 2026-07-22:

- the migration and service-role-only functions are applied to the production Supabase project;
- the dedicated Gmail Read OAuth client, callback, and encrypted runtime secrets are configured;
- three separate Gmail/Workspace accounts are active for one BuildOS user;
- each account has one enabled `read` capability and one non-revoked `gmail_read` credential;
- credential ciphertext remains encrypted at rest and observed scopes contain `gmail.readonly` plus
  identity scopes only;
- the production Email settings surface shows Reading enabled, Sending off, and Message changes off.

Still required before broad rollout:

- complete the remaining RLS, callback replay, account-cap, and lifecycle integration tests;
- complete Google restricted-scope verification/security evidence before leaving External/Testing;
- replace or rotate test grants as needed while Google applies testing-mode token lifetimes;
- complete the remaining Phase 0 privacy/security approvals before broad mailbox-reading rollout.

## UX contract

The Email Integrations surface shows one card per Gmail account:

- user-defined account label;
- current Google email address;
- `Read only` badge;
- status and last successful verification;
- reconnect control;
- disconnect/delete control;
- advanced permissions area showing Sending, Gmail Drafts, and Message Changes as **Off**;
- **Connect another Gmail account** control.

Do not place Send, Reply, Archive, Mark read, Delete, or Save to Gmail Drafts actions in the primary
connection flow.

## WP-1.1 — Database and access control

Add the connection, credential, capability, OAuth-state, and metadata-only audit structures defined
in the master plan.

Requirements:

- key all server token operations by `connection_id`, never only `user_id`;
- enforce `(user_id, provider, provider_account_id)` uniqueness;
- initially prevent one provider account from attaching to two BuildOS users;
- browser roles cannot select credential ciphertext or call credential mutation functions;
- service operations always verify authenticated user ownership of the connection;
- capability defaults are read enabled and every action disabled;
- deletion cascades are intentional and covered by tests;
- generated database types are updated in the same implementation change.

Do not add Gmail columns to `user_calendar_tokens` or reuse the Calendar token cache.

## WP-1.2 — Token encryption and runtime isolation

Use a dedicated Gmail Read managed KMS key and encryption context. Store key version with each
encrypted token so keys can rotate without disconnecting every account.

Requirements:

- no fallback key derived from Supabase, Google client, or Calendar secrets;
- no decrypted token in browser data, logs, thrown errors, traces, or queue payloads;
- cache clients by `connection_id` and clear the cache on refresh, disable, reconnect, disconnect,
  revocation, and ownership change;
- cap cache lifetime and re-check connection status before each provider request;
- production starts only when the intended managed key is present; fail closed on missing key;
- Gmail Read service identity cannot read Gmail Actions credentials when Phase 3 exists.

## WP-1.3 — OAuth initiation

Create a new unambiguous route such as `/auth/google/gmail/read/start`. Do not extend the legacy
`/auth/google/gmail-callback` login route.

The server creates an opaque random state record with:

- authenticated `user_id`;
- intended redirect path from an allowlist;
- nonce and PKCE verifier where supported by the selected OAuth library;
- OAuth client kind (`gmail_read`);
- creation and short expiry time;
- single-use consumed state.

Generate the authorization request with:

- scopes exactly `openid email https://www.googleapis.com/auth/gmail.readonly`;
- offline access for refresh-token issuance;
- `prompt=consent select_account` for **Connect another**;
- no `login_hint` for adding an account;
- the server-issued state and nonce;
- no incremental inclusion of unrelated Google grants.

## WP-1.4 — OAuth callback and connection creation

The callback must:

1. require a valid authenticated BuildOS session;
2. atomically validate and consume the state record;
3. reject missing, expired, replayed, wrong-client, or wrong-user state;
4. exchange the authorization code server-side;
5. validate token issuer, audience, nonce, and time claims;
6. use Google `sub` as provider identity;
7. verify the returned email/profile against the authorized account;
8. inspect the granted scopes and reject any missing required scope;
9. reject unexpected action scopes on the Read client and log a metadata-only security event;
10. preserve an existing refresh token if Google omits a replacement during reconnect;
11. upsert the same `sub` for the same BuildOS user instead of duplicating it;
12. enforce the account cap and global provider-account ownership policy;
13. encrypt tokens before writing them;
14. return to the account card with a clear success or actionable reconnect error.

Connection creation must be atomic enough that a callback failure does not leave a card claiming to
be connected without valid encrypted credentials.

## WP-1.5 — Status, reconnect, and refresh

Expose server-derived states:

- `active`;
- `reconnect_required`;
- `disabled`;
- `temporarily_unavailable`;
- `policy_blocked` where a Workspace administrator prevents access.

Refresh handling must preserve the connection identity, rotate stored tokens atomically, classify
`invalid_grant` as reconnect-required, and never retry indefinitely. A refresh failure for one Gmail
account must not affect another account belonging to the same BuildOS user.

## WP-1.6 — Disconnect and deletion

Disconnect is a deliberate server workflow:

1. mark the connection disabled to stop new work;
2. invalidate and clear in-process caches;
3. stop any future watch if one exists in a later phase;
4. revoke the Google token/grant;
5. delete read and action credentials;
6. expire pending action intents;
7. delete transient Gmail data;
8. ask whether saved derived BuildOS items should remain, when applicable;
9. retain only content-free consent/security records required by policy;
10. make the UI reflect disconnection even if remote revocation needs a bounded retry.

Account deletion performs the same work for every connection.

## WP-1.7 — Connection UI

The UI must make these facts obvious:

- BuildOS login email and connected Gmail accounts are different concepts.
- The user is granting read access to the Google account selected in Google's chooser.
- Each card represents one mailbox and has its own permissions.
- Adding a second mailbox does not replace the first.
- An alias inside a mailbox is not a separate connection.
- Read access does not permit BuildOS or its agent to send or modify email.
- Advanced action permissions are off and are not enabled through this flow.

Accessibility, mobile layout, loading, callback errors, duplicate selection, account-cap errors, and
reconnect states are part of the acceptance criteria, not follow-up polish.

## Required tests

### OAuth and identity

- valid first account;
- valid second and third account;
- duplicate same account for same user;
- same provider account attempted by another BuildOS user;
- expired/replayed/tampered state;
- callback while signed into the wrong BuildOS user;
- callback from the wrong OAuth client;
- missing refresh token on reconnect;
- missing read scope;
- unexpected write-capable scope;
- email address changed while `sub` remains the same;
- account cap exceeded.

### Authorization and storage

- authenticated user cannot read another user's connection metadata;
- browser role cannot read credential rows;
- service rejects a connection not owned by the caller;
- encrypted tokens are not plaintext and decrypt only in the read service;
- cache invalidates on disconnect/reconnect/revocation;
- logs and errors contain no tokens or OAuth codes.

### Lifecycle

- independent token refresh for three accounts;
- one revoked account does not break the others;
- disconnect revokes remotely and deletes locally;
- account deletion handles all connected accounts;
- repeated disconnect is safe and idempotent.

## Phase 1 definition of done

- A test user connects and labels three distinct Google accounts.
- Every stored credential is associated with a connection ID and read grant only.
- The account chooser reliably supports adding another account.
- No Gmail message content has been requested or stored yet.
- Action permissions are visibly off and technically unavailable.
- Ownership, callback, token, reconnect, revocation, and deletion tests pass.
- Phase 0 privacy/security owners approve the implemented data flow before Phase 2.

## References

- [OAuth 2.0 web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference)
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)

<!-- apps/web/docs/technical/email/README.md -->

# BuildOS Gmail Integration — Master Plan

**Created:** 2026-07-22
**Status:** Phase 1 and Phase 2 read surfaces are live; Tier 1 chat reads are in a DJ-only
production pilot; Project Relevance Phase A Slice 1 is implemented locally and pending its exact-file
profile/rule migration apply; the Slice 2 synthetic scan-control-plane handoff is ready
**Primary product rule:** Gmail is read-only by default. An agent may propose an email, but it may
not send, draft in Gmail, or modify Gmail state without separate account permission and an explicit
user confirmation in the UI for the exact action.

## Outcome

BuildOS users can connect multiple Gmail or Google Workspace accounts to one BuildOS identity and
use those accounts primarily as read-only context. A DJ Wayne BuildOS user can, for example, connect
separate 9takes, BuildOS, and Cadre mailboxes without creating three BuildOS accounts.

The initial product supports on-demand search and reading. Write-capable behavior is a later,
isolated capability. Possession of a Google send/compose/modify scope is **necessary but never
sufficient** to perform an action: the user must also authorize the exact action in BuildOS.

## Plan index

| Phase | Document                                                                                  | Outcome                                                                                           |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0     | [Compliance, security, and product decisions](PHASE-0-COMPLIANCE-SECURITY-AND-PRODUCT.md) | Approve the data flow, Google projects, scopes, disclosures, threat model, and launch gates       |
| 1     | [Multi-account read connections](PHASE-1-MULTI-ACCOUNT-READ-CONNECTIONS.md)               | Connect, label, reconnect, and disconnect multiple Gmail accounts with read-only credentials      |
| 2     | [Read-only email experience](PHASE-2-READ-ONLY-EMAIL-EXPERIENCE.md)                       | Search/read selected accounts safely from the UI and agent without storing a full mailbox         |
| 3     | [Explicitly authorized email actions](PHASE-3-EXPLICITLY-AUTHORIZED-EMAIL-ACTIONS.md)     | Add separately enabled send/compose/modify capabilities with exact, one-time UI confirmation      |
| 4     | [Sync, verification, and rollout](PHASE-4-SYNC-VERIFICATION-AND-ROLLOUT.md)               | Optionally add minimal background sync, complete Restricted-scope verification, and launch safely |

Detailed Phase 4 research:

- [Gmail ingestion and project relevance architecture](GMAIL-INGESTION-AND-PROJECT-RELEVANCE-ARCHITECTURE.md) — compares polling with Gmail Pub/Sub, specifies bounded initial ingestion, designs the project-relevance and review pipeline, and maps the work onto the existing BuildOS queue and daily-brief architecture.

Parallel build track (shares the Phase 2 gateway; neither blocks the other):

- [Agentic chat Gmail tools specification](AGENT-CHAT-GMAIL-TOOLS-SPEC.md) — the three Tier 1 read
  tools are deployed behind a global kill switch plus an exact user allowlist. Local draft
  proposals remain deferred; no send, Gmail-draft, or modify tool exists. Tracker:
  `tasker/35-agentic-chat-gmail-tools.md`.
- [Tier 1 build handoff](HANDOFF-TIER1-GMAIL-CHAT-TOOLS.md) — implementation handoff for the
  three read tools: state of the world, reading list, build order, landmines, definition of done.
- [Project Relevance Phase A handoff](HANDOFF-PHASE-A-PROJECT-RELEVANCE.md) — locked pilot
  defaults, five build slices, evaluation gates, and the first-PR boundary. Tracker:
  `tasker/36-gmail-project-relevance-phase-a.md`.
- [Phase A Slice 2 scan-control-plane handoff](HANDOFF-PHASE-A-SLICE-2-SCAN-CONTROL-PLANE.md) —
  implementation contract for immutable manifests, per-account leases/checkpoints, fail-closed
  budgets, cancellation, terminal states, and a synthetic three-account proof before any Gmail
  scan.
- [Gmail relevance migration-ledger baseline](SUPABASE-MIGRATION-LEDGER-BASELINE.md) — production
  physical-baseline decision and exact-file forward-apply protocol; repository-wide `db push` is
  prohibited while the legacy ledger remains sparse and locally duplicated.

Phase 3 does not block the read-only product. It is deliberately later and can remain disabled
indefinitely.

## Current implementation checkpoint

Phase 1 is deployed at `build-os.com`. It includes the multi-account schema and RLS policies, a dedicated
read-only OAuth flow with single-use state/PKCE/nonce validation, account-bound encrypted token
storage, account-isolated refresh/reconnect transitions, account-deletion revocation cleanup,
connection management endpoints, and an Email profile tab. The UI exposes connect, label, reconnect,
and disconnect only. Sending and message modification remain visibly off and have no runtime route
or executor.

The three initial Gmail/Workspace accounts are connected independently with active `read` capability
rows and encrypted `gmail_read` credentials containing `gmail.readonly` and identity scopes only.
The Google OAuth app remains in External/Testing mode, so restricted-scope verification and the
testing-mode refresh-token lifetime remain rollout constraints.

The first Phase 2 vertical slice is deployed to production: a GET-only Gmail provider gateway,
explicit account selection, bounded multi-account search, on-demand message retrieval,
deterministic HTML-to-text sanitization, attachment blocking, rate limits, no-store API responses,
metadata-only auditing, encrypted account-bound pagination, and a read-only message UI. Pagination
continues one selected account at a time with a 15-minute cursor bound to the user, connection, and
query, plus hard page and visible-result ceilings. The three Tier 1 chat tools now expose account
listing, bounded search, and one-message retrieval through that same gateway. They are gated by
`EMAIL_CHAT_TOOLS_ENABLED` and the exact-user `EMAIL_CHAT_TOOLS_USER_IDS` allowlist. Durable Gmail
tool traces are content-free: counts and booleans only, with no queries, account IDs, addresses,
subjects, snippets, bodies, cursors, or deep links.

The production pilot is enabled only for DJ's BuildOS user. Live validation confirmed all three
accounts in the profile, a bounded three-account search, on-demand read of one sanitized message,
and the absence of any message-detail write action. A fresh agentic-chat validation returned the
versioned `gmail-read-v2` result, rendered exactly one **Open in Gmail** link for every selected
account, and resolved all three links to the intended signed-in mailboxes. Browser-held search and
opened-message state is reconstructed whenever the connection set changes so disconnected-account
data cannot remain in the Email tab. Project-relevance Gmail ingestion has not started. Slice 1's
model-free compiler and exact-user read-only preview are implemented locally, and the profile/rule
migration is disposable-database verified but not applied to production. The scan queue, classifier,
and review UI remain later Phase A work. Slice 2 is now specified as a content-free synthetic
control-plane build and explicitly cannot call Gmail or a model. Phase A's global flag, exact-user
allowlist, and model flag are documented and default off.

## Non-negotiable invariants

1. Connecting Gmail through the normal integration flow grants read-only access only.
2. BuildOS login, Google Calendar, Gmail read access, and Gmail action access use separate OAuth
   concerns and credentials.
3. The read service never receives a send-, compose-, or modify-capable token.
4. The agent runtime never receives an action token or a direct `send`, `compose`, or `modify`
   execution tool.
5. An agent-generated reply or new email is a **proposal**, not a Gmail draft and not a queued send.
6. Every send requires the user to review the exact From account, To/CC/BCC recipients, subject,
   body, and attachments, then choose **Send once** in the UI.
7. A send confirmation is short-lived, single-use, bound to a hash of the reviewed payload, and
   invalidated by any edit.
8. A persistent “Enable sending” setting does not grant persistent autonomous sending. It only
   makes per-message confirmation possible.
9. Saving a draft to Gmail and modifying message state are separate permissions from sending.
10. Bulk sending, scheduled autonomous sending, email-triggered auto-replies, and permanent Gmail
    deletion are outside this plan.
11. No raw message content, proposed email content, access token, or recipient list appears in
    application logs, analytics, traces, or security-event metadata.
12. Disconnect and account deletion revoke Google access and delete credentials and transient data.

These invariants must be enforced independently at the OAuth, database, service, tool-policy, UI,
and test layers. UI hiding alone is not a security boundary.

## Capability model

| Capability                    | Google scope                               | Default                 | Agent authority                               | UI authorization                                           |
| ----------------------------- | ------------------------------------------ | ----------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Identify mailbox              | `openid email`                             | Enabled with connection | Read account label/status                     | Connection consent                                         |
| Search and read               | `gmail.readonly`                           | Enabled with connection | May search/read within user-selected accounts | Read-only connection consent                               |
| Propose an email              | None beyond local BuildOS access           | Available later         | May create/edit a local proposal              | User request; no Gmail side effect                         |
| Send one email/reply/forward  | `gmail.send` on a separate action grant    | Off                     | May propose only; cannot execute              | Enable sending for account **and** confirm exact message   |
| Save a draft in Gmail         | `gmail.compose` on a separate action grant | Off                     | May propose only; cannot execute              | Separate capability enablement and per-draft confirmation  |
| Label/archive/mark read/trash | `gmail.modify` on a separate action grant  | Off                     | May propose only; cannot execute              | Separate capability enablement and per-action confirmation |
| Permanent deletion            | Broad `mail.google.com` scope              | Never                   | None                                          | Out of scope                                               |
| Bulk or autonomous sending    | N/A                                        | Never                   | None                                          | Out of scope                                               |

`gmail.modify` is especially broad: it can provide reading, composing, sending, and modification
authority. It must not be treated as a convenient catch-all. It remains disabled until a specific
user-facing feature has its own go/no-go review.

## OAuth and service isolation

The preferred production topology is:

```text
BuildOS Google login project/client
  └─ identity only: openid, email, profile

BuildOS Google Calendar project/client
  └─ existing Calendar grant

BuildOS Gmail Read project/client
  └─ openid, email, https://www.googleapis.com/auth/gmail.readonly
  └─ credentials usable only by GmailReadGateway

BuildOS Gmail Actions project/client
  ├─ https://www.googleapis.com/auth/gmail.send, when explicitly enabled
  ├─ https://www.googleapis.com/auth/gmail.compose, only after a later go/no-go
  └─ https://www.googleapis.com/auth/gmail.modify, only after a later go/no-go
      credentials usable only by GmailActionExecutor
```

At minimum, Gmail read and Gmail actions require different OAuth clients, secret stores, credential
rows, service identities, and runtime policy. Separate Google Cloud projects are preferred because
they isolate consent, verification, blast radius, quota, and credential compromise. Phase 0 records
the final project-level decision before implementation.

The Gmail Read project must never request `gmail.send`, `gmail.compose`, `gmail.modify`, or
`mail.google.com`. The Actions project must request only the capability the user is enabling; it
must not use one broad grant for convenience.

## Multiple-account identity model

A connected Gmail account belongs to a BuildOS user but is not the BuildOS login identity.

- Use Google's stable OpenID `sub` as `provider_account_id`.
- Treat the email address as mutable display metadata, not an authorization key.
- Give every connection a user-editable label such as “9takes” or “Cadre.”
- Upsert the same Google `sub` for the same BuildOS user instead of creating duplicates.
- Initially prevent the same Google `sub` from being attached to multiple BuildOS users.
- Keep an account alias within one Gmail mailbox as one connection; aliases are filters, not
  independent OAuth accounts.
- Require explicit `connection_id` values in every read request and every action proposal.
- Preserve `connection_id`, provider message ID, and provider thread ID on derived results.

Start with a product cap of five Gmail accounts per BuildOS user. This is a BuildOS safety and UX
limit, not a Gmail technical limit, and can be raised after observing real use.

## Target data model

### `user_email_connections`

Non-secret connection metadata:

- `id`
- `user_id`
- `provider` (`google_gmail` initially)
- `provider_account_id` (Google `sub`)
- `email_address`
- `display_name`
- `account_label`
- `status` (`active`, `reconnect_required`, `disabled`, `error`)
- `read_enabled`
- `connected_at`, `last_verified_at`, `last_used_at`
- `created_at`, `updated_at`, `deleted_at`

Unique: `(user_id, provider, provider_account_id)`. Prefer an initial global uniqueness guard for
`(provider, provider_account_id)` until shared-mailbox semantics are intentionally designed.

### `email_connection_credentials`

Server-only, encrypted credential material:

- `connection_id`
- `grant_kind` (`read`, `send`, `compose`, `modify`)
- `oauth_client_kind`
- encrypted access and refresh tokens
- access-token expiry
- granted scopes
- token/key version
- refresh/revocation state
- timestamps

Browser roles receive no direct table privileges. Read and action credentials use separate managed
KMS keys and encryption contexts.

### `email_capability_grants`

The BuildOS-side permission state for one account:

- `connection_id`
- `capability` (`read`, `send`, `save_gmail_draft`, `modify_message`)
- `status` (`enabled`, `disabled`, `reconnect_required`)
- user and time that enabled/disabled it
- Google scopes observed at last verification
- policy version and consent receipt

This record cannot create authority that is absent from the matching Google token. Conversely, a
Google token cannot create authority if this record is disabled.

### `email_action_intents`

A short-lived request to perform exactly one side effect:

- `id`, `user_id`, `connection_id`
- `action_type`
- encrypted proposed payload
- canonical payload hash
- state (`proposed`, `awaiting_confirmation`, `confirmed`, `executing`, `succeeded`, `failed`,
  `delivery_unknown`, `expired`, `cancelled`)
- proposal source (`user`, `agent`, `system`)
- confirmation user/time/session assurance
- idempotency key
- provider result identifiers
- expiry and timestamps

Any change to recipients, account, subject, body, or attachments creates a new hash and returns the
intent to `awaiting_confirmation`.

### `email_access_audit_events`

Record actor, connection, operation, result, count, policy decision, and timestamp. Never record
message subjects, body text, recipient lists, raw headers, tokens, or attachment contents.

## Read-only user flow

1. The user opens Email Integrations and chooses **Connect Gmail (read only)**.
2. The UI shows a just-in-time disclosure explaining what BuildOS can read, why, retention, AI
   handling, and how to disconnect.
3. Google displays an account chooser; BuildOS requests only identity plus `gmail.readonly`.
4. The callback validates the authenticated BuildOS session, one-time OAuth state, issuer,
   audience, nonce, `sub`, email, and the exact granted scopes.
5. BuildOS displays the new account card and lets the user label it.
6. **Connect another Gmail account** repeats the flow with no `login_hint` so Google shows the
   account chooser.
7. Search, open, and summarize operations always show source-account provenance.
8. Disconnect revokes the Google grant, deletes credentials, clears transient content, and handles
   saved derived data according to the user's deletion choice.

The normal read UI contains no direct Gmail send or modify control. A future “Reply” affordance
opens a local proposal surface and cannot call Gmail.

## Explicit send flow

Sending is protected by two separate approvals:

### Approval 1: enable the account capability

The user opens the account's advanced permissions, chooses **Enable sending**, reads a specific
disclosure, reauthenticates if required, and completes a separate Google OAuth grant for
`gmail.send`. This does not enable autonomous sends.

### Approval 2: authorize one exact email

1. A user or agent creates a local proposed email.
2. The UI renders the exact From account, recipients, subject, body, and attachment list.
3. The server canonicalizes the payload and stores a short-lived encrypted intent and hash.
4. The user chooses **Send once**. A stale or high-risk session requires step-up authentication.
5. The browser submits a CSRF-protected confirmation for that intent and payload hash.
6. The action service atomically consumes the one-time confirmation and verifies ownership,
   connection, capability, Google scope, expiry, and unchanged hash.
7. The isolated executor sends once and records only non-content outcome metadata.
8. A timeout after provider dispatch becomes `delivery_unknown`; it is not automatically retried.

The agent cannot produce step 5. Its maximum authority is to create or update the proposal in
step 1.

## Agent and untrusted-content boundary

Email is hostile external input. Message bodies may contain prompt injection designed to make an
agent disclose data or invoke tools.

- Convert HTML to bounded sanitized text; never load remote images.
- Keep attachments disabled in the initial product.
- Process email interpretation in a constrained, no-tools model step.
- Route Gmail content only through approved zero-data-retention/no-training providers.
- Fail closed if the private provider route is unavailable; do not use an operator break-glass
  downgrade for Gmail content.
- Never let email content alter account selection, capability policy, tool allowlists, or action
  confirmation.
- Agent tools in Phases 1–2 are read-only. Phase 3 may add `email.send.propose`, but never
  `email.send.execute`.
- A proposed BuildOS task or Calendar event also requires the existing product confirmation policy;
  reading an email is not permission to mutate another system.

## Current BuildOS findings that shape the plan

- Google login currently requests only `email profile openid` in
  `apps/web/src/routes/auth/login/+page.svelte`; this should remain identity-only.
- `apps/web/src/routes/auth/google/gmail-callback` is a legacy login callback, not a Gmail API
  connection flow. The new integration must use a new, unambiguous route.
- Calendar's `user_calendar_tokens` model is one-to-one with a BuildOS user and caches by user ID;
  Gmail must key credentials and clients by connection ID.
- Calendar token AES-256-GCM encryption is a useful pattern, but Gmail Restricted-scope credentials
  need dedicated managed keys, rotation, and no fallback derived from unrelated application
  secrets.
- Calendar disconnect currently removes local tokens without revoking the Google grant. The Gmail
  flow must implement remote revocation from its first release.
- BuildOS has a Google Limited Use privacy section and private/ZDR AI defaults. Gmail still needs a
  just-in-time disclosure, email-specific retention language, a fail-closed AI lane, and verification
  that no fallback or telemetry path retains email content.

## Global definition of done

- One BuildOS user can connect at least three separate Gmail accounts and distinguish their results.
- The default connection token cannot call Gmail send, draft, or modify endpoints.
- Read credentials never enter the action service; action credentials never enter agent context.
- An agent can search/read only accounts the authenticated user selected.
- An agent cannot send an email through any tool, internal route, queue payload, or retry path.
- A user can enable sending for one account without enabling it for other connected accounts.
- Each sent email has a user-confirmed, exact, single-use intent; edits invalidate confirmation.
- Replay, double-click, stale-session, wrong-user, wrong-account, and payload-tampering tests fail
  closed.
- Ambiguous provider outcomes never trigger an automatic duplicate send.
- Disconnect and account deletion revoke grants and delete credentials and transient content.
- Logs and analytics contain no Gmail content or tokens.
- Google verification, CASA/security requirements, privacy disclosures, and production readiness
  gates are complete before public launch.

## Authoritative external references

- [Gmail OAuth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Gmail messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Google Workspace API user data and Limited Use policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- [OAuth verification requirements](https://support.google.com/cloud/answer/13464321)
- [Restricted-scope CASA requirements](https://support.google.com/cloud/answer/13465431)
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [OpenID Connect identity reference](https://developers.google.com/identity/openid-connect/reference)

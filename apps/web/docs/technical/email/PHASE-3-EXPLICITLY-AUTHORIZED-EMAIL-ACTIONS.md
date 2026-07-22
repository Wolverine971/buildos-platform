<!-- apps/web/docs/technical/email/PHASE-3-EXPLICITLY-AUTHORIZED-EMAIL-ACTIONS.md -->

# Phase 3 — Explicitly Authorized Gmail Actions

**Status:** Planned; separately gated; not required for read-only launch
**Depends on:** Phases 0–2 complete, dedicated security review, and an explicit product go/no-go
**Initial action:** sending one user-confirmed message with `gmail.send`

## Outcome

BuildOS can help write email while preserving a hard distinction between proposal and execution.
An agent can create a local proposed message. Only the authenticated user, through the BuildOS UI,
can authorize one exact send from one explicitly enabled Gmail account.

Saving a draft into Gmail and modifying existing messages are later subphases with separate scopes,
controls, and approvals. They must not be bundled into the send feature.

## Core authorization rule

```text
Google action scope
AND enabled BuildOS account capability
AND authenticated connection ownership
AND recent/adequate user session
AND exact unmodified payload
AND unexpired one-time UI confirmation
AND server policy approval
= one permitted action
```

If any term is absent, the action is denied.

A long-lived OAuth token is not a long-lived agent permission. A chat instruction such as “send
that” is not the UI confirmation and cannot be converted into one by a model or tool.

## Subphase 3A — Send one email

### WP-3A.1 — Separately enable sending for one account

The account's Advanced Email Permissions panel shows Sending as Off by default. Enabling it requires:

1. an explicit **Enable sending** action from the authenticated user;
2. a just-in-time disclosure that this grant allows BuildOS to send as that Gmail account;
3. recent or step-up authentication according to the approved risk policy;
4. a separate Gmail Actions OAuth client/project;
5. Google consent for only `openid email https://www.googleapis.com/auth/gmail.send`;
6. callback verification that the Google `sub` matches the existing read connection;
7. encrypted storage under the Actions key;
8. a versioned BuildOS capability/consent record.

Do not use `gmail.compose`, `gmail.modify`, or `mail.google.com` for send-only functionality. Do not
increment the read token's scopes.

The UI states: “Sending enabled for this account. BuildOS will still ask you to confirm every
email.” Disabling sending immediately marks the capability unavailable, clears caches, expires
pending send intents, revokes the action token, and leaves read access unchanged.

### WP-3A.2 — Local proposals only

Add a proposal operation such as `email.send.propose`. It stores or updates a BuildOS-local proposed
message and has no Gmail side effect.

An agent may:

- suggest recipients;
- draft subject/body;
- explain uncertainty;
- update a proposal at the user's request.

An agent may not:

- enable account permissions;
- choose a hidden From account;
- confirm a proposal;
- obtain a confirmation token;
- call the action executor;
- schedule, queue, retry, or send a message;
- add attachments in the initial send release;
- turn “always do this” into an automation rule.

The proposal is visibly labeled **Not sent** and **Agent-generated** when applicable.

### WP-3A.3 — Exact review and confirmation UI

Before every send, render a dedicated review screen/modal containing the complete:

- From account label and Gmail address;
- To, CC, and BCC recipients;
- subject;
- final body exactly as it will be encoded;
- attachment list (none in the initial release);
- reply/forward context where relevant;
- warnings for new/external recipients and empty/suspicious fields.

The primary action is **Send once**. The screen must not use ambiguous labels such as Continue,
Approve, or Done.

When the review opens, the server canonicalizes the proposed payload and creates an encrypted,
short-lived action intent with a payload hash. The confirmation request includes the intent ID and
hash. Any edit to the From account, recipients, subject, body, headers, or attachments invalidates
the confirmation and requires another review.

The browser confirmation must be CSRF-protected and originate from an authenticated interactive UI
session. Agent/server tool credentials cannot call it. Require step-up authentication when the
session is stale or the risk policy calls for it.

### WP-3A.4 — Isolated action executor

The executor is a narrow server component with access only to Gmail Actions credentials. It accepts
confirmed intent IDs, not arbitrary email payloads from an agent or general API caller.

In one controlled state transition it verifies:

- user and connection ownership;
- action capability enabled;
- exact expected Google scope;
- provider `sub` and From account match;
- intent is unexpired, confirmed, and unused;
- payload hash still matches canonical content;
- recipient and message limits;
- no attachments for the initial release;
- idempotency key is unused;
- policy and rate limits permit one send.

The executor atomically claims the intent before provider dispatch. Only the executor may decrypt
the send token and payload.

### WP-3A.5 — Duplicate-send and ambiguous-outcome policy

Gmail acceptance followed by a network timeout can leave BuildOS unsure whether the message was
sent. Automatic retry could send a duplicate.

Requirements:

- generate a stable provider/client message correlation value where supported;
- persist the pre-dispatch claim before calling Gmail;
- store Gmail's returned message/thread IDs on success;
- classify timeout/lost-response after dispatch as `delivery_unknown`;
- do not automatically retry `delivery_unknown`;
- attempt a safe provider reconciliation before offering any resend;
- if still ambiguous, show the user that delivery is uncertain and require a newly reviewed intent
  for any resend;
- double-click and replay return the original intent status rather than dispatching again.

### WP-3A.6 — Audit and retention

Audit:

- who proposed the message (`user` or `agent`);
- who confirmed it;
- account/connection ID;
- action type, timestamps, policy version, result, and provider result IDs;
- hash/idempotency metadata.

Do not audit raw recipients, subject, body, headers, attachments, tokens, or OAuth codes.

Encrypt proposed/confirmed content. Erase action payload content promptly after terminal resolution
unless the user explicitly saves the proposal as normal BuildOS content. Retain only the minimum
metadata needed for security, user receipts, and duplicate prevention.

## Subphase 3B — Save a Gmail draft

**Default decision:** deferred and disabled.

If approved later, saving a draft in Gmail requires a separate `gmail.compose` grant and account
capability. A local BuildOS proposal does not need this scope.

The user must explicitly choose **Save to Gmail Drafts** for the exact payload. The agent can propose
the action but cannot execute it. Editing or updating an existing Gmail draft is another write and
requires a new confirmation. The service and credentials remain isolated from Gmail Read and Send.

Before implementation, perform a new scope, privacy, API, verification, deletion, and ambiguous-
outcome review. Do not infer approval from Phase 3A.

## Subphase 3C — Modify existing Gmail messages

**Default decision:** deferred and disabled.

`gmail.modify` is broad and can allow multiple reading and writing behaviors. If BuildOS later adds
mark read/unread, label, archive, or trash:

- approve each product operation independently;
- request `gmail.modify` only through the isolated Actions project/client;
- maintain per-operation BuildOS capability switches even though the Google scope is broad;
- show the account, affected message count, and exact action before confirmation;
- require stronger confirmation for batch operations and trash;
- cap batch size and never expand a model-provided selection silently;
- provide an undo path where Gmail supports one;
- keep permanent delete out of scope because it requires broader authority.

No Phase 3C operation is available merely because a user enabled sending.

## Action state machine

```text
proposed
  └─ awaiting_confirmation
       ├─ edited → awaiting_confirmation with new hash
       ├─ cancelled
       ├─ expired
       └─ confirmed
            └─ executing
                 ├─ succeeded
                 ├─ failed_before_dispatch (safe to create a new intent)
                 └─ delivery_unknown (no automatic retry)
```

The model cannot move an intent to `confirmed` or `executing`. Only the interactive UI confirmation
endpoint can produce `confirmed`; only the isolated executor can produce `executing`.

## API and tool-policy boundaries

- Do not expose a general Gmail SDK client outside the gateway/executor.
- Do not mount `email.send.execute`, `email.draft.save`, or `email.message.modify` as agent tools.
- Do not accept arbitrary action payloads on background queues.
- Queue only a confirmed intent ID and server-authored policy context if async execution is needed.
- Worker policy revalidates the capability and intent; queue possession is not authorization.
- Confirmation tokens are audience-bound to the action executor and unusable for other actions.
- A read connection ID cannot be substituted for an action connection/grant.
- Admin/support impersonation cannot confirm user sends.

## Required tests

### Capability enablement

- send remains off after normal read connection;
- enable send for only one of three accounts;
- Google `sub` mismatch between read and action callbacks;
- missing or extra scopes;
- callback replay/wrong user/wrong OAuth client;
- disabling send revokes only action access and expires pending intents;
- read access continues after action revocation.

### Per-message authorization

- user-created and agent-created proposal;
- confirmation of exact payload;
- edit recipient/subject/body/from after review;
- stale/expired intent;
- stale session/failed step-up;
- wrong user or wrong account;
- CSRF attempt;
- double-click and confirmation replay;
- direct executor call without confirmed intent;
- agent attempts to call confirmation/executor;
- recipient/body/size limit exceeded;
- no sending permission despite a valid read token.

### Delivery integrity

- success with provider IDs;
- provider rejects before dispatch completion;
- network timeout before dispatch;
- lost response after possible provider acceptance;
- worker/process crash at every state transition;
- no automatic retry from `delivery_unknown`;
- reconciliation and explicit user-driven resend;
- no duplicate after replay, refresh, or double-click.

### Privacy and audit

- action payload encrypted at rest;
- no recipients/subject/body/token in logs, traces, analytics, or audit metadata;
- terminal payload content deleted according to retention policy;
- account disconnect removes action credentials and pending content;
- consent and confirmation receipts contain policy metadata but no email content.

## Phase 3A definition of done

- Sending is disabled for every account by default.
- A user can separately enable `gmail.send` for one selected account.
- The agent can only create a visibly unsent local proposal.
- Every provider send is backed by a recent exact UI confirmation and one-time intent.
- Editing invalidates confirmation.
- No direct agent, worker, admin, internal API, or retry path can bypass the intent state machine.
- Ambiguous outcomes cannot duplicate-send automatically.
- Revocation, tampering, replay, cross-tenant, content-leak, and crash-window tests pass.
- Phase 3B and 3C remain disabled unless each receives its own documented go/no-go.

## References

- [Gmail scope definitions](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [messages.send authorization](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [drafts.create authorization](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create)
- [messages.modify authorization](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify)

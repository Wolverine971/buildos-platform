<!-- apps/web/docs/technical/email/PHASE-2-READ-ONLY-EMAIL-EXPERIENCE.md -->

# Phase 2 — Read-Only Gmail Experience

**Status:** In progress — first read-only search/retrieval vertical slice deployed to production
**Depends on:** Phase 1 complete and Phase 0 AI/data controls approved
**Does not include:** Gmail sending, Gmail drafts, modifying messages, attachments, full mailbox
sync, or email-triggered autonomous work

## Outcome

Users can search and read messages from one or more selected Gmail accounts in BuildOS. The agent
can help summarize and extract information, but the entire Gmail provider surface remains read-only
and every result retains source-account provenance.

## Implementation checkpoint — 2026-07-22

Implemented and deployed to `build-os.com`:

- a server-only provider gateway whose only provider request method is `GET`;
- independent connection ownership, connection status, BuildOS capability, credential kind, and
  stored-scope checks before a token can be used;
- bounded multi-account `messages.list` plus metadata-only `messages.get` search results;
- on-demand `messages.get` with fixed response, MIME depth, part, decoded-body, and text limits;
- plain-text preference and HTML-to-text sanitization with scripts, styles, forms, remote images,
  tracking attributes, and provider HTML removed before browser rendering;
- attachment references detected but never downloaded;
- explicit account selection and visible account provenance on every result and opened message;
- independent per-account pagination with encrypted 15-minute cursors bound to the authenticated
  user, connection, and normalized search query;
- a ten-page provider ceiling per account and a 100-message UI ceiling to prevent pagination from
  becoming an accidental mailbox sync;
- per-user and per-connection rate limits, `no-store` responses, bounded provider timeouts, and
  content-free audit metadata;
- focused tenant-isolation, mixed-account, sanitization, attachment, response-size, and GET-only
  provider tests.

Production validation:

- all three configured Gmail/Workspace connections completed a multi-account read-only search;
- the smoke query was deliberately guaranteed to return no messages, so validation read no real
  message body, attachment, or result content;
- the UI reported zero results without a partial-account warning;
- metadata-only audit rows recorded three successes with `resultCount: 0` and `hasMore: false`;
- the deployed gateway tolerates Google's successful empty partial-response shape while continuing
  to reject malformed non-empty payloads.

Still pending for Phase 2:

- thread reading, if approved;
- the fail-closed zero-data-retention AI interpretation lane and read-only agent tools;
- the remaining prompt-injection, log-leak, rate-limit, delegated-agent, and production-like tests.

## Initial product surface

- Select one, several, or all enabled Gmail accounts.
- Search using a constrained Gmail-compatible query.
- Display account, sender, date, subject, safe snippet, and thread/message identity.
- Open one selected message or thread.
- Summarize selected content or extract proposed BuildOS tasks/events.
- Link every result and derived proposal to its source connection and provider IDs.
- Never silently merge results from multiple accounts without account labels.

No result row or message view contains an executable Gmail action. A future Reply affordance can
open a **local proposal** only after Phase 3 is implemented.

## WP-2.1 — Read-only Gmail gateway

Create a server-only gateway with an explicit method allowlist. Initial methods:

- Gmail profile verification;
- `users.messages.list`;
- `users.messages.get`;
- `users.threads.get` if thread UX is approved;
- label listing only when needed for filtering.

The gateway must not wrap the entire Gmail client or export a raw authenticated Google client. It
must not contain send, draft, modify, trash, delete, batch-modify, import, or insert methods.

Every call requires:

- authenticated BuildOS user ID;
- explicit owned `connection_id`;
- active read capability;
- verified read credential and scope;
- per-user and per-connection rate limits;
- bounded page size, pagination, query length, and response size;
- metadata-only audit outcome.

## WP-2.2 — On-demand retrieval and minimization

Search with `messages.list`, which returns identifiers, then fetch only the messages needed for the
current view or requested analysis.

Initial restrictions:

- no full historical sync;
- no prefetch of every result body;
- no raw MIME download;
- no attachments;
- no remote images or CSS;
- no mailbox-wide vector index;
- no automatic saving of bodies;
- no search queries or content in analytics.

Prefer request-lifetime processing. If a short cache is required for responsiveness, keep it
encrypted/in-memory, user-and-connection scoped, capped by size, and no longer than 15 minutes.

## WP-2.3 — Message parsing and sanitization

Implement a deterministic parser before any UI or model processing:

- cap message and part sizes;
- accept only expected MIME structures;
- prefer plain text where available;
- sanitize HTML to bounded plain text;
- remove scripts, styles, forms, embedded objects, remote resources, tracking URLs, and unsafe
  attributes;
- identify quoted/replied/forwarded content where practical;
- preserve safe source metadata separately from body text;
- treat malformed or encrypted messages as unsupported rather than bypassing controls.

The browser never renders provider HTML directly.

## WP-2.4 — Multi-account query orchestration

For multi-account search:

- validate every requested connection before dispatch;
- apply a small concurrency cap;
- use independent per-account pagination/cursors;
- tolerate one account requiring reconnect without hiding other successful results;
- return account provenance on every item;
- define stable sorting across accounts using provider internal dates plus connection/message IDs;
- prevent a cursor from one account being used against another;
- cap total fetched messages and model input across the combined request.

Default account selection must be explicit and visible. BuildOS may remember the user's selected
accounts, but the agent cannot silently add another account to a request.

## WP-2.5 — Read-only agent tools

Expose narrow tools such as:

```text
email.accounts.list
email.messages.search
email.messages.get
email.threads.get
```

Tool policy requirements:

- connection IDs are server-validated against the authenticated user;
- tools cannot return credentials or raw MIME;
- result size and body length are bounded;
- every result includes connection provenance;
- child/delegated agents receive no Gmail tools unless the user request explicitly requires Gmail
  reading and the parent policy grants the same selected connection IDs;
- delegated work cannot broaden accounts, permissions, retention, or model provider policy;
- no tool name, operation enum, internal route, or queue message for `send`, `compose`, `modify`,
  `trash`, or `delete` exists in this phase.

## WP-2.6 — Safe AI interpretation

Email content enters a Gmail-specific processing lane:

1. deterministic sanitization and size limiting;
2. a no-tools model call that treats the content as quoted untrusted data;
3. schema validation of the summary/extraction;
4. policy-controlled presentation to the user;
5. a separate confirmation flow for any proposed BuildOS/Calendar mutation.

Requirements:

- zero data retention and data-collection denial are mandatory;
- no provider fallback outside the approved list;
- no prompt/content persistence in diagnostic artifacts;
- no model training or reusable evaluation capture;
- no raw body in error-repair prompts unless the same policy is applied;
- a model cannot emit or select tool permissions;
- instructions inside an email are never treated as BuildOS system/user instructions.

## WP-2.7 — Privacy and safety UX

The message surface displays:

- source account label/email;
- when BuildOS fetched the message;
- whether AI processed the selected content;
- controls to remove saved derived content;
- reconnect/error state without leaking provider details;
- a clear distinction between “Create proposal” and an external action.

Avoid copying entire emails into persistent BuildOS documents by default. When the user explicitly
saves a summary or task, store the minimum useful derived content plus source identifiers and make
the retention behavior visible.

## Required tests

### Read authorization

- selected single account;
- selected three accounts;
- wrong-user connection ID;
- disabled/revoked/reconnect-required account;
- mixed success across accounts;
- forged/swapped pagination cursor;
- request exceeds account/message/body caps;
- token has unexpected or missing scope.

### Content safety

- script/style/form/remote-image removal;
- malformed MIME and excessive nesting;
- oversized body/part;
- tracking pixel and unsafe URL;
- prompt injection requesting tool use, secrets, or account expansion;
- quoted message containing apparent system instructions;
- unsupported attachment and encrypted message;
- no content leakage to logs, traces, analytics, or error tracking.

### Agent/tool boundary

- no action tools are mounted;
- agent cannot synthesize an internal action operation name;
- delegated run cannot add accounts or Gmail permissions;
- generated task/event remains a proposal requiring confirmation;
- fail closed when no approved ZDR model route is available.

## Phase 2 definition of done

- A user searches and reads selected messages across three Gmail accounts with visible provenance.
- Only requested message bodies are fetched.
- Provider HTML is never rendered directly.
- Raw bodies are not persisted by default.
- Gmail content uses the approved fail-closed AI path.
- All exposed provider and agent operations are read-only.
- Prompt-injection, tenant-isolation, log-leak, rate-limit, and content-sanitization tests pass.
- A production-like read-only demo is ready for Google verification evidence.

## References

- [List Gmail messages](https://developers.google.com/workspace/gmail/api/guides/list-messages)
- [messages.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [messages.get reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Google Workspace API user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)

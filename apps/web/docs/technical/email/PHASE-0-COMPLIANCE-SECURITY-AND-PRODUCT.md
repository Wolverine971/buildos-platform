<!-- apps/web/docs/technical/email/PHASE-0-COMPLIANCE-SECURITY-AND-PRODUCT.md -->

# Phase 0 — Gmail Compliance, Security, and Product Decisions

**Status:** Planned
**Depends on:** none
**Blocks:** production Gmail OAuth, schema implementation, and Google verification submission

## Outcome

BuildOS has an approved Gmail data-flow diagram, scope inventory, project-isolation decision,
privacy/consent language, threat model, retention/deletion contract, and verification plan before it
handles a real user's email.

Phase 0 is not paperwork after implementation. `gmail.readonly` is a Google Restricted scope, and
the security choices made here constrain the schema, OAuth clients, AI routing, audit system, and
user experience.

## Locked product decisions

- One BuildOS user may connect up to five Gmail/Workspace accounts initially.
- The standard integration is called **Connect Gmail (read only)**.
- V1 retrieves email on demand and does not ingest a whole mailbox.
- Raw bodies are transient and are not stored by default.
- Remote images, attachments, background triggers, and autonomous actions are disabled.
- Google `sub`, not email address, is the provider identity.
- Sending, saving Gmail drafts, and modifying messages are separate optional capabilities.
- The agent may propose an email but may never execute a send.
- Every send is confirmed once in the UI against the exact message payload.
- Bulk send, scheduled send, automatic replies, and permanent delete are out of scope.

## WP-0.1 — Google Cloud and OAuth topology

Document and approve four separate concerns:

1. existing Google login identity;
2. existing Google Calendar access;
3. Gmail read access;
4. Gmail action access.

Preferred production decision: use a dedicated Gmail Read Google Cloud project and a separate Gmail
Actions project. At minimum, use separate OAuth clients, credentials, databases rows, managed keys,
service identities, and runtime services.

Create a distinct Gmail development/testing project. Do not request new Restricted scopes from the
production project until the feature and verification materials are ready. Record owners for:

- Google Cloud organization/project administration;
- OAuth brand and verified-domain maintenance;
- secret and KMS key rotation;
- quota monitoring;
- verification correspondence;
- annual security reassessment.

### Exit criteria

- A short architecture decision record identifies projects, clients, redirect domains, owners, and
  isolation boundaries.
- The Gmail Read scope list is exactly `openid email https://www.googleapis.com/auth/gmail.readonly`.
- The Gmail Actions client begins with no scopes in production. `gmail.send` is added only when
  Phase 3A is approved.
- No design depends on a token shared with login or Calendar.

## WP-0.2 — Data inventory and retention contract

Create a field-level inventory for:

- connection metadata;
- access/refresh tokens;
- Gmail message IDs and thread IDs;
- headers, snippets, bodies, and attachments;
- search queries;
- AI prompts and outputs;
- derived summaries/tasks/events;
- proposed outgoing messages;
- send results and audit records;
- backups, logs, analytics, traces, and support tools.

For every field, record purpose, storage location, encryption, roles with access, retention,
deletion trigger, backup behavior, and whether it is transferred to a model provider.

Recommended initial defaults:

| Data                               | Retention                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| OAuth credentials                  | Until disconnect/revocation/account deletion; encrypted with managed key       |
| Raw message bodies                 | Request lifetime only; optional bounded memory cache no longer than 15 minutes |
| Search result IDs/minimal metadata | Request lifetime unless the user saves a derived item                          |
| AI email prompts                   | Zero data retention provider path; no BuildOS diagnostic persistence           |
| Local outgoing proposal            | Encrypted; user-controlled, or 24-hour expiry for transient proposals          |
| Confirmed action payload           | Keep only through resolution; then erase content and retain metadata/hash      |
| Security audit                     | Metadata only; no subjects, bodies, recipients, headers, or tokens             |

### Exit criteria

- Security, product, and privacy owners approve the inventory.
- Deletion behavior is testable for disconnect, individual proposal deletion, and BuildOS account
  deletion.
- Email content is explicitly excluded from logs, analytics, error payloads, and ordinary model
  traces.

## WP-0.3 — Consent and privacy surfaces

Prepare a just-in-time disclosure immediately before Gmail Read consent. It must explain:

- exactly what BuildOS reads;
- why it reads it and which product features use it;
- whether AI processes the content and under what no-training/no-retention guarantees;
- what is and is not stored;
- that BuildOS cannot send or modify email through the read connection;
- how to disconnect and delete data;
- how multiple connected accounts are kept separate.

Prepare separate disclosures for each future action capability:

- sending one message with `gmail.send`;
- saving drafts with `gmail.compose`;
- modifying message state with `gmail.modify`.

Enabling one capability must not imply consent to another. Store a versioned consent receipt without
storing sensitive email content.

Update the privacy policy before verification submission with Gmail-specific data categories,
purposes, retention, deletion, AI processors, and Limited Use language. Legal/security review is a
launch gate.

## WP-0.4 — Threat model

Model at least these threats:

- OAuth CSRF, state replay, callback swapping, and wrong-user attachment;
- a user accidentally reconnecting the wrong Google account;
- refresh-token theft and cross-service token leakage;
- cross-tenant connection/message access;
- email-address changes and account reuse assumptions;
- malicious HTML, tracking pixels, links, and attachments;
- prompt injection inside subject/body/quoted text;
- an agent attempting to broaden account selection or tool permissions;
- an agent or server route attempting a send without user confirmation;
- UI confirmation replay, payload tampering, double-click, and stale confirmation;
- provider timeout after accepting a send, causing duplicate retry risk;
- secrets or email content appearing in logs/support tooling;
- disabled/revoked accounts continuing to work through a cache;
- background notification forgery if Gmail push is added later.

For each threat, assign an application control, test, monitoring signal, and incident owner.

## WP-0.5 — AI processor and prompt-injection policy

Audit every model route that could receive Gmail content, including retries, fallback providers,
structured-output repair, moderation, observability, debugging, and support replay.

Requirements:

- `data_collection: deny` and zero-data-retention routing are mandatory.
- A Gmail request fails closed if no approved provider is available.
- Operator break-glass settings cannot silently downgrade Gmail content to a retaining provider.
- Gmail content is processed in a no-tools interpretation step.
- No global/user-crossing prompt cache or vector index contains raw Gmail content.
- Email content cannot change allowed tools, account IDs, system instructions, or permissions.
- Gmail data is not used for generalized model training, evaluation corpora, or product analytics.

### Exit criteria

- A testable provider allowlist and Gmail-specific fail-closed policy are approved.
- The data inventory includes every processor and failure path.
- Prompt-injection red-team cases exist before Phase 2 ships.

## WP-0.6 — Google verification and CASA preparation

Reading message bodies requires `gmail.readonly`, a Restricted scope. Prepare for:

- OAuth brand and domain verification;
- scope justification and minimum-scope explanation;
- a complete functional demonstration video;
- public privacy policy and in-product disclosure;
- Google Restricted-scope review;
- the CASA/security assessment level assigned by Google;
- annual reassessment and remediation ownership.

Request assessor requirements and pricing early, but submit the final Google review only when the
read-only feature and disclosures are production-representative. Google's published Restricted-
scope review timing should be treated as a critical-path estimate, not a guaranteed date.

## Phase 0 definition of done

- All work-package exit criteria are met.
- The read/action project boundary is approved.
- Scope names are locked and minimum-scope rationale is documented.
- Product copy clearly says the default connection is read-only.
- The per-send confirmation invariant appears in the product spec, threat model, and test plan.
- Retention, deletion, AI routing, incident response, and verification owners are assigned.
- There is an explicit go/no-go record to begin Phase 1.

## References

- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google Workspace API user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- [OAuth verification requirements](https://support.google.com/cloud/answer/13464321)
- [CASA requirements](https://support.google.com/cloud/answer/13465431)
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)

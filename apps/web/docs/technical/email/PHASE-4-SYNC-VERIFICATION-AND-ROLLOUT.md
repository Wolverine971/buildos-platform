<!-- apps/web/docs/technical/email/PHASE-4-SYNC-VERIFICATION-AND-ROLLOUT.md -->

# Phase 4 — Gmail Sync, Verification, and Rollout

**Status:** Planned
**Depends on:** Phase 2 for read-only launch; Phase 3 only if action capabilities are included
**Principle:** background sync must not broaden OAuth scopes, data retention, agent authority, or
action permissions

## Outcome

BuildOS completes Google Restricted-scope verification and a controlled production rollout. If
product evidence justifies it, users may separately opt into minimal background Gmail indexing for
fresher read experiences. Background processing remains read-only and does not trigger autonomous
email or BuildOS actions.

## WP-4.1 — Decide whether background sync is necessary

Start with measured Phase 2 evidence. Add sync only if on-demand search cannot meet a validated user
need such as daily briefs or low-latency inbox awareness.

The decision record must compare:

- user value and expected query frequency;
- added Restricted-data storage;
- Pub/Sub and worker operations;
- retention and deletion complexity;
- quota/cost effects;
- prompt-injection exposure from unsolicited new messages;
- verification/CASA impact.

Default decision: remain on demand. Sync is an opt-in enhancement, not a prerequisite for launch.

## WP-4.2 — Minimal opt-in sync design

If approved, add an account-level **Keep recent email index updated** setting with a just-in-time
disclosure. The initial index should contain only what the feature needs, preferably:

- connection ID;
- provider message/thread IDs;
- internal date;
- minimal safe headers;
- labels needed for filtering;
- sync/history state;
- retention expiry.

Do not persist raw bodies or attachments by default. Fetch a body on demand when the authenticated
user opens or explicitly analyzes the message.

Use Gmail `watch` with Google Cloud Pub/Sub:

- the topic project must satisfy Gmail's project requirements;
- grant publisher access only to Google's Gmail push service account;
- verify Pub/Sub authentication and expected topic/subscription;
- map notifications to a connection without trusting user-controlled payload fields;
- renew watch registrations daily and no less frequently than Gmail requires;
- process `history.list` incrementally from the stored history ID;
- handle dropped notifications and `404` history expiration with a bounded resync;
- make workers idempotent and per-connection rate limited;
- stop watch and delete state immediately on disconnect/disable.

Notifications schedule read-only synchronization. They never create or confirm an action intent.

## WP-4.3 — Retention and deletion for indexed data

- Use a short recent-message window approved in Phase 0.
- Apply `retention_expires_at` and a reliable deletion job.
- Encrypt any persisted sensitive metadata separately from OAuth credentials.
- Keep RLS/service authorization keyed by user and connection.
- Delete indexed data on opt-out, disconnect, and account deletion.
- Reapply deletions after backup restoration according to the privacy policy.
- Provide an operator-verifiable deletion receipt without retaining content.

Any proposal to store message bodies, attachments, embeddings, or a long-term mailbox index requires
a new privacy/security/verification go/no-go and is not authorized by this phase.

## WP-4.4 — Verification package

Prepare a production-representative Google submission containing:

- OAuth app branding and verified domains;
- exact scope list and minimum-scope rationale;
- read-only connection and multiple-account demonstration;
- in-product disclosure and privacy policy;
- a video showing how Gmail data is used;
- disconnect, revocation, and deletion behavior;
- data-flow and processor inventory;
- security controls and incident-response contacts;
- CASA evidence and remediation status when requested.

If Phase 3A is included, demonstrate that `gmail.send` is separately granted and that every send
requires exact UI confirmation. If it is not included, keep the Actions project/client disabled and
exclude those scopes from the launch submission.

## WP-4.5 — Security verification

Complete independent testing for:

- OAuth state/nonce/replay/callback mix-up;
- cross-user and cross-account isolation;
- token encryption, key rotation, and service identity boundaries;
- revocation and cache invalidation;
- HTML/MIME sanitization and remote-resource blocking;
- prompt injection and model/tool boundary escape;
- content leakage through logs, analytics, errors, support, and AI fallbacks;
- Gmail API quota/rate-limit abuse;
- Pub/Sub forgery, replay, loss, and out-of-order delivery if sync is enabled;
- action-intent bypass and duplicate-send windows if Phase 3A is enabled;
- account and content deletion, including restored-backup procedure.

Critical/high findings block rollout. Security fixes require regression coverage.

## WP-4.6 — Observability without content

Track only non-content operational signals:

- connection/reconnect/revocation counts;
- OAuth callback failures by safe category;
- token refresh health;
- API requests, latency, quota units, and error categories;
- per-connection sync lag and watch expiration;
- sanitizer rejection categories and size caps;
- ZDR/provider-policy denials;
- action-intent states and ambiguous outcomes without email content;
- deletion job success and age.

Alert on cross-tenant authorization failures, repeated OAuth replay, unusual per-account volume,
token decrypt failures, action confirmation bypass attempts, elevated `delivery_unknown`, and
deletion backlog. Do not attach raw provider responses to alerts.

## WP-4.7 — Controlled rollout

Recommended order:

1. internal test accounts in the dedicated development project;
2. security/privacy acceptance with synthetic email fixtures;
3. DJ's three accounts in an internal production pilot after verification permits it;
4. small feature-flagged user cohort;
5. read-only general availability after monitoring and support readiness;
6. optional sync cohort only after its separate decision;
7. optional Phase 3A send cohort only after its separate go/no-go and action security suite.

Do not expose an unverified Restricted-scope client broadly. Maintain kill switches that can:

- stop new Gmail connections;
- disable all reads while preserving connection metadata;
- disable AI processing while retaining manual reads;
- stop watches/workers;
- disable all Gmail actions independently of reads;
- revoke a compromised OAuth client or credential class.

Rollback must not strand undeletable credentials, watches, queued jobs, or action intents.

## WP-4.8 — Operational ownership

Publish runbooks for:

- OAuth client/secret compromise;
- KMS key rotation and decrypt failures;
- Google verification or scope-status change;
- mass `invalid_grant`/reconnect event;
- Pub/Sub outage or history expiration;
- suspected cross-tenant or content exposure;
- model-provider retention-policy failure;
- ambiguous email delivery;
- user deletion/revocation failure;
- Gmail API quota exhaustion.

Assign an owner and escalation path for every runbook and for annual Google reassessment.

## Required launch gates

- Google OAuth verification is approved for every production scope in use.
- Required CASA/security assessment and remediation are complete.
- Public privacy policy and just-in-time disclosures match actual behavior.
- Production OAuth clients, projects, redirects, secret stores, and KMS keys are verified.
- Read-only and action service identities are isolated.
- All critical security and privacy tests pass.
- Deletion/revocation is live-tested with a real connected account.
- Monitoring, kill switches, support playbook, and incident response are operational.
- Feature flags default action capabilities to off.
- No unapproved scope or background data use is present.

## Phase 4 definition of done

- The read-only product is verified, monitored, documented, and safely available to its approved
  cohort.
- Multiple-account isolation and deletion have been proven in production-like conditions.
- Optional sync, if enabled, stores only approved minimal data and cannot trigger actions.
- Optional sending, if enabled, remains a separate per-account capability with per-message UI
  confirmation.
- Annual reassessment, policy review, key rotation, and incident-response responsibilities have
  named owners and dates.

## References

- [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push)
- [Synchronize Gmail clients](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail API quotas](https://developers.google.com/workspace/gmail/api/reference/quota)
- [OAuth verification requirements](https://support.google.com/cloud/answer/13464321)
- [CASA requirements](https://support.google.com/cloud/answer/13465431)

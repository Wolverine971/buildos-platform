<!-- docs/technical/security-event-logging-plan.md -->

# Security Event Logging Plan

## Goal

`/admin/security` should be driven by a canonical stream of security-relevant events, not by application error rows. Error logs remain for debugging unexpected failures. Security events track successful, failed, blocked, denied, and audited activity that matters to account, integration, external-agent, and data-access posture.

## Event Boundaries

| Stream                | Purpose                                              | Examples                                                                                            |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `security_events`     | Intentional security-relevant activity and decisions | login succeeded, password reset requested, OAuth state mismatch, agent session started, tool denied |
| `error_logs`          | Unexpected failures and stack/debug context          | `/auth/callback` threw 500, Supabase query failed, token refresh exception                          |
| Existing audit tables | Domain-specific durable access records               | profile/contact access audit, agent write execution audit                                           |
| Admin metrics         | Aggregates derived from events and audits            | login failure rate, active agent sessions, blocked injection count                                  |

If one request has both security meaning and an implementation failure, write both records and connect them with `request_id` where available.

## Canonical Event Shape

`security_events` stores sanitized metadata only.

Required fields:

- `event_type`: dotted event name such as `auth.login.succeeded`
- `category`: `auth`, `agent`, `access`, `admin`, `detection`, `webhook`, `integration`, or `system`
- `outcome`: `success`, `failure`, `blocked`, `allowed`, `denied`, or `info`
- `severity`: `info`, `low`, `medium`, `high`, or `critical`
- `actor_type`: `anonymous`, `user`, `admin`, `external_agent`, or `system`
- `created_at`

Optional fields:

- `actor_user_id`
- `external_agent_caller_id`
- `target_type`
- `target_id`
- `request_id`
- `session_id`
- `ip_address`
- `user_agent`
- `risk_score`
- `reason`
- `metadata`

Never store:

- passwords
- OAuth authorization codes
- access tokens or refresh tokens
- reset links
- raw external-agent secrets
- full prompt content
- contact method values or other sensitive user content

Store IDs, token prefixes, hashes, counts, scopes, statuses, and sanitized reasons instead.

## Event Taxonomy

Auth events:

- `auth.login.succeeded`
- `auth.login.failed`
- `auth.login.rejected`
- `auth.login.error`
- `auth.logout.succeeded`
- `auth.logout.failed`
- `auth.logout.error`
- `auth.session.set_failed`
- `auth.password_reset.requested`
- `auth.password_reset.request_rejected`
- `auth.password_reset.request_failed`
- `auth.password_reset.session_established`
- `auth.password_reset.session_failed`
- `auth.password_reset.link_error`
- `auth.password_reset.completed`
- `auth.password_reset.failed`
- `auth.oauth.login.succeeded`
- `auth.oauth.login.failed`
- `auth.oauth.register.succeeded`
- `auth.oauth.register.failed`
- `auth.oauth.state_mismatch`
- `auth.oauth.connect.succeeded`
- `auth.oauth.connect.failed`
- `auth.oauth.token_refresh.failed`

Agent events:

- `agent.caller.created`
- `agent.caller.updated`
- `agent.caller.provisioned`
- `agent.caller.trusted`
- `agent.caller.revoked`
- `agent.token.rotated`
- `agent.auth.failed`
- `agent.session.started`
- `agent.session.activated`
- `agent.session.rejected`
- `agent.session.ended`
- `agent.tool.invoked`
- `agent.tool.denied`
- `agent.write.reserved`
- `agent.write.reserve_failed`
- `agent.write.succeeded`
- `agent.write.failed`
- `agent.write.replayed`
- `agent.write.pending_conflict`

Detection and data-access events:

- `detection.prompt_injection.detected`
- `detection.prompt_injection.blocked`
- `detection.prompt_injection.false_positive`
- `detection.rate_limit.exceeded`
- `access.profile.search`
- `access.profile.doc_read`
- `access.profile.doc_write`
- `access.profile.prompt_injection`
- `access.contact.search`
- `access.contact.method_read`
- `access.contact.method_write`
- `access.contact.prompt_injection`
- `access.contact.action_prepare`
- `access.sensitive_contact.requested`
- `access.sensitive_contact.exposed`

Integration and webhook events:

- `integration.calendar.connected`
- `integration.calendar.connect_failed`
- `integration.calendar.oauth_failed`
- `integration.calendar.oauth_state_mismatch`
- `integration.calendar.webhook.registered`
- `integration.calendar.webhook.failed`
- `webhook.signature.failed`
- `webhook.processing.failed`

## Clean Path

1. Add `security_events`.
2. Add a server helper, `logSecurityEvent`, that sanitizes metadata and fails open.
3. Instrument auth, OAuth, password reset, prompt-injection detection, sensitive access, and external agent integration.
4. Update `/admin/security` to make `security_events` the primary real-time source while retaining existing audit tables as supporting evidence.
5. Keep `error_logs` linked through `request_id` or request metadata for debugging.

## Request Path Performance

Security event logging should not add unbounded database latency to user-facing requests.

- Default `logSecurityEvent` delivery is background for normal success, failure, info, and audit-feed events.
- Blocked, denied, high-severity, critical, and external-agent auth-failure events use a short bounded wait before the request continues.
- Callers that truly require durable persistence before continuing can use explicit blocking delivery.
- Route handlers should pass platform `waitUntil` support when available so background writes can outlive the response safely.

## Dashboard Requirements

The admin security page should include:

- live security-event feed
- posture score and computed findings
- auth metrics
- external-agent integration metrics
- prompt-injection detection metrics
- sensitive access metrics
- integration token and webhook hygiene
- data coverage status

The browser view should receive only sanitized fields.

## Current Rollout Status

- [x] Define event model and retention boundaries.
- [x] Add migration for `security_events`.
- [x] Add server-side logging helper.
- [x] Instrument password login, logout, password reset, Google OAuth, calendar OAuth, prompt injection, sensitive contact/profile access, and external agent sessions/writes.
- [x] Update `/admin/security` to use `security_events` as the primary event stream.
- [ ] Backfill historical security events from legacy `security_logs` if needed.
- [ ] Add retention policy once product policy is finalized.

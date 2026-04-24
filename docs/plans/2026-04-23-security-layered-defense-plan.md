<!-- docs/plans/2026-04-23-security-layered-defense-plan.md -->

# Security Hardening Plan

Date: 2026-04-23

## Goal

Improve BuildOS's security posture with a layered defense model that reduces compromise risk without introducing noticeable user-facing latency or breaking external agent integrations like OpenClaw.

## Current Position

The database layer is stronger than the request edge.

- Good: Supabase RLS coverage is substantial, security event logging exists, external agent caller tokens are hashed before lookup, and standard browser security headers are already present.
- Weakest layer: request-edge hardening is uneven. Internal diagnostics are overly informative, some webhook/shared-secret handling is too loose, and Google Calendar refresh/access tokens are stored in plaintext at the app layer.

## CSRF Clarification

SvelteKit does include built-in CSRF protection. Per the official SvelteKit configuration docs:

- `kit.csrf.checkOrigin` defaults to `true`
- it checks the incoming `Origin` header for `POST`, `PUT`, `PATCH`, and `DELETE` form submissions
- it applies to `application/x-www-form-urlencoded`, `multipart/form-data`, and `text/plain`
- it applies in production, not local development

Implication for BuildOS:

- We should keep relying on SvelteKit's built-in protection for normal browser form submissions.
- We should not assume that protection covers JSON API calls from `fetch(..., { headers: { 'Content-Type': 'application/json' } })`.
- We should not add a blanket same-origin rule to all JSON POST routes, because that would risk breaking external agent integrations such as OpenClaw and other bearer-token callers.

## No-Break Constraints

These constraints guide the rollout:

- Do not break `/api/agent-call/*` JSON-RPC traffic used by external agents.
- Do not break public webhook ingress that is intentionally machine-to-machine.
- Prefer minimal-response hardening and data-at-rest protection before broader request-shape changes.
- Prefer backward-compatible data migrations over flag days.

## Phase 1

Approved now.

### 1. Internal Diagnostics

Reduce exposed operational detail while preserving functionality.

- Make worker health responses minimal.
- Stop returning worker internals through `/api/worker/health`.
- Remove configuration-state leakage from `/webhooks/daily-brief-email` GET.
- Restrict `/debug/auth` to local development or admins.
- Reduce secret leakage from the Stripe webhook test endpoint.

Expected performance impact: none.

### 2. Google Calendar Tokens

Move Google Calendar access and refresh tokens to encrypted storage at the application layer.

- Encrypt on write.
- Decrypt on read in server-only code paths.
- Support legacy plaintext rows so no existing users break.
- Lazily rewrite plaintext rows to encrypted form when they are next used.
- Add a dedicated encryption env var, but keep a safe server-secret-derived fallback so deploys do not hard fail before configuration is updated.

Expected performance impact: negligible. AES-GCM on short token strings is effectively free compared to network I/O and Google API calls.

### 3. Low-Risk Layer 1 Cleanup

Do now only where it is clearly no-break.

- Use constant-time comparison for the daily brief webhook signature verification path.
- Stop logging raw headers and rejected signatures in webhook failure logs.

Expected performance impact: none.

## Phase 2

Do next after Phase 1 settles.

### 1. Browser Policy

- Add CSP in `Report-Only` first.
- Inventory required third-party origins for Ahrefs, Clarity, Meta, Vercel analytics, and any inline scripts in `app.html`.
- Move to enforced CSP after violations are stable.

### 2. Targeted JSON Mutation Origin Checks

Apply explicit `Origin` validation only to session-cookie JSON mutation endpoints that are browser-owned.

- Good candidates: auth/profile/settings/browser-only mutation routes.
- Exclude: `/api/agent-call/*`, `/api/webhooks/*`, `/webhooks/*`, cron endpoints, and other bearer/HMAC machine callers.

### 3. Route-Level Throttling

Apply rate limiting only where it helps:

- auth login/register/reset paths
- AI-heavy generation routes
- webhook ingress abuse controls where appropriate

Avoid global rate limiting.

## Phase 3

### 1. Service-to-Service Auth Normalization

- Replace remaining raw secret string comparisons with constant-time helpers.
- Standardize machine-to-machine auth around bearer or HMAC patterns with replay window checks where useful.

### 2. Backfill and Rotation

- Backfill old plaintext calendar rows proactively after the lazy migration path proves stable.
- Rotate to a dedicated `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY` in production.
- Keep fallback decryption support long enough to avoid forced reconnects.

### 3. Detection

Add alerts on top of the existing `security_events` stream for:

- auth failure bursts
- unknown external agent callers
- webhook auth failures
- sudden calendar token refresh failures
- unusual rate-limit spikes

## Rollout Notes

- Phase 1 is intentionally narrow and low-risk.
- External agents are explicitly preserved by not applying broad same-origin rules to JSON APIs.
- Calendar token encryption is backward-compatible and does not require a schema migration.

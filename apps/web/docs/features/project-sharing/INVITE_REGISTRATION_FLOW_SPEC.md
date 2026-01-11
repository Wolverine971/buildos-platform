<!-- apps/web/docs/features/project-sharing/INVITE_REGISTRATION_FLOW_SPEC.md -->

# Invite registration flow spec

**Status**: Implemented (pending QA)  
**Last updated**: 2026-01-10  
**Owner**: Platform

## Overview

Invites currently assume the recipient already has a BuildOS account. For new users, the invite link redirects to login, registration ignores the invite, and no pending-invites list exists. This spec defines the account-creation flow for invites so new users can register and then explicitly accept pending invites.

## Related docs

- `apps/web/docs/features/project-sharing/PROJECT_SHARING_SPEC.md`

## Goals

- Allow invitees without accounts to register and then see their pending project invites.
- Preserve the invite context across signup/login (including OAuth).
- Require explicit acceptance (invite should be "waiting" post-login).
- Avoid exposing invite token hashes to clients.
- Keep owner/admin invite creation flow unchanged.

## Non-goals

- Organization/team invites or SSO provisioning.
- Automatic acceptance solely based on email match.
- Multi-project role management or ownership transfer.

## Previous behavior (pre-fix)

- Invite acceptance auto-ran on page load: `apps/web/src/routes/invites/[token]/+page.server.ts`.
- Unauthenticated users were redirected to `/auth/login?redirectTo=...`, but login/register did not honor redirects: `apps/web/src/routes/auth/login/+page.svelte`, `apps/web/src/routes/auth/register/+page.svelte`.
- Token-based acceptance uses RPC: `apps/web/src/routes/api/onto/invites/token/[token]/accept/+server.ts`.
- Invite records are admin-only via RLS; invitees cannot query `onto_project_invites` directly: `supabase/migrations/20260320000000_project_sharing_membership.sql`.

## Implemented UX flow

1. **Invite created** (unchanged): email includes invite link.
2. **Invite email CTAs**:
    - Primary: `/invites/{token}` (accept flow)
    - Secondary: `/auth/register?redirect=/invites/{token}`
    - Tertiary: `/auth/login?redirect=/invites/{token}`
3. **Invite landing page (`/invites/{token}`)**:
    - Not authenticated: show "Sign in" and "Create account" buttons (preserve `redirect`).
    - Authenticated: show invite details + explicit **Accept** / **Decline** actions (no auto-accept).
4. **Post-auth**:
    - If `redirect` is set, navigate to it.
    - Otherwise, route to `/invites` when pending invites exist.
5. **Pending invites list**:
    - Shows all pending invites for current user email.
    - Actions: Accept / Decline.

## UI changes

- `apps/web/src/routes/invites/[token]/+page.svelte` becomes a preview + action page (no auto-accept).
- New page: `apps/web/src/routes/invites/+page.svelte` (list pending invites).
- Optional follow-up: add a "Pending invites" panel to `/projects`.

## Backend changes

### RPCs (preferred for security)

- `list_pending_project_invites()`
    - Security definer.
    - Uses authenticated email to return only safe fields:
        - `invite_id`, `project_id`, `project_name`, `role_key`, `access`, `invited_by_name`, `expires_at`, `created_at`.
    - Does not return `token_hash`.

- `get_project_invite_preview(p_token_hash text)`
    - Returns the same safe fields for a token (used by `/invites/{token}` page).

- `accept_project_invite_by_id(p_invite_id uuid)`
    - Uses `auth.uid()` + `public.users` email to validate invitee.
    - Idempotent if already a member.

- `decline_project_invite(p_invite_id uuid)` (optional)
    - Sets status to `declined`.

### API endpoints

- `GET /api/onto/invites/pending` -> `list_pending_project_invites()`
- `POST /api/onto/invites/:inviteId/accept` -> `accept_project_invite_by_id()`
- `POST /api/onto/invites/:inviteId/decline` -> `decline_project_invite()` (optional)
- `POST /api/onto/invites/token/:token/accept` remains for token-based acceptance (legacy support).

### Data model

- Added `declined` to `chk_project_invite_status` constraint.
- No new columns required for basic flow.

## Auth + redirect handling

- Standardize on `redirect` query parameter across `/auth/login` and `/auth/register`.
- On successful login/registration (including Google OAuth), navigate to `redirect` if it is a safe internal path.
- Persist `redirect` for Google OAuth via encoded state.

## Edge cases

- **Expired invite**: show "Invite expired" with guidance to request a new invite.
- **Email mismatch**: prompt to log in with the invited email.
- **Already a member**: treat accept as success and redirect to project.
- **Multiple invites**: list and accept individually.

## Logging + telemetry

- Log failures via `logOntologyApiError` (new endpoints).
- Track events: invite viewed, accept, decline, expired, email mismatch.

## Testing plan

- API tests for pending list (only matching email), accept/decline, expired behavior.
- UI tests for redirect flow from invite -> register/login -> accept.
- Security tests: ensure no `token_hash` exposure via API/RPC.

## Rollout

- Feature flag for new invite preview + pending list.
- Backward compatibility: existing invite links still function.
- Monitor acceptance errors and conversion rates (invite viewed -> accept).

## Implementation status

- [x] Invite email includes project name/description plus register/login links with redirect.
- [x] Invite preview page shows details + accept/decline actions.
- [x] Pending invites page + API endpoints.
- [x] RPCs added: preview, list, accept by id, decline.
- [x] Auth redirect handling for login/register + Google OAuth state.
- [ ] Tests for new endpoints and UI flows.

## Open questions

- Best placement for pending invites (dashboard vs projects vs dedicated `/invites`)?
- Do we allow accepting invites before email verification is complete?

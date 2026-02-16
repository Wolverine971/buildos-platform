---
title: New User Flow Audit — Remaining Findings
date: 2026-02-16
category: ux-audit
tags: [onboarding, auth, new-user, ux]
status: open
path: thoughts/shared/research/2026-02-16_00-00-00_new-user-flow-audit.md
---

# New User Flow Audit — Remaining Findings

Audit of the complete new-user journey: first visit → registration → onboarding → dashboard.

Three issues were fixed inline (see git history). The findings below remain open.

---

## Fixed (2026-02-16)

1. **`confirm()` dialog for duplicate email** — replaced with inline "Sign in to your existing account" link in the error banner (`auth/register/+page.svelte`).
2. **Onboarding modal only recalculated on route change** — `needsOnboarding` and `showOnboardingModal` are now `$derived` reactive to `user`/`completedOnboarding`/`onboardingProgress`, not gated by route change (`+layout.svelte`).
3. **Dashboard loads expensive analytics behind onboarding modal** — `+page.server.ts` now returns empty analytics for users with `completed_onboarding: false`.

---

## Open Findings

### HIGH — `/projects/create` throws 401 instead of redirecting

**File:** `apps/web/src/routes/projects/create/+page.server.ts:16-17`

The page uses `throw error(401, 'Authentication required')` which shows a raw error page. Should redirect unauthenticated users to `/auth/login`. Note: the `/projects/+layout.server.ts` has a proper redirect, but the create page's load function runs and throws first.

**Note from product:** Users should not be going to `/projects/create` at all. The flow should redirect to Agentic Chat with the create-project context instead of rendering a standalone create page. This is a broader product decision — the current create page uses `AgentChatModal` but is a dedicated route that could be replaced by a chat-initiated flow.

### HIGH — Inconsistent auth guards across routes

No global auth middleware in `hooks.server.ts`. Individual pages handle auth checks differently:

| Route | Guard behavior |
|---|---|
| `/onboarding` | `redirect(303, '/auth/login')` — correct |
| `/projects/*` | `redirect(303, '/auth/login')` via layout — correct |
| `/projects/create` | `error(401)` — broken |
| `/dashboard/calendar` | Unknown — needs audit |
| `/admin/*` | Unknown — needs audit |

Consider adding a centralized auth guard in hooks for `/projects/*`, `/dashboard/*`, `/admin/*`, and `/onboarding/*` routes.

### MEDIUM — V2 onboarding complete but still feature-flagged

V2 onboarding (9-step flow with brain dump import, calendar analysis, preference capture) is behind `?v2=true` query param. Per docs, all 3 implementation phases are complete. New users get the inferior V1 experience (4 plain text fields) by default.

**Decision needed:** When to promote V2 to default.

### MEDIUM — V1 and V2 onboarding write to different completion flags

- V1 sets `onboarding_completed_at` in `user_context` table
- V2 sets `completed_onboarding: true` on `users` table AND `onboarding_v2_completed_at`
- The layout checks `user.completed_onboarding` (from `users` table)

If V1's `/api/onboarding` `complete` action fails to update `users.completed_onboarding`, the onboarding modal would keep reappearing. Should audit the V1 complete action to verify it updates both tables.

### LOW — localStorage-only modal dismissal

The "I'll do this later" button stores dismissal in `localStorage('onboarding_modal_dismissed')`. Not synced to the server. Different device/browser will show the modal again. Consider persisting dismissal in the database.

### LOW — Toast after navigation race condition

In `auth/register/+page.svelte:284-288`, the welcome toast fires after `await goto(destination, { invalidateAll: true })`. The `invalidateAll` causes a full data reload and re-render, which may reset the toast service state before the toast renders.

### LOW — Arbitrary 2-second delay after onboarding completion

V1 onboarding's "Complete Setup" waits 2 seconds via `setTimeout` before redirecting to `/`. No user-visible reason for the wait. If the background analysis job needs time, show a progress indicator instead.

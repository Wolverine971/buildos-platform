# Project Calendar Connection Updates

## Goals

- Detect a user’s Google Calendar connection status inside the project header.
- Guide users without a Google connection through a lightweight connect flow without leaving the project page.
- Keep the post-connection experience tight: surface project-calendar creation/customization once Google is linked.

## Implementation Plan

- **Surface calendar status in the header**
    - Read the calendar status already stored in `projectStoreV2.calendarStatus` (populated via `ProjectDataService.loadCalendarStatus()`).
    - Branch the header CTA:
        - `Connect Calendar` when `calendarStatus?.isConnected` is false.
        - `Customize Calendar` when Google is connected but the project lacks a dedicated calendar.
        - Move everything into the 3-dot menu once both conditions are satisfied.
- **Generate project-aware Google OAuth URLs**
    - Extend `GoogleOAuthService.generateCalendarAuthUrl` so callers can pass a post-success redirect (defaults to `/profile?tab=calendar`).
    - Update `/profile/calendar` loader to forward an optional `redirect` query param through to the auth URL.
- **Handle OAuth callback redirects**
    - Encode the desired post-OAuth destination in the `state` payload.
    - In `src/routes/auth/google/calendar-callback/+page.server.ts`, decode the richer state object, fall back to the legacy `/profile?tab=calendar`, and propagate success/error indicators to the requested page.
- **Project-level connect modal**
    - Add a new modal component (e.g., `ProjectCalendarConnectModal.svelte`) that:
        - Displays a short explanation of why the calendar connection is needed.
        - Requests the auth URL from `/profile/calendar?redirect=/projects/<id>`.
        - Sends the user into OAuth and closes itself.
    - Register the modal in `modal.store.ts` and expose it via `ProjectModals.svelte` so the header CTA can open it.
- **Post-OAuth project refresh**
    - In `src/routes/projects/[id]/+page.svelte`, watch for `calendar_connected` or error params after redirect.
    - Show a toast, refresh `projectDataService.loadCalendarStatus({ force: true })`, and strip the query params.
- **Follow-up QA / testing**
    - Unit-test the new OAuth state serialization/deserialization helper.
    - Add a Vitest or Playwright scenario covering the connect → customize flow.
    - Manually verify that existing `/profile?tab=calendar` behaviour remains intact.

## CTA Copy Logic

- Show `Connect Calendar` when the user has no Google connection.
- After Google is linked but before a project calendar exists, keep the prominent CTA visible as `Customize Calendar` (opening the project calendar settings modal straightaway).
- Once both the user connection and project calendar exist, rely on the 3-dot settings menu entry (`Calendar Settings`).

## Google OAuth Flow Changes

Yes. We need to adjust the flow so that it

- Accepts custom post-success destinations (for the project page redirect).
- Encodes the additional metadata in the OAuth `state` value and decodes it on return.
- Continues to default to `/profile?tab=calendar` when no custom redirect is supplied, preserving the existing experience.

<!-- apps/web/docs/features/notifications/admin-notifications-remediation-plan-2026-04-12.md -->

# Admin Notifications Audit Remediation Plan

Date: 2026-04-12
Owner: Codex
Scope: `/admin/notifications`, `/admin/notifications/nlogs`, notification analytics RPCs, delivery tracking, correlation logging, and notification docs.

## Goal

Make the admin notification dashboard trustworthy enough for operational monitoring:

- Metrics reflect the selected time period and use consistent lifecycle definitions.
- Tracking updates are tied to authenticated users or signed channel-specific tracking links.
- Event, delivery, and log rows carry enough correlation data for future audits.
- Documentation describes the current system, not historical phase plans.

## Current Plan

### Phase 1: Dashboard Data Correctness

- [x] Audit current dashboard data sources and docs.
- [x] Fix event breakdown fan-out caused by joining deliveries to subscriptions.
- [x] Make SMS stats use real opt-in semantics and lifecycle-safe delivery denominators.
- [x] Make `/admin/notifications` timeframe controls drive all timeframe-sensitive cards.
- [x] Update admin labels so "sent", "delivered", "opened", and "clicked" match SQL definitions.

### Phase 2: Tracking Integrity

- [x] Mark in-app and push notifications opened when the authenticated recipient views `/notifications`.
- [x] Require recipient authentication for generic push/in-app click tracking.
- [x] Keep email and SMS tracking on their channel-specific token/link paths.
- [x] Preserve click-implies-open behavior across supported channels.

### Phase 3: Audit And Correlation

- [x] Ensure shared logger always writes a correlation ID when database logging is enabled.
- [x] Preserve correlation IDs through admin test, retry, and resend flows.
- [x] Reset stale lifecycle fields when an admin retries a failed delivery.
- [x] Add row-level correlation data to manually-created admin test deliveries.

### Phase 4: Event Type Cohesion

- [x] Update admin event filters and test selectors for the full canonical event type set.
- [x] Add transformer coverage for tracked in-app event types so worker fallback copy is rare.
- [x] Keep database event-type constraints, TypeScript unions, admin UI, and payload transforms aligned.

### Phase 5: Documentation And Verification

- [x] Update notification README and docs map with the current admin/logging/tracking docs.
- [x] Update the notification audit with this remediation pass.
- [x] Update tracking architecture docs with current email, SMS, push, and in-app behavior.
- [x] Run focused type checks/tests for changed notification files.
- [x] Record known residual repo-wide check failures separately from notification-specific failures.

## Metric Definitions To Enforce

- `total_sent`: delivery rows that reached the sent lifecycle: `sent`, `delivered`, `opened`, or `clicked`.
- Channel table `total_sent` is a legacy API field displayed as `Total`; it counts non-cancelled attempted deliveries so pending and failed rows remain visible beside lifecycle counts.
- `success_rate`: sent lifecycle rows divided by finalized attempts: `sent`, `delivered`, `opened`, `clicked`, `failed`, or `bounced`.
- `delivery_rate`: confirmed deliveries divided by sent lifecycle rows.
- `open_rate`: rows with `opened_at` divided by sent lifecycle rows.
- `click_rate`: rows with `clicked_at` divided by rows with `opened_at` (click-to-open rate).
- `failed`: `failed` plus `bounced`; `cancelled` is suppression, not delivery failure.
- `in_app` open: recipient viewed `/notifications`.
- `push` click: recipient clicked the browser notification and the service worker posted the delivery ID with the user's session.
- `email` open/click: email tracking pixel and click redirect.
- `sms` click: short-link redirect.

## Documentation Files To Keep Cohesive

- `apps/web/docs/features/notifications/README.md`
- `apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md`
- `apps/web/docs/features/notifications/notification-audit.md`
- `apps/web/docs/features/notifications/NOTIFICATION_LOGGING_IMPLEMENTATION_SPEC.md`
- `docs/architecture/NOTIFICATION_TRACKING_SYSTEM.md`
- `docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md`

## Work Log

- 2026-04-12: Created this plan after auditing `/admin/notifications`, analytics RPCs, tracking endpoints, correlation flow, and current notification docs.
- 2026-04-12: Fixed event breakdown fan-out, SMS stat semantics, timeframe wiring, auto-refresh interval duplication, in-app/push open tracking, recipient-authenticated push/in-app click tracking, admin retry/resend/test correlation, Twilio callback signature URL reconstruction, event type selector drift, and transformer coverage for tracked in-app event types.
- 2026-04-12: Hotfixed `get_notification_event_performance` after runtime testing found a PL/pgSQL ambiguity between the returned `event_type` column and the internal `notification_events.event_type` reference. The function now aliases the internal event type as `event_type_key`, and migration `20260428000025` reapplies the corrected definition for databases that already ran `20260428000024`.
- 2026-04-12: Validation: `pnpm --filter @buildos/shared-types typecheck` passed; `pnpm --filter @buildos/shared-utils typecheck` passed; `pnpm --filter @buildos/web check` still fails on unrelated repo-wide issues (`171 errors`, `214 warnings`, `101 files`), and filtering that check for notification paths returned no remaining notification diagnostics.

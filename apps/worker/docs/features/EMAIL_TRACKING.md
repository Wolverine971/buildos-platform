<!-- apps/worker/docs/features/EMAIL_TRACKING.md -->

# Worker Email Tracking

Last verified against code on 2026-07-06.

The worker exposes a public open-tracking pixel route:

```http
GET /api/email-tracking/:trackingId
```

It always returns a 1x1 transparent PNG. Tracking failures do not change the
response.

## Active Email Path

```text
send_notification job
  -> workers/notification/emailAdapter.ts
  -> create emails and email_recipients rows
  -> inject /api/email-tracking/:trackingId pixel
  -> rewrite links to {PUBLIC_APP_URL}/api/email-tracking/:trackingId/click
  -> POST {PUBLIC_APP_URL}/api/webhooks/send-notification-email
  -> web app sends the provider email
```

The worker owns record creation and the pixel endpoint. The web app owns final
email provider delivery.

## Pixel Route Behavior

Implemented in `apps/worker/src/routes/email-tracking.ts`.

For a valid `trackingId`, the route:

1. Looks up the `emails` row by `tracking_id`.
2. Loads related `email_recipients`.
3. Updates each recipient's open fields:
    - `opened_at`
    - `open_count`
    - `last_opened_at`
4. Inserts an `email_tracking_events` row with:
    - `event_type = 'opened'`
    - user agent
    - IP address
    - first-open and count metadata
5. Returns the pixel.

For missing or unknown IDs, it logs and still returns the pixel.

## Auth

This route is intentionally public so email clients can load the pixel. It is
exempted before the global worker bearer-token middleware.

## Current Limitations

- The worker route records opens only.
- Link rewriting points click URLs at `PUBLIC_APP_URL`, so click handling is a
  web app concern.
- A single tracking pixel currently updates every recipient associated with the
  email record.
- Open tracking depends on the email client loading remote images.

## Related Files

- `apps/worker/src/routes/email-tracking.ts`
- `apps/worker/src/workers/notification/emailAdapter.ts`
- `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts`
